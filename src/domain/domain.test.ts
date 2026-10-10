import { describe, expect, it, vi } from 'vitest'
import { classifyApproval } from './approvals'
import { evidenceForApplication, validateSupportedEvidence } from './evidence'
import { calculateMatch } from './matching'
import { normalizeLinkedInProfileUrl, resumeProfileSchema } from './resume'
import { linkedInJobUrl } from './extensionImport'
import { openAiOutputText, parseOpenAiOutput } from '../../supabase/functions/_shared/openai-response'
import popupHtml from '../../browser-extension/popup.html?raw'
import popupScript from '../../browser-extension/popup-v2.js?raw'

const evidence = [
  { id: '91ea9794-8324-49d4-b210-b3484569ecf0', claim: 'React', confidence: 1, verifiedByUser: true, allowedForApplication: true },
  { id: '4551ca4e-17c5-4563-8e25-614505598574', claim: 'Python', confidence: 0.8, verifiedByUser: false, allowedForApplication: true },
]

describe('professional evidence', () => {
  it('only returns claims reviewed and allowed by the user', () => {
    expect(evidenceForApplication(evidence)).toEqual([evidence[0]])
  })

  it('rejects unsupported or unverified claims', () => {
    expect(validateSupportedEvidence([evidence[0].id], evidence)).toBe(true)
    expect(validateSupportedEvidence([evidence[1].id], evidence)).toBe(false)
  })
})

describe('job matching', () => {
  const dimensions = { skills: 90, experience: 80, seniority: 80, title: 80, education: 100, location: 100, language: 80 }

  it('requires all referenced evidence before recommending apply', () => {
    expect(calculateMatch({ dimensions, requiredEvidenceIds: ['missing'], availableVerifiedEvidenceIds: [], hasHardBlocker: false })).toMatchObject({
      overallScore: 87, recommendation: 'STRETCH', unsupportedEvidenceIds: ['missing'],
    })
  })

  it('never recommends a job with a hard blocker', () => {
    expect(calculateMatch({ dimensions, requiredEvidenceIds: [], availableVerifiedEvidenceIds: [], hasHardBlocker: true }).recommendation).toBe('SKIP')
  })
})

describe('approval classification', () => {
  it('allows verified contact data, requires saved rules for preferences, and escalates sensitive questions', () => {
    expect(classifyApproval('email')).toBe('SAFE_AUTO')
    expect(classifyApproval('salary_expectation')).toBe('RULE_REQUIRED')
    expect(classifyApproval('legal_declaration', 'I certify this information is accurate')).toBe('ALWAYS_APPROVE')
    expect(classifyApproval('unknown_field')).toBe('ALWAYS_APPROVE')
  })
})

describe('resume extraction validation', () => {
  it('accepts a structured profile with explicitly empty sections', () => {
    expect(resumeProfileSchema.safeParse({
      fullName: 'Ana Lima', headline: null, summary: null, phone: null, location: null,
      linkedinUrl: null, portfolioUrl: null, experiences: [], educations: [], certifications: [],
      skills: [{ name: 'React', proficiency: null, yearsExperience: null }], projects: [], languages: [],
    }).success).toBe(true)
  })

  it('rejects extracted experience fields without their required structure', () => {
    expect(resumeProfileSchema.safeParse({ fullName: 'Ana Lima', experiences: [{ title: 'Engineer' }] }).success).toBe(false)
  })
})

describe('browser extension handoff', () => {
  it('accepts public LinkedIn job URLs and rejects non-job or non-LinkedIn URLs', () => {
    expect(linkedInJobUrl('https://www.linkedin.com/jobs/view/123456789')).toBe('https://www.linkedin.com/jobs/view/123456789')
    expect(linkedInJobUrl('https://www.linkedin.com/jobs/search-results/?currentJobId=4458633468&trackingId=private')).toBe('https://www.linkedin.com/jobs/view/4458633468')
    expect(linkedInJobUrl('https://www.linkedin.com/jobs/search-results/?currentJobId=not-a-number')).toBeNull()
    expect(linkedInJobUrl('https://linkedin.com/jobs/search/?keywords=react')).toBeNull()
    expect(linkedInJobUrl('https://example.com/jobs/view/123456789')).toBeNull()
    expect(linkedInJobUrl('javascript:alert(1)')).toBeNull()
  })
})

