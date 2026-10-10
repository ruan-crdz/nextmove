import { ArrowRight, BriefcaseBusiness, CircleAlert, Compass, FileText, Home, Layers3, Search, UserRound } from 'lucide-react'
import type { AppView } from '../../domain/app-view'

type AppHeaderProps = {
  view: AppView
  userEmail: string | null
  queueCount: number
  approvalCount: number
  search: string
  onSearchChange: (value: string) => void
  onSearch: () => void
  onNavigate: (view: AppView) => void
  onAccount: () => void
}

const navigation: { view: AppView; label: string; icon: typeof Home }[] = [
  { view: 'Home', label: 'Home', icon: Home },
  { view: 'Vagas', label: 'Vagas', icon: Compass },
  { view: 'Fila', label: 'Fila', icon: Layers3 },
  { view: 'Aprovações', label: 'Aprovações', icon: CircleAlert },
  { view: 'Candidaturas', label: 'Candidaturas', icon: BriefcaseBusiness },
  { view: 'Currículo', label: 'Currículo', icon: FileText },
]

export function AppHeader({ view, userEmail, queueCount, approvalCount, search, onSearchChange, onSearch, onNavigate, onAccount }: AppHeaderProps) {
  const mobileLabel = view === 'Currículo' ? 'Perfil' : view

  return <header className="app-header">
    <div className="app-header-inner">
      <a className="app-brand" href="#home" aria-label="Next Move, início">
        <img className="app-brand-wide" src={`${import.meta.env.BASE_URL}brand/nextmove-horizontal.png`} alt="Next Move" />
        <img className="app-brand-symbol" src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" />
      </a>
      <form className="global-search" role="search" onSubmit={(event) => { event.preventDefault(); onSearch() }}>
        <Search size={17} aria-hidden="true" />
        <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Buscar vagas, empresas ou cargos" aria-label="Buscar vagas, empresas ou cargos" />
        <button type="submit" aria-label="Ver resultados da busca"><ArrowRight size={15} /></button>
      </form>
      <nav className="desktop-nav" aria-label="Navegação principal">
        {navigation.map(({ view: destination, label, icon: Icon }) => <button
          key={destination}
          className={`desktop-nav-item ${view === destination ? 'active' : ''}`}
          aria-label={label}
          aria-current={view === destination ? 'page' : undefined}
          onClick={() => onNavigate(destination)}
        >
          <Icon size={18} strokeWidth={1.8} />
          <span>{label}</span>
          {destination === 'Fila' && queueCount > 0 && <b className="nav-badge">{queueCount}</b>}
          {destination === 'Aprovações' && approvalCount > 0 && <b className="nav-badge nav-badge-alert">{approvalCount}</b>}
        </button>)}
      </nav>
      <button className="account-button" onClick={onAccount} aria-label={userEmail ? `Conta ${userEmail}` : 'Entrar na conta'} title={userEmail ?? 'Entrar na conta'}>
        {userEmail ? userEmail[0].toUpperCase() : <UserRound size={17} />}
      </button>
      <div className="mobile-header-content">
        <a className="mobile-brand" href="#home" aria-label="Next Move, início">
          <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" />
        </a>
        <strong>{mobileLabel}</strong>
        {view === 'Vagas' ? <label className="mobile-header-search"><Search size={16} /><input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Cargo ou empresa" aria-label="Buscar vagas, empresas ou cargos" /></label> : <button className="mobile-search-button" onClick={() => onNavigate('Vagas')} aria-label="Buscar vagas"><Search size={19} /></button>}
        <button className="mobile-account-button" onClick={onAccount} aria-label={userEmail ? `Conta ${userEmail}` : 'Entrar na conta'}>{userEmail ? userEmail[0].toUpperCase() : <UserRound size={17} />}</button>
      </div>
    </div>
  </header>
}