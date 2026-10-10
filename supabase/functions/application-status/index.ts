import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return json({ ok: true }, 200)
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  let inspectActivity = false
  try {
    const body = await request.json()
    inspectActivity = isRecord(body) && body.inspectActivity === true
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
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
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: runs, error } = await admin.from('application_runs')
    .select('id,user_id,application_id,openai_session_id,status')
    .eq('user_id', user.id).not('openai_session_id', 'is', null).in('status', ['running', 'needs_input']).order('last_activity_at', { ascending: false }).limit(5)
  if (error) return json({ error: 'Could not load agent sessions' }, 500)

  const sessions = []
  for (const run of runs ?? []) {
    const response = await fetch(`https://api.openai.com/v1/agents/sessions/${encodeURIComponent(run.openai_session_id)}`, {
      headers: { Authorization: `Bearer ${openAiKey}`, 'OpenAI-Beta': 'agents=v1' },
    })
    if (!response.ok) {
      if (response.status >= 500) continue
      const failure = 'Não foi possível consultar o estado da sessão do agente.'
      await failApplication(admin, run, failure)
      continue
    }
    const session = await response.json()
    const requiredActions = Array.isArray(session.required_actions) ? session.required_actions : []
    let approvalSync: { actionTypes: string[]; materialized: number; errors: string[] } | null = null
    if (session.status === 'failed') {
      await failApplication(admin, run, 'A sessão do agente falhou. Revise o erro e tente novamente.')
    } else if (requiredActions.length) {
      approvalSync = await saveRequiredActions(admin, run, requiredActions)
    } else if (session.status === 'idle') {
      await markSessionPaused(admin, run, user.id)
    } else {
      await admin.from('application_runs').update({ status: 'running', last_activity_at: new Date().toISOString() }).eq('id', run.id).eq('user_id', user.id)
      await admin.from('applications').update({ status: 'applying', updated_at: new Date().toISOString() }).eq('id', run.application_id).eq('user_id', user.id)
    }
    sessions.push({
      runId: run.id,
      applicationId: run.application_id,
      status: session.status,
      needsInput: requiredActions.length > 0,
      ...(approvalSync ? { approvalSync } : {}),
      ...(inspectActivity ? { activity: await getRecentAgentActivity(openAiKey, run.openai_session_id) } : {}),
    })
  }

  const { data: pendingRows, error: pendingError } = await admin.from('approval_requests')
    .select('id,application_id,question,suggested_answer,classification,status,request_type,request_payload')
    .eq('user_id', user.id).eq('status', 'pending').order('created_at', { ascending: true }).limit(100)
  if (pendingError) return json({ error: 'Could not load pending approvals' }, 500)

  const applicationIds = [...new Set((pendingRows ?? []).map((approval) => approval.application_id))]
  const { data: applications, error: applicationsError } = applicationIds.length
    ? await admin.from('applications').select('id,job_id').eq('user_id', user.id).in('id', applicationIds)
    : { data: [], error: null }
  if (applicationsError) return json({ error: 'Could not load approval applications' }, 500)

  const jobIds = [...new Set((applications ?? []).map((application) => application.job_id))]
  const { data: jobs, error: jobsError } = jobIds.length
    ? await admin.from('jobs').select('id,title,company').eq('user_id', user.id).in('id', jobIds)
    : { data: [], error: null }
  if (jobsError) return json({ error: 'Could not load approval jobs' }, 500)

  const applicationById = new Map((applications ?? []).map((application) => [application.id, application]))
  const jobById = new Map((jobs ?? []).map((job) => [job.id, job]))
  const approvals = (pendingRows ?? []).map((approval) => {
    const application = applicationById.get(approval.application_id)
    return {
      ...approval,
      applications: application ? { job_id: application.job_id, jobs: jobById.get(application.job_id) ?? null } : null,
    }
  })
  return json({ sessions, approvals, pendingApprovals: approvals.length }, 200)
})

async function getRecentAgentActivity(openAiKey: string, sessionId: string) {
  try {
    const response = await fetch(`https://api.openai.com/v1/agents/sessions/${encodeURIComponent(sessionId)}/items?order=desc&limit=25`, {
      headers: { Authorization: `Bearer ${openAiKey}`, 'OpenAI-Beta': 'agents=v1' },
    })
    if (!response.ok) return { error: `items_http_${response.status}`, items: [] }
    const payload = await response.json()
    const items = isRecord(payload) && Array.isArray(payload.data) ? payload.data : []
    return {
      items: items.flatMap((item) => {
        if (!isRecord(item)) return []
        if (item.type === 'computer_use_call') return [{ type: item.type, title: stringValue(item.title), status: stringValue(item.status) }]
        if (item.type === 'user_message' || (item.type === 'message' && item.role === 'user')) {
          return [{ type: 'user_message', textLength: agentMessageText(item).length }]
        }
        if (item.type === 'agent_message' || (item.type === 'message' && item.role === 'assistant')) {
          const text = agentMessageText(item)
          return text ? [{ type: 'agent_message', text: text.slice(0, 4000) }] : []
        }
        if (item.type === 'function_call') return [{ type: item.type, name: stringValue(item.name) }]
        return []
      }),
    }
  } catch {
    return { error: 'items_unavailable', items: [] }
  }
}

