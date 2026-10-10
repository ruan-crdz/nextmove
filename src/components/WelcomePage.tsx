import { ArrowRight, Check, Compass, ShieldCheck, Sparkles } from 'lucide-react'
import './welcome.css'
import './welcome-mobile.css'

type WelcomePageProps = {
  loading?: boolean
  onSignUp: () => void
  onLogIn: () => void
}

export function WelcomePage({ loading = false, onSignUp, onLogIn }: WelcomePageProps) {
  return <div className="welcome-page">
    <header className="welcome-nav">
      <a className="wordmark" href="#home" aria-label="NextMove, início">
        <img className="wordmark-image" src={`${import.meta.env.BASE_URL}brand/nextmove-horizontal.png`} alt="NextMove" />
      </a>
      <div className="welcome-nav-actions">
        <span>Já tem uma conta?</span>
        <button className="welcome-login" aria-label="Já tenho uma conta, entrar" onClick={onLogIn} disabled={loading}>Entrar <ArrowRight size={15} /></button>
      </div>
    </header>

    <main>
      <section className="welcome-hero" aria-labelledby="welcome-title">
        <img className="welcome-photo" src="https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=2200&q=85" alt="Profissionais colaborando em um espaço de trabalho" />
        <div className="welcome-photo-shade" />
        <div className="welcome-hero-content">
          <span className="welcome-eyebrow"><Sparkles size={14} /> UMA BUSCA DE TRABALHO MAIS SUA</span>
          <h1 id="welcome-title">Seu próximo passo começa com <span>clareza.</span></h1>
          <p>Organize oportunidades, entenda o que combina com seu caminho e escolha como seguir. No seu ritmo, com você no controle.</p>
          <div className="welcome-actions">
            <button className="welcome-primary" onClick={onSignUp} disabled={loading}>Criar minha conta <ArrowRight size={17} /></button>
            <button className="welcome-secondary" aria-label="Entrar na minha conta" onClick={onLogIn} disabled={loading}>Entrar</button>
          </div>
          <div className="welcome-assurance"><ShieldCheck size={15} /> Seu perfil e suas oportunidades ficam privados.</div>
        </div>
        {loading && <span className="welcome-loading">Carregando sua sessão…</span>}
      </section>

      <section className="welcome-principles" aria-label="Como o NextMove ajuda">
        <article><span className="principle-icon"><Compass size={18} /></span><div><h2>Oportunidades com contexto</h2><p>Traga links de vagas e mantenha a origem visível.</p></div></article>
        <article><span className="principle-icon"><Check size={18} /></span><div><h2>Decisões suas</h2><p>Revise cada oportunidade antes de colocá-la na fila.</p></div></article>
        <article><span className="principle-icon"><ShieldCheck size={18} /></span><div><h2>Transparência primeiro</h2><p>Saiba o que está salvo e o que ainda precisa da sua ação.</p></div></article>
      </section>
    </main>

    <footer className="welcome-footer"><span>© 2026 NextMove</span><span>Uma ferramenta para organizar sua busca profissional.</span></footer>
  </div>
}