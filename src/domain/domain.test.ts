import { describe, expect, it } from 'vitest'
import { classifyApproval } from './approvals'
import { evidenceForApplication, validateSupportedEvidence } from './evidence'
import { calculateMatch } from './matching'
import { resumeProfileSchema } from './resume'
import { linkedInJobUrl } from './extensionImport'

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
    expect(linkedInJobUrl('https://linkedin.com/jobs/search/?keywords=react')).toBeNull()
    expect(linkedInJobUrl('https://example.com/jobs/view/123456789')).toBeNull()
    expect(linkedInJobUrl('javascript:alert(1)')).toBeNull()
  })
})