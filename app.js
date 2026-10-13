(function () {
  "use strict";

  const DADOS = window.BARALHO;
  const CARTAS = DADOS.cartas;
  const POR_NUMERO = new Map(CARTAS.map((c) => [c.numero, c]));
  const TOTAL = CARTAS.length;
  const POLITICOS = [...new Set(CARTAS.map((c) => c.politico))];
  const CHAVE = "baralho-politico:v1";
  const NAO_VISTAS = "nao-vistas";   // valor de filtro especial (hashtags sempre começam com #)
  const NOME_NAIPE = { copas: "copas", espadas: "espadas", ouros: "ouros", paus: "paus" };
  const FOCAVEIS = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

  const $ = (sel) => document.querySelector(sel);
  const cartasEl = $("#cartas");
  const filtros = $("#filtros");
  const modalCarta = $("#modal-carta");
  const modalResumo = $("#modal-resumo");
  const palco = $("#palco");
  const virador = $("#virador");
  const faceFrente = $("#face-frente");
  const faceVerso = $("#face-verso");
  const acoes = $("#acoes");
  const anuncio = $("#anuncio");
  const fundoDaPagina = [$(".top"), $("main"), $(".rodape"), $(".skip")];

  const reduzMovimento = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Estado ---------- */

  let estado = carregar();
  let cartaAtual = null;     // número da carta aberta
  let camadaAtiva = null;    // { el, aoFechar, focoRetorno }
  let leque = null;          // criado no fim, depois das funções de render

  function embaralhar(lista) {
    const a = lista.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function novoEstado() {
    return { ordem: embaralhar(CARTAS.map((c) => c.numero)), respostas: {}, filtro: "" };
  }

  function carregar() {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE));
      const ordemOk =
        salvo && Array.isArray(salvo.ordem) && salvo.ordem.length === TOTAL &&
        salvo.ordem.every((n) => POR_NUMERO.has(n)) && new Set(salvo.ordem).size === TOTAL;
      if (ordemOk) {
        const respostas = {};
        for (const [n, v] of Object.entries(salvo.respostas || {})) {
          if (POR_NUMERO.has(Number(n)) && (v === "bom" || v === "ruim")) respostas[n] = v;
        }
        return {
          ordem: salvo.ordem, respostas,
          filtro: typeof salvo.filtro === "string" ? salvo.filtro : "",
          resumoVisto: !!salvo.resumoVisto,
        };
      }
    } catch (e) { /* sem localStorage: segue com estado novo */ }
    return novoEstado();
  }

  function salvar() {
    try { localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch (e) { /* ignora */ }
  }

  const vistas = () => Object.keys(estado.respostas).length;

  /* ---------- Marcação das cartas ---------- */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }

  function canto(c, inv) {
    return `<div class="canto${inv ? " inv" : ""}" aria-hidden="true"><span class="rank">${c.rotulo}</span><svg><use href="#s-${c.naipe}"/></svg></div>`;
  }

  function tamanhoFrase(c) {
    const n = c.frase.length;
    return n >= 95 ? " l" : n >= 60 ? " m" : "";
  }

  function htmlFrente(c) {
    return `${canto(c)}
      <div class="corpo">
        <p class="pergunta"><span class="isso">Isso é</span><br>bom ou ruim?</p>
        <p class="frase${tamanhoFrase(c)}">${c.numero}. “${esc(c.frase)}”</p>
        <p class="tag">${esc(c.hashtag)}</p>
      </div>
      ${canto(c, true)}`;
  }

  function htmlVerso(c, resposta) {
    const nome = esc(c.politico).replace(" ", "<br>");
    return `${canto(c)}
      <div class="corpo">
        <p class="politico">${nome}</p>
        ${resposta ? `<p class="resposta">Você achou <b class="${resposta}">${resposta}</b></p>` : ""}
        <p class="frase-curta">${c.numero}. “${esc(c.frase)}”</p>
      </div>
      ${canto(c, true)}`;
  }

  function descricao(c) {
    return `Carta ${c.rotulo} de ${NOME_NAIPE[c.naipe]}`;
  }

  /* ---------- Mesa ---------- */

  function renderFiltros() {
    const contagem = new Map();
    for (const c of CARTAS) contagem.set(c.hashtag, (contagem.get(c.hashtag) || 0) + 1);
    const tags = [...contagem.keys()].sort((a, b) => a.localeCompare(b, "pt-BR"));
    if (estado.filtro && estado.filtro !== NAO_VISTAS && !contagem.has(estado.filtro)) estado.filtro = "";

    const chip = (valor, rotulo, n) =>
      `<button type="button" class="chip" data-filtro="${esc(valor)}" aria-pressed="${estado.filtro === valor}">${esc(rotulo)}<span class="n">${n}</span></button>`;
    filtros.innerHTML = chip("", "Todas", TOTAL) + chip(NAO_VISTAS, "Não vistas", TOTAL - vistas()) +
      tags.map((t) => chip(t, t, contagem.get(t))).join("");
  }

  function passaNoFiltro(c) {
    if (!estado.filtro) return true;
    if (estado.filtro === NAO_VISTAS) return !estado.respostas[c.numero];
    return c.hashtag === estado.filtro;
  }

  // Monta o leque com as cartas do filtro atual, mantendo no centro a carta
  // `manterN` (ou a que já estava no centro) quando ela continua na lista.
  // Se ela saiu da lista (ex.: acabou de ser vista no filtro "Não vistas") e
  // `manterIndice` estiver ligado, a carta seguinte ocupa o mesmo lugar.
  function renderMesa(manterN, { manterIndice = false } = {}) {
    const lista = estado.ordem.map((n) => POR_NUMERO.get(n)).filter(passaNoFiltro);
    const indiceAnterior = leque ? leque.indiceCentral() : -1;
    const anterior = leque ? Number(cartasEl.querySelectorAll(".mini")[indiceAnterior]?.dataset.n) : NaN;
    const alvoN = manterN ?? anterior;
    cartasEl.innerHTML = lista.length
      ? lista.map((c) => {
          const r = estado.respostas[c.numero];
          const rotulo = `${descricao(c)}. ${c.numero}. ${c.frase} ${c.hashtag}.` +
            (r ? ` Vista: você achou ${r}. Frase de ${c.politico}.` : " Ainda não vista.");
          return `<div class="braco">
            <button type="button" class="mini ${c.naipe}${r ? " vista" : ""}" data-n="${c.numero}" aria-label="${esc(rotulo)}">
              <span class="sombra-oferta"></span>
              <div class="palco-mini" aria-hidden="true">
                <div class="face frente">${htmlFrente(c)}</div>
                ${r ? `<div class="carimbo ${r}"><b>${r.toUpperCase()}</b><small>${esc(c.politico)}</small></div>` : ""}
              </div>
            </button>
          </div>`;
        }).join("")
      : `<p class="vazio">${estado.filtro === NAO_VISTAS
          ? "Você já escolheu todas as cartas. Veja o resumo!"
          : "Nenhuma carta com esse tema."}</p>`;
    let i = lista.findIndex((c) => c.numero === alvoN);
    if (i < 0 && manterIndice && indiceAnterior >= 0) i = Math.min(indiceAnterior, lista.length - 1);
    leque.recarregar(i >= 0 ? i : undefined);
    if (!lista.length) atualizarPosicao(-1, 0);
    renderContador();
  }

  function atualizarPosicao(i, total) {
    // com filtro o leque mostra menos que o total, então a posição faz sentido
    const posicao = $("#posicao");
    posicao.hidden = !estado.filtro || !total;
    posicao.textContent = total ? `${i + 1} de ${total}` : "";
    posicao.setAttribute("aria-label", total ? `Carta ${i + 1} de ${total} no filtro` : "");
    $("#seta-esq").disabled = i <= 0;
    $("#seta-dir").disabled = i < 0 || i >= total - 1;
  }

  function renderContador() {
    const v = vistas();
    $("#contador").innerHTML = `<strong>${v}</strong> de ${TOTAL} vistas`;
    $("#barra").style.width = `${(v / TOTAL) * 100}%`;
    const n = filtros.querySelector(`.chip[data-filtro="${NAO_VISTAS}"] .n`);
    if (n) n.textContent = TOTAL - v;
  }

  function miniDaCarta(n) {
    return cartasEl.querySelector(`.mini[data-n="${n}"]`);
  }

  /* ---------- Camadas: foco preso, Esc, fundo inerte ---------- */

  function abrirCamada(el, { focoInicial, aoFechar }) {
    camadaAtiva = { el, aoFechar, focoRetorno: document.activeElement };
    el.hidden = false;
    fundoDaPagina.forEach((x) => x && (x.inert = true));
    document.documentElement.classList.add("travado");
    // força reflow para a transição de opacidade acontecer
    void el.offsetWidth;
    el.classList.add("aberta");
    (focoInicial || el.querySelector(FOCAVEIS))?.focus({ preventScroll: true });
  }

  function fecharCamada(el, focoDestino) {
    el.classList.remove("aberta");
    el.hidden = true;
    fundoDaPagina.forEach((x) => x && (x.inert = false));
    document.documentElement.classList.remove("travado");
    const retorno = focoDestino || camadaAtiva?.focoRetorno;
    camadaAtiva = null;
    if (retorno && document.contains(retorno)) retorno.focus({ preventScroll: false });
  }

  document.addEventListener("keydown", (e) => {
    if (!camadaAtiva) return;
    if (e.key === "Escape") {
      e.preventDefault();
      camadaAtiva.aoFechar();
      return;
    }
    if (e.key !== "Tab") return;
    const focaveis = [...camadaAtiva.el.querySelectorAll(FOCAVEIS)].filter((x) => x.getClientRects().length);
    if (!focaveis.length) { e.preventDefault(); return; }
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    if (!camadaAtiva.el.contains(document.activeElement)) {
      e.preventDefault();
      primeiro.focus();
    } else if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  });

  /* ---------- Carta em primeiro plano ---------- */

  function transformDe(origem, destino) {
    const s = origem.width / destino.width;
    return `translate(${origem.left - destino.left}px, ${origem.top - destino.top}px) scale(${s})`;
  }

  function abrirCarta(n) {
    const c = POR_NUMERO.get(n);
    const resposta = estado.respostas[n];
    const mini = miniDaCarta(n);
    cartaAtual = n;

    palco.className = `palco ${c.naipe}`;
    faceFrente.innerHTML = htmlFrente(c);
    faceVerso.innerHTML = htmlVerso(c, resposta);
    $("#carta-titulo").textContent = descricao(c);
    anuncio.textContent = "";

    // vira sem animar se a carta já foi respondida
    virador.style.transition = "none";
    virador.classList.toggle("virada", !!resposta);
    definirFaceVisivel(!!resposta);
    void virador.offsetWidth;
    virador.style.transition = "";

    renderAcoes(c, resposta);
    abrirCamada(modalCarta, {
      focoInicial: acoes.querySelector(FOCAVEIS),
      aoFechar: fecharCarta,
    });

    if (mini && !reduzMovimento()) {
      const origem = mini.getBoundingClientRect();
      const destino = palco.getBoundingClientRect();
      mini.classList.add("voando");
      palco.animate(
        [{ transform: transformDe(origem, destino), transformOrigin: "0 0" }, { transform: "none", transformOrigin: "0 0" }],
        { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" }
      ).finished.catch(() => {}).then(() => mini.classList.remove("voando"));
    }
  }

  function definirFaceVisivel(verso) {
    faceFrente.setAttribute("aria-hidden", String(verso));
    faceVerso.setAttribute("aria-hidden", String(!verso));
  }

  function renderAcoes(c, resposta) {
    if (!resposta) {
      acoes.innerHTML = `
        <button type="button" class="btn btn-bom" data-resposta="bom">Bom</button>
        <button type="button" class="btn btn-ruim" data-resposta="ruim">Ruim</button>`;
      return;
    }
    const fonte = c.fonteUrl
      ? `<a class="btn btn-claro" href="${esc(c.fonteUrl)}" target="_blank" rel="noopener noreferrer">Ver a fonte<span class="sr-only"> (abre em nova aba)</span> ↗</a>`
      : `<button type="button" class="btn btn-claro" disabled>Ver a fonte</button>`;
    const proxima = vistas() >= TOTAL ? "Ver resumo" : "Próxima carta";
    acoes.innerHTML = `${fonte}
      <button type="button" class="btn btn-contorno-claro" data-fechar data-avancar>${proxima}</button>
      ${c.fonteUrl ? "" : `<p class="dica">Esta carta não tem link de fonte.</p>`}`;
  }

  function responder(valor) {
    const c = POR_NUMERO.get(cartaAtual);
    if (!c || estado.respostas[c.numero]) return;
    estado.respostas[c.numero] = valor;
    salvar();
    renderContador();

    faceVerso.innerHTML = htmlVerso(c, valor);
    virador.classList.add("virada");
    definirFaceVisivel(true);
    renderAcoes(c, valor);
    anuncio.textContent = `Você achou ${valor}. Esta frase é de ${c.politico}.`;
    acoes.querySelector(FOCAVEIS)?.focus({ preventScroll: true });
  }

  // Índice no leque da próxima carta ainda não vista, a partir da central e
  // dando a volta no fim; -1 se todas as cartas do filtro já foram vistas.
  function proximaNaoVista() {
    const minis = [...cartasEl.querySelectorAll(".mini")];
    const atual = Math.max(0, leque.indiceCentral());
    for (let k = 0; k < minis.length; k++) {
      const i = (atual + k) % minis.length;
      if (!estado.respostas[minis[i].dataset.n]) return i;
    }
    return -1;
  }

  // `avancar`: veio do botão "Próxima carta"; depois de a carta voltar ao
  // leque, ele gira até a próxima carta não vista.
  function fecharCarta({ avancar = false } = {}) {
    if (cartaAtual == null) return;
    const n = cartaAtual;
    cartaAtual = null;
    renderMesa(undefined, { manterIndice: true });
    const mini = miniDaCarta(n);   // some do leque se o filtro for "Não vistas"
    const focoFinal = mini || cartasEl.querySelector(".mini.central") || $("#mesa");

    const terminar = () => {
      if (mini) mini.classList.remove("voando");
      fecharCamada(modalCarta, focoFinal);
      if (vistas() >= TOTAL && estado.respostas[n] && !estado.resumoVisto) {
        estado.resumoVisto = true;
        salvar();
        abrirResumo(focoFinal);
      } else if (avancar) {
        const i = proximaNaoVista();
        if (i >= 0) leque.irPara(i);
      }
    };

    if (mini && !reduzMovimento()) {
      const destino = mini.getBoundingClientRect();
      const origem = palco.getBoundingClientRect();
      mini.classList.add("voando");
      modalCarta.classList.remove("aberta");
      palco.animate(
        [{ transform: "none", transformOrigin: "0 0" }, { transform: transformDe(destino, origem), transformOrigin: "0 0" }],
        { duration: 340, easing: "cubic-bezier(.4,0,.2,1)" }
      ).finished.catch(() => {}).then(terminar);
    } else {
      terminar();
    }
  }

  /* ---------- Resumo ---------- */

  function abrirResumo(focoRetorno) {
    const v = vistas();
    const blocos = POLITICOS.map((p) => {
      const cartas = CARTAS.filter((c) => c.politico === p);
      const bom = cartas.filter((c) => estado.respostas[c.numero] === "bom").length;
      const ruim = cartas.filter((c) => estado.respostas[c.numero] === "ruim").length;
      const falta = cartas.length - bom - ruim;
      const pct = (x) => `${(x / cartas.length) * 100}%`;
      return `<section class="politico-resumo" aria-label="${esc(p)}">
        <h3>${esc(p)}</h3>
        <div class="empilhada" aria-hidden="true"><span class="b" style="width:${pct(bom)}"></span><span class="r" style="width:${pct(ruim)}"></span></div>
        <ul class="legenda">
          <li class="b">${bom} ${bom === 1 ? "boa" : "boas"}</li>
          <li class="r">${ruim} ${ruim === 1 ? "ruim" : "ruins"}</li>
          ${falta ? `<li class="n">${falta} não ${falta === 1 ? "vista" : "vistas"}</li>` : ""}
        </ul>
      </section>`;
    }).join("");

    const intro = v === 0
      ? "Você ainda não julgou nenhuma frase. Escolha uma carta para começar."
      : `Você julgou ${v} de ${TOTAL} frases. Veja quantas de cada político você achou boas ou ruins:`;
    $("#resumo-conteudo").innerHTML = `<p class="muted">${intro}</p>${blocos}`;
    $("#btn-continuar").textContent = v >= TOTAL ? "Fechar" : "Continuar";

    abrirCamada(modalResumo, {
      focoInicial: $("#btn-continuar"),
      aoFechar: () => fecharCamada(modalResumo, focoRetorno),
    });
  }

  function recomecar() {
    if (vistas() && !window.confirm("Recomeçar? Suas respostas serão apagadas e as cartas, embaralhadas de novo.")) return;
    const filtro = estado.filtro;
    estado = novoEstado();
    estado.filtro = filtro;
    salvar();
    fecharCamada(modalResumo, $("#mesa"));
    renderFiltros();
    renderMesa();
    window.scrollTo({ top: 0, behavior: reduzMovimento() ? "auto" : "smooth" });
  }

  /* ---------- Eventos ---------- */

  $("#seta-esq").addEventListener("click", () => leque.anterior());
  $("#seta-dir").addEventListener("click", () => leque.proxima());

  filtros.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    estado.filtro = chip.dataset.filtro;
    salvar();
    filtros.querySelectorAll(".chip").forEach((b) => b.setAttribute("aria-pressed", String(b === chip)));
    atualizarBotaoFiltros();
    renderMesa();
    alternarFiltros(false);
  });

  /* ---------- Painel de filtros (recolhido atrás do botão) ---------- */

  const btnFiltros = $("#btn-filtros");
  const painelFiltros = $("#painel-filtros");

  function atualizarBotaoFiltros() {
    const chip = filtros.querySelector(`.chip[data-filtro="${CSS.escape(estado.filtro)}"]`);
    const nome = estado.filtro ? chip?.firstChild.textContent : "";
    $("#btn-filtros-rotulo").textContent = nome || "Filtros";
    btnFiltros.classList.toggle("ativo", !!estado.filtro);
    btnFiltros.setAttribute("aria-label", nome ? `Filtros (filtro atual: ${nome})` : "Filtros");
  }

  function alternarFiltros(abrir = painelFiltros.hidden, devolverFoco = true) {
    if (abrir === !painelFiltros.hidden) return;
    painelFiltros.hidden = !abrir;
    btnFiltros.setAttribute("aria-expanded", String(abrir));
    if (abrir) (filtros.querySelector('.chip[aria-pressed="true"]') || filtros.querySelector(".chip"))?.focus();
    else if (devolverFoco && painelFiltros.contains(document.activeElement)) btnFiltros.focus();
  }

  btnFiltros.addEventListener("click", () => alternarFiltros());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !painelFiltros.hidden && !camadaAtiva) { e.preventDefault(); alternarFiltros(false); btnFiltros.focus(); }
  });
  document.addEventListener("pointerdown", (e) => {
    if (!painelFiltros.hidden && !painelFiltros.contains(e.target) && !btnFiltros.contains(e.target)) alternarFiltros(false, false);
  });
  painelFiltros.addEventListener("focusout", (e) => {
    if (e.relatedTarget && !painelFiltros.contains(e.relatedTarget) && e.relatedTarget !== btnFiltros) alternarFiltros(false, false);
  });

  modalCarta.addEventListener("click", (e) => {
    const r = e.target.closest("[data-resposta]");
    if (r) return responder(r.dataset.resposta);
    const f = e.target.closest("[data-fechar]");
    if (f) fecharCarta({ avancar: f.hasAttribute("data-avancar") });
  });

  modalResumo.addEventListener("click", (e) => {
    if (e.target.closest("[data-fechar]")) camadaAtiva?.aoFechar();
  });

  $("#btn-resumo").addEventListener("click", (e) => abrirResumo(e.currentTarget));
  $("#btn-recomecar").addEventListener("click", recomecar);

  const linkPdf = $("#link-pdf");
  if (DADOS.compartilheUrl) linkPdf.href = DADOS.compartilheUrl;
  else linkPdf.closest("p").hidden = true;

  // A mão usa assets/mao-*.png; enquanto as imagens não existirem, cai no SVG provisório.
  document.querySelectorAll("img[data-mao]").forEach((img) => {
    img.addEventListener("error", () => {
      if (!img.src.endsWith(".svg")) img.src = `assets/${img.dataset.mao}.svg`;
    });
    img.src = `assets/${img.dataset.mao}.png`;
  });

  leque = window.criarLeque($("#leque"), {
    reduzMovimento,
    aoAbrir: (n) => abrirCarta(n),
    aoMudarCentral: atualizarPosicao,
  });

  renderFiltros();
  atualizarBotaoFiltros();
  renderMesa();
})();
