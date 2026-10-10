import { useEffect, useState } from 'react'
import { ArrowRight, Check, LoaderCircle, X } from 'lucide-react'
import { joinPreferenceList, splitPreferenceList, type SearchPreferences } from '../../domain/preferences'
import { supabase } from '../../lib/supabase'

type SearchPreferencesDialogProps = {
  open: boolean
  userId: string | null
  onClose: () => void
  onSaved: (preferences: SearchPreferences) => void
}

const workplaceOptions = [
  { value: 'remote', label: 'Remoto' },
  { value: 'hybrid', label: 'Híbrido' },
  { value: 'onsite', label: 'Presencial' },
]

export function SearchPreferencesDialog({ open, userId, onClose, onSaved }: SearchPreferencesDialogProps) {
  const [preferences, setPreferences] = useState<SearchPreferences>(emptyPreferences())
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      if (!open || !supabase || !userId) return
      setLoading(true)
      setMessage('')
      const { data, error } = await supabase.from('job_preferences').select('*').eq('user_id', userId).maybeSingle()
      if (!active) return
      if (error) setMessage('Não foi possível carregar suas preferências. Tente novamente.')
      else if (data) setPreferences(data as SearchPreferences)
      else setPreferences(emptyPreferences())
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [open, userId])

  if (!open) return null

  function update<K extends keyof SearchPreferences>(key: K, value: SearchPreferences[K]) {
    setPreferences((current) => ({ ...current, [key]: value }))
  }

  function updateList(key: 'job_titles' | 'locations' | 'employment_types' | 'seniority' | 'languages', value: string) {
    update(key, splitPreferenceList(value))
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !userId) {
      setMessage('Entre na sua conta para salvar preferências.')
      return
    }
    setSaving(true)
    setMessage('')
    const payload: SearchPreferences = {
      ...preferences,
      job_titles: preferences.job_titles.filter(Boolean),
      locations: preferences.locations.filter(Boolean),
      salary_min: preferences.salary_min && preferences.salary_min > 0 ? preferences.salary_min : null,
      salary_currency: 'BRL',
    }
    const { error } = await supabase.from('job_preferences').upsert({ user_id: userId, ...payload }, { onConflict: 'user_id' })
    setSaving(false)
    if (error) {
      setMessage('Não foi possível salvar. Confira os campos e tente novamente.')
      return
    }
    onSaved(payload)
    onClose()
  }

  return <div className="preferences-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <section className={`preferences-dialog preferences-step-${step}`} role="dialog" aria-modal="true" aria-labelledby="preferences-title">
      <header className="preferences-header"><div><span>BUSCA PROFISSIONAL</span><h2 id="preferences-title">Que vaga você procura?</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar preferências" disabled={saving}><X size={18} /></button></header>
      <form onSubmit={save}>
        <div className="preferences-steps" role="tablist" aria-label="Etapas das preferências">
          {['Busca', 'Condições', 'Idiomas'].map((label, index) => <button key={label} type="button" role="tab" aria-selected={step === index} onClick={() => setStep(index)}>{label}</button>)}
        </div>
        <div className="preferences-fields">
          <label>Cargos desejados<textarea rows={2} value={joinPreferenceList(preferences.job_titles)} onChange={(event) => updateList('job_titles', event.target.value)} placeholder="Ex.: Engenharia de Software" /></label>
          <label>Localizações<textarea rows={2} value={joinPreferenceList(preferences.locations)} onChange={(event) => updateList('locations', event.target.value)} placeholder="Ex.: São Paulo, Brasil" /></label>
          <fieldset><legend>Modalidade</legend><div className="preference-options">{workplaceOptions.map((option) => <label key={option.value}><input type="checkbox" checked={preferences.workplace_types.includes(option.value)} onChange={(event) => update('workplace_types', event.target.checked ? [...preferences.workplace_types, option.value] : preferences.workplace_types.filter((value) => value !== option.value))} />{option.label}</label>)}</div></fieldset>
          <label>Tipo de vínculo<textarea rows={2} value={joinPreferenceList(preferences.employment_types)} onChange={(event) => updateList('employment_types', event.target.value)} placeholder="Ex.: CLT, contrato" /></label>
          <label>Senioridade<textarea rows={2} value={joinPreferenceList(preferences.seniority)} onChange={(event) => updateList('seniority', event.target.value)} placeholder="Ex.: Pleno, Sênior" /></label>
          <label>Pretensão salarial mínima<input type="number" min="0" step="500" value={preferences.salary_min ?? ''} onChange={(event) => update('salary_min', event.target.value ? Number(event.target.value) : null)} placeholder="Opcional · R$ por mês" /></label>
          <label>Idiomas desejados<textarea rows={2} value={joinPreferenceList(preferences.languages)} onChange={(event) => updateList('languages', event.target.value)} placeholder="Ex.: Português, Inglês" /></label>
        </div>
        {message && <p className="preferences-message" role="status">{message}</p>}
        <footer className="preferences-footer"><button type="button" className="filters-clear-button" onClick={onClose} disabled={saving}>Cancelar</button><button className="primary-button" type="submit" disabled={saving || loading}>{saving ? <><LoaderCircle size={15} className="approval-spinner" />Salvando…</> : <><Check size={15} />Salvar preferências <ArrowRight size={14} /></>}</button></footer>
      </form>
      {loading && <div className="preferences-loading" role="status">Carregando preferências…</div>}
    </section>
  </div>
}

function emptyPreferences(): SearchPreferences {
  return { job_titles: [], locations: [], workplace_types: [], employment_types: [], seniority: [], salary_min: null, salary_currency: 'BRL', languages: [] }
}