import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, Clock3, Send, ShieldCheck, X, Filter, ArrowDownWideNarrow, ChevronDown, Link2, BriefcaseBusiness, Plus } from 'lucide-react'
import { demoJobs, mapStoredJob, type Job } from './domain/jobs'
import type { AppView } from './domain/app-view'
import { emptyJobFilters, type JobFilters } from './domain/job-filters'
import type { ProfileSummary, SearchPreferences } from './domain/preferences'
import { AuthDialog } from './components/AuthDialog'
import { WelcomePage } from './components/WelcomePage'
import { ResumeImportView } from './components/ResumeImportView'
import { ApprovalQueueView } from './components/ApprovalQueueView'
import { AppHeader } from './components/layout/AppHeader'
import { DesktopSidebar } from './components/layout/DesktopSidebar'
import { DesktopAgentRail } from './components/layout/DesktopAgentRail'
import { MobileBottomNav } from './components/layout/MobileBottomNav'
import { HomeDashboard } from './components/home/HomeDashboard'
import { JobCard as JobCardView } from './components/jobs/JobCard'
import { JobFiltersSheet } from './components/jobs/JobFiltersSheet'
import { CandidateTracker } from './components/jobs/CandidateTracker'
import { SearchPreferencesDialog } from './components/preferences/SearchPreferencesDialog'
import type { ResumeProfile } from './domain/resume'
import { linkedInJobUrl } from './domain/extensionImport'
import { invokeAuthenticated, supabase } from './lib/supabase'
import './components/auth.css'
import './components/brand.css'
import './components/queue-status.css'

