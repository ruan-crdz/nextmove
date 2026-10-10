import { ArrowRight, BriefcaseBusiness, CircleAlert, Compass, FileText, Layers3, Search, ShieldCheck } from 'lucide-react'
import type { AppView } from '../../domain/app-view'
import type { Job } from '../../domain/jobs'
import type { ProfileSummary, SearchPreferences } from '../../domain/preferences'
import { JobCard } from '../jobs/JobCard'

type HomeDashboardProps = {
  jobs: Job[]
  queue: Job[]
  profile: ProfileSummary | null
  preferences: SearchPreferences | null
  realAccount: boolean
  pendingApprovalCount: number
  onNavigate: (view: AppView) => void
  onEditPreferences: () => void
  onQueue: (job: Job) => void
  onDetails: (job: Job) => void
}

export function HomeDashboard({ jobs, queue, profile, preferences, realAccount, pendingApprovalCount, onNavigate, onEditPreferences, onQueue, onDetails }: HomeDashboardProps) {
  const activeCount = queue.filter((job) => job.status === 'applying').length
  const waitingCount = queue.filter((job) => job.status === 'queued' || job.status === 'saved').length
  const topJobs = [...jobs].filter((job) => job.status !== 'submitted').sort((left, right) => right.score - left.score).slice(0, 2)
  const complete = (profile?.completeness ?? 0) >= 90
  const preferenceText = preferences
    ? [preferences.job_titles[0], preferences.locations[0], preferences.workplace_types[0]].filter(Boolean).join(' · ')
    : ''

  return <section className="home-dashboard" aria-labelledby="home-title">
    <header className="home-intro">
      <div><span className="home-eyebrow">SEU PRÓXIMO MOVIMENTO</span><h1 id="home-title">Encontre oportunidades. Acompanhe cada passo.</h1><p>Vagas com contexto e candidaturas sob seu controle.</p></div>
      <button className="home-search-cta" onClick={() => onNavigate('Vagas')}><Search size={17} />Buscar vagas</button>
    </header>

    {!realAccount && <div className="demo-notice"><span>PRÉVIA</span><p>Exemplos ilustrativos. Entre para ver seu perfil e suas oportunidades reais.</p></div>}

    {realAccount && <section className="home-metrics" aria-label="Resumo da sua busca">
      <button onClick={() => onNavigate('Vagas')}><span>Vagas</span><strong>{jobs.length}</strong><small>na sua conta</small></button>
      <button onClick={() => onNavigate('Fila')}><span>Na fila</span><strong>{queue.length}</strong><small>{activeCount} em preparo · {waitingCount} aguardando</small></button>
      <button onClick={() => onNavigate('Aprovações')}><span>Precisam de você</span><strong>{pendingApprovalCount}</strong><small>respostas pendentes</small></button>
    </section>}

    {pendingApprovalCount > 0 && <button className="home-priority-action" onClick={() => onNavigate('Aprovações')}>
      <span className="priority-icon"><CircleAlert size={18} /></span><span><strong>Uma resposta sua está pendente</strong><small>Confira antes de o agente continuar.</small></span><ArrowRight size={17} />
    </button>}

    {realAccount && !complete && <section className="home-setup-row">
      <span className="home-setup-icon"><FileText size={19} /></span><div><strong>{profile?.fullName ? 'Complete seu perfil profissional' : 'Prepare seu perfil profissional'}</strong><p>Confirme as informações do currículo antes de usá-las em candidaturas.</p></div>
      <button onClick={() => onNavigate('Currículo')}>{profile?.fullName ? 'Revisar perfil' : 'Importar currículo'} <ArrowRight size={14} /></button>
    </section>}

    {realAccount && !preferenceText && <section className="home-setup-row">
      <span className="home-setup-icon"><Compass size={19} /></span><div><strong>Defina sua busca</strong><p>Escolha cargo, modalidade e localização para orientar suas recomendações.</p></div>
      <button onClick={onEditPreferences}>Configurar busca <ArrowRight size={14} /></button>
    </section>}

    {preferenceText && <div className="home-preference-summary"><span>SUA BUSCA</span><strong>{preferenceText}</strong></div>}

    <section className="home-queue-section">
      <div className="home-section-heading"><div><span>ACOMPANHAMENTO</span><h2>Suas candidaturas</h2></div><button onClick={() => onNavigate('Fila')}>Abrir fila <ArrowRight size={14} /></button></div>
      {queue.length ? <div className="home-queue-list">{queue.slice(0, 3).map((job) => <button className="home-queue-row" key={job.id} onClick={() => onNavigate(job.status === 'needs_input' ? 'Aprovações' : 'Fila')}>
        <span className="home-company-mark">{job.initials}</span><span className="home-queue-job"><strong>{job.company}</strong><small>{job.title}</small></span>
        <span className={`home-queue-status ${job.status === 'needs_input' ? 'urgent' : job.status === 'failed' ? 'failed' : ''}`}>{statusLabel(job.status)}</span><ArrowRight size={15} />
      </button>)}</div> : <div className="home-empty"><Layers3 size={21} /><strong>Nenhuma vaga na fila</strong><span>Adicione uma oportunidade quando encontrar uma que combine.</span><button onClick={() => onNavigate('Vagas')}>Ver vagas <ArrowRight size={14} /></button></div>}
    </section>

    <section className="home-recommendations">
      <div className="home-section-heading"><div><span>OPORTUNIDADES</span><h2>Vagas para você</h2></div><button onClick={() => onNavigate('Vagas')}>Ver todas <ArrowRight size={14} /></button></div>
      {topJobs.length ? <div className="job-list">{topJobs.map((job) => <JobCard key={job.id} compact job={job} queued={queue.some((item) => item.id === job.id)} onQueue={() => onQueue(job)} onDetails={() => onDetails(job)} />)}</div> : <div className="home-empty"><BriefcaseBusiness size={21} /><strong>Suas oportunidades aparecerão aqui</strong><span>Pesquise vagas ou adicione um link público.</span><button onClick={() => onNavigate('Vagas')}>Buscar vagas <ArrowRight size={14} /></button></div>}
    </section>

    <div className="home-trust-note"><ShieldCheck size={16} /><span>Você revisa as respostas; o envio final só acontece com sua confirmação.</span></div>
  </section>
}

function statusLabel(status: Job['status']) {
  if (status === 'needs_input') return 'Precisa de você'
  if (status === 'applying') return 'Preparando candidatura'
  if (status === 'failed') return 'Falha ao iniciar'
  if (status === 'submitted') return 'Enviada'
  if (status === 'queued') return 'Na fila'
  return 'Salva'
}