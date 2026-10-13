# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projeto

Site estático (HTML/CSS/JS puro, sem build, sem dependências) que digitaliza o baralho `Baralho.pdf`: 32 cartas com frases políticas; o usuário julga "Bom" ou "Ruim" sem saber o autor, depois a carta vira e revela o político (Lula: copas 1–8 e espadas 9–16; Flávio Bolsonaro: ouros 17–24 e paus 25–32). Hospedagem: qualquer servidor estático (Cloudflare Workers via `preparar-public.sh`; também funciona em GitHub Pages servido da raiz).

Código, identificadores e textos da interface em pt-BR.

## Rodar

Abrir `index.html` direto no navegador (funciona em `file://`, pois os dados vêm de `cards.js` via `<script>`, não de `fetch`). Não há build, lint nem suíte de testes no repositório.

## Publicar

`./preparar-public.sh` regenera `cards.js`, monta `public/` (só `index.html`, `style.css`, `app.js`, `cards.js`) e faz deploy como Cloudflare Worker de assets estáticos via `npx wrangler deploy`. `--sem-deploy` só monta `public/`. O nome do Worker vem de `NOME_WORKER` (ambiente ou `.env.deploy`, ignorado pelo git). Arquivo novo que o site precise em produção tem de entrar em `ARQUIVOS` no script.

## Dados

- `cards.json` é a fonte de verdade: `{ compartilheUrl, cartas: [{ numero, rotulo, naipe, frase, hashtag, politico, fonteUrl }] }`.
- `cards.js` é gerado a partir dele (`window.BARALHO = ...`) e não deve ser editado à mão. `preparar-public.sh` regenera automaticamente; para regenerar sem montar `public/`:
  ```
  python3 -c "import json;d=json.load(open('cards.json'));open('cards.js','w').write('// Gerado a partir de cards.json. Não editar à mão.\nwindow.BARALHO = '+json.dumps(d,ensure_ascii=False,indent=2)+';\n')"
  ```
- `fonteUrl` e `compartilheUrl` foram extraídos dos QR codes do PDF (versos nas páginas 2, 4, 6, 8; "Compartilhe!" na página 9). Os versos estão espelhados para impressão frente e verso: em cada página, linha de cima = cartas n+4, n+3, n+2, n+1 e linha de baixo = n+8, n+7, n+6, n+5. Ao reextrair, associar pelo número impresso, não pela posição. Se um QR não decodificar, deixar `fonteUrl` vazio (a UI desabilita "Ver a fonte").

## Arquitetura (`app.js`)

IIFE única, sem framework. Pontos que exigem ler mais de um arquivo:

- **Estado** em `localStorage` na chave `baralho-politico:v1`: `{ ordem, respostas: {numero: "bom"|"ruim"}, filtro, resumoVisto }`. `carregar()` valida a ordem salva contra as cartas atuais e descarta se inconsistente; se mudar o formato, trocar a versão da chave.
- **Marcação de carta compartilhada**: `htmlFrente`/`htmlVerso` geram a mesma face para a mesa (`.mini`) e para o modal. Todo o tamanho interno da carta usa unidades `cqw`, relativas ao container (`.palco-mini` na mesa, `.palco` no modal); por isso a mesma marcação escala de miniatura para tela cheia. Naipes são símbolos SVG (`#s-copas` etc.) definidos em `index.html`; a cor vem de `--naipe` pela classe do naipe.
- **Camadas (modais)**: `abrirCamada`/`fecharCamada` cuidam de `inert` no fundo da página, trava de scroll, foco inicial e retorno de foco; um único `keydown` global faz Esc e o ciclo de Tab para `camadaAtiva`. Só uma camada aberta por vez (o resumo abre depois que a carta fecha).
- **Animações**: voo mesa↔modal usa Web Animations API em `.palco` (técnica FLIP via `transformDe`), sempre condicionada a `reduzMovimento()`; durante o voo a miniatura recebe `.voando` (visibility hidden), que precisa ser removida antes de devolver o foco a ela. O flip 3D é transição CSS em `.virador.virada`. O CSS zera transições sob `prefers-reduced-motion`.
- **Empilhamento**: a carta 3D (`.virador`) cria camada própria; `.acoes` tem `position: relative; z-index: 1` para a sombra da carta não cobrir os botões.
- A mesa é re-renderizada inteira (`renderMesa`) a cada mudança; elementos são reencontrados por `data-n`.

## Visual

Fiel ao baralho: cartas brancas, borda preta, cantos arredondados; vermelho escuro (`--vermelho`) para copas/ouros e para "Isso é"; preto para espadas/paus; canto inferior é o superior rotacionado 180°. As cartas ficam brancas também no tema escuro (só a página muda). Tokens de cor em `:root`, com tema escuro via `prefers-color-scheme` e `data-theme`.
