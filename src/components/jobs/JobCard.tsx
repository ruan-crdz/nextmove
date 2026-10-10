import { ArrowRight, Check, Plus } from 'lucide-react'
import type { Job } from '../../domain/jobs'

type JobCardProps = {
  job: Job
  queued: boolean
  compact?: boolean
  onQueue: () => void
  onDetails: () => void
}

export function JobCard({ job, queued, compact = false, onQueue, onDetails }: JobCardProps) {
  const sourceUrl = safeExternalUrl(job.sourceUrl)
  return <article className={`job-card ${compact ? 'job-card-compact' : ''}`}>
    <div className={`company-mark ${job.accent}`} aria-hidden="true">{job.initials}</div>
    <div className="job-main">
      <div className="job-topline"><span className="company-name">{job.company}</span><span className="posted-time">{job.posted}</span></div>
      <h2 className="job-title-heading"><button className="job-title" onClick={onDetails}>{job.title}</button></h2>
      <p className="job-location">{job.location}<span>·</span>{job.workplace}<span>·</span>{job.salary}</p>
      <div className="job-match-summary">
        {job.score > 0 ? <span className="match-badge">{job.score}% compatível</span> : <span className="match-unavailable">Compatibilidade após confirmar seu perfil</span>}
        <div className="match-skills">{job.matched.slice(0, 3).map((skill) => <span className="match-detail" key={skill}><Check size={12} />{skill}</span>)}</div>
      </div>
      {job.gap && <p className="gap-note"><strong>A considerar</strong><span>{job.gap}</span></p>}
      <div className="job-bottom">
        {sourceUrl ? <span className="source-label">Origem: <a href={sourceUrl} target="_blank" rel="noreferrer">{job.source} <ArrowRight size={12} /></a></span> : <span className="source-label">Origem: {job.source}</span>}
        <div className="job-actions">
          <button className="detail-button" onClick={onDetails}>Ver vaga</button>
          <button className={`queue-button ${queued ? 'is-queued' : ''}`} onClick={onQueue} disabled={queued}>
            {queued ? <><Check size={15} />Na fila</> : <><Plus size={15} />Adicionar à fila</>}
          </button>
        </div>
      </div>
    </div>
  </article>
}

function safeExternalUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}