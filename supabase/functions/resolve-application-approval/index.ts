import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return json({ ok: true }, 200)
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authorization = request.headers.get('Authorization')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const openAiKey = Deno.env.get('OPENAI_API_KEY')
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401)
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !openAiKey) return json({ error: 'Server integrations are not configured' }, 503)

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return json({ error: 'Invalid session' }, 401)

  let body: { approvalId?: unknown; decision?: unknown; answer?: unknown; fields?: unknown }
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }
  if (typeof body.approvalId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.approvalId)) return json({ error: 'A valid approvalId is required' }, 400)
  if (!['approve', 'deny', 'cancel'].includes(String(body.decision))) return json({ error: 'Decision must be approve, deny, or cancel' }, 400)
  const decision = body.decision as 'approve' | 'deny' | 'cancel'

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: approval, error: approvalError } = await admin.from('approval_requests')
    .select('id,user_id,application_id,question,suggested_answer,classification,status,request_type,openai_request_id,openai_call_id,openai_turn_id,request_payload')
    .eq('id', body.approvalId).eq('user_id', user.id).maybeSingle()
  if (approvalError || !approval) return json({ error: 'Approval request not found' }, 404)
  if (approval.status !== 'pending') return json({ error: 'This approval has already been resolved' }, 409)

  const { data: run } = await admin.from('application_runs').select('id,openai_session_id')
    .eq('user_id', user.id).eq('application_id', approval.application_id)
    .not('openai_session_id', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!run?.openai_session_id) return json({ error: 'No active OpenAI session exists for this approval' }, 409)

  if (approval.classification === 'ALWAYS_APPROVE' && decision === 'approve' && approval.request_type !== 'browser_origin_access' && approval.request_type !== 'authentication') {
    if (approval.request_type === 'final_submit' && body.answer !== 'confirm_submit') return json({ error: 'Final submission requires the explicit confirm_submit action' }, 400)
    if (approval.request_type === 'final_review' && !['confirm_submit', 'continue_preparing'].includes(String(body.answer))) return json({ error: 'Final review requires an explicit continue or submit decision' }, 400)
  }

  const event = buildSessionEvent(approval, decision, body)
  if (!event) return json({ error: 'Approval request has no resumable OpenAI action' }, 409)

  const openAiResponse = await fetch(`https://api.openai.com/v1/agents/sessions/${encodeURIComponent(run.openai_session_id)}/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${openAiKey}`, 'OpenAI-Beta': 'agents=v1', 'Content-Type': 'application/json', 'Idempotency-Key': approval.id },
    body: JSON.stringify({ events: [event] }),
  })
  if (!openAiResponse.ok) return json({ error: 'OpenAI could not resume the existing agent session' }, 502)

  const resolvedAnswer = approval.request_type === 'authentication' ? null : typeof body.answer === 'string' ? body.answer.slice(0, 8000) : null
  const { error: updateError } = await admin.from('approval_requests').update({
    status: decision === 'deny' || decision === 'cancel' ? 'rejected' : 'approved',
    resolved_answer: resolvedAnswer,
    resolved_at: new Date().toISOString(),
  }).eq('id', approval.id).eq('user_id', user.id).eq('status', 'pending')
  if (updateError) return json({ error: 'OpenAI resumed, but approval state could not be saved' }, 500)

  if (approval.request_type !== 'authentication' && approval.classification !== 'ALWAYS_APPROVE' && decision === 'approve' && typeof body.answer === 'string' && body.answer.trim()) {
    await admin.from('application_answers').insert({
      user_id: user.id,
      question_key: approval.request_type,
      question_text: approval.question,
      answer: body.answer.slice(0, 8000),
      sensitive: approval.classification === 'ALWAYS_APPROVE',
      verified_by_user: true,
    })
  }
  const nextStatus = decision === 'deny' || decision === 'cancel' ? 'cancelled' : 'applying'
  await admin.from('applications').update({ status: nextStatus, ...(nextStatus === 'cancelled' ? { completed_at: new Date().toISOString() } : {}), updated_at: new Date().toISOString() }).eq('id', approval.application_id).eq('user_id', user.id)
  await admin.from('application_runs').update({ status: nextStatus === 'cancelled' ? 'cancelled' : 'running', last_activity_at: new Date().toISOString() }).eq('id', run.id).eq('user_id', user.id)
  await admin.from('application_events').insert({
    user_id: user.id, application_id: approval.application_id,
    event_type: nextStatus === 'cancelled' ? 'cancelled' : 'answer_received',
    message: nextStatus === 'cancelled' ? 'Candidatura cancelada pela pessoa usuária' : 'Resposta enviada à mesma sessão do agente',
    metadata: { approval_id: approval.id, request_type: approval.request_type },
  })
  return json({ status: nextStatus, resumedExistingSession: true }, 200)
})

