export function linkedInJobUrl(value: string | null) {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !/(^|\.)linkedin\.com$/i.test(url.hostname) || !/\/jobs\/view\/\d+/.test(url.pathname)) return null
    return url.toString()
  } catch {
    return null
  }
}