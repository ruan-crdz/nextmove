export type MatchDimension = 'skills' | 'experience' | 'seniority' | 'title' | 'education' | 'location' | 'language'

export type MatchInput = {
  dimensions: Record<MatchDimension, number>
  requiredEvidenceIds: string[]
  availableVerifiedEvidenceIds: string[]
  hasHardBlocker: boolean
}

export function calculateMatch(input: MatchInput) {
  const weights: Record<MatchDimension, number> = {
    skills: 0.28, experience: 0.2, seniority: 0.14, title: 0.12,
    education: 0.1, location: 0.1, language: 0.06,
  }
  const evidence = new Set(input.availableVerifiedEvidenceIds)
  const unsupported = input.requiredEvidenceIds.filter((id) => !evidence.has(id))
  const weightedScore = Object.entries(weights).reduce((score, [dimension, weight]) => {
    const value = input.dimensions[dimension as MatchDimension]
    if (!Number.isFinite(value) || value < 0 || value > 100) throw new RangeError(`Invalid ${dimension} score`)
    return score + value * weight
  }, 0)
  const overallScore = Math.round(weightedScore)
  const recommendation = input.hasHardBlocker || overallScore < 55
    ? 'SKIP'
    : overallScore >= 78 && unsupported.length === 0 ? 'APPLY' : 'STRETCH'

  return { overallScore, recommendation, unsupportedEvidenceIds: unsupported }
}