function App() {
  const demoMode = import.meta.env.VITE_DEMO_MODE === 'true'
  const configured = Boolean(supabase) && !demoMode
  const [view, setView] = useState<AppView>('Home')
  const [queuedIds, setQueuedIds] = useState<string[]>(() => configured ? [] : demoJobs.filter((job) => job.status).map((job) => job.id))
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [urlEntryOpen, setUrlEntryOpen] = useState(false)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [urls, setUrls] = useState('')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<JobFilters>(emptyJobFilters)
  const [sortOrder, setSortOrder] = useState<'match' | 'recent'>('match')
  const [jobPage, setJobPage] = useState(0)
  const [jobsPerPage, setJobsPerPage] = useState(() => getJobsPerPage())
  const [toast, setToast] = useState('')
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(configured)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup')
  const [authOpen, setAuthOpen] = useState(false)
  const [liveJobs, setLiveJobs] = useState<Job[]>([])
  const [profileSummary, setProfileSummary] = useState<ProfileSummary | null>(null)
  const [searchPreferences, setSearchPreferences] = useState<SearchPreferences | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0)

  useEffect(() => {
    const updatePageSize = () => setJobsPerPage(getJobsPerPage())
    window.addEventListener('resize', updatePageSize)
    return () => window.removeEventListener('resize', updatePageSize)
  }, [])

  useEffect(() => { setJobPage(0) }, [search, filters, sortOrder])

  useEffect(() => {
    if (!supabase || demoMode) return
    let active = true
    supabase.auth.getSession()
      .then(({ data }) => {
        if (!active) return
        setUserEmail(data.session?.user.email ?? null)
        setUserId(data.session?.user.id ?? null)
      })
      .catch(() => { if (active) { setUserEmail(null); setUserId(null) } })
      .finally(() => { if (active) setAuthLoading(false) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? null)
      setUserId(session?.user.id ?? null)
      setAuthLoading(false)
      if (!session) { setLiveJobs([]); setProfileSummary(null); setSearchPreferences(null) }
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [demoMode])

  useEffect(() => {
    if (!supabase || demoMode || !userEmail) return
    let active = true
    Promise.all([
      supabase.from('jobs').select('*').order('discovered_at', { ascending: false }),
      supabase.from('applications').select('job_id,status,failure_reason').order('created_at', { ascending: false }),
      supabase.from('job_matches').select('job_id,overall_score,matched_requirements,missing_requirements,reasoning_summary'),
      supabase.from('profiles').select('full_name,headline,location,completeness').maybeSingle(),
      supabase.from('job_preferences').select('*').maybeSingle(),
    ]).then(([jobsResult, applicationsResult, matchesResult, profileResult, preferencesResult]) => {
      if (!active || jobsResult.error || !jobsResult.data) return
      const applicationByJob = new Map((applicationsResult.data ?? []).map((application) => [application.job_id, application]))
      const matchByJob = new Map((matchesResult.data ?? []).map((match) => [match.job_id, match]))
      setLiveJobs(jobsResult.data.map((record) => mapStoredJob({
        ...record,
        application_status: applicationByJob.get(record.id)?.status,
        failure_reason: applicationByJob.get(record.id)?.failure_reason,
        match_score: matchByJob.get(record.id)?.overall_score,
        matched_skills: matchByJob.get(record.id)?.matched_requirements,
        missing_requirements: matchByJob.get(record.id)?.missing_requirements,
      } as Record<string, unknown>)))
      setQueuedIds([...applicationByJob.keys()])
      setProfileSummary(profileResult.data ? {
        fullName: profileResult.data.full_name,
        headline: profileResult.data.headline,
        location: profileResult.data.location,
        completeness: profileResult.data.completeness ?? 0,
      } : null)
      setSearchPreferences(preferencesResult.data as SearchPreferences | null)
    })
    return () => { active = false }
  }, [demoMode, userEmail])

  useEffect(() => {
    if (!supabase || demoMode || !userEmail) return
    const client = supabase
    let active = true
    const updateCount = async () => {
      const { count } = await client.from('approval_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      if (active) setPendingApprovalCount(count ?? 0)
    }
    void updateCount()
    const interval = window.setInterval(() => { void updateCount() }, 8000)
    return () => { active = false; window.clearInterval(interval) }
  }, [demoMode, userEmail])

  useEffect(() => {
    if (!configured || !userEmail) return
    const params = new URLSearchParams(window.location.search)
    const url = linkedInJobUrl(params.get('jobUrl'))
    if (!url) return
    setUrls(url)
    setView('Vagas')
    setUrlEntryOpen(true)
    window.history.replaceState({}, '', window.location.pathname)
  }, [configured, userEmail])

  const sourceJobs = configured && userEmail ? liveJobs : demoJobs
  const queue = useMemo(() => sourceJobs.filter((job) => queuedIds.includes(job.id)), [queuedIds, sourceJobs])
  const visibleJobs = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    const filtered = sourceJobs.filter((job) => {
      if (normalizedSearch && !`${job.title} ${job.company} ${job.location}`.toLowerCase().includes(normalizedSearch)) return false
      if (filters.location && !job.location.toLowerCase().includes(filters.location.trim().toLowerCase())) return false
      if (filters.workplace && job.workplace !== filters.workplace) return false
      if (filters.minMatch && job.score < Number(filters.minMatch)) return false
      if (filters.source && job.source !== filters.source) return false
      if (filters.status && job.status !== filters.status) return false
      return true
    })
    return filtered.sort((left, right) => sortOrder === 'match'
      ? right.score - left.score
      : new Date(right.discoveredAt ?? 0).getTime() - new Date(left.discoveredAt ?? 0).getTime())
  }, [filters, search, sortOrder, sourceJobs])
  const pageCount = Math.max(1, Math.ceil(visibleJobs.length / jobsPerPage))
  const pageJobs = visibleJobs.slice(jobPage * jobsPerPage, (jobPage + 1) * jobsPerPage)
  const activeFilterCount = Object.values(filters).filter(Boolean).length

  async function addToQueue(job: Job) {
    if (supabase && userEmail) {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        setToast('Sua sessão expirou. Entre novamente para salvar a vaga.')
        return
      }
      const { error } = await supabase.from('applications').upsert({
        user_id: user.id,
        job_id: job.id,
        status: 'saved',
        match_score: null,
      }, { onConflict: 'user_id,job_id', ignoreDuplicates: true })
      if (error) {
        setToast('Não foi possível salvar esta vaga. Tente novamente.')
        return
      }
    }
    setQueuedIds((current) => current.includes(job.id) ? current : [...current, job.id])
    setLiveJobs((current) => current.map((item) => item.id === job.id ? { ...item, status: 'queued' } : item))
    setToast(`${job.company} salva na sua fila`)
    window.setTimeout(() => setToast(''), 2600)
  }

  async function startQueue() {
    if (!supabase || !userEmail) {
      setToast('Modo demo: nenhuma candidatura será enviada.')
      window.setTimeout(() => setToast(''), 3000)
      return
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setToast('Entre novamente para iniciar a fila.')
      return
    }
    const pending = queue.filter((job) => !['applying', 'needs_input', 'submitted', 'failed', 'cancelled'].includes(job.status ?? ''))
    if (!pending.length) {
      setToast('Não há novas candidaturas salvas para iniciar.')
      return
    }
    setAnalyzing(true)
    let dispatched = 0
    let failed = 0
    for (const job of pending) {
      const { data: application } = await supabase.from('applications')
        .select('id').eq('user_id', user.id).eq('job_id', job.id).maybeSingle()
      if (!application) continue
      const { error: queueError } = await invokeAuthenticated('queue-application', { applicationId: application.id })
      if (queueError) { failed += 1; continue }
      const { error: dispatchError } = await invokeAuthenticated('dispatch-application', { applicationId: application.id })
      if (dispatchError) failed += 1
      else dispatched += 1
    }
    setAnalyzing(false)
    if (dispatched) {
      setLiveJobs((current) => current.map((job) => pending.some((item) => item.id === job.id) ? { ...job, status: 'applying' } : job))
      setToast(`${dispatched} agente${dispatched === 1 ? '' : 's'} iniciado${dispatched === 1 ? '' : 's'}${failed ? ` · ${failed} não puderam iniciar` : ''}. Acompanhe a fila para responder aprovações.`)
    } else {
      setToast(failed ? `${failed} candidatura${failed === 1 ? '' : 's'} não pôde${failed === 1 ? '' : 'ram'} iniciar. Verifique o perfil confirmado e tente novamente.` : 'Não há candidaturas salvas para iniciar.')
    }
    window.setTimeout(() => setToast(''), 5000)
  }

  async function addLinks() {
    const links = urls.split(/\s+/).filter((url) => /^https?:\/\//.test(url))
    if (!links.length || links.length > 20) {
      setToast(links.length > 20 ? 'Adicione no máximo 20 URLs por análise' : 'Cole pelo menos uma URL válida')
      window.setTimeout(() => setToast(''), 2600)
      return
    }
    if (!supabase || !userEmail) {
      if (configured) {
        setToast('Entre na sua conta para analisar e salvar vagas')
        setUrlEntryOpen(false)
        setAuthOpen(true)
      } else {
        setToast(`${links.length} link${links.length > 1 ? 's' : ''} recebido${links.length > 1 ? 's' : ''} no modo demo`)
        setUrls('')
        setUrlEntryOpen(false)
      }
      window.setTimeout(() => setToast(''), 3000)
      return
    }
    setAnalyzing(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setAnalyzing(false)
      setUrlEntryOpen(false)
      setAuthOpen(true)
      return
    }
    const { data, error } = await invokeAuthenticated<{ jobs?: Record<string, unknown>[]; error?: string }>('analyze-job-links', { urls: [...new Set(links)] })
    setAnalyzing(false)
    if (error || data?.error) {
      setToast(data?.error ?? 'Não foi possível analisar os links. Tente novamente.')
      window.setTimeout(() => setToast(''), 4000)
      return
    }
    const results = Array.isArray(data?.jobs) ? data.jobs as Record<string, unknown>[] : []
    setLiveJobs((current) => {
      const byId = new Map(current.map((job) => [job.id, job]))
      for (const record of results) byId.set(String(record.id), mapStoredJob(record))
      return [...byId.values()]
    })
    setSearch('')
    setToast(`${results.length} vaga${results.length === 1 ? '' : 's'} analisada${results.length === 1 ? '' : 's'} e salva${results.length === 1 ? '' : 's'}`)
    setUrls('')
    setUrlEntryOpen(false)
    window.setTimeout(() => setToast(''), 3000)
  }

  async function discoverLinkedInJobs(profile: ResumeProfile) {
    setView('Vagas')
    if (!supabase) return
    setAnalyzing(true)
    setToast(`Perfil confirmado${profile.headline ? ` para ${profile.headline}` : ''}. Buscando vagas públicas no LinkedIn…`)
    const { data, error } = await invokeAuthenticated<{ jobs?: Record<string, unknown>[]; error?: string; message?: string }>('discover-linkedin-jobs')
    setAnalyzing(false)
    if (error || data?.error) {
      setToast(data?.error ?? 'Não foi possível buscar vagas agora. Tente novamente pela busca.')
      window.setTimeout(() => setToast(''), 5000)
      return
    }
    const results = Array.isArray(data?.jobs) ? data.jobs as Record<string, unknown>[] : []
    setLiveJobs((current) => {
      const byId = new Map(current.map((job) => [job.id, job]))
      for (const record of results) byId.set(String(record.id), mapStoredJob(record))
      return [...byId.values()]
    })
    setToast(results.length ? `${results.length} vagas públicas do LinkedIn encontradas` : data?.message ?? 'Nenhuma vaga pública compatível encontrada. Você também pode colar links.')
    window.setTimeout(() => setToast(''), 5000)
  }

  function openSearchPreferences() {
    if (userId) {
      setPreferencesOpen(true)
      return
    }
    if (configured) {
      setAuthMode('login')
      setAuthOpen(true)
      return
    }
    setToast('Entre na sua conta para salvar suas preferências de busca.')
    window.setTimeout(() => setToast(''), 3500)
  }

  async function handleAccountAction() {
    if (userEmail) {
      await supabase?.auth.signOut()
      setToast('Você saiu da sua conta')
      return
    }
    if (configured) {
      setAuthMode('login')
      setAuthOpen(true)
    }
  }

  function handlePreferencesSaved(preferences: SearchPreferences) {
    setSearchPreferences(preferences)
    setToast('Preferências salvas')
    window.setTimeout(() => setToast(''), 2600)
  }

  function handleHeaderSearch() {
    setView('Vagas')
  }

  if (configured && !userEmail) {
    return <>
      <WelcomePage
        loading={authLoading}
        onSignUp={() => { setAuthMode('signup'); setAuthOpen(true) }}
        onLogIn={() => { setAuthMode('login'); setAuthOpen(true) }}
      />
      {authOpen && !authLoading && <AuthDialog initialMode={authMode} onClose={() => setAuthOpen(false)} />}
    </>
  }

  return (
    <div className={`app-shell ${!userEmail ? 'is-demo' : ''}`}>
      <AppHeader
        view={view}
        userEmail={userEmail}
        queueCount={queue.length}
        approvalCount={pendingApprovalCount}
        search={search}
        onSearchChange={setSearch}
        onSearch={handleHeaderSearch}
        onNavigate={setView}
        onAccount={() => { void handleAccountAction() }}
      />

      <main className="workspace">
        <DesktopSidebar
          profile={profileSummary}
          preferences={searchPreferences}
          demo={!userEmail}
          queueCount={queue.length}
          onNavigate={setView}
          onEditPreferences={openSearchPreferences}
        />

        <section className="feed-column">
          {view !== 'Home' && <div className="feed-heading"><div className="feed-heading-copy"><span className="eyebrow">NEXT MOVE</span><h1>{view === 'Vagas' ? 'Vagas para você' : view === 'Currículo' ? 'Perfil' : view}</h1><p>{view === 'Vagas' ? 'Selecionadas com base no seu perfil e preferências.' : view === 'Fila' ? 'Acompanhe cada candidatura e veja quando sua ação é necessária.' : view === 'Candidaturas' ? 'Acompanhe o status das vagas salvas.' : view === 'Aprovações' ? 'Responda apenas ao que precisa da sua decisão.' : 'Confirme os dados antes de usá-los em candidaturas.'}</p></div></div>}
          {view === 'Home' && <HomeDashboard jobs={sourceJobs} queue={queue} profile={profileSummary} preferences={searchPreferences} realAccount={Boolean(userEmail && configured)} pendingApprovalCount={pendingApprovalCount} onNavigate={setView} onEditPreferences={openSearchPreferences} onQueue={(job) => { void addToQueue(job) }} onDetails={setSelectedJob} />}
          {view === 'Vagas' && <>
            <div className="jobs-toolbar"><span className="jobs-result-count">{visibleJobs.length} vaga{visibleJobs.length === 1 ? '' : 's'} encontradas</span><div className="jobs-toolbar-actions"><button className="filter-trigger" onClick={() => setFiltersOpen(true)}><Filter size={16} />Filtros{activeFilterCount > 0 && <b>{activeFilterCount}</b>}</button><label className="sort-control"><ArrowDownWideNarrow size={15} /><select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as 'match' | 'recent')} aria-label="Ordenar vagas"><option value="match">Mais compatíveis</option><option value="recent">Mais recentes</option></select><ChevronDown size={14} /></label><button className="add-link-button" onClick={() => setUrlEntryOpen(true)}><Link2 size={15} />Adicionar vaga</button></div></div>
            <div className="job-list">{pageJobs.map((job) => <JobCard key={job.id} job={job} queued={queuedIds.includes(job.id)} onQueue={() => { void addToQueue(job) }} onDetails={() => setSelectedJob(job)} />)}</div>
            {pageCount > 1 && <nav className="job-pagination" aria-label="Páginas de vagas"><button disabled={jobPage === 0} onClick={() => setJobPage((page) => Math.max(0, page - 1))}>Anterior</button><span>{jobPage + 1} de {pageCount}</span><button disabled={jobPage + 1 >= pageCount} onClick={() => setJobPage((page) => Math.min(pageCount - 1, page + 1))}>Próxima</button></nav>}
            {!visibleJobs.length && <div className="jobs-empty"><BriefcaseBusiness size={21} /><h2>Nenhuma vaga encontrada</h2><p>Ajuste a busca ou limpe os filtros.</p><button onClick={() => { setSearch(''); setFilters(emptyJobFilters) }}>Limpar busca e filtros</button></div>}
            {visibleJobs.length > 0 && <div className="feed-footer"><span>Fim das oportunidades por enquanto</span><div /></div>}
          </>}
          {view === 'Fila' && <QueueView jobs={queue} pendingApprovalCount={pendingApprovalCount} onDetails={setSelectedJob} onStart={startQueue} onOpenApprovals={() => setView('Aprovações')} />}
          {view === 'Aprovações' && <ApprovalQueueView />}
          {view === 'Candidaturas' && <CandidateTracker jobs={queue} onDetails={setSelectedJob} onExplore={() => setView('Vagas')} />}
          {view === 'Currículo' && <ResumeImportView userEmail={userEmail} onBack={() => setView('Home')} onProfileConfirmed={(profile) => { setProfileSummary({ fullName: profile.fullName, headline: profile.headline, location: profile.location, completeness: 100 }); void discoverLinkedInJobs(profile) }} />}
        </section>

            <DesktopAgentRail jobs={queue} pendingApprovalCount={pendingApprovalCount} realAccount={Boolean(userEmail && configured)} onNavigate={setView} />
      </main>

      {!userEmail && <div className="demo-ribbon"><span className="demo-pulse" /> {configured ? 'PRÉVIA' : 'DEMO'} <span>{configured ? 'Vagas ilustrativas · entre para analisar e salvar oportunidades reais' : 'Dados de exemplo · candidaturas não são enviadas'}</span></div>}
      {toast && <div className="toast"><Check size={16} />{toast}<button onClick={() => setToast('')} aria-label="Fechar aviso"><X size={14} /></button></div>}
      {urlEntryOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !analyzing) setUrlEntryOpen(false) }}><section className="link-modal" role="dialog" aria-modal="true" aria-labelledby="link-modal-title"><div className="modal-title-row"><div className="modal-icon"><Link2 size={18} /></div><button className="icon-button" onClick={() => setUrlEntryOpen(false)} aria-label="Fechar" disabled={analyzing}><X size={18} /></button></div><h2 id="link-modal-title">Traga uma vaga para cá</h2><p>{userEmail ? 'Cole até 20 links públicos de vagas. Um por linha.' : 'No modo demo, os links não são analisados. Entre para salvar e analisar vagas.'}</p><textarea value={urls} onChange={(event) => setUrls(event.target.value)} placeholder={'https://example.com/careers/role\nhttps://linkedin.com/jobs/view/...'} rows={4} autoFocus disabled={analyzing} /><div className="modal-note"><ShieldCheck size={15} /> Mantemos a origem e o link original da vaga; páginas com login não são acessadas.</div><div className="modal-actions"><button className="quiet-button" onClick={() => setUrlEntryOpen(false)} disabled={analyzing}>Cancelar</button><button className="primary-button" onClick={addLinks} disabled={analyzing}>{analyzing ? 'Analisando…' : 'Analisar links'} <ArrowRight size={15} /></button></div></section></div>}
      {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} />}
      {selectedJob && <JobDetails job={selectedJob} queued={queuedIds.includes(selectedJob.id)} onClose={() => setSelectedJob(null)} onQueue={() => { void addToQueue(selectedJob); setSelectedJob(null) }} />}
      <MobileBottomNav view={view} queueCount={queue.length} pendingApprovalCount={pendingApprovalCount} onNavigate={setView} />
      <JobFiltersSheet open={filtersOpen} jobs={sourceJobs} search={search} filters={filters} onClose={() => setFiltersOpen(false)} onChange={setFilters} onClear={() => setFilters(emptyJobFilters)} />
      <SearchPreferencesDialog open={preferencesOpen} userId={userId} onClose={() => setPreferencesOpen(false)} onSaved={handlePreferencesSaved} />
    </div>
  )
}

