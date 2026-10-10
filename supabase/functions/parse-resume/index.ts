import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import mammoth from 'npm:mammoth@1.13.0'
import { parseOpenAiOutput } from '../_shared/openai-response.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const textOrNull = { type: ['string', 'null'] }
const stringArray = { type: 'array', items: { type: 'string' } }
const profileSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['fullName', 'headline', 'summary', 'phone', 'location', 'linkedinUrl', 'portfolioUrl', 'experiences', 'educations', 'certifications', 'skills', 'projects', 'languages'],
  properties: {
    fullName: textOrNull,
    headline: textOrNull,
    summary: textOrNull,
    phone: textOrNull,
    location: textOrNull,
    linkedinUrl: textOrNull,
    portfolioUrl: textOrNull,
    experiences: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['company', 'title', 'location', 'description', 'startDate', 'endDate', 'isCurrent'], properties: { company: { type: 'string' }, title: { type: 'string' }, location: textOrNull, description: textOrNull, startDate: textOrNull, endDate: textOrNull, isCurrent: { type: 'boolean' } } } },
    educations: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['institution', 'degree', 'fieldOfStudy', 'startDate', 'endDate'], properties: { institution: { type: 'string' }, degree: textOrNull, fieldOfStudy: textOrNull, startDate: textOrNull, endDate: textOrNull } } },
    certifications: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'issuer', 'issuedAt', 'expiresAt', 'credentialUrl'], properties: { name: { type: 'string' }, issuer: textOrNull, issuedAt: textOrNull, expiresAt: textOrNull, credentialUrl: textOrNull } } },
    skills: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'proficiency', 'yearsExperience'], properties: { name: { type: 'string' }, proficiency: textOrNull, yearsExperience: { type: ['number', 'null'] } } } },
    projects: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'description', 'url', 'technologies'], properties: { name: { type: 'string' }, description: textOrNull, url: textOrNull, technologies: stringArray } } },
    languages: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'proficiency'], properties: { name: { type: 'string' }, proficiency: textOrNull } } },
  },
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

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return json({ error: 'Invalid session' }, 401)

  let body: { documentId?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  if (typeof body.documentId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.documentId)) {
    return json({ error: 'A valid documentId is required' }, 400)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: document, error: documentError } = await admin.from('documents')
    .select('id,user_id,storage_path,file_name,mime_type,size_bytes')
    .eq('id', body.documentId).eq('user_id', user.id).maybeSingle()
  if (documentError || !document) return json({ error: 'Resume document not found' }, 404)
  const isPdf = document.mime_type === 'application/pdf' && document.file_name.toLowerCase().endsWith('.pdf')
  const isDocx = document.mime_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' && document.file_name.toLowerCase().endsWith('.docx')
  if (!isPdf && !isDocx) return json({ error: 'Use a PDF or DOCX resume' }, 415)
  if (!document.size_bytes || document.size_bytes > 10 * 1024 * 1024) return json({ error: 'Resume must be 10 MB or smaller' }, 413)

  await admin.from('documents').update({ processing_status: 'processing', processing_error: null }).eq('id', document.id).eq('user_id', user.id)
  const { data: file, error: downloadError } = await admin.storage.from('user-resumes').download(document.storage_path)
  if (downloadError || !file) return failDocument(admin, document.id, user.id, 'Não foi possível ler o arquivo privado.')

  let fileContent: Record<string, string>
  if (isPdf) {
    fileContent = { type: 'input_file', filename: document.file_name, file_data: `data:application/pdf;base64,${toBase64(await file.arrayBuffer())}` }
  } else {
    let extractedText = ''
    try {
      const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
      extractedText = result.value.slice(0, 100_000)
    } catch {
      return failDocument(admin, document.id, user.id, 'Não foi possível extrair o texto do DOCX.')
    }
    if (!extractedText.trim()) return failDocument(admin, document.id, user.id, 'O DOCX não contém texto legível.')
    fileContent = { type: 'input_text', text: `Conteúdo extraído do currículo DOCX:\n${extractedText}` }
  }

  let openAiResponse: Response
  try {
    openAiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: 'Extraia do currículo somente informações explicitamente presentes. Não infira nem complete dados ausentes; use null ou arrays vazios. Preserve nomes, organizações, datas e níveis de idioma como escritos. Este resultado será revisado pela pessoa antes de virar perfil.' },
            fileContent,
          ],
        }],
        text: { format: { type: 'json_schema', name: 'resume_profile', strict: true, schema: profileSchema } },
      }),
    })
  } catch {
    return failDocument(admin, document.id, user.id, 'Não foi possível conectar à OpenAI.')
  }
  if (!openAiResponse.ok) return failDocument(admin, document.id, user.id, 'A OpenAI não conseguiu processar o currículo. Verifique a configuração da chave e tente novamente.')

  let profile: Record<string, unknown>
  try {
    const result = await openAiResponse.json()
    profile = parseOpenAiOutput<Record<string, unknown>>(result)
  } catch {
    return failDocument(admin, document.id, user.id, 'A extração retornou um formato inválido.')
  }
  if (!profile || !Array.isArray(profile.experiences) || !Array.isArray(profile.skills)) {
    return failDocument(admin, document.id, user.id, 'A extração do currículo ficou incompleta.')
  }

  const { error: saveError } = await admin.from('documents').update({
    processing_status: 'review',
    processing_error: null,
    extracted_profile: profile,
  }).eq('id', document.id).eq('user_id', user.id)
  if (saveError) return json({ error: 'Could not save extracted profile for review' }, 500)
  return json({ documentId: document.id, status: 'review', profile }, 200)
})

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)))
  }
  return btoa(binary)
}

async function failDocument(client: ReturnType<typeof createClient>, documentId: string, userId: string, message: string) {
  await client.from('documents').update({ processing_status: 'failed', processing_error: message })
    .eq('id', documentId).eq('user_id', userId)
  return json({ error: message }, 422)
}

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}