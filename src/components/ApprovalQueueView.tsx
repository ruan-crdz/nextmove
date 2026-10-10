import { useEffect, useState } from 'react'
import { Check, CircleAlert, LoaderCircle, ShieldCheck, X } from 'lucide-react'
import { invokeAuthenticated, supabase } from '../lib/supabase'
import './approvals.css'
import './review-summary.css'

type Approval = {
  id: string
  application_id: string
  question: string
  suggested_answer: string | null
  classification: 'SAFE_AUTO' | 'RULE_REQUIRED' | 'ALWAYS_APPROVE'
  status: string
  request_type: string
  request_payload: { origin?: string; reason?: string; review_summary?: string; fields?: { id: string; label: string; type: string; required: boolean }[]; options?: { id: string; label: string; field_ids?: string[] }[] }
  applications?: { job_id?: string; jobs?: { title?: string; company?: string } }
}

export function ApprovalQueueView() {
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [fields, setFields] = useState<Record<string, Record<string, string>>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    async function refresh() {
      if (!supabase) return
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data, error } = await invokeAuthenticated<{ error?: string; approvals?: Approval[] }>('application-status')
      if (error) {
        if (active) setMessage('Não foi possível carregar as aprovações. Atualize a tela e tente novamente.')
        return
      }
      if (data?.error) {
        if (active) setMessage('Não foi possível carregar as aprovações. Atualize a tela e tente novamente.')
        return
      }
      if (active) {
        setMessage('')
        setApprovals(data?.approvals ?? [])
      }
    }
    void refresh()
    const interval = window.setInterval(() => { void refresh() }, 8000)
    return () => { active = false; window.clearInterval(interval) }
  }, [])

  async function resolve(approval: Approval, decision: 'approve' | 'deny' | 'cancel') {
    if (!supabase) return
    setBusyId(approval.id)
    setMessage('')
    const requestFields = approval.request_payload?.fields ?? []
    const body: Record<string, unknown> = { approvalId: approval.id, decision }
    if (approval.request_type === 'authentication' && decision === 'approve') {
      body.fields = requestFields.map((field) => ({ field_id: field.id, value: fields[approval.id]?.[field.id] ?? '' })).filter((field) => field.value)
      const selectedOption = answers[approval.id]
      if (selectedOption) body.answer = selectedOption
    } else if (approval.request_type === 'final_review' && decision === 'approve') {
      body.answer = 'continue_preparing'
    } else if (approval.request_type === 'final_submit' && decision === 'approve') {
      body.answer = 'confirm_submit'
    } else if (decision === 'approve') {
      body.answer = answers[approval.id] ?? approval.suggested_answer ?? ''
    }
    const { data, error } = await invokeAuthenticated<{ error?: string; status?: string }>('resolve-application-approval', body)
    setBusyId(null)
    if (error || data?.error) {
      setMessage(data?.error ?? error?.message ?? 'Não foi possível registrar sua decisão. Tente novamente.')
      return
    }
    setApprovals((current) => current.filter((item) => item.id !== approval.id))
    setMessage(decision === 'approve' ? 'Decisão registrada. O agente continuará a mesma sessão.' : 'Candidatura cancelada ou acesso negado.')
  }

  return <section className="approval-view">
    <div className="approval-heading"><span className="summary-caption">CONTROLE HUMANO</span><h1>Aprovações pendentes</h1><p>O agente pausa quando precisa de você. Respostas de login são enviadas diretamente à sessão e não ficam salvas no NextMove.</p></div>
    {message && <p className="approval-message" role="status">{message}</p>}
    {!approvals.length ? <div className="approval-empty"><ShieldCheck size={24} /><strong>Nenhuma aprovação pendente</strong><span>Esta lista atualiza automaticamente enquanto a página estiver aberta.</span></div> : approvals.map((approval) => {
      const job = approval.applications?.jobs
      const origin = approval.request_payload?.origin
      const requestFields = approval.request_payload?.fields ?? []
      const options = approval.request_payload?.options ?? []
      const finalReview = approval.request_type === 'final_review'
      const browserOrigin = approval.request_type === 'browser_origin_access'
      const authentication = approval.request_type === 'authentication'
      return <article className="approval-card" key={approval.id}>
        <div className="approval-card-top"><span className="approval-icon"><CircleAlert size={17} /></span><div><strong>{job?.title ?? 'Candidatura'}</strong><span>{job?.company ?? 'Empresa'} · {approval.request_type.replaceAll('_', ' ')}</span></div><span className={`approval-risk ${approval.classification.toLowerCase()}`}>{approval.classification === 'ALWAYS_APPROVE' ? 'Sempre confirmar' : 'Sua resposta'}</span></div>
        <h2>{approval.question}</h2>
        {origin && <p className="approval-origin">Domínio solicitado: <strong>{origin}</strong>{approval.request_payload.reason ? ` · ${approval.request_payload.reason}` : ''}</p>}
        {finalReview && approval.request_payload.review_summary && <div className="approval-review-summary"><span>RESUMO DA CANDIDATURA</span><pre>{approval.request_payload.review_summary}</pre></div>}
        {finalReview && !approval.request_payload.review_summary && <p className="approval-final-warning">Não há resumo textual salvo para revisar. Não autorize o envio; continuar só retoma a preparação.</p>}
        {approval.suggested_answer && !browserOrigin && !authentication && <p className="approval-suggestion">Sugestão baseada no currículo revisado: <strong>{approval.suggested_answer}</strong></p>}
        {authentication && requestFields.map((field) => <label className="approval-field" key={field.id}>{field.label}{field.required && ' *'}<input
          type={/password|code|token/i.test(`${field.id} ${field.type}`) ? 'password' : 'text'}
          autoComplete="off"
          value={fields[approval.id]?.[field.id] ?? ''}
          onChange={(event) => setFields((current) => ({ ...current, [approval.id]: { ...current[approval.id], [field.id]: event.target.value } }))}
        /></label>)}
        {authentication && options.length > 0 && <label className="approval-field">Método de login<select value={answers[approval.id] ?? ''} onChange={(event) => setAnswers((current) => ({ ...current, [approval.id]: event.target.value }))}><option value="">Selecione</option>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>}
        {!browserOrigin && !authentication && !finalReview && approval.request_type !== 'final_submit' && <label className="approval-field">Sua resposta<textarea rows={3} value={answers[approval.id] ?? approval.suggested_answer ?? ''} onChange={(event) => setAnswers((current) => ({ ...current, [approval.id]: event.target.value }))} /></label>}
        {finalReview && <p className="approval-final-warning">A sessão está pausada. Continuar retoma apenas a preparação e não autoriza o envio.</p>}
        {approval.request_type === 'final_submit' && <p className="approval-final-warning">Esta autorização envia a candidatura. Confira o resumo apresentado pelo agente antes de confirmar.</p>}
        <div className="approval-actions">
          <button className="quiet-button" disabled={busyId === approval.id} onClick={() => resolve(approval, 'cancel')}><X size={14} /> {browserOrigin ? 'Negar acesso' : 'Cancelar candidatura'}</button>
          <button className="primary-button" disabled={busyId === approval.id || (authentication && requestFields.some((field) => field.required && !fields[approval.id]?.[field.id])) || (authentication && options.length > 0 && !answers[approval.id])} onClick={() => resolve(approval, 'approve')}>
            {busyId === approval.id ? <><LoaderCircle size={14} className="approval-spinner" /> Enviando…</> : <><Check size={14} /> {browserOrigin ? 'Permitir uma vez' : finalReview ? 'Continuar sem enviar' : approval.request_type === 'final_submit' ? 'Confirmar e enviar candidatura' : authentication ? 'Continuar login' : 'Responder e continuar'}</>}
          </button>
        </div>
      </article>
    })}
  </section>
}