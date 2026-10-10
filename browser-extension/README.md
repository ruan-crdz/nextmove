# NextMove Job Handoff

Extensão Chrome Manifest V3 para analisar e enfileirar a URL da vaga pública do LinkedIn que está na aba ativa sem abrir uma guia do NextMove.

## Instalar para teste

1. Abra `chrome://extensions`.
2. Ative **Developer mode**.
3. Clique em **Load unpacked** e selecione esta pasta.
4. Abra uma vaga pública `linkedin.com/jobs/view/...` ou uma página `jobs/search-results` com uma vaga selecionada (`currentJobId`).
5. No primeiro uso, entre no NextMove dentro do popup da extensão usando email e senha da sua conta.
6. Clique em **Adicionar à fila**. A extensão analisa o link, salva a candidatura e chama a fila Supabase diretamente; abra o site depois para acompanhar.

A extensão lê somente a URL da aba ativa depois do clique do usuário. Não injeta script no LinkedIn, não lê o DOM, não acessa cookies ou endpoints privados e não faz Easy Apply. Ela guarda tokens de sessão no `chrome.storage.local`, nunca a senha. A análise continua sujeita à disponibilidade de dados públicos/citações do LinkedIn; nenhum formulário é preenchido ou enviado.