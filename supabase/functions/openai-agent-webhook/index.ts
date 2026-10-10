import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, webhook-id, webhook-timestamp, webhook-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return json({ ok: true }, 200)
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const signingSecret = Deno.env.get('OPENAI_WEBHOOK_SECRET')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!signingSecret || !supabaseUrl || !serviceRoleKey) return json({ error: 'Webhook is not configured' }, 503)

  const rawBody = new Uint8Array(await request.arrayBuffer())
  if (!(await verifyWebhook(request.headers, rawBody, signingSecret))) return json({ error: 'Invalid webhook signature' }, 400)

  let event: Record<string, unknown>
  try {
    event = JSON.parse(new TextDecoder().decode(rawBody))
  } catch {
    return json({ error: 'Invalid webhook JSON' }, 400)
  }
  if (typeof event.id !== 'string' || typeof event.type !== 'string') return json({ error: 'Invalid webhook event' }, 400)
  const data = isRecord(event.data) ? event.data : {}
  const sessionId = typeof data.id === 'string' ? data.id : null

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: insertError } = await admin.from('openai_webhook_events').insert({ id: event.id, event_type: event.type, session_id: sessionId })
  if (insertError?.code === '23505') return json({ received: true, duplicate: true }, 200)
  if (insertError) return json({ error: 'Could not record webhook event' }, 500)
  if (!sessionId) {
    await markWebhookProcessed(admin, event.id)
    return json({ received: true, ignored: true }, 200)
  }

  const { data: run, error: runError } = await admin.from('application_runs')
    .select('id,user_id,application_id,status').eq('openai_session_id', sessionId).maybeSingle()
  if (runError || !run) {
    await markWebhookProcessed(admin, event.id, 'No application run maps to this session')
    return json({ received: true, ignored: true }, 200)
  }

  if (event.type === 'agent.session.failed' || event.type === 'agent.session.environment.failed') {
    const message = 'O agente encontrou um erro no navegador hospedado. Tente novamente.'
    await admin.from('application_runs').update({ status: 'failed', failure_reason: message, completed_at: new Date().toISOString(), last_activity_at: new Date().toISOString() }).eq('id', run.id)
    await admin.from('applications').update({ status: 'failed', failure_reason: message, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', run.application_id).eq('user_id', run.user_id)
    await admin.from('application_events').insert({ user_id: run.user_id, application_id: run.application_id, event_type: 'failed', message })
  } else if (event.type === 'agent.session.in_progress') {
    await admin.from('application_runs').update({ status: 'running', last_activity_at: new Date().toISOString() }).eq('id', run.id)
    await admin.from('applications').update({ status: 'applying', updated_at: new Date().toISOString() }).eq('id', run.application_id).eq('user_id', run.user_id)
    await admin.from('application_events').insert({ user_id: run.user_id, application_id: run.application_id, event_type: 'agent_progress', message: 'Agente está trabalhando na candidatura' })
  } else if (event.type === 'agent.session.action_required' || event.type === 'agent.session.idle') {
    await processRequiredActions(admin, run, sessionId, event.type)
  }

  await markWebhookProcessed(admin, event.id)
  return json({ received: true }, 200)
})