function agentMessageText(item: Record<string, unknown>) {
  if (typeof item.text === 'string') return item.text.trim()
  if (!Array.isArray(item.content)) return ''
  return item.content.flatMap((part) => isRecord(part) && typeof part.text === 'string' ? [part.text] : []).join('\n').trim()
}

async function saveRequiredActions(admin: ReturnType<typeof createClient>, run: Record<string, string>, actions: unknown[]) {
  const diagnostics = { actionTypes: [] as string[], materialized: 0, errors: [] as string[] }
  for (const value of actions) {
    if (!isRecord(value)) {
      diagnostics.actionTypes.push('unknown_shape')
      diagnostics.errors.push('unrecognized_action_shape')
      continue
    }
    const actionType = stringValue(value.type) ?? 'unknown'
    diagnostics.actionTypes.push(actionType)
    let writeError: { code?: string } | null = null
    if (value.type === 'function_call' && value.name === 'request_user_response') {
      const args = isRecord(value.arguments) ? value.arguments : {}
      const callId = stringValue(value.call_id)
      if (!callId) {
        diagnostics.errors.push('function_call:missing_call_id')
        continue
      }
      const requestType = stringValue(args.request_type) ?? 'question'
      const { error } = await admin.from('approval_requests').upsert({
        user_id: run.user_id, application_id: run.application_id,
        question: stringValue(args.question) ?? 'O agente precisa de uma resposta para continuar.',
        suggested_answer: stringValue(args.suggested_answer),
        classification: ['final_submit', 'legal', 'work_authorization', 'demographic'].includes(requestType) ? 'ALWAYS_APPROVE' : 'RULE_REQUIRED',
        request_type: requestType, openai_request_id: callId, openai_call_id: callId, openai_turn_id: stringValue(value.turn_id),
        request_payload: { reason: stringValue(args.reason), sensitivity: stringValue(args.sensitivity), options: Array.isArray(args.options) ? args.options : [] },
        status: 'pending',
      }, { onConflict: 'openai_request_id' })
      writeError = error
    } else if (value.type === 'computer_use_approval_request') {
      const request = isRecord(value.request) ? value.request : {}
      const requestId = stringValue(value.request_id)
      if (!requestId) {
        diagnostics.errors.push('computer_use_approval_request:missing_request_id')
        continue
      }
      const authentication = request.type === 'browser_authentication'
      const origin = stringValue(request.credential_origin) ?? stringValue(request.origin)
      const { error } = await admin.from('approval_requests').upsert({
        user_id: run.user_id, application_id: run.application_id,
        question: authentication ? 'O site pede autenticação. Confira o domínio antes de continuar.' : `O agente precisa acessar ${origin ?? 'um novo domínio'}.`,
        suggested_answer: null, classification: 'ALWAYS_APPROVE',
        request_type: authentication ? 'authentication' : 'browser_origin_access', openai_request_id: requestId,
        openai_turn_id: stringValue(value.turn_id),
        request_payload: authentication
          ? { origin, fields: Array.isArray(request.fields) ? request.fields : [], options: Array.isArray(request.options) ? request.options : [] }
          : { origin, reason: stringValue(request.reason), browser_request_type: stringValue(request.type) },
        status: 'pending',
      }, { onConflict: 'openai_request_id' })
      writeError = error
    } else {
      diagnostics.errors.push(`unsupported_action:${actionType}`)
      continue
    }
    if (writeError) diagnostics.errors.push(`${actionType}:${writeError.code ?? 'database_error'}`)
    else diagnostics.materialized += 1
  }
  const { error: runError } = await admin.from('application_runs').update({ status: 'needs_input', last_activity_at: new Date().toISOString() }).eq('id', run.id).eq('user_id', run.user_id)
  const { error: applicationError } = await admin.from('applications').update({ status: 'needs_input', updated_at: new Date().toISOString() }).eq('id', run.application_id).eq('user_id', run.user_id)
  if (runError) diagnostics.errors.push(`run_status:${runError.code ?? 'database_error'}`)
  if (applicationError) diagnostics.errors.push(`application_status:${applicationError.code ?? 'database_error'}`)
  return diagnostics
}

async function markSessionPaused(admin: ReturnType<typeof createClient>, run: Record<string, string>, userId: string) {
  await admin.from('application_runs').update({ status: 'needs_input', last_activity_at: new Date().toISOString() }).eq('id', run.id).eq('user_id', run.user_id)
  await admin.from('applications').update({ status: 'needs_input', updated_at: new Date().toISOString() }).eq('id', run.application_id).eq('user_id', userId)
}

async function failApplication(admin: ReturnType<typeof createClient>, run: Record<string, string>, reason: string) {
  await admin.from('application_runs').update({ status: 'failed', failure_reason: reason, completed_at: new Date().toISOString() }).eq('id', run.id).eq('user_id', run.user_id)
  await admin.from('applications').update({ status: 'failed', failure_reason: reason, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', run.application_id).eq('user_id', run.user_id)
  await admin.from('application_events').insert({ user_id: run.user_id, application_id: run.application_id, event_type: 'failed', message: reason })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value ? value : null
}

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}