const appUrl = 'https://ruan-crdz.github.io/nextmove/'
const status = document.querySelector('#status')
const sendButton = document.querySelector('#send')
let jobUrl = null

function isLinkedInJobUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && /(^|\.)linkedin\.com$/i.test(url.hostname) && /\/jobs\/view\/\d+/.test(url.pathname)
  } catch {
    return false
  }
}

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab?.url || !isLinkedInJobUrl(tab.url)) {
    status.textContent = 'Abra uma página pública de vaga do LinkedIn para continuar.'
    return
  }
  jobUrl = tab.url
  status.textContent = tab.title || new URL(jobUrl).pathname
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