async function processRequiredActions(admin: ReturnType<typeof createClient>, run: Record<string, string>, sessionId: string, eventType: string) {
  const openAiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openAiKey) return
  const response = await fetch(`https://api.openai.com/v1/agents/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${openAiKey}`, 'OpenAI-Beta': 'agents=v1' },
  })
  if (!response.ok) return
  const session = await response.json()
  const requiredActions = Array.isArray(session.required_actions) ? session.required_actions : []
  let createdApproval = false

  for (const action of requiredActions) {
    if (!isRecord(action)) continue
    const actionType = typeof action.type === 'string' ? action.type : ''
    if (actionType === 'function_call') {
      const name = typeof action.name === 'string' ? action.name : ''
      if (name !== 'request_user_response') continue
      const args = isRecord(action.arguments) ? action.arguments : {}
      const callId = typeof action.call_id === 'string' ? action.call_id : null
      if (!callId) continue
      const requestType = typeof args.request_type === 'string' ? args.request_type : 'question'
      const question = typeof args.question === 'string' ? args.question : 'O agente precisa de uma resposta para continuar.'
      const classification = requestType === 'final_submit' || requestType === 'legal' || requestType === 'work_authorization' || requestType === 'demographic' ? 'ALWAYS_APPROVE' : 'RULE_REQUIRED'
      const { error } = await admin.from('approval_requests').upsert({
        user_id: run.user_id, application_id: run.application_id, question,
        suggested_answer: nullableString(args.suggested_answer), classification,
        request_type: requestType, openai_request_id: callId,
        openai_call_id: callId, openai_turn_id: nullableString(action.turn_id),
        request_payload: { reason: nullableString(args.reason), sensitivity: nullableString(args.sensitivity), options: Array.isArray(args.options) ? args.options : [] },
        status: 'pending',
      }, { onConflict: 'openai_request_id' })
      if (!error) createdApproval = true
    } else if (actionType === 'computer_use_approval_request') {
      const request = isRecord(action.request) ? action.request : {}
      const requestType = typeof request.type === 'string' ? request.type : 'browser_origin_access'
      const requestId = typeof action.request_id === 'string' ? action.request_id : null
      if (!requestId) continue
      const isAuth = requestType === 'browser_authentication'
      const origin = nullableString(request.origin) ?? nullableString(request.credential_origin)
      const question = isAuth
        ? 'O site pede autenticação. Entre no domínio exibido para continuar.'
        : `O agente pede acesso ao domínio ${origin ?? 'não identificado'}.`
      const { error } = await admin.from('approval_requests').upsert({
        user_id: run.user_id, application_id: run.application_id, question,
        suggested_answer: null, classification: 'ALWAYS_APPROVE',
        request_type: isAuth ? 'authentication' : 'browser_origin_access', openai_request_id: requestId,
        openai_turn_id: nullableString(action.turn_id),
        request_payload: isAuth
          ? { origin, fields: Array.isArray(request.fields) ? request.fields : [], options: Array.isArray(request.options) ? request.options : [] }
          : { origin, reason: nullableString(request.reason), browser_request_type: requestType },
        status: 'pending',
      }, { onConflict: 'openai_request_id' })
      if (!error) createdApproval = true
    }
  }

  if (createdApproval) {
    await admin.from('application_runs').update({ status: 'needs_input', last_activity_at: new Date().toISOString() }).eq('id', run.id)
    await admin.from('applications').update({ status: 'needs_input', updated_at: new Date().toISOString() }).eq('id', run.application_id).eq('user_id', run.user_id)
    await admin.from('application_events').insert({ user_id: run.user_id, application_id: run.application_id, event_type: 'question_required', message: 'O agente precisa da sua resposta ou aprovação para continuar' })
    return
  }

  if (eventType === 'agent.session.idle') {
    const { data: pendingFinal } = await admin.from('approval_requests').select('id')
      .eq('user_id', run.user_id).eq('application_id', run.application_id).eq('request_type', 'final_review').eq('status', 'pending').limit(1).maybeSingle()
    if (!pendingFinal) {
      await admin.from('approval_requests').insert({
        user_id: run.user_id, application_id: run.application_id,
        question: 'O agente pausou. Revise a candidatura e informe se deseja continuar.',
        suggested_answer: null, classification: 'ALWAYS_APPROVE', request_type: 'final_review',
        status: 'pending', request_payload: { note: 'Session idle is not proof of submission or completion.' },
      })
    }
    await admin.from('application_runs').update({ status: 'needs_input', last_activity_at: new Date().toISOString() }).eq('id', run.id)
    await admin.from('applications').update({ status: 'needs_input', updated_at: new Date().toISOString() }).eq('id', run.application_id).eq('user_id', run.user_id)
  }
}

async function markWebhookProcessed(admin: ReturnType<typeof createClient>, eventId: string, error?: string) {
  await admin.from('openai_webhook_events').update({ processed_at: new Date().toISOString(), processing_error: error ?? null }).eq('id', eventId)
}

async function verifyWebhook(headers: Headers, rawBody: Uint8Array, secret: string) {
  const id = headers.get('webhook-id')
  const timestamp = headers.get('webhook-timestamp')
  const signatureHeader = headers.get('webhook-signature')
  if (!id || !timestamp || !signatureHeader || !/^\d+$/.test(timestamp)) return false
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false
  const secretValue = secret.startsWith('whsec_') ? secret.slice(6) : secret
  let secretBytes: Uint8Array
  try { secretBytes = Uint8Array.from(atob(secretValue), (character) => character.charCodeAt(0)) } catch { return false }
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const prefix = new TextEncoder().encode(`${id}.${timestamp}.`)
  const signed = new Uint8Array(prefix.length + rawBody.length)
  signed.set(prefix)
  signed.set(rawBody, prefix.length)
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, signed))
  const expected = btoa(String.fromCharCode(...digest))
  return signatureHeader.split(' ').some((candidate) => {
    const [version, signature] = candidate.split(',', 2)
    return version === 'v1' && constantTimeEqual(signature ?? '', expected)
  })
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return difference === 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nullableString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}