import { useState } from 'react'
import { ArrowRight, KeyRound, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

type AuthDialogProps = {
  onClose: () => void
  canClose?: boolean
}

export function AuthDialog({ onClose, canClose = true }: AuthDialogProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true)
    setMessage('')
    const result = mode === 'signup'
      ? await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` },
      })
      : await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (result.error) {
      setMessage(result.error.message)
      return
    }
    if (mode === 'signup' && !result.data.session) {
      setMessage('Confira seu email para confirmar a conta e depois entre.')
      return
    }
    onClose()
  }

  return <div className="modal-backdrop auth-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && canClose) onClose() }}>
    <section className="link-modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <div className="modal-title-row"><div className="modal-icon"><KeyRound size={18} /></div>{canClose && <button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18} /></button>}</div>
      <h2 id="auth-title">{mode === 'signup' ? 'Seu próximo passo começa aqui' : 'Boas-vindas de volta'}</h2>
      <p>{mode === 'signup' ? 'Crie uma conta privada para salvar suas vagas e seu perfil.' : 'Entre para acessar seu perfil e suas vagas salvas.'}</p>
      <form onSubmit={submit} className="auth-form">
        <label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Senha<input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {message && <p className="auth-message" role="status">{message}</p>}
        <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Aguarde…' : mode === 'signup' ? 'Criar conta' : 'Entrar'} <ArrowRight size={15} /></button>
      </form>
      <button className="auth-switch" onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setMessage('') }}>{mode === 'signup' ? 'Já tenho conta · Entrar' : 'Ainda não tenho conta · Criar conta'}</button>
    </section>
  </div>
}