const appUrl = 'https://ruan-crdz.github.io/nextmove/'
const status = document.querySelector('#status')
const sendButton = document.querySelector('#send')
let jobUrl = null

function canonicalLinkedInJobUrl(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !/(^|\.)linkedin\.com$/i.test(url.hostname)) return null
    const jobPath = url.pathname.match(/\/jobs\/view\/(\d+)/)
    const searchResultId = url.pathname.includes('/jobs/search-results/') ? url.searchParams.get('currentJobId') : null
    const jobId = jobPath?.[1] ?? (searchResultId && /^\d+$/.test(searchResultId) ? searchResultId : null)
    return jobId ? `https://www.linkedin.com/jobs/view/${jobId}/` : null
  } catch {
    return null
  }
}

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  const canonicalUrl = tab?.url ? canonicalLinkedInJobUrl(tab.url) : null
  if (!canonicalUrl) {
    status.textContent = 'Abra uma vaga pública ou selecione uma vaga nos resultados do LinkedIn.'
    return
  }
  jobUrl = canonicalUrl
  status.textContent = `Vaga ${new URL(jobUrl).pathname.split('/').filter(Boolean).at(-1)}`
  sendButton.disabled = false
})

sendButton.addEventListener('click', async () => {
  if (!jobUrl) return
  const destination = new URL(appUrl)
  destination.searchParams.set('jobUrl', jobUrl)
  sendButton.disabled = true
  status.textContent = 'Abrindo o NextMove…'
  await chrome.tabs.create({ url: destination.toString() })
  window.close()
})