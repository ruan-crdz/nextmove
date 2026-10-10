import { useEffect, useState } from 'react'
import { Check, SlidersHorizontal, X } from 'lucide-react'
import { emptyJobFilters, type JobFilters } from '../../domain/job-filters'
import type { Job } from '../../domain/jobs'

type JobFiltersSheetProps = {
  open: boolean
  jobs: Job[]
  search: string
  filters: JobFilters
  onClose: () => void
  onChange: (filters: JobFilters) => void
  onClear: () => void
}

export function JobFiltersSheet({ open, jobs, search, filters, onClose, onChange, onClear }: JobFiltersSheetProps) {
  const [draft, setDraft] = useState(filters)
  useEffect(() => { if (open) setDraft(filters) }, [filters, open])
  if (!open) return null

  const workplaces = unique(jobs.map((job) => job.workplace).filter((value) => !['Modalidade não informada', 'Faixa não informada'].includes(value)))
  const sources = unique(jobs.map((job) => job.source).filter((value) => value !== 'Origem não informada'))
  const statuses = unique(jobs.map((job) => job.status).filter((value): value is NonNullable<Job['status']> => Boolean(value)))
  const query = search.trim().toLowerCase()
  const resultCount = jobs.filter((job) => {
    if (query && !`${job.title} ${job.company} ${job.location}`.toLowerCase().includes(query)) return false
    if (draft.location && !job.location.toLowerCase().includes(draft.location.trim().toLowerCase())) return false
    if (draft.workplace && job.workplace !== draft.workplace) return false
    if (draft.minMatch && job.score < Number(draft.minMatch)) return false
    if (draft.source && job.source !== draft.source) return false
    if (draft.status && job.status !== draft.status) return false
    return true
  }).length
  const update = (key: keyof JobFilters, value: string) => setDraft((current) => ({ ...current, [key]: value }))

  return <div className="filters-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="filters-sheet" role="dialog" aria-modal="true" aria-labelledby="filters-title">
      <header className="filters-sheet-header"><div><span>ENCONTRE O QUE PROCURA</span><h2 id="filters-title"><SlidersHorizontal size={18} />Filtros</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar filtros"><X size={18} /></button></header>
      <div className="filters-fields">
        <label>Localidade<input value={draft.location} onChange={(event) => update('location', event.target.value)} placeholder="Cidade ou região" /></label>
        {workplaces.length > 1 && <label>Modalidade<select value={draft.workplace} onChange={(event) => update('workplace', event.target.value)}><option value="">Todas</option>{workplaces.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>}
        <label>Compatibilidade mínima<select value={draft.minMatch} onChange={(event) => update('minMatch', event.target.value)}><option value="">Todas</option><option value="70">70% ou mais</option><option value="80">80% ou mais</option><option value="90">90% ou mais</option></select></label>
        {sources.length > 1 && <label>Origem<select value={draft.source} onChange={(event) => update('source', event.target.value)}><option value="">Todas as fontes</option>{sources.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>}
        {statuses.length > 1 && <label>Status<select value={draft.status} onChange={(event) => update('status', event.target.value)}><option value="">Todos</option>{statuses.map((value) => <option key={value} value={value}>{statusText(value)}</option>)}</select></label>}
      </div>
      <footer className="filters-sheet-footer"><button className="filters-clear-button" onClick={() => { setDraft(emptyJobFilters); onClear() }}>Limpar filtros</button><button className="primary-button" onClick={() => { onChange(draft); onClose() }}><Check size={15} />Mostrar {resultCount} vaga{resultCount === 1 ? '' : 's'}</button></footer>
    </section>
  </div>
}

function unique<T extends string>(values: T[]): T[] { return [...new Set(values)] }

function statusText(status: NonNullable<Job['status']>) {
  return ({ saved: 'Salva', queued: 'Na fila', applying: 'Preparando candidatura', needs_input: 'Precisa de você', submitted: 'Enviada', failed: 'Falha ao iniciar', cancelled: 'Cancelada' })[status]
}