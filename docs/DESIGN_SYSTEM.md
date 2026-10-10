# Design System do Next Move

## Princípios

- A interface permanece dentro da viewport: `100dvh`, sem rolagem vertical ou horizontal no documento.
- Conteúdo longo é dividido em páginas ou etapas. Não esconder informações com `overflow: hidden` sem um controle que permita acessá-las.
- Preservar ações humanas explícitas: currículo só é usado após confirmação e candidatura só é enviada após autorização final.
- Priorizar hierarquia clara, comparação rápida e controles consistentes entre desktop e mobile.

## Identidade visual

- Marca azul derivada do ícone: navy `#082050`, royal `#003078` / `#0060d8`, azul vivo `#0080f0`.
- Usar as propriedades centralizadas em `src/design-tokens.css`; evitar criar paletas locais conflitantes.
- Manrope para títulos; DM Sans para corpo e controles.
- Usar Lucide para ícones e manter texto em ações importantes.
- Cartões com bordas discretas e raio de até 8 px. Seções de página não devem parecer cartões aninhados.

## Tipografia e interação

- Corpo e formulários: 14–16 px quando houver espaço; texto auxiliar mobile: mínimo 12 px.
- Eyebrows e metadados podem ser menores quando não forem necessários para entender uma ação.
- Alvos interativos mobile: mínimo de 44 × 44 px sempre que possível.
- Inputs mantêm rótulos visíveis, foco evidente e tamanho de fonte de 16 px no mobile para evitar zoom involuntário.
- Abas usam `role="tablist"`, `role="tab"` e `aria-selected`; navegação usa `aria-current`.
- Estados de carregamento, erro e sucesso devem ser distinguíveis e expostos com `role="status"` quando aplicável.

## Layout responsivo

- Breakpoints principais: 768 px para navegação mobile e 1180 px para composição do workspace.
- Shell autenticado: header fixo no fluxo, workspace ocupa o espaço restante; bottom navigation e faixa demo têm altura reservada.
- Landing pública: início, funcionamento e segurança são vistas selecionáveis; cada vista cabe na altura disponível.
- Home reduz conteúdo secundário em viewports baixos e aponta para as telas completas.
- Vagas, Fila, Candidaturas e Aprovações usam paginação. Tamanho de página diminui em viewports baixos.
- Perfil divide origem (Currículo/LinkedIn) em abas e revisão em Dados, Resumo, Experiência, Formação e Extras.
- Preferências de busca usam Busca, Condições e Idiomas. Detalhes da vaga separam Compatibilidade e Descrição.
- Resumos extensos de candidatura são apresentados em páginas de texto, sem rolagem interna.
- Modais ficam acima do header/navegação e dimensionam o conteúdo sem criar uma segunda página rolável.

## Viewport e validação

- Validar pelo menos 1440 × 900, 1280 × 800, 1024 × 768, 768 × 1024, 430 × 932, 390 × 844, 375 × 812 e 360 × 800.
- Para cada tela e modal, `scrollHeight` e `scrollWidth` não devem exceder as dimensões do respectivo painel.
- Overflow deve ser corrigido por paginação, etapas, quebra de linha ou ajuste de densidade; não apenas mascarado no documento.
- Preservar `prefers-reduced-motion` e estados acessíveis de teclado.