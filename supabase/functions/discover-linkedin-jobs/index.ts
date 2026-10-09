import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const nullableText = { type: ['string', 'null'] }
const searchResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['jobs'],
  properties: {
    jobs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'company', 'sourceUrl', 'location', 'workplaceType', 'employmentType', 'seniority', 'description', 'summary', 'requiredSkills', 'preferredSkills', 'applicationUrl', 'publishedAt', 'matchScore', 'matchedSkills', 'gaps', 'reasoning'],
        properties: {
          title: { type: 'string' }, company: { type: 'string' }, sourceUrl: { type: 'string' }, location: nullableText,
          workplaceType: { type: 'string', enum: ['remote', 'hybrid', 'onsite', 'unknown'] },
          employmentType: nullableText, seniority: nullableText, description: { type: 'string' }, summary: { type: 'string' },
          requiredSkills: { type: 'array', items: { type: 'string' } }, preferredSkills: { type: 'array', items: { type: 'string' } },
          applicationUrl: nullableText, publishedAt: nullableText, matchScore: { type: 'number' },
          matchedSkills: { type: 'array', items: { type: 'string' } }, gaps: { type: 'array', items: { type: 'string' } }, reasoning: { type: 'string' },
        },
      },
    },
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

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const [profileResult, skillResult, experienceResult, educationResult, languageResult, preferenceResult] = await Promise.all([
    admin.from('profiles').select('full_name,headline,summary,location').eq('id', user.id).maybeSingle(),
    admin.from('skills').select('name,proficiency,years_experience').eq('user_id', user.id),
    admin.from('experiences').select('company,title,description,location').eq('user_id', user.id),
    admin.from('educations').select('institution,degree,field_of_study').eq('user_id', user.id),
    admin.from('languages').select('name,proficiency').eq('user_id', user.id),
    admin.from('job_preferences').select('job_titles,locations,workplace_types,seniority').eq('user_id', user.id).maybeSingle(),
  ])
  if (profileResult.error) return json({ error: 'Could not load the confirmed profile' }, 500)
  const profile = profileResult.data
  if (!profile || (!profile.headline && !(skillResult.data?.length))) {
    return json({ error: 'Import and confirm your resume before searching for matching jobs' }, 409)
  }

  const context = {
    headline: profile.headline,
    summary: profile.summary,
    location: preferenceResult.data?.locations?.join(', ') || profile.location,
    targetTitles: preferenceResult.data?.job_titles ?? [],
    seniority: preferenceResult.data?.seniority ?? [],
    workplaceTypes: preferenceResult.data?.workplace_types ?? [],
    skills: skillResult.data ?? [],
    experience: experienceResult.data ?? [],
    education: educationResult.data ?? [],
    languages: languageResult.data ?? [],
  }
  const searchTerms = [...new Set([
    ...context.targetTitles,
    profile.headline,
    ...(skillResult.data ?? []).slice(0, 8).map((skill) => skill.name),
    context.location,
  ].filter((value): value is string => typeof value === 'string' && value.trim()))].join(' ')

  let response: Response
  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        tools: [{ type: 'web_search' }],
        input: [
          {
            role: 'system',
            content: [{ type: 'input_text', text: 'Search the public web for up to 8 current job postings on publicly indexed LinkedIn /jobs/view/ pages that are relevant to the user profile. Never sign in, access private pages, or scrape authenticated LinkedIn. Return only job URLs cited by your web search results. Do not invent companies, job URLs, job descriptions, requirements, salaries, locations, or dates. If a fact is not in cited public results, use null, an empty list, or a clear uncertainty in reasoning. Keep the job description excerpt separate from your summary. Match only against the supplied confirmed profile; report gaps honestly and do not infer missing experience. Prefer recent active postings. If search results do not provide a public LinkedIn job URL, omit the result.' }],
          },
          { role: 'user', content: [{ type: 'input_text', text: `Find suitable LinkedIn job listings using this confirmed professional profile:\n${JSON.stringify(context)}\nSearch keywords: ${searchTerms}` }] },
        ],
        text: { format: { type: 'json_schema', name: 'linkedin_job_discovery', strict: true, schema: searchResultSchema } },
      }),
    })
  } catch {
    return json({ error: 'Could not connect to public job search' }, 502)
  }
  if (!response.ok) return json({ error: 'OpenAI could not search public LinkedIn job listings' }, 502)

  let parsed: { jobs?: unknown }
  let citations = new Set<string>()
  try {
    const result = await response.json()
    parsed = JSON.parse(result.output_text)
    citations = collectCitations(result.output)
  } catch {
    return json({ error: 'Job search returned an invalid response' }, 502)
  }
  if (!Array.isArray(parsed.jobs)) return json({ error: 'Job search returned no results' }, 502)

  const candidates = parsed.jobs.flatMap((job: Record<string, unknown>) => {
    if (typeof job.sourceUrl !== 'string') return []
    const sourceUrl = canonicalLinkedInUrl(job.sourceUrl)
    if (!sourceUrl || !citations.has(sourceUrl)) return []
    if (typeof job.title !== 'string' || !job.title.trim() || typeof job.company !== 'string' || !job.company.trim()) return []
    if (typeof job.description !== 'string' || !job.description.trim()) return []
    const score = typeof job.matchScore === 'number' && Number.isFinite(job.matchScore) ? Math.max(0, Math.min(100, Math.round(job.matchScore))) : 0
    const applicationUrl = publicHttpsUrl(job.applicationUrl) ? job.applicationUrl : sourceUrl
    return [{
      db: {
        user_id: user.id,
        title: job.title.trim(), company: job.company.trim(), location: nullableTextValue(job.location),
        workplace_type: job.workplaceType, employment_type: nullableTextValue(job.employmentType), seniority: nullableTextValue(job.seniority),
        description_original: job.description, description_ai_summary: nullableTextValue(job.summary),
        requirements_required: stringArray(job.requiredSkills), requirements_preferred: stringArray(job.preferredSkills),
        source_platform: 'LinkedIn', source_url: sourceUrl,
        application_platform: applicationUrl === sourceUrl ? 'LinkedIn' : new URL(applicationUrl).hostname,
        application_url: applicationUrl, published_at: validDate(job.publishedAt), verified_at: null,
      },
      score,
      matchedSkills: stringArray(job.matchedSkills),
      gaps: stringArray(job.gaps),
      reasoning: nullableTextValue(job.reasoning) ?? 'Compatibilidade calculada com base no perfil confirmado.',
    }]
  })
  if (!candidates.length) return json({ jobs: [], message: 'Nenhuma vaga pública do LinkedIn com citação verificável foi encontrada. Tente novamente ou adicione um link.' }, 200)

  const savedJobs = []
  for (const candidate of candidates) {
    const { data: job, error } = await admin.from('jobs')
      .upsert(candidate.db, { onConflict: 'user_id,canonical_application_url' })
      .select('id,title,company,location,workplace_type,employment_type,seniority,description_original,description_ai_summary,requirements_required,requirements_preferred,salary_min,salary_max,currency,source_platform,source_url,application_platform,application_url,published_at,discovered_at,verified_at')
      .single()
    if (error) return json({ error: 'Could not save discovered jobs' }, 500)

    const { error: matchError } = await admin.from('job_matches').upsert({
      user_id: user.id, job_id: job.id, overall_score: candidate.score,
      recommendation: candidate.score >= 78 ? 'APPLY' : candidate.score >= 55 ? 'STRETCH' : 'SKIP',
      dimensions: {}, matched_requirements: candidate.matchedSkills, missing_requirements: candidate.gaps,
      transferable_strengths: [], hard_blockers: [], reasoning_summary: candidate.reasoning,
    }, { onConflict: 'user_id,job_id' })
    if (matchError) return json({ error: 'Could not save job matching analysis' }, 500)
    const { error: sourceError } = await admin.from('job_sources').upsert({
      user_id: user.id, job_id: job.id, platform: 'LinkedIn', source_url: candidate.db.source_url,
    }, { onConflict: 'user_id,job_id,source_url' })
    if (sourceError) return json({ error: 'Could not save LinkedIn source' }, 500)
    savedJobs.push({ ...job, match_score: candidate.score, matched_skills: candidate.matchedSkills, missing_requirements: candidate.gaps, reasoning_summary: candidate.reasoning })
  }
  return json({ jobs: savedJobs, count: savedJobs.length }, 200)
})

function collectCitations(output: unknown) {
  const urls = new Set<string>()
  if (!Array.isArray(output)) return urls
  for (const item of output) {
    if (!item || typeof item !== 'object' || !Array.isArray((item as Record<string, unknown>).content)) continue
    for (const content of (item as { content: unknown[] }).content) {
      if (!content || typeof content !== 'object' || !Array.isArray((content as Record<string, unknown>).annotations)) continue
      for (const annotation of (content as { annotations: unknown[] }).annotations) {
        if (!annotation || typeof annotation !== 'object') continue
        const value = annotation as Record<string, unknown>
        if (value.type === 'url_citation' && typeof value.url === 'string') {
          const canonical = canonicalLinkedInUrl(value.url)
          if (canonical) urls.add(canonical)
        }
      }
    }
  }
  return urls
}

function canonicalLinkedInUrl(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !/(^|\.)linkedin\.com$/i.test(url.hostname) || !url.pathname.includes('/jobs/view/')) return null
    url.hash = ''
    url.search = ''
    return url.href
  } catch {
    return null
  }
}

function publicHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !isPrivateHost(url.hostname)
  } catch {
    return false
  }
}

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase()
  return host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
    /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host === '::1'
}

function nullableTextValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 20) : []
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