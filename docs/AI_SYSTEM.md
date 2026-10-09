# Sistema de IA

## Princípio

Uma saída profissional deve estar ligada a evidências verificadas pelo usuário. `evidenceForApplication` exclui afirmações não confirmadas ou não autorizadas; `validateSupportedEvidence` rejeita referências a evidências inválidas. O matching calcula dimensões ponderadas e não recomenda `APPLY` se houver requisito sem evidência ou bloqueador.

## Estado

`parse-resume` usa OpenAI Responses (`gpt-4.1-mini`) para extrair PDF/DOCX e guarda o resultado como rascunho; o usuário revisa e confirma antes de criar evidências permitidas. `discover-linkedin-jobs` usa Web Search, exige citação de URL pública `/jobs/view/` do LinkedIn e compara com os campos confirmados. `analyze-job-links` extrai links enviados pelo usuário e preserva descrição original separada do resumo. Nenhuma função entra em conta do LinkedIn.

## Integração futura

Usar Structured Outputs para extração e análise; preservar texto original da vaga; associar cada requisito e afirmação a IDs de evidência; registrar lacunas em vez de completar por inferência; validar novamente no servidor antes de gerar currículo, carta ou resposta. Nunca usar Assistants API nem enviar segredos ao cliente.

Computer use e consumo da fila não estão implementados. O score de descoberta ainda precisa de avaliação offline e explicação por dimensão/evidência. Uma integração futura requer revisar limites da API, autorização de navegação, interação explícita em páginas sensíveis, idempotência, checkpoints e aprovação humana antes de enviar declarações ou a candidatura final.