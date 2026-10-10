# NextMove Job Handoff

Extensão Chrome Manifest V3 para analisar e enfileirar a URL da vaga pública do LinkedIn que está na aba ativa sem abrir uma guia do NextMove.

## Instalar para teste

1. Abra `chrome://extensions`.
2. Ative **Developer mode**.
3. Clique em **Load unpacked** e selecione esta pasta.
4. Abra uma vaga pública `linkedin.com/jobs/view/...` ou uma página `jobs/search-results` com uma vaga selecionada (`currentJobId`).
5. No primeiro uso, entre no NextMove dentro do popup da extensão usando email e senha da sua conta.
6. Clique em **Adicionar à fila**. A extensão analisa o link, salva a candidatura e chama a fila Supabase diretamente; abra o site depois para acompanhar.

A extensão usa a URL da aba ativa para identificar a vaga e, somente após o clique **Adicionar à fila**, lê o `href` do link visível **Candidatar-se** na página atual. Se o LinkedIn usar `safety/go`, decodifica apenas o parâmetro `url`; preserva a vaga LinkedIn como origem e envia o destino ATS para análise. Não lê o restante do DOM, não acessa cookies ou endpoints privados e não clica no botão de inscrição. Ela guarda tokens de sessão no `chrome.storage.local`, nunca a senha. Nenhum formulário é preenchido ou enviado.