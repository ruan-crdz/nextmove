import { useEffect, useState } from 'react'
import { ArrowRight, BriefcaseBusiness } from 'lucide-react'
import type { Job } from '../../domain/jobs'

type CandidateTrackerProps = {
  jobs: Job[]
  onDetails: (job: Job) => void
  onExplore: () => void
}

export function CandidateTracker({ jobs, onDetails, onExplore }: CandidateTrackerProps) {
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(getPageSize)
  useEffect(() => {
    const updatePageSize = () => setPageSize(getPageSize())
    window.addEventListener('resize', updatePageSize)
    return () => window.removeEventListener('resize', updatePageSize)
  }, [])
  useEffect(() => { setPage(0) }, [jobs.length, pageSize])
  const pageCount = Math.max(1, Math.ceil(jobs.length / pageSize))
  const pageJobs = jobs.slice(page * pageSize, (page + 1) * pageSize)
  const statusLabel: Record<NonNullable<Job['status']>, string> = {
    saved: 'Salva', queued: 'Na fila', applying: 'Preparando candidatura', needs_input: 'Precisa de você',
    submitted: 'Enviada', failed: 'Falha ao iniciar', cancelled: 'Cancelada',
  }
  return <section className="candidate-tracker">
    <div className="tracker-heading"><div><span>ACOMPANHAMENTO</span><h2>Suas candidaturas</h2><p>Acompanhe cada vaga e veja se existe alguma ação sua pendente.</p></div></div>
    {jobs.length ? <><div className="tracker-list">{pageJobs.map((job) => <button className="tracker-row" key={job.id} onClick={() => onDetails(job)}>
      <span className="tracker-company-mark">{job.initials}</span><span className="tracker-job"><strong>{job.title}</strong><small>{job.company} · {job.location}</small></span>
      <span className={`tracker-status tracker-${job.status ?? 'saved'}`}><i />{statusLabel[job.status ?? 'saved']}</span><ArrowRight size={16} />
    </button>)}</div>{pageCount > 1 && <nav className="job-pagination" aria-label="Páginas de candidaturas"><button disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>Anterior</button><span>{page + 1} de {pageCount}</span><button disabled={page + 1 >= pageCount} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>Próxima</button></nav>}</> : <div className="tracker-empty"><BriefcaseBusiness size={22} /><strong>Nenhuma vaga salva ainda</strong><p>Encontre uma oportunidade e adicione à fila para acompanhá-la aqui.</p><button onClick={onExplore}>Explorar vagas <ArrowRight size={14} /></button></div>}
  </section>
}

function getPageSize() {
  if (typeof window === 'undefined') return 1
  return window.innerWidth <= 768 ? 1 : window.innerHeight < 760 ? 2 : 3
}