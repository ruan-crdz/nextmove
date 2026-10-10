export function linkedInJobUrl(value: string | null) {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !/(^|\.)linkedin\.com$/i.test(url.hostname)) return null
    const viewId = url.pathname.match(/\/jobs\/view\/(\d+)/)?.[1]
    const searchId = url.pathname.includes('/jobs/search-results/') ? url.searchParams.get('currentJobId') : null
    const jobId = viewId ?? (searchId && /^\d+$/.test(searchId) ? searchId : null)
    if (!jobId) return null
    url.pathname = `/jobs/view/${jobId}`
    url.search = ''
    url.hash = ''
    return `https://www.linkedin.com${url.pathname}`
  } catch {
    return null
  }
}