describe('OpenAI Responses API decoding', () => {
  it('reads structured JSON from the raw HTTP output content array', () => {
    const rawResponse = { output: [{ type: 'message', content: [{ type: 'output_text', text: '{"fullName":"Ana Lima"}' }] }] }
    expect(parseOpenAiOutput(rawResponse)).toEqual({ fullName: 'Ana Lima' })
  })

  it('also accepts an SDK output_text convenience field', () => {
    expect(openAiOutputText({ output_text: '{"jobs":[]}' })).toBe('{"jobs":[]}')
  })

  it('rejects responses with no text instead of parsing undefined', () => {
    expect(() => parseOpenAiOutput({ output: [] })).toThrow(/did not contain structured output text/i)
  })
})

describe('LinkedIn profile URL', () => {
  it('normalizes public profile links and rejects unrelated or private links', () => {
    expect(normalizeLinkedInProfileUrl('https://www.linkedin.com/in/ana-lima/?trk=profile')).toBe('https://www.linkedin.com/in/ana-lima')
    expect(normalizeLinkedInProfileUrl('https://linkedin.com/jobs/view/123')).toBeNull()
    expect(normalizeLinkedInProfileUrl('https://example.com/in/ana')).toBeNull()
    expect(normalizeLinkedInProfileUrl('http://linkedin.com/in/ana')).toBeNull()
  })
})

describe('browser extension direct queue flow', () => {
  it('analyzes and queues the selected search-result job without opening a tab', async () => {
    document.body.innerHTML = popupHtml.match(/<body>([\s\S]*)<\/body>/)?.[1].replace(/<script[^>]*>[\s\S]*?<\/script>/g, '') ?? ''
    const calls: string[] = []
    const session = { access_token: 'access', refresh_token: 'refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'user-id', email: 'person@example.com' } }
    const chromeMock = {
      tabs: { query: (_query: unknown, callback: (tabs: { url: string }[]) => void) => callback([{ url: 'https://www.linkedin.com/jobs/search-results/?currentJobId=4458633468&trackingId=ignored' }]) },
      storage: { local: { get: (_key: string, callback: (data: Record<string, unknown>) => void) => callback({ 'nextmove-extension-session': session }), set: (_value: unknown, callback: () => void) => callback(), remove: (_key: string, callback: () => void) => callback() } },
    }
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)
      if (url.endsWith('/functions/v1/analyze-job-links')) return new Response(JSON.stringify({ jobs: [{ id: 'job-id' }] }), { status: 200 })
      if (url.includes('/rest/v1/applications?on_conflict=')) return new Response(null, { status: 201 })
      if (url.includes('/rest/v1/applications?select=id')) return new Response(JSON.stringify([{ id: 'application-id' }]), { status: 200 })
      if (url.endsWith('/functions/v1/queue-application')) return new Response(JSON.stringify({ status: 'queued' }), { status: 202 })
      throw new Error(`Unexpected request ${url}`)
    })
    vi.stubGlobal('chrome', chromeMock)
    vi.stubGlobal('fetch', fetchMock)
    Object.assign(window, { NEXTMOVE_EXTENSION_CONFIG: { supabaseUrl: 'https://project.supabase.co', publishableKey: 'sb_publishable_test' }, chrome: chromeMock, fetch: fetchMock })
    window.eval(popupScript)

    await vi.waitFor(() => expect(document.querySelector<HTMLButtonElement>('#send')?.disabled).toBe(false))
    expect(document.querySelector<HTMLFormElement>('#login-form')?.hidden).toBe(true)
    expect(document.querySelector<HTMLDivElement>('#account-view')?.hidden).toBe(false)
    document.querySelector<HTMLButtonElement>('#send')?.click()
    await vi.waitFor(() => expect(document.querySelector('#status')?.textContent).toMatch(/adicionada à fila/i))

    expect(calls).toEqual([
      'https://project.supabase.co/functions/v1/analyze-job-links',
      'https://project.supabase.co/rest/v1/applications?on_conflict=user_id%2Cjob_id',
      'https://project.supabase.co/rest/v1/applications?select=id&user_id=eq.user-id&job_id=eq.job-id&limit=1',
      'https://project.supabase.co/functions/v1/queue-application',
    ])
  })
})