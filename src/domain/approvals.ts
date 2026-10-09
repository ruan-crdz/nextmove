export type ApprovalClass = 'SAFE_AUTO' | 'RULE_REQUIRED' | 'ALWAYS_APPROVE'

const safeFields = new Set([
  'name', 'email', 'phone', 'portfolio_url', 'linkedin_url', 'experience', 'education', 'skills',
])
const ruleFields = new Set([
  'salary', 'salary_expectation', 'notice_period', 'relocation', 'hybrid', 'onsite', 'schedule', 'travel',
])
const sensitiveTerms = /work.?authori[sz]ation|visa|conflict|criminal|background|disabilit|ethnic|race|legal|consent|truth|accurate|certif|submit|autoriz|defici|etni|ra[cç]a|antecedent|jur[ií]dic|declara|enviar|submeter/i

export function classifyApproval(fieldKey: string, question = ''): ApprovalClass {
  const normalizedKey = fieldKey.trim().toLowerCase().replace(/[ -]/g, '_')
  if (sensitiveTerms.test(`${normalizedKey} ${question}`)) return 'ALWAYS_APPROVE'
  if (safeFields.has(normalizedKey)) return 'SAFE_AUTO'
  if (ruleFields.has(normalizedKey)) return 'RULE_REQUIRED'
  return 'ALWAYS_APPROVE'
}