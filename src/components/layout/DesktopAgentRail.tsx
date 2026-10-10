import { ArrowRight, CircleAlert, ShieldCheck } from 'lucide-react'
import type { AppView } from '../../domain/app-view'
import type { Job } from '../../domain/jobs'

type DesktopAgentRailProps = {
  jobs: Job[]
  pendingApprovalCount: number
  realAccount: boolean
  onNavigate: (view: AppView) => void
}

export function DesktopAgentRail({ jobs, pendingApprovalCount, realAccount, onNavigate }: DesktopAgentRailProps) {
  const active = jobs.filter((job) => job.status === 'applying' || job.status === 'needs_input').slice(0, 3)
  const activeCount = jobs.filter((job) => job.status === 'applying').length
  const needsInput = jobs.filter((job) => job.status === 'needs_input')

  return <aside className="desktop-agent-rail" aria-label="Fila e ações necessárias">
    <section className="agent-rail-card">
      <div className="agent-rail-heading"><div><span>SEU AGENTE</span><h2>Em movimento</h2></div><span className="agent-rail-count">{activeCount}</span></div>
      {active.length ? <div className="agent-activity-list">{active.map((job) => <button className="agent-activity-row" key={job.id} onClick={() => onNavigate(job.status === 'needs_input' ? 'Aprovações' : 'Fila')}>
        <span className={`agent-activity-dot ${job.status === 'needs_input' ? 'urgent' : ''}`} />
        <span><strong>{job.company}</strong><small>{job.status === 'needs_input' ? 'Precisa de você' : 'Preparando candidatura'}</small></span>
        <ArrowRight size={14} />
      </button>)}</div> : <p className="agent-empty-copy">{realAccount ? 'Nenhuma candidatura em andamento.' : 'Entre na sua conta para acompanhar candidaturas reais.'}</p>}
      <button className="agent-rail-link" onClick={() => onNavigate('Fila')}>Abrir fila <ArrowRight size={14} /></button>
    </section>

    {needsInput.length > 0 && <section className="agent-action-card">
      <div className="agent-action-heading"><CircleAlert size={16} /><span>AÇÃO NECESSÁRIA</span></div>
      {needsInput.slice(0, 2).map((job) => <div className="agent-action-row" key={job.id}><strong>{job.company}</strong><span>{job.title}</span></div>)}
      <button className="primary-button agent-action-button" onClick={() => onNavigate('Aprovações')}>Responder agora <ArrowRight size={15} /></button>
    </section>}

    {pendingApprovalCount > 0 && needsInput.length === 0 && <section className="agent-action-card">
      <div className="agent-action-heading"><CircleAlert size={16} /><span>AÇÃO NECESSÁRIA</span></div>
      <p>{pendingApprovalCount} resposta{pendingApprovalCount === 1 ? '' : 's'} aguardando você.</p>
      <button className="primary-button agent-action-button" onClick={() => onNavigate('Aprovações')}>Ver aprovações <ArrowRight size={15} /></button>
    </section>}

    <div className="agent-safety-note"><ShieldCheck size={16} /><span>O envio final sempre depende da sua confirmação.</span></div>
  </aside>
}