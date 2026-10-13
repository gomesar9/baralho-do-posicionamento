# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projeto

Site estático (HTML/CSS/JS puro, sem build, sem dependências) que digitaliza o baralho `Baralho.pdf`: 32 cartas com frases políticas; o usuário julga "Bom" ou "Ruim" sem saber o autor, depois a carta vira e revela o político (Lula: copas 1–8 e espadas 9–16; Flávio Bolsonaro: ouros 17–24 e paus 25–32). Hospedagem: qualquer servidor estático (Cloudflare Workers via `preparar-public.sh`; também funciona em GitHub Pages servido da raiz).

Código, identificadores e textos da interface em pt-BR.

## Rodar

Abrir `index.html` direto no navegador (funciona em `file://`, pois os dados vêm de `cards.js` via `<script>`, não de `fetch`). Não há build, lint nem suíte de testes no repositório.

## Publicar

Produção: https://baralhodaverdade.org (e `www.`), Cloudflare Worker de assets estáticos `baralho-politico`, configurado em `wrangler.jsonc` (nome, domínios como `custom_domain`, `compatibility_date`, diretório `public/`).

- **Pipeline** (`.github/workflows/deploy.yml`): push na `main` (ou disparo manual) monta `public/`, confere se `cards.js` está em dia com `cards.json` e publica com `wrangler deploy`, usando os segredos `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` do environment `production` do GitHub (restrito à branch `main`). O job `validar` (monta e roda `wrangler deploy --dry-run`) existe, mas o gatilho `pull_request` está comentado por enquanto.
- **Local**: `./preparar-public.sh --sem-deploy` regenera `cards.js` e monta `public/` (só `index.html`, `style.css`, `leque.js`, `app.js`, `cards.js` e a pasta `assets/`); sem a flag também publica (exige `wrangler login`). Arquivo novo que o site precise em produção tem de entrar em `ARQUIVOS` (ou pasta em `PASTAS`) no script. A versão do wrangler está fixada no script e no workflow; mudar nos dois.

## Dados

- `cards.json` é a fonte de verdade: `{ compartilheUrl, cartas: [{ numero, rotulo, naipe, frase, hashtag, politico, fonteUrl }] }`.
- `cards.js` é gerado a partir dele (`window.BARALHO = ...`) e não deve ser editado à mão. `preparar-public.sh` regenera automaticamente; para regenerar sem montar `public/`:
  ```
  python3 -c "import json;d=json.load(open('cards.json'));open('cards.js','w').write('// Gerado a partir de cards.json. Não editar à mão.\nwindow.BARALHO = '+json.dumps(d,ensure_ascii=False,indent=2)+';\n')"
  ```
- `fonteUrl` e `compartilheUrl` foram extraídos dos QR codes do PDF (versos nas páginas 2, 4, 6, 8; "Compartilhe!" na página 9). Os versos estão espelhados para impressão frente e verso: em cada página, linha de cima = cartas n+4, n+3, n+2, n+1 e linha de baixo = n+8, n+7, n+6, n+5. Ao reextrair, associar pelo número impresso, não pela posição. Se um QR não decodificar, deixar `fonteUrl` vazio (a UI desabilita "Ver a fonte").

## Arquitetura

Duas IIFEs, sem framework: `leque.js` (expõe `window.criarLeque`) cuida só da mesa em leque; `app.js` cuida de estado, cartas, modais e resumo, e chama o leque. Pontos que exigem ler mais de um arquivo:

- **Leque** (`leque.js`): cada carta é um `.braco` que gira (`rotate`) em torno de um pivô `--raio` abaixo do pé da carta (`transform-origin`), e dentro dele o `.mini` sobe/inclina/cresce com `translate3d`/`rotateX` conforme a distância ao centro. A posição é um número contínuo `pos` (índice da carta central com fração); arrasto (Pointer Events), roda e teclado alteram `pos`, e uma mola faz inércia e encaixe. O laço `requestAnimationFrame` só roda enquanto há movimento, e por quadro só se escrevem `transform`/`opacity` (zIndex e visibilidade só quando mudam) — manter assim para os 60 fps. `medir()` recalcula tamanhos no `ResizeObserver` e publica `--cw`, `--ch`, `--base`, `--raio` no CSS. Tabindex é móvel: só a carta central tem `tabIndex = 0`. Clique na central chama `aoAbrir`; em outra, traz ao centro; clique logo após arrasto é ignorado.
- **3D**: a `perspective` está em `.cartas`; `.braco` tem `preserve-3d`. Não pôr `opacity`, `overflow` ou `filter` no `.braco` (achata o 3D) — a opacidade vai no `.mini`. A sombra da carta oferecida é um `.sombra-oferta` com opacidade animada, não `box-shadow` animado.
- **Mão**: `img[data-mao]` em duas camadas (`.mao-fundo` atrás de `.cartas`, `.mao-polegar` na frente), com o mesmo enquadramento e girando juntas pelo pulso. `app.js` tenta `assets/mao-*.png` e, se falhar, usa `assets/mao-*.svg` (substitutos provisórios). O balanço vem da velocidade do leque.

- **Estado** em `localStorage` na chave `baralho-politico:v1`: `{ ordem, respostas: {numero: "bom"|"ruim"}, filtro, resumoVisto }`. `filtro` é `""` (todas), uma hashtag ou o valor especial `NAO_VISTAS` (`"nao-vistas"`); nesse filtro a carta julgada sai do leque ao fechar e a seguinte assume o centro (`renderMesa(..., { manterIndice: true })`). `carregar()` valida a ordem salva contra as cartas atuais e descarta se inconsistente; se mudar o formato, trocar a versão da chave.
- **Marcação de carta compartilhada**: `htmlFrente`/`htmlVerso` geram a mesma face para o leque (`.mini`) e para o modal. Todo o tamanho interno da carta usa unidades `cqw`, relativas ao container (`.palco-mini` no leque, `.palco` no modal); por isso a mesma marcação escala de miniatura para tela cheia. Naipes são símbolos SVG (`#s-copas` etc.) definidos em `index.html`; a cor vem de `--naipe` pela classe do naipe.
- **Camadas (modais)**: `abrirCamada`/`fecharCamada` cuidam de `inert` no fundo da página, trava de scroll, foco inicial e retorno de foco; um único `keydown` global faz Esc e o ciclo de Tab para `camadaAtiva`. Só uma camada aberta por vez (o resumo abre depois que a carta fecha).
- **Animações**: voo mesa↔modal usa Web Animations API em `.palco` (técnica FLIP via `transformDe`), sempre condicionada a `reduzMovimento()`; durante o voo a miniatura recebe `.voando` (visibility hidden), que precisa ser removida antes de devolver o foco a ela. O flip 3D é transição CSS em `.virador.virada`. O CSS zera transições sob `prefers-reduced-motion`; no leque, com movimento reduzido, o encaixe é instantâneo e a mão não balança.
- **Empilhamento**: a carta 3D (`.virador`) cria camada própria; `.acoes` tem `position: relative; z-index: 1` para a sombra da carta não cobrir os botões.
- A mesa é re-renderizada inteira (`renderMesa`) a cada mudança, mantendo no centro a mesma carta, e chama `leque.recarregar`; elementos são reencontrados por `data-n`.

## Visual

Fiel ao baralho: cartas brancas, borda preta, cantos arredondados; vermelho escuro (`--vermelho`) para copas/ouros e para "Isso é"; preto para espadas/paus; canto inferior é o superior rotacionado 180°. As cartas ficam brancas também no tema escuro (só a página muda). Tokens de cor em `:root`, com tema escuro via `prefers-color-scheme` e `data-theme`.
