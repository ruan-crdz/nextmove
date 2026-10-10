import { useState } from 'react'
import { ArrowRight, Check, Compass, ShieldCheck, Sparkles } from 'lucide-react'
import './welcome.css'
import './welcome-mobile.css'
import './landing-redesign.css'

type WelcomePageProps = {
  loading?: boolean
  onSignUp: () => void
  onLogIn: () => void
}

export function WelcomePage({ loading = false, onSignUp, onLogIn }: WelcomePageProps) {
  const [activeSection, setActiveSection] = useState<'home' | 'how' | 'security'>('home')
  return <div className="welcome-page">
    <header className="welcome-nav">
      <a className="wordmark" href="#home" aria-label="NextMove, início" onClick={() => setActiveSection('home')}>
        <img className="wordmark-image" src={`${import.meta.env.BASE_URL}brand/nextmove-horizontal.png`} alt="NextMove" />
      </a>
      <nav className="welcome-links" aria-label="Links da página"><button type="button" aria-current={activeSection === 'how' ? 'page' : undefined} onClick={() => setActiveSection('how')}>Como funciona</button><button type="button" aria-current={activeSection === 'security' ? 'page' : undefined} onClick={() => setActiveSection('security')}>Segurança</button></nav>
      <div className="welcome-nav-actions"><button className="welcome-login" aria-label="Já tenho uma conta, entrar" onClick={onLogIn} disabled={loading}>Entrar</button><button className="welcome-nav-primary" onClick={onSignUp} disabled={loading}>Criar conta <ArrowRight size={15} /></button></div>
    </header>

    <nav className="welcome-mobile-tabs" aria-label="Seções do Next Move">
      <button type="button" aria-current={activeSection === 'home' ? 'page' : undefined} onClick={() => setActiveSection('home')}>Início</button>
      <button type="button" aria-current={activeSection === 'how' ? 'page' : undefined} onClick={() => setActiveSection('how')}>Como funciona</button>
      <button type="button" aria-current={activeSection === 'security' ? 'page' : undefined} onClick={() => setActiveSection('security')}>Segurança</button>
    </nav>

    <main className="welcome-main">
      {activeSection === 'home' && <section className="welcome-hero" aria-labelledby="welcome-title">
        <div className="welcome-hero-copy">
          <span className="welcome-eyebrow"><Sparkles size={14} /> SUA BUSCA. SEU CONTROLE.</span>
          <h1 id="welcome-title">Encontre a vaga.<br /><span>A gente cuida do resto.</span></h1>
          <p>Organize seu perfil, descubra oportunidades compatíveis e deixe o Next Move preparar suas candidaturas enquanto você continua sua rotina.</p>
          <div className="welcome-actions"><button className="welcome-primary" onClick={onSignUp} disabled={loading}>Criar minha conta <ArrowRight size={17} /></button><button className="welcome-secondary" onClick={onLogIn} disabled={loading}>Já tenho conta</button></div>
          <div className="welcome-assurance"><ShieldCheck size={16} /><span>Você revisa antes de qualquer envio.</span></div>
        </div>
        <div className="welcome-product-scene" aria-label="Prévia da interface do Next Move">
          <div className="product-window-bar"><img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" /><strong>Next Move</strong><span>Vagas para você</span><i /></div>
          <div className="product-window-body">
            <div className="product-window-heading"><div><span>OPORTUNIDADES</span><strong>Vagas para você</strong></div><span className="product-search-icon"><Compass size={16} /></span></div>
            <article className="product-job-preview"><div className="preview-company-mark">A</div><div className="preview-job-info"><span>Artefact</span><strong>Software Engineer</strong><small>São Paulo · Remoto</small></div><b className="preview-match">92%<small>compatível</small></b></article>
            <article className="product-job-preview"><div className="preview-company-mark preview-company-alt">P</div><div className="preview-job-info"><span>Pitang</span><strong>AI Engineer</strong><small>Brasil · Remoto</small></div><b className="preview-match">87%<small>compatível</small></b></article>
            <div className="preview-agent-row"><span className="preview-agent-icon"><Check size={15} /></span><div><strong>Seu agente</strong><small>Você revisa antes do envio</small></div><span className="preview-agent-status">Pronto</span></div>
          </div>
        </div>
        {loading && <span className="welcome-loading">Carregando sua sessão…</span>}
      </section>}

      {activeSection === 'how' && <section className="welcome-how" id="como-funciona" aria-labelledby="how-title">
        <header><span>COMO FUNCIONA</span><h2 id="how-title">Da busca à candidatura, em três passos.</h2></header>
        <div className="welcome-steps">
          <article><span>01</span><div><h3>Prepare seu perfil</h3><p>Envie seu currículo ou comece do zero. Você revisa tudo antes de confirmar.</p></div></article>
          <article><span>02</span><div><h3>Escolha oportunidades</h3><p>Entenda por que cada vaga combina com o que você já construiu.</p></div></article>
          <article><span>03</span><div><h3>Acompanhe o agente</h3><p>Ele prepara o formulário e chama você quando precisa de uma decisão.</p></div></article>
        </div>
        <button className="welcome-primary welcome-section-cta" onClick={onSignUp} disabled={loading}>Criar minha conta <ArrowRight size={17} /></button>
      </section>}

      {activeSection === 'security' && <section className="welcome-trust" id="seguranca" aria-labelledby="trust-title">
        <div><span>VOCÊ MANTÉM O CONTROLE</span><h2 id="trust-title">Clareza em cada decisão.</h2><p>O Next Move não inventa informações profissionais. Perguntas sensíveis e o envio final dependem de você.</p></div>
        <ul><li><Check size={16} />Nenhuma experiência inventada</li><li><Check size={16} />Perguntas sensíveis ficam com você</li><li><Check size={16} />Envio final só com sua confirmação</li></ul>
        <button className="welcome-primary welcome-section-cta" onClick={onSignUp} disabled={loading}>Criar minha conta <ArrowRight size={17} /></button>
      </section>}
    </main>

    <footer className="welcome-footer"><img src={`${import.meta.env.BASE_URL}brand/nextmove-horizontal.png`} alt="Next Move" /><span>Uma ferramenta para organizar sua busca profissional.</span><small>© 2026 Next Move</small></footer>
  </div>
}