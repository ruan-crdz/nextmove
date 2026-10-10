# Arquitetura

## Implementado

O cliente Vite mostra entrada institucional sem sessão. Com Supabase, usa Auth, carrega perfil/vagas do usuário e faz upload de currículo PDF/DOCX para o bucket privado. `parse-resume` cria extração estruturada como rascunho; só após revisão humana a UI grava perfil, experiências, formação, skills, idiomas, certificados, projetos e evidências verificadas. `discover-linkedin-jobs` então pesquisa páginas públicas indexadas e exige citações URL do LinkedIn antes de salvar matches. `analyze-job-links` segue disponível para URLs coladas.

O Supabase guarda os dados por usuário. Migrations criam perfil, documentos, evidências, vagas, matches e fila. Edge Functions validam JWT, escopam cada operação por `user.id` e mantêm a chave OpenAI/service role apenas no backend. Uma RPC autenticada enfileira uma aplicação existente com lock por aplicação; `queue-application` valida a sessão e chama somente essa RPC.

`202610100001` guarda extração de currículo para revisão, idiomas e origem dos registros; `202610100002` deduplica certificados/projetos por documento. A extensão Chrome em `browser-extension/` só passa a URL pública ativa via query string após clique; a aplicação valida host/path, preserva o deep link durante login e abre a caixa de análise quando há sessão.

## Execução assíncrona e controle humano

`queue-application` cria runs duráveis em `pgmq`. `dispatch-application` reserva um run, cria uma sessão OpenAI Agents com browser hospedado e retorna sem aguardar a execução. `application-status` sincroniza ações requeridas e ociosidade; `resolve-application-approval` envia decisões à mesma sessão. `openai-agent-webhook` aceita eventos com assinatura verificada; o polling da tela **Aprovações** funciona como fallback.

O agente recebe apenas o currículo/perfil confirmado e evidências permitidas. Não usa LinkedIn autenticado, não inventa respostas e não envia credenciais por mensagens comuns. A autorização `final_submit` é separada de uma pausa `final_review`; continuar a preparação na revisão não autoriza envio. A chave de execução fica no backend, com `auto_submit=false`.

A extensão em `browser-extension/` transfere só a URL ativa após clique do usuário; não injeta scripts nem lê conteúdo privado do LinkedIn.

```text
React ── Supabase Auth ── private resume storage ── parse-resume / OpenAI
  ├──── discover-linkedin-jobs / analyze-job-links ── OpenAI public web search
  └──── Postgres (RLS) ─── application ─── queue-application ── pgmq
                           └── dispatch-application
                             └── OpenAI Agents session
                               ├── polling / signed webhook
                               └── approvals ── same session
```

Não se deve chamar o browser agent de uma página pública. A chave OpenAI e a execução de ferramentas pertencem a funções de backend autenticadas, com checkpoints e logs redigidos. O webhook requer endpoint e signing secret configurados no painel OpenAI/Supabase; não é necessário para o polling inicial.