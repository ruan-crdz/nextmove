const { supabaseUrl, publishableKey } = globalThis.NEXTMOVE_EXTENSION_CONFIG
const status = document.querySelector('#status')
const sendButton = document.querySelector('#send')
const loginForm = document.querySelector('#login-form')
const accountView = document.querySelector('#account-view')
const accountLabel = document.querySelector('#account-label')
const signOutButton = document.querySelector('#sign-out')
const sessionStorageKey = 'nextmove-extension-session'
const linkedinOriginKey = 'nextmove-extension-linkedin-origin'
let jobUrl = null
let originUrl = null
let activeTabId = null
let needsLinkedInApplicationLink = false
let session = null
let busy = false

function activeJobUrl(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || isPrivateHost(url.hostname)) return null
    if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) {
      if (url.pathname === '/') return null
      return { applicationUrl: url.href, linkedinOrigin: null, needsApplicationLink: false, label: url.hostname }
    }
    const directJobId = url.pathname.match(/\/jobs\/view\/(\d+)/)?.[1]
    const resultJobId = url.pathname.includes('/jobs/search-results/') ? url.searchParams.get('currentJobId') : null
    const jobId = directJobId ?? (resultJobId && /^\d+$/.test(resultJobId) ? resultJobId : null)
    if (!jobId) return null
    const canonicalUrl = `https://www.linkedin.com/jobs/view/${jobId}/`
    return { applicationUrl: null, linkedinOrigin: canonicalUrl, needsApplicationLink: true, label: `vaga ${jobId}` }
  } catch {
    return null
  }
}

function isPrivateHost(hostname) {
  const host = hostname.toLowerCase()
  return host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
    /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host === '::1'
}

function jobLabel() {
  return `Vaga ${new URL(jobUrl).pathname.split('/').filter(Boolean).at(-1)}`
}

function render() {
  const hasJob = Boolean(jobUrl || needsLinkedInApplicationLink)
  loginForm.hidden = !hasJob || Boolean(session)
  accountView.hidden = !hasJob || !session
  sendButton.disabled = !session || !hasJob || busy
  document.querySelector('#send-label').textContent = needsLinkedInApplicationLink ? 'Extrair candidatura e adicionar à fila' : 'Adicionar à fila'
  if (session) accountLabel.textContent = `Conectado como ${session.user.email}`
}

function extractApplicationLinkFromPage() {
  const visibleLinks = Array.from(document.querySelectorAll('a[href]')).filter((anchor) => {
    const label = (anchor.innerText || anchor.getAttribute('aria-label') || anchor.textContent || '').replace(/\s+/g, ' ').trim()
    const visible = anchor.getClientRects().length > 0 && getComputedStyle(anchor).visibility !== 'hidden'
    return visible && /^(candidatar-se|apply(?: now)?)$/i.test(label)
  })
  const destinations = new Set()
  for (const anchor of visibleLinks) {
    try {
      const link = new URL(anchor.href)
      if (/(^|\.)linkedin\.com$/i.test(link.hostname) && link.pathname.includes('/safety/go/')) {
        const destination = link.searchParams.get('url')
        if (destination) destinations.add(destination)
      } else {
        destinations.add(link.href)
      }
    } catch {
      continue
    }
  }
  const safeDestinations = [...destinations].filter((value) => {
    try {
      const url = new URL(value)
      return url.protocol === 'https:' && !/(^|\.)linkedin\.com$/i.test(url.hostname) &&
        !url.username && !url.password && url.hostname !== 'localhost' && !url.hostname.endsWith('.local') &&
        !/^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)
    } catch {
      return false
    }
  })
  return safeDestinations.length === 1 ? safeDestinations[0] : null
}

function readStoredSession() {
  return new Promise((resolve) => chrome.storage.local.get(sessionStorageKey, (values) => resolve(values[sessionStorageKey] ?? null)))
}

function readLinkedInOrigin() {
  return new Promise((resolve) => chrome.storage.local.get(linkedinOriginKey, (values) => resolve(values[linkedinOriginKey] ?? null)))
}

function storeSession(value) {
  return new Promise((resolve) => chrome.storage.local.set({ [sessionStorageKey]: value }, resolve))
}

function removeStoredSession() {
  return new Promise((resolve) => chrome.storage.local.remove(sessionStorageKey, resolve))
}

