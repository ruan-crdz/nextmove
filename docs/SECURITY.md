# Segurança

- Nenhuma chave OpenAI é configurada no frontend. `.env.example` contém apenas URL Supabase e anon key pública.
- O setup lê a OpenAI key de `.env.local` ou `.env`, envia-a como Supabase secret por arquivo temporário fora do repo e remove a linha local após sucesso.
- RLS está habilitada nas tabelas pessoais. Políticas de Storage aceitam somente caminhos no diretório do usuário autenticado.
- As Edge Functions validam o token do chamador. `analyze-job-links` limita URLs, persiste `user_id` autenticado e mantém a chave OpenAI no servidor; `queue-application` chama RPC que valida proprietário, bloqueia a aplicação e cria um run pendente.
- Chamadas do frontend às Edge Functions recuperam a sessão atual e enviam `Authorization: Bearer <access_token>` explicitamente. Se não houver sessão, a chamada é bloqueada no cliente com mensagem para entrar novamente.
- `parse-resume` só baixa arquivos no diretório privado do usuário autenticado; o perfil extraído fica em estado `review` até confirmação explícita.
- `discover-linkedin-jobs` só guarda URLs `/jobs/view/` do LinkedIn que estejam presentes nas citações de Web Search retornadas pela OpenAI. A extensão não injeta scripts, lê DOM, cookies ou endpoints privados.
- O demo não chama serviços externos e não envia candidaturas.
- LinkedIn autenticado, cookies e credenciais de sites de emprego não são coletados.

Antes de produção: adicionar rate limits; validar transições de status; auditar políticas com dois usuários; redigir logs; validar MIME real e tamanho dos uploads; implementar expiração/retry de mensagens; rotacionar secrets; executar testes RLS no Supabase; revisar proteção CSRF/CORS e política de retenção. Não submeta dados reais antes dessas verificações.