import { z } from 'zod'

export const evidenceItemSchema = z.object({
  id: z.string().uuid(),
  claim: z.string().trim().min(1),
  confidence: z.number().min(0).max(1),
  verifiedByUser: z.boolean(),
  allowedForApplication: z.boolean(),
})

export type EvidenceItem = z.infer<typeof evidenceItemSchema>

export function evidenceForApplication(items: EvidenceItem[]) {
  return items.filter((item) => item.verifiedByUser && item.allowedForApplication)
}

export function validateSupportedEvidence(claimedEvidenceIds: string[], evidence: EvidenceItem[]) {
  const allowedIds = new Set(evidenceForApplication(evidence).map((item) => item.id))
  return claimedEvidenceIds.every((id) => allowedIds.has(id))
}