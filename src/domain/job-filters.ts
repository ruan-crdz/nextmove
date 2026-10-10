export type JobFilters = {
  location: string
  workplace: string
  minMatch: string
  source: string
  status: string
}

export const emptyJobFilters: JobFilters = {
  location: '',
  workplace: '',
  minMatch: '',
  source: '',
  status: '',
}