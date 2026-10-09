# NextMove

Fundação inicial para transformar uma busca de emprego em um fluxo organizado, explicável e sob controle da pessoa candidata.

## Estado atual

Sem sessão, o frontend usa **modo demo explícito**. Com Supabase configurado, cadastro/login por email, análise de até 20 links HTTPS públicos com OpenAI Responses/web search, preservação da origem e salvamento das vagas passam pelo backend real. Também é possível salvar vagas como candidaturas no Postgres e colocá-las na fila pgmq.

O worker que consome a fila, matching contra um perfil profissional real, importação de currículo, aprovações e automação de browser ainda não estão implementados. Enfileirar não significa que uma candidatura será preenchida ou enviada.

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

`npm run setup` requer Supabase CLI autenticada (`supabase login`) e os dados de projeto. Se `.env.local` já existir, o setup reutiliza URL, publishable key e project ref. Se `OPENAI_API_KEY` estiver em `.env.local` ou `.env`, o setup a envia como Supabase secret e remove a linha do arquivo local após o envio.

## Arquitetura e privacidade

- O frontend é React, Vite, TypeScript strict, Tailwind CSS v4, TanStack Query e Zustand.
- Supabase Auth, PostgreSQL, Storage privado, RLS e pgmq guardam dados isolados por usuário.
- Toda tabela de usuário restringe linhas pelo proprietário. Chaves compostas impedem referências cruzadas entre usuários nas relações principais.
- Currículos são destinados ao bucket privado `user-resumes`, organizados sob o UUID do usuário.
- A OpenAI key é exclusivamente server-side. Nunca crie variáveis `VITE_OPENAI_*`.
- `analyze-job-links` usa OpenAI Responses com web search e Structured Outputs; `queue-application` protege o enqueue autenticado.
- URLs do LinkedIn são tratadas como origem declarada; não há scraping autenticado nem automação de Easy Apply.
- Schema aplicado e as funções `analyze-job-links` e `queue-application` publicadas no projeto configurado.

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

Próximos passos: worker idempotente para pgmq; perfil/evidências e importação revisada de currículo; matching explicável; aprovações; execução browser autorizada. Nenhuma candidatura pode ser considerada enviada até haver confirmação do ATS.
