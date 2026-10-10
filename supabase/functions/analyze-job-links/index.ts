import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { parseOpenAiOutput } from '../_shared/openai-response.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const jobSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['sourceUrl', 'title', 'company', 'location', 'workplaceType', 'employmentType', 'seniority', 'descriptionOriginal', 'summary', 'required', 'preferred', 'salaryMin', 'salaryMax', 'currency', 'applicationUrl', 'applicationPlatform', 'publishedAt'],
  properties: {
    sourceUrl: { type: 'string' },
    title: { type: 'string' },
    company: { type: 'string' },
    location: { type: ['string', 'null'] },
    workplaceType: { type: 'string', enum: ['remote', 'hybrid', 'onsite', 'unknown'] },
    employmentType: { type: ['string', 'null'] },
    seniority: { type: ['string', 'null'] },
    descriptionOriginal: { type: 'string' },
    summary: { type: 'string' },
    required: { type: 'array', items: { type: 'string' } },
    preferred: { type: 'array', items: { type: 'string' } },
    salaryMin: { type: ['number', 'null'] },
    salaryMax: { type: ['number', 'null'] },
    currency: { type: ['string', 'null'] },
    applicationUrl: { type: ['string', 'null'] },
    applicationPlatform: { type: ['string', 'null'] },
    publishedAt: { type: ['string', 'null'] },
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

  let body: { urls?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  if (!Array.isArray(body.urls) || body.urls.length < 1 || body.urls.length > 20) {
    return json({ error: 'Provide between 1 and 20 job URLs' }, 400)
  }

  const urls: string[] = []
  for (const candidate of body.urls) {
    if (typeof candidate !== 'string' || candidate.length > 2048) return json({ error: 'Invalid URL' }, 400)
    let parsed: URL
    try {
      parsed = new URL(candidate)
    } catch {
      return json({ error: 'Invalid URL' }, 400)
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || isPrivateHost(parsed.hostname)) {
      return json({ error: 'Only public HTTPS job URLs are accepted' }, 400)
    }
    if (!urls.includes(parsed.href)) urls.push(parsed.href)
  }
  if (!urls.length) return json({ error: 'No unique URLs to analyze' }, 400)

  const openAiResponse = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      tools: [{ type: 'web_search' }],
      input: [
        {
          role: 'system',
          content: [{
            type: 'input_text',
            text: 'Analyze only publicly accessible job pages for the URLs supplied by the user. Never log in, bypass access controls, or scrape authenticated LinkedIn pages. Preserve each exact sourceUrl. Extract the job description faithfully into descriptionOriginal and keep your concise generated summary separate. Never invent salary, requirements, company facts, or application destinations; use null or empty arrays when absent. Prefer an official employer careers/ATS application URL when publicly verifiable. Return one result per accessible job URL; omit inaccessible URLs.',
          }],
        },
        { role: 'user', content: [{ type: 'input_text', text: `Analyze these job URLs in order:\n${urls.map((url, index) => `${index + 1}. ${url}`).join('\n')}` }] },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'job_link_analysis',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['jobs'],
            properties: { jobs: { type: 'array', items: jobSchema } },
          },
        },
      },
    }),
  })
  if (!openAiResponse.ok) return json({ error: 'OpenAI could not analyze these job links' }, 502)

  let analysis: { jobs?: unknown }
  try {
    const response = await openAiResponse.json()
    analysis = parseOpenAiOutput<{ jobs?: unknown }>(response)
  } catch {
    return json({ error: 'OpenAI returned an invalid analysis' }, 502)
  }
  if (!Array.isArray(analysis.jobs)) return json({ error: 'OpenAI returned no job results' }, 502)

  const submittedUrls = new Set(urls)
  const jobs = analysis.jobs.flatMap((item: Record<string, unknown>) => {
    if (typeof item.sourceUrl !== 'string' || !submittedUrls.has(item.sourceUrl)) return []
    if (typeof item.title !== 'string' || !item.title.trim() || typeof item.company !== 'string' || !item.company.trim()) return []
    if (typeof item.descriptionOriginal !== 'string' || !item.descriptionOriginal.trim()) return []
    return [{
      user_id: user.id,
      title: item.title.trim(),
      company: item.company.trim(),
      location: nullableString(item.location),
      workplace_type: item.workplaceType,
      employment_type: nullableString(item.employmentType),
      seniority: nullableString(item.seniority),
      description_original: item.descriptionOriginal,
      description_ai_summary: nullableString(item.summary),
      requirements_required: Array.isArray(item.required) ? item.required : [],
      requirements_preferred: Array.isArray(item.preferred) ? item.preferred : [],
      salary_min: nullableNumber(item.salaryMin),
      salary_max: nullableNumber(item.salaryMax),
      currency: nullableString(item.currency),
      source_platform: sourcePlatform(item.sourceUrl),
      source_url: item.sourceUrl,
      application_platform: nullableString(item.applicationPlatform),
      application_url: isPublicHttpsUrl(item.applicationUrl) ? item.applicationUrl : null,
      published_at: validDate(item.publishedAt),
      verified_at: null,
    }]
  })
  if (!jobs.length) return json({ error: 'No public job descriptions could be verified from those links' }, 422)

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const savedJobs = []
  for (const job of jobs) {
    const { data, error } = await adminClient.from('jobs')
      .upsert(job, { onConflict: 'user_id,canonical_application_url' })
      .select('id,title,company,location,workplace_type,employment_type,seniority,description_original,description_ai_summary,requirements_required,requirements_preferred,salary_min,salary_max,currency,source_platform,source_url,application_platform,application_url,published_at,discovered_at,verified_at')
      .single()
    if (error) return json({ error: 'Could not save analyzed jobs' }, 500)
    const { error: sourceError } = await adminClient.from('job_sources').upsert({
      user_id: user.id,
      job_id: data.id,
      platform: job.source_platform,
      source_url: job.source_url,
    }, { onConflict: 'user_id,job_id,source_url' })
    if (sourceError) return json({ error: 'Could not save job source provenance' }, 500)
    savedJobs.push(data)
  }
  return json({ jobs: savedJobs }, 200)
})

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase()
  return host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
    /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host === '::1'
}

function isPublicHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !isPrivateHost(url.hostname)
  } catch {
    return false
  }
}

function sourcePlatform(value: unknown) {
  if (typeof value !== 'string') return 'Unknown'
  const host = new URL(value).hostname.toLowerCase()
  if (host.includes('linkedin.com')) return 'LinkedIn'
  if (host.includes('greenhouse.io')) return 'Greenhouse'
  if (host.includes('lever.co')) return 'Lever'
  if (host.includes('ashbyhq.com')) return 'Ashby'
  if (host.includes('myworkdayjobs.com')) return 'Workday'
  return host.replace(/^www\./, '')
}

function nullableString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function nullableNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function validDate(value: unknown) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null
  return new Date(value).toISOString()
}

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}