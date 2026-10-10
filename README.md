# NextMove

Fundação inicial para transformar uma busca de emprego em um fluxo organizado, explicável e sob controle da pessoa candidata.

## Estado atual

Sem sessão, o frontend mostra a entrada institucional. Com Supabase configurado, cadastro/login por email, upload privado de currículo PDF/DOCX, extração via OpenAI, revisão/edição e confirmação do perfil estão conectados. Após confirmar, o app busca vagas públicas com OpenAI Web Search, valida URLs citadas do LinkedIn, calcula match a partir do perfil confirmado e salva vaga, origem e match no Postgres. A análise de até 20 URLs coladas também continua disponível.

O botão Iniciar agora despacha runs idempotentes para uma sessão OpenAI Agents com browser hospedado. O agente usa perfil/evidências confirmadas, pode pausar e criar aprovações, e o envio final continua sempre desligado até confirmação explícita.

## Rodar localmente

Requisitos: Node.js 20 ou superior.

```sh
npm install
npm run dev
```

Abra a URL local impressa pelo Vite. O frontend funciona sem credenciais em modo demo.

## Comandos

| Comando | Uso |
| --- | --- |
| `npm run dev` | Desenvolvimento local |
| `npm run build` | Typecheck e build de produção |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript strict |
| `npm test` | Testes Vitest e Testing Library |
| `npm run test:e2e` | Teste Playwright do fluxo demo |
| `npm run seed:demo` | Informações sobre os fixtures demo |
| `npm run setup` | Vincular Supabase, transferir OpenAI key local, aplicar migration e publicar funções |

A URL pública do perfil LinkedIn pode ser salva em **Currículo**. Para importar experiências e skills que estão no seu perfil, baixe o PDF exportado pelo LinkedIn e envie junto do currículo. Login/OIDC do LinkedIn não dá acesso automático ao histórico profissional; isso exige acesso de parceiro aprovado pela plataforma.

A extensão experimental está em [`browser-extension/`](browser-extension/). No Chrome, carregue a pasta via `chrome://extensions` → **Developer mode** → **Load unpacked**; após atualizar o código, clique em **Reload**. Entre no NextMove dentro do popup uma vez; em uma vaga do LinkedIn, clique **Adicionar à fila**. Após esse clique, ela lê somente o `href` visível de **Candidatar-se**, preserva a vaga LinkedIn como origem e usa o destino ATS, sem abrir outra guia. Não lê o restante da página, cookies ou endpoints privados, e não automatiza candidaturas.

`npm run setup` requer Supabase CLI autenticada (`supabase login`) e os dados de projeto. Se `.env.local` já existir, o setup reutiliza URL, publishable key e project ref. Se `OPENAI_API_KEY` estiver em `.env.local` ou `.env`, o setup a envia como Supabase secret e remove a linha do arquivo local após o envio.

## Arquitetura e privacidade

- O frontend é React, Vite, TypeScript strict, Tailwind CSS v4, TanStack Query e Zustand.
- Supabase Auth, PostgreSQL, Storage privado, RLS e pgmq guardam dados isolados por usuário.
- Toda tabela de usuário restringe linhas pelo proprietário. Chaves compostas impedem referências cruzadas entre usuários nas relações principais.
- Currículos são destinados ao bucket privado `user-resumes`, organizados sob o UUID do usuário.
- A OpenAI key é exclusivamente server-side. Nunca crie variáveis `VITE_OPENAI_*`.
- `parse-resume` extrai perfil estruturado de PDF/DOCX em armazenamento privado; o usuário revisa antes de gravar linhas e evidências verificadas.
- `discover-linkedin-jobs` usa OpenAI Responses/Web Search, exige URL pública citada do LinkedIn e relaciona as vagas ao perfil confirmado.
- `analyze-job-links` usa OpenAI Responses com web search e Structured Outputs; `queue-application` protege o enqueue autenticado.
- `dispatch-application` cria uma sessão de browser OpenAI sem manter Edge Function longa; `application-status` sincroniza required actions; `resolve-application-approval` retorna respostas à mesma sessão.
- `openai-agent-webhook` valida assinatura e deduplica eventos, mas requer cadastrar o endpoint e guardar `OPENAI_WEBHOOK_SECRET`; sem isso, o polling da tela Aprovações mantém o primeiro teste funcionando.
- URLs do LinkedIn são tratadas como origem declarada; não há scraping autenticado nem automação de Easy Apply.
- Migrations de currículo/idiomas aplicadas e funções `queue-application`, `analyze-job-links`, `parse-resume` e `discover-linkedin-jobs` publicadas.

## Deploy

O workflow em `.github/workflows/deploy.yml` publica o build em GitHub Pages e calcula o base path a partir do nome real do repositório. Configure Pages para a origem **GitHub Actions**.

## Documentação

- [Arquitetura](docs/ARCHITECTURE.md)
- [Modelo de dados](docs/DATA_MODEL.md)
- [Sistema de IA](docs/AI_SYSTEM.md)
- [Segurança](docs/SECURITY.md)
- [UX](docs/UX.md)
- [Benchmark conceitual](docs/BENCHMARK.md)

## Limitações e próximo passo

Para um teste: confirme um currículo/perfil, adicione uma vaga pública com formulário ATS e clique **Iniciar candidatura**. O agente abre o domínio no browser hospedado; aprove cada domínio e responda pedidos em **Aprovações**. Ele deve parar antes do submit e pedir sua confirmação. Não envie uma inscrição real antes de revisar os dados e o domínio.