function buildSessionEvent(approval: Record<string, unknown>, decision: string, body: { answer?: unknown; fields?: unknown }) {
  const requestType = approval.request_type
  const requestId = approval.openai_request_id
  if (typeof requestType !== 'string') return null

  if (requestType === 'final_review' && decision === 'approve') {
    return {
      type: 'agent.session.input.message',
      input: [{
        role: 'user',
        content: [{ type: 'input_text', text: body.answer === 'confirm_submit'
          ? 'I explicitly reviewed this application and authorize you to submit this specific application now. Submit it exactly once, then report the actual confirmation or error. Do not make any other declaration on my behalf.'
          : 'I reviewed the current state. Continue preparing only; do not submit. If final submission is ready, ask me again.' }],
      }],
    }
  }
  if (typeof requestId !== 'string') return null

  if (requestType === 'browser_origin_access') {
    return {
      type: 'agent.session.input.computer_use_approval_request_result',
      request_id: requestId,
      response: { type: 'browser_origin_access', decision: decision === 'approve' ? 'approve' : decision === 'cancel' ? 'cancel' : 'deny' },
    }
  }

  if (requestType === 'authentication') {
    if (decision !== 'approve' && decision !== 'deny' && decision !== 'cancel') return null
    if (decision !== 'approve') return { type: 'agent.session.input.computer_use_approval_request_result', request_id: requestId, response: { type: 'browser_authentication', action: 'cancel' } }
    const payload = isRecord(approval.request_payload) ? approval.request_payload : {}
    const allowedFields = Array.isArray(payload.fields) ? payload.fields.filter(isRecord) : []
    const providedFields = Array.isArray(body.fields) ? body.fields.filter(isRecord) : []
    const allowedIds = new Set(allowedFields.map((field) => field.id).filter((id): id is string => typeof id === 'string'))
    const fields = providedFields.flatMap((field) => typeof field.field_id === 'string' && allowedIds.has(field.field_id) && typeof field.value === 'string' && field.value.length > 0
      ? [{ field_id: field.field_id, value: field.value.slice(0, 2048) }]
      : [])
    const requiredIds = allowedFields.filter((field) => field.required === true).map((field) => field.id).filter((id): id is string => typeof id === 'string')
    if (requiredIds.some((id) => !fields.some((field) => field.field_id === id))) return null
    const options = Array.isArray(payload.options) ? payload.options.filter(isRecord) : []
    const selectedOption = typeof body.answer === 'string' && options.some((option) => option.id === body.answer) ? body.answer : undefined
    return {
      type: 'agent.session.input.computer_use_approval_request_result',
      request_id: requestId,
      response: { type: 'browser_authentication', action: 'submit', fields, ...(selectedOption ? { selected_option: selectedOption } : {}) },
    }
  }

  if (typeof approval.openai_call_id === 'string' && typeof approval.openai_turn_id === 'string') {
    const approved = decision === 'approve'
    return {
      type: 'agent.session.input.tool_result',
      turn_id: approval.openai_turn_id,
      call_id: approval.openai_call_id,
      success: true,
      output: JSON.stringify({ approved, answer: approved && typeof body.answer === 'string' ? body.answer.slice(0, 8000) : null }),
    }
  }

  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}