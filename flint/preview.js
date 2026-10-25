// Home-card preview: a quiet loop of a tiled matrix filling in K-step by K-step.
// Self-contained; does nothing if the host element is missing.
(() => {
  const host = document.querySelector("[data-flint-preview]");
  if (!host) return;
  const NS = "http://www.w3.org/2000/svg";
  const mk = (p, tag, a) => {
    const e = document.createElementNS(NS, tag);
    for (const k in a) e.setAttribute(k, a[k]);
    p.append(e);
    return e;
  };

  // C: 4 x 2 tiles of 3 x 3 cells. A sits to its left, B above it; both split into 4 K strips.
  const S = 10, T = 3, GAP = 3, SA = 8, SB = 7, PAD = 6;
  const cw = 4 * T * S + 3 * GAP, ch = 2 * T * S + GAP;
  const aw = 4 * SA, bh = 4 * SB;
  const W = aw + PAD + cw, H = bh + PAD + ch;
  const ox = 10, oy = 4;
  const svg = mk(host, "svg", { class: "fp", viewBox: `0 0 ${W + 2 * ox} ${H + 2 * oy}`, preserveAspectRatio: "xMidYMid meet", "aria-hidden": "true", focusable: "false", "data-k": "0" });
  const cx = ox + aw + PAD, cy = oy + bh + PAD;

  const strips = [];
  for (let k = 0; k < 4; k++) {
    strips.push(
      mk(svg, "rect", { class: "s", x: ox + k * SA, y: cy, width: SA, height: ch }),
      mk(svg, "rect", { class: "s", x: cx, y: oy + k * SB, width: cw, height: SB })
    );
  }
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 4; tx++) {
    const x = cx + tx * (T * S + GAP), y = cy + ty * (T * S + GAP);
    const d = (ty * 4 + tx) * 0.07 + "s";
    mk(svg, "rect", { class: "t", x: x - 0.5, y: y - 0.5, width: T * S + 1, height: T * S + 1, rx: 1.5 });
    for (let r = 0; r < T; r++) for (let c = 0; c < T; c++) {
      const e = mk(svg, "rect", { class: "c", x: x + c * S, y: y + r * S, width: S, height: S });
      e.style.setProperty("--d", d);
    }
  }

  const show = (k) => {
    svg.dataset.k = k;
    strips.forEach((el, n) => {
      const step = n >> 1; // strips are pushed in A/B pairs per K-step
      el.classList.toggle("done", step < k - 1);
      el.classList.toggle("cur", step === k - 1);
    });
  };

  // Reduced motion: one still frame, halfway through the K loop.
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { show(2); return; }

  const wait = [900, 1100, 1100, 1100, 2400]; // blank, then four K-steps, last one held
  let k = 0, t = 0, vis = false;
  show(0);
  const tick = () => {
    clearTimeout(t);
    if (!vis || document.hidden) return;
    t = setTimeout(() => { k = (k + 1) % 5; show(k); tick(); }, wait[k]);
  };
  const update = () => { if (vis && !document.hidden) tick(); else clearTimeout(t); };
  new IntersectionObserver(([e]) => { vis = e.isIntersecting; update(); }, { threshold: 0.2 }).observe(host);
  document.addEventListener("visibilitychange", update);
})();