function JobCard(props: { job: Job; queued: boolean; onQueue: () => void; onDetails: () => void }) {
  return <JobCardView {...props} />
}

function QueueView({ jobs, pendingApprovalCount, onDetails, onStart, onOpenApprovals }: { jobs: Job[]; pendingApprovalCount: number; onDetails: (job: Job) => void; onStart: () => void; onOpenApprovals: () => void }) {
  const [page, setPage] = useState(0)
  const pageSize = getJobsPerPage()
  useEffect(() => { setPage(0) }, [jobs.length, pageSize])
  const pageCount = Math.max(1, Math.ceil(jobs.length / pageSize))
  const pageJobs = jobs.slice(page * pageSize, (page + 1) * pageSize)
  const dispatchable = jobs.filter((job) => !['applying', 'needs_input', 'submitted', 'failed', 'cancelled'].includes(job.status ?? '')).length
  const failedCount = jobs.filter((job) => job.status === 'failed').length
  const summary = jobs.some((job) => job.status === 'needs_input')
    ? 'Algumas candidaturas precisam da sua resposta.'
    : failedCount > 0
      ? `${failedCount} candidatura${failedCount === 1 ? ' falhou' : 's falharam'} ao iniciar. Confira o erro antes de tentar novamente.`
      : jobs.some((job) => job.status === 'applying')
        ? 'O agente está preparando candidaturas. Revise cada pergunta e confirme antes do envio.'
        : jobs.some((job) => job.status === 'queued')
          ? 'Candidaturas aguardando para iniciar.'
          : 'Nenhuma candidatura é enviada sem sua confirmação final.'
  return <div className="queue-page">{pendingApprovalCount > 0 && <button className="queue-approval-link" onClick={onOpenApprovals}><Clock3 size={16} /><span>{pendingApprovalCount} aprovação{pendingApprovalCount === 1 ? '' : 'ões'} aguardando sua resposta</span><ArrowRight size={15} /></button>}<div className="queue-summary"><div><span className="summary-caption">CANDIDATURAS</span><strong>{jobs.length}</strong><span>na fila</span></div><div className="summary-estimate"><Clock3 size={16} /><span>{summary}</span></div></div>{jobs.length ? <><div className="queue-job-list">{pageJobs.map((job) => {
    const statusLabel = job.status === 'needs_input' ? 'Precisa de você' : job.status === 'applying' ? 'Agente trabalhando' : job.status === 'queued' ? 'Aguardando na fila' : job.status === 'failed' ? 'Falhou' : job.status === 'cancelled' ? 'Cancelada' : 'Salva'
    return <button className="queue-job-row" key={job.id} onClick={() => onDetails(job)}><div className={`company-mark small ${job.accent}`}>{job.initials}</div><div><strong>{job.title}</strong><span>{job.company} · {job.location}</span>{job.failureReason && <small className="queue-error">{job.failureReason}</small>}</div><span className={`queue-status ${job.status === 'applying' ? 'in-progress' : ''} ${job.status === 'needs_input' ? 'needs-input' : ''} ${job.status === 'failed' ? 'failed' : ''}`}><i />{statusLabel}</span><ArrowRight size={16} /></button>
  })}</div>{pageCount > 1 && <nav className="job-pagination" aria-label="Páginas da fila"><button disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>Anterior</button><span>{page + 1} de {pageCount}</span><button disabled={page + 1 >= pageCount} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>Próxima</button></nav>}</> : <p className="empty-queue">Sua fila está vazia. Adicione uma oportunidade para começar.</p>}<div className="queue-safety"><ShieldCheck size={18} /><div><strong>Você mantém o controle</strong><p>O agente pausa para login, respostas sensíveis e revisão final. O envio continua dependendo da sua confirmação.</p></div></div><button className="primary-button start-queue" disabled={!dispatchable} onClick={onStart}><Send size={15} /> Iniciar {dispatchable} candidatura{dispatchable === 1 ? '' : 's'}</button></div>
}

