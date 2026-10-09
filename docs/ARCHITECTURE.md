# Arquitetura

## Implementado

O cliente Vite serve a demo sem sessão. Com Supabase configurado, usa Auth para cadastro/login por email, carrega vagas do usuário e envia até 20 links públicos à Edge Function `analyze-job-links`. Regras puras de evidência, score ponderado e classificação de aprovação ficam em `src/domain` e podem ser testadas sem serviços externos.

O Supabase guarda os dados por usuário. A migration inicial cria perfis, evidências, vagas, matches, aplicações, runs, eventos, regras e aprovações. `analyze-job-links` valida sessão, chama OpenAI Responses com web search e persiste conteúdo/proveniência usando service role apenas no backend. Uma RPC autenticada enfileira uma aplicação existente com lock por aplicação; `queue-application` valida a sessão e chama somente essa RPC.

## Ainda não conectado

Não existe worker para consumir `pgmq`, extração de currículo, match contra evidence profile, API de approvals ou sessão de browser. A submissão de candidaturas não acontece.

```text
React ── Supabase Auth ── analyze-job-links ── OpenAI Responses/web search
  └──── Postgres (RLS) ─── application ─── queue-application ── pgmq
                                                               └── worker (pendente)
                                                                    └── browser agent (pendente)
```

Não se deve chamar o browser agent de uma página pública. A chave OpenAI e a execução de ferramentas pertencem a uma função de backend autenticada, com limites, checkpoints e logs redigidos.