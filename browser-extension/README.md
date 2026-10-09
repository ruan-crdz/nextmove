# NextMove Job Handoff

Extensão Chrome Manifest V3 para compartilhar a URL da vaga pública do LinkedIn que está na aba ativa.

## Instalar para teste

1. Abra `chrome://extensions`.
2. Ative **Developer mode**.
3. Clique em **Load unpacked** e selecione esta pasta.
4. Abra uma página pública `linkedin.com/jobs/view/...`, clique no ícone da extensão e escolha **Adicionar no NextMove**.

A extensão lê somente a URL/título da aba ativa depois do clique do usuário. Não injeta script no LinkedIn, não lê o DOM, não acessa cookies ou endpoints privados e não faz Easy Apply. O NextMove abre com o link preenchido; a pessoa entra na conta, inicia a análise e revisa os resultados.