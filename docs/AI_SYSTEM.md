# Sistema de IA

## Princípio

Uma saída profissional deve estar ligada a evidências verificadas pelo usuário. `evidenceForApplication` exclui afirmações não confirmadas ou não autorizadas; `validateSupportedEvidence` rejeita referências a evidências inválidas. O matching calcula dimensões ponderadas e não recomenda `APPLY` se houver requisito sem evidência ou bloqueador.

## Estado

`analyze-job-links` usa OpenAI Responses (`gpt-4.1-mini`) com web search e Structured Outputs para extrair dados de links públicos. Descrição original e resumo gerado ficam separados. A função não acessa sessões autenticadas. Matching contra um perfil real ainda não está conectado; os scores na demo não avaliam uma pessoa.

## Integração futura

Usar Structured Outputs para extração e análise; preservar texto original da vaga; associar cada requisito e afirmação a IDs de evidência; registrar lacunas em vez de completar por inferência; validar novamente no servidor antes de gerar currículo, carta ou resposta. Nunca usar Assistants API nem enviar segredos ao cliente.

Computer use e consumo da fila não estão implementados. Uma integração futura requer revisar os limites atuais da API, autorização de navegação, interação explícita em páginas sensíveis, idempotência, checkpoints e aprovação humana antes de enviar declarações ou a candidatura final.