async function authRequest(grant, body) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=${grant}`, {
    method: 'POST',
    headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.msg || result.message || 'Não foi possível entrar na conta NextMove.')
  return {
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    expires_at: result.expires_at ?? Math.floor(Date.now() / 1000) + result.expires_in,
    user: result.user,
  }
}

async function getFreshSession() {
  const stored = session ?? await readStoredSession()
  if (!stored) return null
  if (stored.expires_at > Math.floor(Date.now() / 1000) + 60) {
    session = stored
    return stored
  }
  try {
    session = await authRequest('refresh_token', { refresh_token: stored.refresh_token })
    await storeSession(session)
    return session
  } catch {
    session = null
    await removeStoredSession()
    return null
  }
}

async function supabaseRequest(path, options = {}, accessToken = session?.access_token) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  const text = await response.text()
  let result = null
  if (text) {
    try { result = JSON.parse(text) } catch { result = { message: text } }
  }
  if (!response.ok) throw new Error(result?.error ?? result?.message ?? `Supabase retornou ${response.status}.`)
  return result
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  busy = true
  status.textContent = 'Entrando no NextMove…'
  render()
  try {
    const email = document.querySelector('#email').value.trim()
    const password = document.querySelector('#password').value
    session = await authRequest('password', { email, password })
    await storeSession(session)
    document.querySelector('#password').value = ''
    status.textContent = `${jobLabel()} pronta para adicionar.`
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Não foi possível entrar.'
  } finally {
    busy = false
    render()
  }
})

sendButton.addEventListener('click', async () => {
  if ((!jobUrl && !needsLinkedInApplicationLink) || busy) return
  busy = true
  status.textContent = needsLinkedInApplicationLink ? 'Localizando o link de candidatura…' : 'Analisando e adicionando à fila…'
  render()
  try {
    if (needsLinkedInApplicationLink) {
      const [injected] = await chrome.scripting.executeScript({
        target: { tabId: activeTabId },
        func: extractApplicationLinkFromPage,
      })
      const destination = injected?.result
      if (typeof destination !== 'string') throw new Error('Não encontrei um único link externo no botão Candidatar-se. Abra os detalhes da vaga e tente novamente.')
      const parsedDestination = new URL(destination)
      if (parsedDestination.protocol !== 'https:' || isPrivateHost(parsedDestination.hostname) || /(^|\.)linkedin\.com$/i.test(parsedDestination.hostname)) {
        throw new Error('O botão Candidatar-se não apontou para um endereço HTTPS público válido.')
      }
      jobUrl = parsedDestination.href
      needsLinkedInApplicationLink = false
      render()
    }
    const activeSession = await getFreshSession()
    if (!activeSession) throw new Error('Sua sessão expirou. Entre novamente no NextMove pela extensão.')

    const analysis = await supabaseRequest('/functions/v1/analyze-job-links', {
      method: 'POST',
      body: JSON.stringify({ urls: [jobUrl], ...(originUrl && originUrl !== jobUrl ? { originUrl } : {}) }),
    }, activeSession.access_token)
    const jobs = Array.isArray(analysis?.jobs) ? analysis.jobs : []
    if (!jobs.length) throw new Error(analysis?.message || 'Não encontrei dados públicos verificáveis para essa vaga. Tente abrir a vaga diretamente.')

    for (const job of jobs) {
      await supabaseRequest('/rest/v1/applications?on_conflict=user_id%2Cjob_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify({ user_id: activeSession.user.id, job_id: job.id, status: 'saved' }),
      }, activeSession.access_token)
      const rows = await supabaseRequest(`/rest/v1/applications?select=id&user_id=eq.${encodeURIComponent(activeSession.user.id)}&job_id=eq.${encodeURIComponent(job.id)}&limit=1`, {}, activeSession.access_token)
      const applicationId = rows?.[0]?.id
      if (!applicationId) throw new Error('A vaga foi analisada, mas não encontrei a candidatura salva.')
      await supabaseRequest('/functions/v1/queue-application', {
        method: 'POST',
        body: JSON.stringify({ applicationId }),
      }, activeSession.access_token)
    }
    status.textContent = jobs.length === 1
      ? `${jobLabel()} analisada e adicionada à fila. Abra o NextMove quando quiser acompanhar.`
      : `${jobs.length} vagas adicionadas à fila NextMove.`
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível adicionar a vaga à fila.'
    if (/401|jwt|session|token/i.test(message)) {
      session = null
      await removeStoredSession()
      status.textContent = 'Sua sessão expirou. Entre novamente no NextMove pela extensão.'
    } else {
      status.textContent = message
    }
  } finally {
    busy = false
    render()
  }
})

signOutButton.addEventListener('click', async () => {
  session = null
  await removeStoredSession()
  status.textContent = jobUrl ? `${jobLabel()} aberta. Entre para adicionar à fila.` : 'Abra uma vaga pública do LinkedIn.'
  render()
})

chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
  activeTabId = tab?.id ?? null
  const activeJob = tab?.url ? activeJobUrl(tab.url) : null
  jobUrl = activeJob?.applicationUrl ?? null
  needsLinkedInApplicationLink = Boolean(activeJob?.needsApplicationLink)
  if (activeJob?.linkedinOrigin) {
    originUrl = activeJob.linkedinOrigin
    await new Promise((resolve) => chrome.storage.local.set({ [linkedinOriginKey]: { url: originUrl, capturedAt: Date.now() } }, resolve))
  } else if (activeJob) {
    const stored = await readLinkedInOrigin()
    if (stored?.url && Date.now() - stored.capturedAt < 30 * 60 * 1000) originUrl = stored.url
  }
  if (!activeJob) status.textContent = 'Abra uma vaga pública do LinkedIn ou a página de candidatura da empresa.'
  else if (activeJob.needsApplicationLink) status.textContent = `${activeJob.label} · o botão vai localizar o link de candidatura externo`
  else if (originUrl && !activeJob.linkedinOrigin) status.textContent = `${activeJob.label} · origem LinkedIn preservada`
  else status.textContent = activeJob.label
  session = await getFreshSession()
  render()
})