export type Job = {
  id: string
  title: string
  company: string
  initials: string
  accent: string
  location: string
  workplace: string
  salary: string
  posted: string
  discoveredAt?: string
  score: number
  matched: string[]
  gap: string
  source: string
  sourceUrl: string
  applicationUrl: string
  description: string
  status?: 'saved' | 'queued' | 'applying' | 'needs_input' | 'submitted' | 'failed' | 'cancelled'
  failureReason?: string
}

export function mapStoredJob(record: Record<string, unknown>): Job {
  const company = typeof record.company === 'string' ? record.company : 'Empresa não informada'
  const applicationUrl = typeof record.application_url === 'string' ? record.application_url : typeof record.source_url === 'string' ? record.source_url : ''
  const sourceUrl = typeof record.source_url === 'string' ? record.source_url : applicationUrl
  const workplaceType = record.workplace_type
  const applicationStatus = record.application_status
  const matchScore = typeof record.match_score === 'number' ? record.match_score : 0
  const matchedSkills = Array.isArray(record.matched_skills) ? record.matched_skills.filter((item): item is string => typeof item === 'string') : []
  const missingRequirements = Array.isArray(record.missing_requirements) ? record.missing_requirements.filter((item): item is string => typeof item === 'string') : []
  const salaryMin = typeof record.salary_min === 'number' ? record.salary_min : null
  const salaryMax = typeof record.salary_max === 'number' ? record.salary_max : null
  const salary = salaryMin && salaryMax
    ? `${record.currency ?? 'R$'} ${salaryMin.toLocaleString('pt-BR')} – ${salaryMax.toLocaleString('pt-BR')}`
    : 'Faixa não informada'

  return {
    id: String(record.id),
    title: typeof record.title === 'string' ? record.title : 'Vaga sem título',
    company,
    initials: company.trim().charAt(0).toUpperCase() || '?',
    accent: 'mint',
    location: typeof record.location === 'string' ? record.location : 'Localização não informada',
    workplace: workplaceType === 'remote' ? 'Remoto' : workplaceType === 'hybrid' ? 'Híbrido' : workplaceType === 'onsite' ? 'Presencial' : 'Modalidade não informada',
    salary,
    posted: 'adicionada agora',
    discoveredAt: typeof record.discovered_at === 'string' ? record.discovered_at : undefined,
    score: matchScore,
    matched: matchedSkills,
    gap: missingRequirements[0] ?? 'Compatibilidade calculada com seu perfil confirmado',
    source: typeof record.source_platform === 'string' ? record.source_platform : 'Origem não informada',
    sourceUrl,
    applicationUrl,
    description: typeof record.description_original === 'string' ? record.description_original : '',
    status: applicationStatus === 'submitted' ? 'submitted'
      : applicationStatus === 'needs_input' ? 'needs_input'
        : applicationStatus === 'researching' || applicationStatus === 'preparing' || applicationStatus === 'applying' ? 'applying'
          : applicationStatus === 'saved' ? 'saved'
            : applicationStatus === 'queued' ? 'queued'
              : applicationStatus === 'failed' ? 'failed'
                : applicationStatus === 'cancelled' ? 'cancelled'
                  : undefined,
    failureReason: typeof record.failure_reason === 'string' ? record.failure_reason : undefined,
  }
}

export const demoJobs: Job[] = [
  {
    id: 'darwin-ai', title: 'Senior Frontend Engineer', company: 'Darwin AI', initials: 'D', accent: 'mint',
    location: 'São Paulo, SP', workplace: 'Remoto', salary: 'R$ 12 mil – R$ 16 mil', posted: 'há 2 h', score: 94,
    matched: ['React', 'TypeScript', 'Design systems'], gap: 'Next.js não aparece no perfil', source: 'LinkedIn',
    sourceUrl: 'https://www.linkedin.com/jobs/view/4128700011', applicationUrl: 'https://jobs.ashbyhq.com/darwin-ai',
    description: 'Buscamos uma pessoa engenheira frontend para evoluir nossa plataforma de inteligência artificial. Você vai trabalhar com React e TypeScript, colaborar com produto e design e ajudar a estabelecer padrões de acessibilidade e qualidade visual.',
    status: 'applying',
  },
  {
    id: 'nuvemshop', title: 'Product Engineer', company: 'Nuvemshop', initials: 'N', accent: 'coral',
    location: 'Brasil', workplace: 'Remoto', salary: 'R$ 10 mil – R$ 14 mil', posted: 'há 5 h', score: 88,
    matched: ['React', 'Experiência de produto', 'APIs'], gap: 'Ruby é desejável, não eliminatório', source: 'Greenhouse',
    sourceUrl: 'https://boards.greenhouse.io/nuvemshop/jobs/5481002', applicationUrl: 'https://boards.greenhouse.io/nuvemshop/jobs/5481002',
    description: 'Construa experiências de comércio digital que atendem milhares de lojistas. A função combina engenharia de produto, colaboração multidisciplinar e evolução de aplicações web em escala.',
    status: 'queued',
  },
  {
    id: 'wildlife', title: 'Frontend Developer', company: 'Wildlife Studios', initials: 'W', accent: 'lilac',
    location: 'São Paulo, SP', workplace: 'Híbrido', salary: 'Faixa não informada', posted: 'ontem', score: 82,
    matched: ['JavaScript', 'Interfaces web', 'Colaboração'], gap: 'Experiência com jogos não evidenciada', source: 'LinkedIn',
    sourceUrl: 'https://www.linkedin.com/jobs/view/4128700098', applicationUrl: 'https://wildlifestudios.com/careers',
    description: 'Faça parte de uma equipe que cria jogos para milhões de pessoas. Procuramos alguém com atenção a detalhes, base sólida em tecnologias web e vontade de aprender com um time multidisciplinar.',
  },
]