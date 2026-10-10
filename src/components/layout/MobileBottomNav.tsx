import { BriefcaseBusiness, FileText, Home, Layers3, Compass } from 'lucide-react'
import type { AppView, MobileView } from '../../domain/app-view'

type MobileBottomNavProps = {
  view: AppView
  queueCount: number
  pendingApprovalCount: number
  onNavigate: (view: AppView) => void
}

const items: { view: MobileView; label: string; icon: typeof Home }[] = [
  { view: 'Home', label: 'Home', icon: Home },
  { view: 'Vagas', label: 'Vagas', icon: Compass },
  { view: 'Fila', label: 'Fila', icon: Layers3 },
  { view: 'Candidaturas', label: 'Candidaturas', icon: BriefcaseBusiness },
  { view: 'Perfil', label: 'Perfil', icon: FileText },
]

export function MobileBottomNav({ view, queueCount, pendingApprovalCount, onNavigate }: MobileBottomNavProps) {
  const activeView: MobileView = view === 'Currículo' ? 'Perfil' : view === 'Aprovações' ? 'Fila' : view
  return <nav className="mobile-bottom-nav" aria-label="Navegação mobile">
    {items.map(({ view: target, label, icon: Icon }) => {
      const active = activeView === target
      const badge = target === 'Fila' ? pendingApprovalCount || queueCount : 0
      return <button key={target} className={`mobile-nav-item ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined} onClick={() => onNavigate(target === 'Perfil' ? 'Currículo' : target)}>
        <span className="mobile-nav-icon"><Icon size={20} strokeWidth={1.8} />{badge > 0 && <b>{badge}</b>}</span>
        <span>{label}</span>
      </button>
    })}
  </nav>
}