export type ProfileSummary = {
  fullName: string | null
  headline: string | null
  location: string | null
  completeness: number
}

export type SearchPreferences = {
  job_titles: string[]
  locations: string[]
  workplace_types: string[]
  employment_types: string[]
  seniority: string[]
  salary_min: number | null
  salary_currency: string
  languages: string[]
}

export function splitPreferenceList(value: string) {
  return [...new Set(value.split(/[\n,;]/).map((item) => item.trim()).filter(Boolean))]
}

export function joinPreferenceList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').join('\n') : ''
}