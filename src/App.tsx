import { useEffect, useMemo, useState } from 'react'
import { ArrowDownWideNarrow, ArrowRight, Bell, Bookmark, BriefcaseBusiness, Check, ChevronDown, CircleAlert, CircleHelp, Clock3, Compass, FileText, Filter, Flame, Globe2, KeyRound, Layers3, Link2, MapPin, MoreHorizontal, Plus, Search, Send, Settings2, ShieldCheck, Sparkles, X } from 'lucide-react'
import { demoJobs, mapStoredJob, type Job } from './domain/jobs'
import { AuthDialog } from './components/AuthDialog'
import { WelcomePage } from './components/WelcomePage'
import { ResumeImportView } from './components/ResumeImportView'
import { ApprovalQueueView } from './components/ApprovalQueueView'
import type { ResumeProfile } from './domain/resume'
import { linkedInJobUrl } from './domain/extensionImport'
import { invokeAuthenticated, supabase } from './lib/supabase'
import './components/auth.css'
import './components/brand.css'

type View = 'Vagas' | 'Fila' | 'Aprovações' | 'Candidaturas' | 'Currículo'

function App() {
  const demoMode = import.meta.env.VITE_DEMO_MODE === 'true'
  const configured = Boolean(supabase) && !demoMode
  const [view, setView] = useState<View>('Vagas')
  const [queuedIds, setQueuedIds] = useState<string[]>(() => configured ? [] : demoJobs.filter((job) => job.status).map((job) => job.id))
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [urlEntryOpen, setUrlEntryOpen] = useState(false)
  const [urls, setUrls] = useState('')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(configured)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup')
  const [authOpen, setAuthOpen] = useState(false)
  const [liveJobs, setLiveJobs] = useState<Job[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0)

  useEffect(() => {
    if (!supabase || demoMode) return
    let active = true
    supabase.auth.getSession()
      .then(({ data }) => { if (active) setUserEmail(data.session?.user.email ?? null) })
      .catch(() => { if (active) setUserEmail(null) })
      .finally(() => { if (active) setAuthLoading(false) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? null)
      setAuthLoading(false)
      if (!session) setLiveJobs([])
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [demoMode])

  useEffect(() => {
    if (!supabase || demoMode || !userEmail) return
    let active = true
    Promise.all([
      supabase.from('jobs').select('*').order('discovered_at', { ascending: false }),
      supabase.from('applications').select('job_id,status').order('created_at', { ascending: false }),
      supabase.from('job_matches').select('job_id,overall_score,matched_requirements,missing_requirements,reasoning_summary'),
    ]).then(([jobsResult, applicationsResult, matchesResult]) => {
      if (!active || jobsResult.error || !jobsResult.data) return
      const applicationStatus = new Map((applicationsResult.data ?? []).map((application) => [application.job_id, application.status]))
      const matchByJob = new Map((matchesResult.data ?? []).map((match) => [match.job_id, match]))
      setLiveJobs(jobsResult.data.map((record) => mapStoredJob({
        ...record,
        application_status: applicationStatus.get(record.id),
        match_score: matchByJob.get(record.id)?.overall_score,
        matched_skills: matchByJob.get(record.id)?.matched_requirements,
        missing_requirements: matchByJob.get(record.id)?.missing_requirements,
      } as Record<string, unknown>)))
      setQueuedIds([...applicationStatus.keys()])
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
  const visibleJobs = useMemo(() => sourceJobs.filter((job) => `${job.title} ${job.company} ${job.location}`.toLowerCase().includes(search.toLowerCase())), [search, sourceJobs])

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
    const pending = queue.filter((job) => job.status !== 'applying' && job.status !== 'needs_input' && job.status !== 'submitted')
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

  const navigation: { label: View; icon: typeof Compass }[] = [
    { label: 'Vagas', icon: Compass }, { label: 'Fila', icon: Layers3 }, { label: 'Aprovações', icon: CircleAlert },
    { label: 'Candidaturas', icon: BriefcaseBusiness }, { label: 'Currículo', icon: FileText },
  ]

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
    <div className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="#home" aria-label="NextMove, início">
          <img className="wordmark-image" src={`${import.meta.env.BASE_URL}brand/nextmove-horizontal.png`} alt="NextMove" />
        </a>
        <nav className="top-nav" aria-label="Navegação principal">
          {navigation.map(({ label, icon: Icon }) => (
            <button key={label} className={`nav-item ${view === label ? 'active' : ''}`} onClick={() => setView(label)}>
              <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
              {label === 'Fila' && queue.length > 0 && <span className="nav-count">{queue.length}</span>}
              {label === 'Aprovações' && pendingApprovalCount > 0 && <span className="nav-count approval-count">{pendingApprovalCount}</span>}
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <div className="agent-status"><span className="status-dot" /> <span>{userEmail ? 'Fila disponível' : configured ? 'Prévia' : 'Modo demo'}</span><b>{queue.length}</b></div>
          <button className="icon-button notification-button" aria-label="Notificações"><Bell size={18} /><i /></button>
          {userEmail ? <button className="avatar signed-in" aria-label={`Conta ${userEmail}`} title={userEmail} onClick={async () => { await supabase?.auth.signOut(); setToast('Você saiu da sua conta') }}>{userEmail.slice(0, 1).toUpperCase()}</button> : <button className="avatar signed-in" aria-label={configured ? 'Entrar na conta' : 'Modo de demonstração'} title={configured ? 'Entrar ou criar conta' : 'Modo de demonstração'} onClick={() => configured && setAuthOpen(true)}>{configured ? <KeyRound size={15} /> : 'DEMO'}</button>}
        </div>
      </header>

      <main className="workspace">
        <aside className="left-rail">
          <section className="profile-block">
            <div className="profile-cover"><span className="cover-sun" /><span className="cover-line" /></div>
            <div className="profile-avatar">{userEmail?.[0]?.toUpperCase() ?? 'NM'}</div>
            <div className="profile-info"><strong>{userEmail ? userEmail.split('@')[0] : 'Seu perfil'}</strong><span>{userEmail ? 'Perfil profissional' : 'Exemplo de demonstração'}</span></div>
            <div className="profile-progress"><div className="progress-copy"><span>Perfil profissional</span><strong>{userEmail ? 'A começar' : 'Demo'}</strong></div><div className="progress-track"><span style={{ width: userEmail ? '8%' : '100%' }} /></div><button onClick={() => setView('Currículo')}>{userEmail ? 'Importar currículo' : 'Ver perfil de exemplo'} <ArrowRight size={14} /></button></div>
          </section>
          <section className="rail-section search-preferences">
            <div className="rail-title">SUA BUSCA <button aria-label="Editar preferências"><Settings2 size={15} /></button></div>
            {userEmail ? <><div className="preference-row"><BriefcaseBusiness size={15} /><span>Preferências ainda não configuradas</span></div><button className="text-action" onClick={() => setToast('A configuração de preferências estará disponível em breve')}>Configurar busca <ArrowRight size={14} /></button></> : <><div className="preference-row"><BriefcaseBusiness size={15} /><span>Frontend · Product Eng. (exemplo)</span></div><div className="preference-row"><MapPin size={15} /><span>Brasil · Remoto (exemplo)</span></div><div className="preference-row"><Layers3 size={15} /><span>Pleno · Sênior (exemplo)</span></div></>}
          </section>
          <section className="rail-section saved-section">
            <div className="rail-title">ATALHOS</div>
            <button className="shortcut" onClick={() => setView('Candidaturas')}><Bookmark size={16} /> Vagas salvas <span>{userEmail ? queue.length : 4}</span></button>
            <button className="shortcut" onClick={() => setView('Fila')}><Clock3 size={16} /> Atividade recente</button>
          </section>
          <div className="rail-bottom"><ShieldCheck size={15} /><span>Suas informações ficam privadas</span><button aria-label="Saiba mais"><CircleHelp size={15} /></button></div>
        </aside>

        <section className="feed-column">
          <div className="feed-heading">
            <div className="eyebrow"><Sparkles size={13} /> SUA BUSCA, COM MAIS CLAREZA</div>
            <div className="heading-line"><div><h1>{view === 'Vagas' ? 'Vagas para você' : view}</h1><p>{view === 'Vagas' ? 'Oportunidades que combinam com o que você já construiu.' : view === 'Fila' ? 'Acompanhe o trabalho do agente, etapa por etapa.' : 'Seu próximo passo profissional, em um só lugar.'}</p></div><button className="round-icon" aria-label="Opções de visualização"><MoreHorizontal size={20} /></button></div>
          </div>
          {view === 'Vagas' && <>
            <div className="search-tools"><label className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cargo, empresa ou palavra-chave" /></label><button className="filter-button" onClick={() => setToast('Filtros: remoto · faixa salarial · senioridade')}><Filter size={16} /><span>Filtros</span><span className="filter-number">2</span></button><button className="sort-button"><ArrowDownWideNarrow size={16} /> Relevância <ChevronDown size={14} /></button></div>
            <div className="result-meta"><span><strong>{visibleJobs.length} oportunidades</strong> {userEmail ? 'na sua conta' : configured ? '· prévia com dados ilustrativos' : 'de demonstração'}</span><button onClick={() => setUrlEntryOpen(true)}><Link2 size={15} /> Adicionar por link</button></div>
            <div className="job-list">{visibleJobs.map((job, index) => <JobCard key={job.id} job={job} queued={queuedIds.includes(job.id)} onQueue={() => addToQueue(job)} onDetails={() => setSelectedJob(job)} style={{ animationDelay: `${index * 70}ms` }} />)}</div>
            <div className="feed-footer"><span>Fim das oportunidades por enquanto</span><div /></div>
          </>}
          {view === 'Fila' && <QueueView jobs={queue} onDetails={setSelectedJob} onStart={startQueue} />}
          {view === 'Aprovações' && <ApprovalQueueView />}
          {view === 'Candidaturas' && <div className="empty-workspace"><div className="empty-icon"><BriefcaseBusiness size={24} /></div><h2>Suas candidaturas começam aqui</h2><p>Salve uma vaga ou adicione um link para organizar suas próximas oportunidades.</p><button className="primary-button" onClick={() => setView('Vagas')}>Explorar vagas <ArrowRight size={16} /></button></div>}
          {view === 'Currículo' && <ResumeImportView userEmail={userEmail} onBack={() => setView('Vagas')} onProfileConfirmed={(profile) => { void discoverLinkedInJobs(profile) }} />}
        </section>

        <aside className="right-rail">
          <section className="queue-panel">
            <div className="panel-heading"><div><span className="panel-kicker">EM MOVIMENTO</span><h2>Sua fila <span>{queue.length}</span></h2></div><button className="icon-button" onClick={() => setView('Fila')} aria-label="Abrir fila"><ArrowRight size={17} /></button></div>
            {queue.length ? <div className="mini-queue">{queue.slice(0, 3).map((job) => <QueueMiniItem key={job.id} job={job} />)}</div> : <p className="queue-empty">Quando adicionar uma vaga, ela aparece aqui.</p>}
            {queue.length > 0 && <button className="queue-link" onClick={() => setView('Fila')}>Ver fila completa <ArrowRight size={14} /></button>}
          </section>
          {!userEmail && <section className="insight-panel"><div className="insight-top"><span className="insight-icon"><Flame size={16} /></span><span>UM BOM COMEÇO · DEMO</span></div><h3>Compare oportunidades com mais contexto.</h3><p>Na demonstração, explore exemplos de competências, pontos em comum e lacunas.</p><button onClick={() => setView('Currículo')}>Ver exemplo <ArrowRight size={14} /></button><span className="insight-decoration" /></section>}
          <section className="link-panel"><Globe2 size={16} /><div><strong>Vagas de fontes públicas</strong><p>Preservamos o link original e priorizamos páginas oficiais para candidatura.</p></div></section>
          <footer className="right-footer"><span>Sobre</span><span>Privacidade</span><span>Ajuda</span><small>© 2026 NextMove</small></footer>
        </aside>
      </main>

      {!userEmail && <div className="demo-ribbon"><span className="demo-pulse" /> {configured ? 'PRÉVIA' : 'DEMO'} <span>{configured ? 'Vagas ilustrativas · entre para analisar e salvar oportunidades reais' : 'Dados de exemplo · candidaturas não são enviadas'}</span></div>}
      {toast && <div className="toast"><Check size={16} />{toast}<button onClick={() => setToast('')} aria-label="Fechar aviso"><X size={14} /></button></div>}
      {urlEntryOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !analyzing) setUrlEntryOpen(false) }}><section className="link-modal" role="dialog" aria-modal="true" aria-labelledby="link-modal-title"><div className="modal-title-row"><div className="modal-icon"><Link2 size={18} /></div><button className="icon-button" onClick={() => setUrlEntryOpen(false)} aria-label="Fechar" disabled={analyzing}><X size={18} /></button></div><h2 id="link-modal-title">Traga uma vaga para cá</h2><p>{userEmail ? 'Cole até 20 links públicos de vagas. Um por linha.' : 'No modo demo, os links não são analisados. Entre para salvar e analisar vagas.'}</p><textarea value={urls} onChange={(event) => setUrls(event.target.value)} placeholder={'https://example.com/careers/role\nhttps://linkedin.com/jobs/view/...'} rows={4} autoFocus disabled={analyzing} /><div className="modal-note"><ShieldCheck size={15} /> Mantemos a origem e o link original da vaga; páginas com login não são acessadas.</div><div className="modal-actions"><button className="quiet-button" onClick={() => setUrlEntryOpen(false)} disabled={analyzing}>Cancelar</button><button className="primary-button" onClick={addLinks} disabled={analyzing}>{analyzing ? 'Analisando…' : 'Analisar links'} <ArrowRight size={15} /></button></div></section></div>}
      {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} />}
      {selectedJob && <JobDetails job={selectedJob} queued={queuedIds.includes(selectedJob.id)} onClose={() => setSelectedJob(null)} onQueue={() => { void addToQueue(selectedJob); setSelectedJob(null) }} />}
    </div>
  )
}

function JobCard({ job, queued, onQueue, onDetails, style }: { job: Job; queued: boolean; onQueue: () => void; onDetails: () => void; style?: React.CSSProperties }) {
  return <article className="job-card" style={style}>
    <div className={`company-mark ${job.accent}`}>{job.initials}</div>
    <div className="job-main"><div className="job-topline"><span className="company-name">{job.company}</span><span className="posted-time">{job.posted}</span><button className="job-more" aria-label={`Mais opções para ${job.company}`}><MoreHorizontal size={18} /></button></div><button className="job-title" onClick={onDetails}>{job.title}</button><p className="job-location">{job.location} <span>·</span> {job.workplace} <span>·</span> {job.salary}</p><div className="match-row">{job.score > 0 ? <><div className="match-score"><span>{job.score}</span><small>%</small></div><strong>Compatibilidade</strong><span className="match-divider" />{job.matched.slice(0, 2).map((skill) => <span className="match-detail" key={skill}><Check size={13} /> {skill}</span>)}</> : <span className="match-unavailable">Compatibilidade após confirmar seu perfil</span>}</div><div className="gap-note"><span>+</span> {job.gap}</div><div className="job-bottom"><span className="source-label">Origem: <a href={job.sourceUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>{job.source} <ArrowRight size={11} /></a></span><div className="job-actions"><button className="detail-button" onClick={onDetails}>Ver vaga</button><button className={`queue-button ${queued ? 'is-queued' : ''}`} onClick={onQueue}>{queued ? <><Check size={15} /> Na fila</> : <><Plus size={15} /> Adicionar à fila</>}</button></div></div></div>
  </article>
}

function QueueMiniItem({ job }: { job: Job }) {
  const applying = job.status === 'applying'
  const needsInput = job.status === 'needs_input'
  return <div className="mini-queue-item"><div className={`mini-mark ${job.accent}`}>{job.initials}</div><div className="mini-info"><strong>{job.company}</strong><span>{needsInput ? 'Precisa de você' : applying ? 'Agente trabalhando' : 'Aguardando na fila'}</span><div className="mini-progress"><i style={{ width: applying ? '50%' : '8%' }} /></div></div><span className={`mini-state ${needsInput ? 'needs-input' : applying ? 'working' : ''}`} /></div>
}

function QueueView({ jobs, onDetails, onStart }: { jobs: Job[]; onDetails: (job: Job) => void; onStart: () => void }) {
  const dispatchable = jobs.filter((job) => job.status !== 'applying' && job.status !== 'needs_input' && job.status !== 'submitted').length
  return <div className="queue-page"><div className="queue-summary"><div><span className="summary-caption">CANDIDATURAS</span><strong>{jobs.length}</strong><span>na fila</span></div><div className="summary-estimate"><Clock3 size={16} /><span>{jobs.some((job) => job.status === 'needs_input') ? 'Algumas candidaturas precisam da sua resposta.' : jobs.some((job) => job.status === 'applying') ? 'O agente está preparando candidaturas. Revise cada pergunta e confirme antes do envio.' : 'Nenhuma candidatura é enviada sem sua confirmação final.'}</span></div></div>{jobs.length ? <div className="queue-job-list">{jobs.map((job) => <button className="queue-job-row" key={job.id} onClick={() => onDetails(job)}><div className={`company-mark small ${job.accent}`}>{job.initials}</div><div><strong>{job.title}</strong><span>{job.company} · {job.location}</span></div><span className={`queue-status ${job.status === 'applying' ? 'in-progress' : ''} ${job.status === 'needs_input' ? 'needs-input' : ''}`}><i />{job.status === 'needs_input' ? 'Precisa de você' : job.status === 'applying' ? 'Agente trabalhando' : 'Salva'}</span><ArrowRight size={16} /></button>)}</div> : <p className="empty-queue">Sua fila está vazia. Adicione uma oportunidade para começar.</p>}<div className="queue-safety"><ShieldCheck size={18} /><div><strong>Você mantém o controle</strong><p>O agente pausa para login, respostas sensíveis e revisão final. O envio continua dependendo da sua confirmação.</p></div></div><button className="primary-button start-queue" disabled={!dispatchable} onClick={onStart}><Send size={15} /> Iniciar {dispatchable} candidatura{dispatchable === 1 ? '' : 's'}</button></div>
}

function JobDetails({ job, queued, onClose, onQueue }: { job: Job; queued: boolean; onClose: () => void; onQueue: () => void }) {
  return <div className="modal-backdrop details-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="details-modal" role="dialog" aria-modal="true" aria-labelledby="details-title"><div className="details-top"><div className={`company-mark ${job.accent}`}>{job.initials}</div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={19} /></button></div><span className="company-name">{job.company}</span><h2 id="details-title">{job.title}</h2><p className="job-location">{job.location} <span>·</span> {job.workplace} <span>·</span> {job.salary}</p><div className="details-match">{job.score > 0 && <div className="match-score large"><span>{job.score}</span><small>%</small></div>}<div><strong>{job.score > 0 ? 'Compatibilidade com seu perfil confirmado' : 'Compatibilidade ainda não calculada'}</strong><p>{job.score > 0 ? 'Baseada no perfil confirmado e na análise pública desta vaga.' : 'Confirme seu currículo para avaliar esta vaga com base nas suas evidências.'}</p></div></div><div className="detail-columns"><div><span className="section-kicker">PONTOS EM COMUM</span>{job.matched.length ? job.matched.map((skill) => <p className="detail-bullet positive" key={skill}><Check size={14} /> {skill}</p>) : <p className="resume-empty-field">Ainda sem correspondências calculadas.</p>}<span className="section-kicker gap-heading">A CONSIDERAR</span><p className="detail-bullet caution"><span>!</span> {job.gap}</p></div><div><span className="section-kicker">SOBRE A VAGA</span><p className="description-text">{job.description}</p><span className="source-label">Origem: <a href={job.sourceUrl} target="_blank" rel="noreferrer">{job.source} ↗</a></span><p className="application-host">Aplicação hospedada em <strong>{new URL(job.applicationUrl).hostname}</strong></p></div></div><div className="details-actions"><button className="quiet-button" onClick={onClose}>Fechar</button><button className={`primary-button ${queued ? 'already-queued' : ''}`} onClick={onQueue}>{queued ? <><Check size={15} /> Já está na fila</> : <><Plus size={16} /> Adicionar à fila</>}</button></div></section></div>
}

export default App