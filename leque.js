/*
 * Leque de cartas em 3D com CSS (perspective + transforms).
 *
 * Cada carta é um ".braco" que gira em torno de um pivô abaixo da tela;
 * dentro dele, o ".mini" sobe, inclina e cresce quando está no centro.
 * A posição é contínua (pos = índice da carta central, com fração);
 * arrasto, roda do mouse e teclado mexem em pos, e uma mola faz a
 * inércia e o encaixe na carta inteira mais próxima. O laço de
 * animação só roda enquanto algo se move.
 */
(function () {
  "use strict";

  const VISIVEIS = 3;        // cartas de cada lado em arco "normal" (7 no total)
  const LIMITE = 4.8;        // além disso, a carta fica escondida
  const MOLA_K = 170;        // rigidez da mola de encaixe
  const MOLA_C = 26;         // amortecimento (~crítico para K)
  const PROJECAO = 0.22;     // segundos de inércia projetados ao soltar
  const LIMIAR_ARRASTO = 6;  // px até um toque virar arrasto

  function criarLeque(raiz, opcoes) {
    const palco = raiz.querySelector(".leque-palco");
    const maos = [...raiz.querySelectorAll(".mao")];
    const reduz = opcoes.reduzMovimento;

    let bracos = [];
    let pos = 0, vel = 0, alvo = 0;
    let modo = "parado";            // parado | mola | arrasto | roda
    let medidas = null;
    let rafId = 0, ultimoT = 0, posAnterior = 0;
    let balanco = 0, balancoVel = 0;
    let centralAtual = -1;
    let timerRoda = 0;
    let arrasto = null;
    let ignorarClique = false;

    /* ---------- Medidas ---------- */

    function medir() {
      const w = palco.clientWidth;
      const h = palco.clientHeight;
      // altura da carta: cabe com a parte de baixo na mão e a central erguida
      // pé a 0,3·altura da base; a central sobe 16%, cresce 6% e se aproxima (translateZ)
      const altura = Math.max(150, Math.min((h - 28) / 1.68, (w * 0.7) * 7 / 5, 440));
      const largura = altura * 5 / 7;
      const base = altura * 0.3;                       // distância do pé da carta à base do palco
      // pivô: raio abaixo do pé da carta (curvatura parecida em qualquer tela)
      const raio = Math.max(altura * 1.8, Math.min(w * 0.9, altura * 2.4));
      const raioCentro = raio + altura / 2;
      // a 3ª carta de cada lado fica a ~40% da largura, mas sem abrir demais em tela larga
      const abertura = Math.min(w * 0.4, largura * 1.25);
      const passoRad = Math.asin(Math.min(0.95, abertura / raioCentro)) / VISIVEIS;
      medidas = {
        largura, altura, base, raio,
        passo: (passoRad * 180) / Math.PI,
        pxPorCarta: raioCentro * passoRad,
      };
      raiz.style.setProperty("--cw", `${largura}px`);
      raiz.style.setProperty("--ch", `${altura}px`);
      raiz.style.setProperty("--base", `${base}px`);
      raiz.style.setProperty("--raio", `${raio}px`);
    }

    /* ---------- Desenho ---------- */

    const suave = (x) => x * x * (3 - 2 * x);

    function desenhar() {
      const { altura, passo } = medidas;
      // lido antes de esconder cartas: esconder a carta focada tira o foco dela
      const focoDentro = palco.contains(document.activeElement);
      for (let i = 0; i < bracos.length; i++) {
        const b = bracos[i];
        const d = i - pos;
        const ad = Math.abs(d);
        if (ad > LIMITE) {
          if (b.visivel) { b.el.style.visibility = "hidden"; b.visivel = false; }
          continue;
        }
        if (!b.visivel) { b.el.style.visibility = ""; b.visivel = true; }

        // fora das 7 centrais o ângulo acelera, empurrando a carta pela lateral
        const extra = Math.max(0, ad - VISIVEIS);
        const angulo = passo * (d + Math.sign(d) * extra * extra * 0.9);
        const f = suave(Math.max(0, 1 - ad));       // 1 = carta central
        const sobe = altura * 0.16 * f;
        const z = 60 * f;
        const inclina = 12 * (1 - f);                // as outras ficam deitadas para trás
        const escala = 1 + 0.06 * f;
        const opacidade = ad <= VISIVEIS + 0.5 ? 1 : Math.max(0, 1 - (ad - VISIVEIS - 0.5) / 1.2);

        b.el.style.transform = `rotate(${angulo.toFixed(3)}deg)`;
        b.carta.style.transform =
          `translate3d(0, ${(-sobe).toFixed(2)}px, ${z.toFixed(2)}px) rotateX(${inclina.toFixed(2)}deg) scale(${escala.toFixed(4)})`;
        const zi = 1000 - Math.round(ad * 10);
        if (b.zi !== zi) { b.el.style.zIndex = zi; b.zi = zi; }
        if (b.op !== opacidade) { b.carta.style.opacity = opacidade; b.op = opacidade; }
        const so = f.toFixed(3);
        if (b.so !== so) { b.sombra.style.opacity = so; b.so = so; }
      }

      const transformMao = `rotate(${balanco.toFixed(3)}deg)`;
      for (const m of maos) m.style.transform = transformMao;

      const c = Math.round(Math.min(Math.max(pos, 0), bracos.length - 1));
      if (c !== centralAtual && bracos.length) {
        const anterior = bracos[centralAtual];
        if (anterior) { anterior.carta.tabIndex = -1; anterior.carta.classList.remove("central"); }
        const novo = bracos[c];
        novo.carta.tabIndex = 0;
        novo.carta.classList.add("central");
        centralAtual = c;
        if (focoDentro) novo.carta.focus({ preventScroll: true });
        opcoes.aoMudarCentral?.(c, bracos.length);
      }
    }

    /* ---------- Laço de animação ---------- */

    function agendar() {
      if (!rafId) { ultimoT = 0; rafId = requestAnimationFrame(passoQuadro); }
    }

    function passoQuadro(t) {
      rafId = 0;
      const dt = ultimoT ? Math.min((t - ultimoT) / 1000, 1 / 30) : 1 / 60;
      ultimoT = t;

      if (modo === "mola") {
        if (reduz()) {
          pos = alvo; vel = 0;
        } else {
          const a = -MOLA_K * (pos - alvo) - MOLA_C * vel;
          vel += a * dt;
          pos += vel * dt;
        }
        if (Math.abs(pos - alvo) < 0.0005 && Math.abs(vel) < 0.005) { pos = alvo; vel = 0; modo = "parado"; }
      }

      // a mão balança conforme a velocidade com que o leque gira
      const velObservada = (pos - posAnterior) / dt;
      posAnterior = pos;
      let ativo = modo !== "parado";
      if (reduz()) {
        balanco = 0; balancoVel = 0;
      } else {
        const alvoBalanco = Math.max(-5, Math.min(5, -velObservada * 0.9));
        const a = -90 * (balanco - alvoBalanco) - 12 * balancoVel;
        balancoVel += a * dt;
        balanco += balancoVel * dt;
        if (Math.abs(balanco) > 0.01 || Math.abs(balancoVel) > 0.01) ativo = true;
        else { balanco = 0; balancoVel = 0; }
      }

      desenhar();
      if (ativo) agendar();
    }

    function irPara(i, instantaneo) {
      alvo = Math.max(0, Math.min(bracos.length - 1, Math.round(i)));
      if (instantaneo || reduz()) { pos = alvo; vel = 0; modo = "parado"; desenhar(); agendar(); return; }
      modo = "mola";
      agendar();
    }

    function elastico(p) {
      const max = bracos.length - 1;
      if (p < 0) return p * 0.35;
      if (p > max) return max + (p - max) * 0.35;
      return p;
    }

    /* ---------- Arrasto (toque e mouse) ---------- */

    palco.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || !bracos.length) return;
      arrasto = { id: e.pointerId, x0: e.clientX, y0: e.clientY, pos0: modo === "parado" ? pos : pos, ativo: false, amostras: [] };
    });

    palco.addEventListener("pointermove", (e) => {
      if (!arrasto || e.pointerId !== arrasto.id) return;
      const dx = e.clientX - arrasto.x0;
      const dy = e.clientY - arrasto.y0;
      if (!arrasto.ativo) {
        if (Math.abs(dy) > LIMIAR_ARRASTO && Math.abs(dy) > Math.abs(dx)) { arrasto = null; return; } // rolagem vertical
        if (Math.abs(dx) < LIMIAR_ARRASTO) return;
        arrasto.ativo = true;
        arrasto.x0 = e.clientX;
        arrasto.pos0 = pos;
        modo = "arrasto";
        vel = 0;
        palco.setPointerCapture(e.pointerId);
        raiz.classList.add("arrastando");
      }
      const bruto = arrasto.pos0 - (e.clientX - arrasto.x0) / medidas.pxPorCarta;
      pos = elastico(bruto);
      const t = e.timeStamp;
      arrasto.amostras.push([t, pos]);
      while (arrasto.amostras.length > 2 && t - arrasto.amostras[0][0] > 100) arrasto.amostras.shift();
      agendar();
    });

    function soltar(e) {
      if (!arrasto || e.pointerId !== arrasto.id) return;
      const a = arrasto;
      arrasto = null;
      if (!a.ativo) return;
      raiz.classList.remove("arrastando");
      ignorarClique = true;
      setTimeout(() => { ignorarClique = false; }, 0);
      let v = 0;
      if (a.amostras.length >= 2) {
        const [t0, p0] = a.amostras[0];
        const [t1, p1] = a.amostras[a.amostras.length - 1];
        if (t1 > t0 && e.timeStamp - t1 < 80) v = ((p1 - p0) / (t1 - t0)) * 1000;
      }
      vel = reduz() ? 0 : v;
      irPara(pos + vel * PROJECAO);
    }
    palco.addEventListener("pointerup", soltar);
    palco.addEventListener("pointercancel", soltar);

    // clique/toque: na central abre; em outra, traz para o centro
    palco.addEventListener("click", (e) => {
      if (ignorarClique) { e.preventDefault(); e.stopPropagation(); return; }
      const carta = e.target.closest(".mini");
      if (!carta) return;
      const i = bracos.findIndex((b) => b.carta === carta);
      if (i < 0) return;
      if (i === centralAtual && Math.abs(pos - i) < 0.3) opcoes.aoAbrir(Number(carta.dataset.n), carta);
      else irPara(i);
    });

    /* ---------- Roda do mouse ---------- */

    palco.addEventListener("wheel", (e) => {
      if (!bracos.length) return;
      let delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (e.deltaMode === 1) delta *= 16;
      else if (e.deltaMode === 2) delta *= palco.clientWidth;
      const max = bracos.length - 1;
      // nas pontas, deixa a página rolar
      if ((pos <= 0 && delta < 0) || (pos >= max && delta > 0)) return;
      e.preventDefault();
      modo = "roda";
      vel = 0;
      pos = Math.max(-0.3, Math.min(max + 0.3, pos + delta / (medidas.pxPorCarta * 1.4)));
      clearTimeout(timerRoda);
      timerRoda = setTimeout(() => irPara(pos), 120);
      agendar();
    }, { passive: false });

    /* ---------- Teclado ---------- */

    palco.addEventListener("keydown", (e) => {
      const passos = { ArrowLeft: -1, ArrowRight: 1, PageUp: -5, PageDown: 5 };
      let destino = null;
      const base = modo === "mola" ? alvo : Math.round(pos);
      if (e.key in passos) destino = base + passos[e.key];
      else if (e.key === "Home") destino = 0;
      else if (e.key === "End") destino = bracos.length - 1;
      if (destino == null) return;
      e.preventDefault();
      irPara(destino);
    });

    /* ---------- API ---------- */

    function recarregar(indiceInicial) {
      bracos = [...palco.querySelectorAll(".braco")].map((el) => ({
        el,
        carta: el.querySelector(".mini"),
        sombra: el.querySelector(".sombra-oferta"),
        visivel: true, zi: null, op: null, so: null,
      }));
      bracos.forEach((b) => { b.carta.tabIndex = -1; });
      centralAtual = -1;
      if (!medidas) medir();
      const i = Math.max(0, Math.min(bracos.length - 1, indiceInicial ?? Math.floor((bracos.length - 1) / 2)));
      pos = alvo = posAnterior = i;
      vel = 0;
      modo = "parado";
      desenhar();
    }

    new ResizeObserver(() => { medir(); desenhar(); }).observe(palco);

    return {
      recarregar,
      irPara,
      anterior: () => irPara((modo === "mola" ? alvo : Math.round(pos)) - 1),
      proxima: () => irPara((modo === "mola" ? alvo : Math.round(pos)) + 1),
      indiceCentral: () => centralAtual,
    };
  }

  window.criarLeque = criarLeque;
})();
