import { ArrowRight, Bookmark, BriefcaseBusiness, MapPin, Search, ShieldCheck } from 'lucide-react'
import type { AppView } from '../../domain/app-view'
import type { ProfileSummary, SearchPreferences } from '../../domain/preferences'

type DesktopSidebarProps = {
  profile: ProfileSummary | null
  preferences: SearchPreferences | null
  demo: boolean
  queueCount: number
  onNavigate: (view: AppView) => void
  onEditPreferences: () => void
}

export function DesktopSidebar({ profile, preferences, demo, queueCount, onNavigate, onEditPreferences }: DesktopSidebarProps) {
  const completion = demo ? null : profile?.completeness ?? 0
  const ready = completion !== null && completion >= 90
  const preferenceSummary = preferences
    ? [preferences.job_titles[0], preferences.locations[0], preferences.workplace_types[0]].filter(Boolean)
    : []

  return <aside className="desktop-sidebar" aria-label="Perfil e atalhos">
    <section className="sidebar-card profile-card">
      <div className="profile-card-banner"><span>NM</span></div>
      <div className="profile-card-content">
        <div className="profile-avatar">{demo ? 'NM' : (profile?.fullName?.[0] ?? 'P').toUpperCase()}</div>
        <strong>{demo ? 'Perfil de demonstração' : profile?.fullName || 'Seu perfil profissional'}</strong>
        <span>{demo ? 'Prévia ilustrativa' : profile?.headline || 'Adicione seu cargo ou especialidade'}</span>
        {profile?.location && <small><MapPin size={13} />{profile.location}</small>}
        {!demo && <div className="profile-completion">
          <div><span>{ready ? 'Perfil pronto' : 'Perfil completo'}</span><b>{completion}%</b></div>
          <span className="completion-track"><i style={{ width: `${completion}%` }} /></span>
        </div>}
        <button className="sidebar-link-button" onClick={() => onNavigate('Currículo')}>
          {demo ? 'Ver perfil de exemplo' : ready ? 'Editar perfil' : 'Completar perfil'} <ArrowRight size={14} />
        </button>
      </div>
    </section>

    <section className="sidebar-section search-preferences-card">
      <div className="sidebar-section-heading"><span>SUA BUSCA</span><button onClick={onEditPreferences} aria-label="Editar preferências"><Search size={15} /></button></div>
      {preferenceSummary.length ? <ul>{preferenceSummary.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{demo ? 'Explore vagas de exemplo ou entre para salvar suas preferências.' : 'Defina cargo, modalidade e localização para receber recomendações melhores.'}</p>}
      <button className="sidebar-link-button" onClick={onEditPreferences}>{preferences ? 'Editar busca' : 'Configurar busca'} <ArrowRight size={14} /></button>
    </section>

    <section className="sidebar-section shortcut-section">
      <div className="sidebar-section-heading"><span>ATALHOS</span></div>
      <button className="sidebar-shortcut" onClick={() => onNavigate('Candidaturas')}><Bookmark size={16} /><span>Vagas salvas</span><b>{queueCount}</b></button>
      <button className="sidebar-shortcut" onClick={() => onNavigate('Fila')}><BriefcaseBusiness size={16} /><span>Atividade recente</span></button>
    </section>

    <div className="sidebar-privacy"><ShieldCheck size={15} /><span>Seu perfil e suas oportunidades ficam privados.</span></div>
  </aside>
}