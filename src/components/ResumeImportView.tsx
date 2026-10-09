import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check, FileText, LoaderCircle, Sparkles, Upload } from 'lucide-react'
import { resumeProfileSchema, type ResumeProfile } from '../domain/resume'
import { supabase } from '../lib/supabase'
import './resume-import.css'
import './resume-review.css'

type ResumeImportViewProps = {
  userEmail: string | null
  onBack: () => void
  onProfileConfirmed: (profile: ResumeProfile) => void
}

export function ResumeImportView({ userEmail, onBack, onProfileConfirmed }: ResumeImportViewProps) {
  const [file, setFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState('')
  const [profile, setProfile] = useState<ResumeProfile | null>(null)
  const [documentId, setDocumentId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let active = true
    async function loadPendingReview() {
      if (!supabase) return
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('documents')
        .select('id,file_name,extracted_profile')
        .eq('user_id', user.id).eq('processing_status', 'review')
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (!active || !data?.extracted_profile) return
      const parsed = resumeProfileSchema.safeParse(data.extracted_profile)
      if (parsed.success) {
        setProfile(parsed.data)
        setDocumentId(data.id)
        setFileName(data.file_name)
      }
    }
    void loadPendingReview()
    return () => { active = false }
  }, [])

  async function parseResume() {
    if (!supabase || !file) return
    if (file.size < 1 || file.size > 10 * 1024 * 1024) {
      setMessage('O arquivo precisa ter até 10 MB.')
      return
    }
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    const isDocx = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.toLowerCase().endsWith('.docx')
    if (!isPdf && !isDocx) {
      setMessage('Envie o currículo em PDF ou DOCX.')
      return
    }

    setLoading(true)
    setMessage('')
    setProfile(null)
    setSaved(false)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sua sessão expirou. Entre novamente.')
      const newDocumentId = crypto.randomUUID()
      const safeName = file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '-').slice(-100)
      const path = `${user.id}/${newDocumentId}-${safeName}`
      const mimeType = isPdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      const { error: uploadError } = await supabase.storage.from('user-resumes').upload(path, file, { contentType: mimeType, upsert: false })
      if (uploadError) throw new Error('Não foi possível enviar o currículo. Verifique o tamanho e tente novamente.')

      const { error: documentError } = await supabase.from('documents').insert({
        id: newDocumentId, user_id: user.id, storage_path: path, file_name: file.name,
        mime_type: mimeType, size_bytes: file.size, processing_status: 'uploaded',
      })
      if (documentError) {
        await supabase.storage.from('user-resumes').remove([path])
        throw new Error('Não foi possível registrar o documento no perfil.')
      }

      setDocumentId(newDocumentId)
      setFileName(file.name)
      const { data, error } = await supabase.functions.invoke('parse-resume', { body: { documentId: newDocumentId } })
      if (error || data?.error) throw new Error(data?.error ?? 'Não foi possível extrair o currículo.')
      const parsed = resumeProfileSchema.safeParse(data.profile)
      if (!parsed.success) throw new Error('A extração veio incompleta. Tente outro arquivo.')
      setProfile(parsed.data)
      setMessage('Revise cada seção. Nada será usado em recomendações até você confirmar o perfil.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível processar o currículo.')
    } finally {
      setLoading(false)
    }
  }

  function update<K extends keyof ResumeProfile>(key: K, value: ResumeProfile[K]) {
    setProfile((current) => current ? { ...current, [key]: value } : current)
  }

  async function confirmProfile() {
    if (!supabase || !profile || !documentId) return
    setSaving(true)
    setMessage('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sua sessão expirou. Entre novamente.')
      const completeness = [profile.fullName, profile.headline, profile.summary, profile.experiences.length, profile.educations.length, profile.skills.length, profile.languages.length].filter(Boolean).length
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: user.id, full_name: clean(profile.fullName), headline: clean(profile.headline), summary: clean(profile.summary),
        phone: clean(profile.phone), location: clean(profile.location), linkedin_url: safeUrl(profile.linkedinUrl),
        portfolio_url: safeUrl(profile.portfolioUrl), completeness: Math.round(completeness / 7 * 100),
      })
      if (profileError) throw new Error('Não foi possível salvar os dados básicos do perfil.')

      const experiences = profile.experiences.filter((item) => item.company.trim() && item.title.trim()).map((item) => ({
        user_id: user.id, source_document_id: documentId, company: item.company.trim(), title: item.title.trim(),
        location: clean(item.location), description: clean(item.description), start_date: databaseDate(item.startDate),
        end_date: databaseDate(item.endDate), is_current: item.isCurrent,
      }))
      if (experiences.length) {
        const { error } = await supabase.from('experiences').upsert(experiences, { onConflict: 'user_id,source_document_id,company,title' })
        if (error) throw new Error('Não foi possível salvar experiências. Revise os dados e tente novamente.')
      }

      const educations = profile.educations.filter((item) => item.institution.trim()).map((item) => ({
        user_id: user.id, source_document_id: documentId, institution: item.institution.trim(), degree: clean(item.degree),
        field_of_study: clean(item.fieldOfStudy), start_date: databaseDate(item.startDate), end_date: databaseDate(item.endDate),
      }))
      if (educations.length) {
        const { error } = await supabase.from('educations').upsert(educations, { onConflict: 'user_id,source_document_id,institution,degree' })
        if (error) throw new Error('Não foi possível salvar a formação.')
      }

      const certifications = profile.certifications.filter((item) => item.name.trim()).map((item) => ({
        user_id: user.id, source_document_id: documentId, name: item.name.trim(), issuer: clean(item.issuer),
        issued_at: databaseDate(item.issuedAt), expires_at: databaseDate(item.expiresAt), credential_url: safeUrl(item.credentialUrl),
      }))
      if (certifications.length) {
        const { error } = await supabase.from('certifications').upsert(certifications, { onConflict: 'user_id,source_document_id,name,issuer' })
        if (error) throw new Error('Não foi possível salvar certificações.')
      }

      const projects = profile.projects.filter((item) => item.name.trim()).map((item) => ({
        user_id: user.id, source_document_id: documentId, name: item.name.trim(), description: clean(item.description),
        url: safeUrl(item.url), technologies: item.technologies,
      }))
      if (projects.length) {
        const { error } = await supabase.from('projects').upsert(projects, { onConflict: 'user_id,source_document_id,name' })
        if (error) throw new Error('Não foi possível salvar projetos.')
      }

      const skills = profile.skills.filter((item) => item.name.trim()).map((item) => ({
        user_id: user.id, name: item.name.trim(), proficiency: clean(item.proficiency), years_experience: item.yearsExperience,
      }))
      if (skills.length) {
        const { error } = await supabase.from('skills').upsert(skills, { onConflict: 'user_id,name', ignoreDuplicates: true })
        if (error) throw new Error('Não foi possível salvar competências.')
      }
      const languages = profile.languages.filter((item) => item.name.trim()).map((item) => ({
        user_id: user.id, name: item.name.trim(), proficiency: clean(item.proficiency),
      }))
      if (languages.length) {
        const { error } = await supabase.from('languages').upsert(languages, { onConflict: 'user_id,name' })
        if (error) throw new Error('Não foi possível salvar idiomas.')
      }

      const claims = [
        ...(profile.fullName ? [{ type: 'identity', claim: `Nome: ${profile.fullName}` }] : []),
        ...(profile.headline ? [{ type: 'headline', claim: profile.headline }] : []),
        ...(profile.summary ? [{ type: 'summary', claim: profile.summary }] : []),
        ...skills.map((item) => ({ type: 'skill', claim: `Competência: ${item.name}${item.proficiency ? ` (${item.proficiency})` : ''}` })),
        ...experiences.map((item) => ({ type: 'experience', claim: `${item.title} em ${item.company}${item.description ? `: ${item.description}` : ''}` })),
        ...educations.map((item) => ({ type: 'education', claim: `${item.degree ?? 'Formação'} em ${item.institution}${item.field_of_study ? `, ${item.field_of_study}` : ''}` })),
        ...certifications.map((item) => ({ type: 'certification', claim: `Certificação: ${item.name}${item.issuer ? ` · ${item.issuer}` : ''}` })),
        ...projects.map((item) => ({ type: 'project', claim: `Projeto: ${item.name}${item.description ? ` · ${item.description}` : ''}` })),
        ...languages.map((item) => ({ type: 'language', claim: `Idioma: ${item.name}${item.proficiency ? ` (${item.proficiency})` : ''}` })),
      ]
      if (claims.length) {
        const evidence = claims.map((item) => ({
          user_id: user.id, type: item.type, claim: item.claim, source_type: 'document', source_id: documentId,
          confidence: 1, verified_by_user: true, allowed_for_application: true,
        }))
        const { error } = await supabase.from('evidence_items').insert(evidence)
        if (error) throw new Error('Perfil salvo, mas não foi possível registrar suas evidências.')
      }

      await supabase.from('resume_versions').update({ is_current: false }).eq('user_id', user.id)
      const { error: resumeError } = await supabase.from('resume_versions').insert({
        user_id: user.id, document_id: documentId, title: fileName || 'Currículo importado', language: 'pt-BR', content: profile, is_current: true,
      })
      if (resumeError) throw new Error('Perfil salvo, mas não foi possível registrar a versão do currículo.')
      await supabase.from('documents').update({ processing_status: 'confirmed', extracted_profile: profile }).eq('id', documentId).eq('user_id', user.id)

      setSaved(true)
      setMessage('Perfil confirmado. Agora vamos buscar vagas públicas compatíveis com ele.')
      onProfileConfirmed(profile)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível confirmar o perfil.')
    } finally {
      setSaving(false)
    }
  }

  return <div className="resume-workspace">
    <div className="profile-page-heading">
      <button className="quiet-button" onClick={onBack}><ArrowLeft size={15} /> Voltar</button>
      <div><span className="summary-caption">PERFIL PROFISSIONAL</span><h2>Importar currículo</h2><p>As informações só entram no seu perfil depois que você revisar e confirmar.</p></div>
    </div>
    {!profile && <section className="resume-upload-section">
      <div className="resume-upload-icon"><Upload size={19} /></div>
      <label className="resume-file-picker">Selecione seu currículo<input type="file" accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setMessage('') }} /></label>
      <p>PDF ou DOCX · até 10 MB · guardado em armazenamento privado.</p>
      {!file && <p className="resume-upload-prompt" id="resume-upload-prompt">Selecione um arquivo acima para habilitar a extração.</p>}
      {file && <div className="resume-selected-file"><FileText size={16} /><span>{file.name}</span><span>{Math.max(1, Math.round(file.size / 1024))} KB</span></div>}
      <button className="primary-button" aria-describedby={!file ? 'resume-upload-prompt' : undefined} disabled={!file || loading} onClick={parseResume}>{loading ? <><LoaderCircle size={16} className="resume-spinner" /> Extraindo perfil…</> : <>Extrair perfil com IA <ArrowRight size={16} /></>}</button>
    </section>}
    {profile && <>
      <div className="resume-review-notice"><Sparkles size={17} /><div><strong>Extraído por IA · aguardando sua revisão</strong><span>Edite o que precisar. Só o que você confirmar poderá fundamentar recomendações.</span></div></div>
      <section className="resume-review-form">
        <div className="resume-field-grid">
          <label>Nome completo<input value={profile.fullName ?? ''} onChange={(event) => update('fullName', event.target.value || null)} /></label>
          <label>Cargo / título<input value={profile.headline ?? ''} onChange={(event) => update('headline', event.target.value || null)} /></label>
          <label>Email da conta<input value={userEmail ?? ''} readOnly /></label>
          <label>Telefone<input value={profile.phone ?? ''} onChange={(event) => update('phone', event.target.value || null)} /></label>
          <label>Localização<input value={profile.location ?? ''} onChange={(event) => update('location', event.target.value || null)} /></label>
        </div>
        <label className="resume-long-field">Resumo profissional<textarea rows={4} value={profile.summary ?? ''} onChange={(event) => update('summary', event.target.value || null)} /></label>
        <label className="resume-long-field">Competências <span className="resume-field-hint">Uma por linha</span><textarea rows={4} value={profile.skills.map((skill) => skill.name).join('\n')} onChange={(event) => update('skills', event.target.value.split('\n').map((name) => name.trim()).filter(Boolean).map((name) => profile.skills.find((skill) => skill.name.toLowerCase() === name.toLowerCase()) ?? { name, proficiency: null, yearsExperience: null }))} /></label>
        <ReviewList title="Experiências" count={profile.experiences.length} items={profile.experiences.map((item, index) => <div className="resume-review-item resume-review-item-wide" key={`${item.company}-${index}`}>
          <label>Empresa<input value={item.company} onChange={(event) => update('experiences', profile.experiences.map((entry, i) => i === index ? { ...entry, company: event.target.value } : entry))} /></label>
          <label>Cargo<input value={item.title} onChange={(event) => update('experiences', profile.experiences.map((entry, i) => i === index ? { ...entry, title: event.target.value } : entry))} /></label>
          <label>Localização<input value={item.location ?? ''} onChange={(event) => update('experiences', profile.experiences.map((entry, i) => i === index ? { ...entry, location: event.target.value || null } : entry))} /></label>
          <label>Início<input type="date" value={item.startDate ?? ''} onChange={(event) => update('experiences', profile.experiences.map((entry, i) => i === index ? { ...entry, startDate: event.target.value || null } : entry))} /></label>
          <label>Fim<input type="date" value={item.endDate ?? ''} disabled={item.isCurrent} onChange={(event) => update('experiences', profile.experiences.map((entry, i) => i === index ? { ...entry, endDate: event.target.value || null } : entry))} /></label>
          <label className="resume-current-role"><input type="checkbox" checked={item.isCurrent} onChange={(event) => update('experiences', profile.experiences.map((entry, i) => i === index ? { ...entry, isCurrent: event.target.checked, endDate: event.target.checked ? null : entry.endDate } : entry))} /> Cargo atual</label>
          <label className="resume-review-span">Descrição<textarea rows={3} value={item.description ?? ''} onChange={(event) => update('experiences', profile.experiences.map((entry, i) => i === index ? { ...entry, description: event.target.value || null } : entry))} /></label>
        </div>)} />
        <ReviewList title="Formação" count={profile.educations.length} items={profile.educations.map((item, index) => <div className="resume-review-item resume-review-item-wide" key={`${item.institution}-${index}`}>
          <label>Instituição<input value={item.institution} onChange={(event) => update('educations', profile.educations.map((entry, i) => i === index ? { ...entry, institution: event.target.value } : entry))} /></label>
          <label>Grau<input value={item.degree ?? ''} onChange={(event) => update('educations', profile.educations.map((entry, i) => i === index ? { ...entry, degree: event.target.value || null } : entry))} /></label>
          <label>Área de estudo<input value={item.fieldOfStudy ?? ''} onChange={(event) => update('educations', profile.educations.map((entry, i) => i === index ? { ...entry, fieldOfStudy: event.target.value || null } : entry))} /></label>
          <label>Início<input type="date" value={item.startDate ?? ''} onChange={(event) => update('educations', profile.educations.map((entry, i) => i === index ? { ...entry, startDate: event.target.value || null } : entry))} /></label>
          <label>Fim<input type="date" value={item.endDate ?? ''} onChange={(event) => update('educations', profile.educations.map((entry, i) => i === index ? { ...entry, endDate: event.target.value || null } : entry))} /></label>
        </div>)} />
        <ReviewList title="Idiomas" count={profile.languages.length} items={profile.languages.map((item, index) => <div className="resume-review-item" key={`${item.name}-${index}`}><label>Idioma<input value={item.name} onChange={(event) => update('languages', profile.languages.map((entry, i) => i === index ? { ...entry, name: event.target.value } : entry))} /></label><label>Nível<input value={item.proficiency ?? ''} onChange={(event) => update('languages', profile.languages.map((entry, i) => i === index ? { ...entry, proficiency: event.target.value || null } : entry))} /></label></div>)} />
        <ReviewList title="Certificações" count={profile.certifications.length} items={profile.certifications.map((item, index) => <div className="resume-review-item" key={`${item.name}-${index}`}><label>Certificação<input value={item.name} onChange={(event) => update('certifications', profile.certifications.map((entry, i) => i === index ? { ...entry, name: event.target.value } : entry))} /></label><label>Emissor<input value={item.issuer ?? ''} onChange={(event) => update('certifications', profile.certifications.map((entry, i) => i === index ? { ...entry, issuer: event.target.value || null } : entry))} /></label><label>Link<input type="url" value={item.credentialUrl ?? ''} onChange={(event) => update('certifications', profile.certifications.map((entry, i) => i === index ? { ...entry, credentialUrl: event.target.value || null } : entry))} /></label></div>)} />
        <ReviewList title="Projetos" count={profile.projects.length} items={profile.projects.map((item, index) => <div className="resume-review-item resume-review-item-wide" key={`${item.name}-${index}`}><label>Projeto<input value={item.name} onChange={(event) => update('projects', profile.projects.map((entry, i) => i === index ? { ...entry, name: event.target.value } : entry))} /></label><label>Link<input type="url" value={item.url ?? ''} onChange={(event) => update('projects', profile.projects.map((entry, i) => i === index ? { ...entry, url: event.target.value || null } : entry))} /></label><label className="resume-review-span">Descrição<textarea rows={3} value={item.description ?? ''} onChange={(event) => update('projects', profile.projects.map((entry, i) => i === index ? { ...entry, description: event.target.value || null } : entry))} /></label><label className="resume-review-span">Tecnologias <span className="resume-field-hint">Uma por linha</span><textarea rows={2} value={item.technologies.join('\n')} onChange={(event) => update('projects', profile.projects.map((entry, i) => i === index ? { ...entry, technologies: event.target.value.split('\n').map((technology) => technology.trim()).filter(Boolean) } : entry))} /></label></div>)} />
      </section>
      <button className="primary-button resume-confirm" disabled={saving || saved} onClick={confirmProfile}>{saving ? 'Salvando perfil…' : saved ? <><Check size={16} /> Perfil confirmado</> : <>Confirmar perfil e buscar vagas <ArrowRight size={16} /></>}</button>
    </>}
    {message && <p className={`resume-message ${message.startsWith('Não') ? 'error' : ''}`} role="status">{message}</p>}
  </div>
}

function ReviewList({ title, count, items }: { title: string; count: number; items: ReactNode[] }) {
  return <section className="resume-review-group"><div className="resume-review-title"><span>{title}</span><b>{count}</b></div>{count ? items : <p className="resume-empty-field">Nenhum item identificado no arquivo.</p>}</section>
}

function clean(value: string | null) {
  return value?.trim() || null
}

function safeUrl(value: string | null) {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

function databaseDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : value
}