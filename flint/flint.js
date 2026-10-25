// Technique visualizers: tiled tensor-core matmul and flash-attention forward (online softmax).
// Generic illustrations; all sizes and values are made up for legibility.
(() => {
  "use strict";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NS = "http://www.w3.org/2000/svg";
  const $ = (r, s) => r.querySelector(s);
  const $$ = (r, s) => [...r.querySelectorAll(s)];
  const mk = (p, tag, a, txt) => {
    const e = document.createElementNS(NS, tag);
    for (const k in a) e.setAttribute(k, a[k]);
    if (txt != null) e.textContent = txt;
    p.append(e);
    return e;
  };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const rowsText = (rows) => (rows.length === 1 ? `row ${rows[0] + 1}` : `rows ${rows.map((r) => r + 1).join(", ")}`);

  // Shared player: play/pause, step, restart; pauses when off screen or the tab is hidden.
  // draw(i) renders step i (-1 = idle) and returns { label, text }.
  function player(root, total, staticAt, draw, ms, hold) {
    const bPlay = $(root, '[data-act="play"]');
    const bStep = $(root, '[data-act="step"]');
    const bRestart = $(root, '[data-act="restart"]');
    const count = $(root, "[data-count]");
    const now = $(root, "[data-now]");
    const phase = $(root, "[data-phase]");
    let i = -1, playing = false, active = false, started = false, t = 0;

    const go = (n) => {
      i = n;
      const r = draw(n);
      count.textContent = `Step ${n + 1} / ${total}`;
      now.textContent = r.text;
      phase.textContent = r.label || " ";
    };
    const sync = () => {
      bPlay.textContent = playing ? "Pause" : "Play";
      now.setAttribute("aria-live", playing ? "off" : "polite");
    };
    const tick = () => {
      clearTimeout(t);
      if (!playing || !active) return;
      t = setTimeout(() => { go(i >= total - 1 ? 0 : i + 1); tick(); }, i >= total - 1 ? hold : ms);
    };

    bPlay.addEventListener("click", () => {
      started = true;
      playing = !playing;
      if (playing && (i < 0 || i >= total - 1)) go(0);
      sync();
      tick();
    });
    bStep.addEventListener("click", () => {
      started = true;
      playing = false;
      clearTimeout(t);
      sync();
      go(i >= total - 1 ? 0 : i + 1);
    });
    bRestart.addEventListener("click", () => {
      started = true;
      go(-1);
      if (playing) tick();
    });

    const update = (vis) => { active = vis && !document.hidden; if (!active) clearTimeout(t); else tick(); };
    let vis = false;
    new IntersectionObserver(([e]) => {
      vis = e.isIntersecting;
      if (vis && !started) {
        started = true;
        if (!reduced) { playing = true; go(0); sync(); }
      }
      update(vis);
    }, { threshold: 0.25 }).observe(root);
    document.addEventListener("visibilitychange", () => update(vis));

    go(staticAt); // a meaningful resting state, also the whole story under reduced motion
    sync();
  }

  // ---------- A: tiled tensor-core matrix multiply ----------
  function gemm(root) {
    const svg = $(root, "[data-svg]");
    const C = 14, G = 4, SA = 18, SB = 16, cx = 90, cy = 88, ax = 10, by = 16, KS = 4;
    const px = (j) => cx + j * C + (j > 3 ? G : 0);
    const py = (r) => cy + r * C + (r > 3 ? G : 0);
    const span = 8 * C + G;

    mk(svg, "rect", { class: "ghost", x: cx + 6, y: cy + 6, width: span, height: span, rx: 2 });
    const ghost = svg.lastChild;
    mk(svg, "text", { x: cx + span + 10, y: cy + 20 }, "R");
    const accs = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      mk(svg, "rect", { class: "cell", x: px(c), y: py(r), width: C, height: C });
      accs.push(mk(svg, "rect", { class: "acc", x: px(c), y: py(r), width: C, height: C }));
    }
    const warps = [];
    for (let wr = 0; wr < 2; wr++) for (let wc = 0; wc < 2; wc++)
      warps.push(mk(svg, "rect", { class: "warp", x: px(wc * 4) - 1.5, y: py(wr * 4) - 1.5, width: 4 * C + 3, height: 4 * C + 3, rx: 3 }));
    const A = [], B = [];
    for (let k = 0; k < KS; k++) {
      A.push([0, 1].map((g) => mk(svg, "rect", { class: "strip", x: ax + k * SA, y: py(g * 4), width: SA, height: 4 * C })));
      B.push([0, 1].map((g) => mk(svg, "rect", { class: "strip", x: px(g * 4), y: by + k * SB, width: 4 * C, height: SB })));
    }
    const bias = [];
    for (let c = 0; c < 8; c++) bias.push(mk(svg, "rect", { class: "bias", x: px(c), y: cy + span + 12, width: C, height: 5 }));
    mk(svg, "text", { x: cx + span + 6, y: cy + span + 18 }, "bias");
    mk(svg, "text", { class: "big", x: ax + 36, y: cy - 6, "text-anchor": "middle" }, "A");
    mk(svg, "text", { x: ax + 36, y: cy + span + 18, "text-anchor": "middle" }, "K →");
    mk(svg, "text", { class: "big", x: cx + span + 10, y: by + 10 }, "B");
    mk(svg, "text", { x: cx + span + 10, y: by + 26 }, "K ↓");
    const cLabel = mk(svg, "text", { class: "big", x: cx + span / 2, y: 240, "text-anchor": "middle" }, "C");

    const stages = $$(root, "[data-stages] li");
    const epi = $$(root, "[data-epi] li:not(.lbl)");
    const segs = Object.fromEntries($$(root, "[data-seg]").map((s) => [s.dataset.seg, s]));
    const EP = ["bias", "gelu", "resid", "store"];
    const SUB = ["global → registers", "registers → shared", "shared → fragments", "multiply-accumulate"];
    const EPL = ["bias", "GELU", "residual add", "store C"];
    const SEG = [["stg"], ["stg"], ["frag"], ["frag", "acc"]];
    const EPS = [[4], [4], [4], [4, 0]];
    const LOOPS = [[0, 1], [1, 2], [2, 3], [3, 4]];
    const txt = [
      (k) => `Tile ${k + 1} of A and B is read from global memory into registers.`,
      () => "The registers are written out to shared memory. Turing has no async copy (cp.async), so the tile is staged through registers.",
      () => "Each warp loads its fragments from shared memory, ready for the tensor cores.",
      (k) => `Tensor-core multiplies add K-step ${k + 1} into the C tile. The accumulators stay in registers for the whole K loop.`,
    ];
    const etxt = [
      "Output stage: the bias vector is added to the accumulators.",
      "GELU is applied to each element, still on the accumulators.",
      "The residual is added element by element.",
      "The finished tile is written to global memory.",
    ];

    return (i) => {
      const loop = i >= 0 && i < KS * 4;
      const k = loop ? i >> 2 : KS, s = loop ? i & 3 : -1, e = i >= 16 ? i - 16 : -1;
      svg.dataset.ph = loop ? "loop" : e >= 0 ? EP[e] : "idle";
      A.forEach((col, kk) => col.forEach((r, g) => {
        let c = "strip";
        if (i >= 0) c += kk < k ? " done" : kk === k ? [" fetch", " stage", " frag", " use"][s] : "";
        r.setAttribute("class", c);
        B[kk][g].setAttribute("class", c);
      }));
      const done = i < 0 ? 0 : loop ? k + (s === 3 ? 1 : 0) : KS;
      const op = e >= 0 ? 0.75 : (done / KS) * 0.7;
      accs.forEach((a) => { a.style.fillOpacity = op; });
      warps.forEach((w) => w.classList.toggle("on", s === 2 || s === 3));
      bias.forEach((b) => b.classList.toggle("on", e === 0));
      ghost.classList.toggle("on", e === 2);
      cLabel.textContent = e === 3 ? "C → global memory" : "C";

      const on = loop ? LOOPS[s] : e >= 0 ? EPS[e] : [];
      stages.forEach((li, n) => li.classList.toggle("on", on.includes(n)));
      epi.forEach((li, n) => { li.classList.toggle("on", n === e); li.classList.toggle("done", n < e); });
      const hot = loop ? SEG[s] : e >= 0 ? ["acc"] : [];
      for (const n in segs) segs[n].classList.toggle("on", hot.includes(n));

      if (i < 0) return { label: "", text: "Press Play or Step. One thread block computes one tile of C by walking down K, four steps here." };
      if (loop) return { label: `K-step ${k + 1}/${KS} · ${SUB[s]}`, text: txt[s](k) };
      return { label: `Output stage · ${EPL[e]}`, text: etxt[e] };
    };
  }

  // ---------- B: flash attention forward, online softmax ----------
  function attn(root) {
    const svg = $(root, "[data-svg]");
    const R = 4, NB = 3, BC = 4, D = 4, CELL = 28, Y0 = 76, SX = 48, OX = 276, OW = 16;
    const S = [
      [0.2, 1.1, 0.5, 0.9, 1.8, 0.3, 1.2, 0.7, 0.4, 0.6, 0.1, 0.8],
      [1.6, 0.2, 0.9, 0.4, 0.5, 1.0, 0.3, 1.1, 2.3, 0.7, 1.4, 0.2],
      [0.3, 0.8, 0.2, 0.6, 0.9, 0.4, 0.7, 0.5, 0.6, 1.9, 0.3, 0.5],
      [2.0, 0.5, 1.2, 0.7, 0.8, 1.1, 0.4, 0.9, 0.3, 0.6, 1.0, 0.5],
    ];
    const V = (k, c) => 0.15 + 0.85 * (((k * 7 + c * 5 + 3) % 11) / 10);

    // Run the real online-softmax recurrence once, keeping every intermediate.
    let m = Array(R).fill(-Infinity), l = Array(R).fill(0), O = Array.from({ length: R }, () => Array(D).fill(0));
    const st = [];
    for (let j = 0; j < NB; j++) {
      const Sj = S.map((row) => row.slice(j * BC, j * BC + BC));
      const mN = m.map((v, r) => Math.max(v, ...Sj[r]));
      const a = m.map((v, r) => (isFinite(v) ? Math.exp(v - mN[r]) : 0));
      const P = Sj.map((row, r) => row.map((v) => Math.exp(v - mN[r])));
      const lN = l.map((v, r) => a[r] * v + P[r].reduce((x, y) => x + y, 0));
      const Os = O.map((row, r) => row.map((v) => v * a[r]));
      const On = Os.map((row, r) => row.map((v, c) => v + P[r].reduce((x, p, q) => x + p * V(j * BC + q, c), 0)));
      st.push({ mO: m, mN, a, P, Sj, lO: l, lN, Os, On, up: mN.map((v, r) => r).filter((r) => mN[r] > m[r]) });
      m = mN; l = lN; O = On;
    }
    const Of = O.map((row, r) => row.map((v) => v / l[r]));
    const CAP = Math.max(1, ...st.flatMap((x) => x.On.flat()));
    const zero = Array.from({ length: R }, () => Array(D).fill(0));

    const ry = (r) => Y0 + r * CELL;
    const heads = {};
    const head = (key, x, label) => { heads[key] = mk(svg, "text", { class: "hd", x, y: 68, "text-anchor": "middle" }, label); };
    head("q", 24, "Q"); head("s", SX + 2 * CELL, "S → P"); head("m", 186, "m"); head("a", 222, "α"); head("l", 258, "l"); head("o", OX + 2 * OW, "O");
    for (let r = 0; r <= R; r++) mk(svg, "line", { class: "rule", x1: 8, x2: 340, y1: ry(r), y2: ry(r) });

    // K/V stream chips and the link into the score tile
    const chips = [];
    for (let j = 0; j < NB; j++) {
      const x = SX + j * 84;
      const c = mk(svg, "rect", { class: "chip", x, y: 6, width: 76, height: 26, rx: 5 });
      mk(svg, "text", { class: "big", x: x + 38, y: 23, "text-anchor": "middle" }, `K,V ${j + 1}`);
      chips.push(c);
    }
    const link = mk(svg, "path", { class: "link", d: "" });
    mk(svg, "text", { x: 8, y: 22 }, "stream");

    for (let r = 0; r < R; r++) {
      mk(svg, "rect", { class: "qc", x: 8, y: ry(r) + 1, width: 32, height: CELL - 2, rx: 3 });
      mk(svg, "text", { x: 24, y: ry(r) + 18, "text-anchor": "middle" }, `q${r + 1}`);
    }
    mk(svg, "text", { x: 8, y: ry(R) + 16 }, "held on chip");

    const sc = [];
    for (let r = 0; r < R; r++) for (let c = 0; c < BC; c++)
      sc.push(mk(svg, "rect", { class: "sc s", x: SX + c * CELL + 1, y: ry(r) + 1, width: CELL - 2, height: CELL - 2, rx: 2, opacity: 0 }));
    const mT = [], aT = [], lT = [];
    for (let r = 0; r < R; r++) {
      const y = ry(r) + 18;
      mT.push(mk(svg, "text", { class: "num", x: 186, y, "text-anchor": "middle" }, ""));
      aT.push(mk(svg, "text", { class: "num", x: 222, y, "text-anchor": "middle" }, ""));
      lT.push(mk(svg, "text", { class: "num", x: 258, y, "text-anchor": "middle" }, ""));
    }
    const bars = [];
    for (let r = 0; r < R; r++) for (let c = 0; c < D; c++) {
      mk(svg, "rect", { class: "oc", x: OX + c * OW, y: ry(r) + 1, width: OW, height: CELL - 2 });
      bars.push(mk(svg, "rect", { class: "ob", x: OX + c * OW + 3, y: ry(r) + 4, width: OW - 6, height: CELL - 8 }));
    }

    const stages = $$(root, "[data-stages] li");
    const segs = Object.fromEntries($$(root, "[data-seg]").map((s) => [s.dataset.seg, s]));
    const NAMES = ["stream in", "score tile", "running max", "exponentiate", "rescale", "accumulate"];
    const f1 = (v) => (isFinite(v) ? v.toFixed(1) : "−∞");
    const f2 = (v) => v.toFixed(2);
    const TOTAL = NB * 6 + 1;

    return (i) => {
      const fin = i === TOTAL - 1;
      const j = i < 0 || fin ? -1 : Math.floor(i / 6), s = j < 0 ? -1 : i % 6;
      const x = j >= 0 ? st[j] : null;

      chips.forEach((c, n) => c.setAttribute("class", "chip" + (fin || (j >= 0 && n < j) ? " done" : n === j ? " on" : "")));
      link.setAttribute("d", j >= 0 && s <= 5 ? `M${SX + j * 84 + 38} 32 V42 H${SX + 2 * CELL} V54` : "");
      link.style.opacity = j >= 0 ? 1 : 0;

      // score / probability tile
      sc.forEach((c, n) => {
        const r = n >> 2, b = n & 3;
        if (!x || s === 0) { c.setAttribute("opacity", 0); return; }
        c.setAttribute("opacity", 1);
        const isP = s >= 3;
        c.setAttribute("class", "sc " + (isP ? "p" : "s"));
        c.style.fillOpacity = isP ? 0.08 + 0.92 * x.P[r][b] : 0.12 + 0.78 * clamp(x.Sj[r][b] / 2.4, 0, 1);
      });

      // per-row state
      for (let r = 0; r < R; r++) {
        const mv = !x ? -Infinity : s < 2 ? x.mO[r] : x.mN[r];
        const lv = !x ? 0 : s < 3 ? x.lO[r] : x.lN[r];
        mT[r].textContent = fin ? f1(m[r]) : f1(mv);
        mT[r].classList.toggle("hi", !!x && s >= 2 && s <= 3 && x.up.includes(r));
        aT[r].textContent = x && s >= 2 && j > 0 ? f2(x.a[r]) : "";
        aT[r].classList.toggle("hi", !!x && s === 4 && x.a[r] < 1 && j > 0);
        lT[r].textContent = fin ? f2(l[r]) : f2(lv);
        lT[r].classList.toggle("hi", !!x && s === 3);
      }

      // output accumulator: bar height is O relative to a fixed scale, so rescaling is visible
      const vals = fin ? Of : !x ? zero : s === 4 ? x.Os : s === 5 ? x.On : j === 0 ? zero : st[j - 1].On;
      bars.forEach((b, n) => {
        const v = vals[n >> 2][n & 3];
        b.style.transform = `scaleY(${clamp(v / CAP, 0.001, 1)})`;
        b.classList.toggle("fin", fin);
      });

      const on = { q: false, s: s === 1, m: s === 2, a: s === 2 || s === 3 || s === 4, l: s === 3, o: s === 4 || s === 5 || fin };
      for (const n in heads) heads[n].classList.toggle("on", on[n]);
      stages.forEach((li, n) => { li.classList.toggle("on", fin ? n === 6 : n === s); li.classList.toggle("past", fin ? n < 6 : s >= 0 && n < s); });
      segs.q.classList.toggle("on", j >= 0);
      segs.k.classList.toggle("on", s === 0 || s === 1);
      segs.v.classList.toggle("on", s === 0 || s === 5);

      if (i < 0) return { label: "", text: "Press Play or Step. A block of queries stays on chip while K and V blocks stream through; the softmax is never materialized in full." };
      if (fin) return { label: "Normalize", text: "After the last block each row of O is divided by its running sum l. The full attention matrix was never stored." };
      const label = `K/V block ${j + 1}/${NB} · ${NAMES[s]}`;
      const first = j === 0;
      const text = [
        `Block ${j + 1} of ${NB}: its K and V tiles stream into shared memory. The query rows stay where they are.`,
        `Score tile S = Q · Kᵀ: every query row against the ${BC} keys in this block.`,
        first
          ? "Running max m starts as each row's maximum over this first block."
          : x.up.length
            ? `Running max m: this block raises it in ${rowsText(x.up)}. The other rows keep their max.`
            : "Running max m: no row's max changes in this block.",
        first
          ? "P = exp(S − m) turns scores into weights, and l starts as each row's sum of P."
          : "P = exp(S − m) uses the updated max. l becomes α × (old l) plus the row sum of P.",
        first
          ? "First block: nothing in O to rescale yet."
          : x.up.length
            ? `O is rescaled by α = exp(m_old − m_new) in ${rowsText(x.up)}, so earlier blocks stay consistent with the new max. Other rows have α = 1.`
            : "Every α is 1, so O is left as it is.",
        "P · V is added into O, so each row now covers every key seen so far.",
      ][s];
      return { label, text };
    };
  }

  const builders = { gemm, attn };
  const totals = { gemm: 20, attn: 19 };
  const rest = { gemm: 7, attn: 10 };
  $$(document, "[data-viz]").forEach((root) => {
    const kind = root.dataset.viz;
    player(root, totals[kind], rest[kind], builders[kind](root), 1250, 3200);
  });
})();