function JobDetails({ job, queued, onClose, onQueue }: { job: Job; queued: boolean; onClose: () => void; onQueue: () => void }) {
  const [detailTab, setDetailTab] = useState(0)
  return <div className="modal-backdrop details-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className={`details-modal details-tab-${detailTab}`} role="dialog" aria-modal="true" aria-labelledby="details-title">
      <div className="details-top"><div className={`company-mark ${job.accent}`}>{job.initials}</div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={19} /></button></div>
      <span className="company-name">{job.company}</span>
      <h2 id="details-title">{job.title}</h2>
      <p className="job-location">{job.location} <span>·</span> {job.workplace} <span>·</span> {job.salary}</p>
      <div className="details-tabs" role="tablist" aria-label="Detalhes da vaga">
        <button type="button" role="tab" aria-selected={detailTab === 0} onClick={() => setDetailTab(0)}>Compatibilidade</button>
        <button type="button" role="tab" aria-selected={detailTab === 1} onClick={() => setDetailTab(1)}>Descrição</button>
      </div>
      <div className="details-match">{job.score > 0 && <div className="match-score large"><span>{job.score}</span><small>%</small></div>}<div><strong>{job.score > 0 ? 'Compatibilidade com seu perfil confirmado' : 'Compatibilidade ainda não calculada'}</strong><p>{job.score > 0 ? 'Baseada no perfil confirmado e na análise pública desta vaga.' : 'Confirme seu currículo para avaliar esta vaga com base nas suas evidências.'}</p></div></div>
      <div className="detail-columns">
        <div><span className="section-kicker">PONTOS EM COMUM</span>{job.matched.length ? job.matched.map((skill) => <p className="detail-bullet positive" key={skill}><Check size={14} /> {skill}</p>) : <p className="resume-empty-field">Ainda sem correspondências calculadas.</p>}<span className="section-kicker gap-heading">A CONSIDERAR</span><p className="detail-bullet caution"><span>!</span> {job.gap}</p></div>
        <div><span className="section-kicker">SOBRE A VAGA</span><p className="description-text">{job.description}</p><span className="source-label">Origem: <a href={job.sourceUrl} target="_blank" rel="noreferrer">{job.source} ↗</a></span><p className="application-host">Aplicação hospedada em <strong>{new URL(job.applicationUrl).hostname}</strong></p></div>
      </div>
      <div className="details-actions"><button className="quiet-button" onClick={onClose}>Fechar</button><button className={`primary-button ${queued ? 'already-queued' : ''}`} onClick={onQueue}>{queued ? <><Check size={15} /> Já está na fila</> : <><Plus size={16} /> Adicionar à fila</>}</button></div>
    </section>
  </div>
}

export default App

function getJobsPerPage() {
  if (typeof window === 'undefined') return 1
  if (window.innerWidth < 1180 || window.innerHeight < 850) return 1
  return 2
}
