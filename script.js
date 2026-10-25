// Speculative decoding demo: a scripted replay of draft-then-verify rounds.
// Runs on every [data-demo] line. The phase label and counters are optional and are
// looked up inside the nearest [data-demo-root], so a bare line works as a compact preview.
(() => {
  // Each round: what the draft proposes, how many of those the target keeps,
  // and the token the target adds itself (null once the grammar is complete).
  const rounds = [
    { draft: ['{"', "name", '":'], accept: 3, own: ' "' },
    { draft: ["On", "yx", '"'], accept: 2, own: '",' },
    { draft: [' "', "speed", "up"], accept: 3, own: '": ' },
    { draft: ["2", ".", "49"], accept: 0, own: "1" },
    { draft: [".", "49", "}"], accept: 3, own: null },
  ];

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const tok = (text, cls) => {
    const s = document.createElement("span");
    s.className = cls ? `tok ${cls}` : "tok";
    s.textContent = text;
    return s;
  };

  document.querySelectorAll("[data-demo]").forEach(setup);

  function setup(line) {
    const root = line.closest("[data-demo-root]") || line;
    const phaseEl = root.querySelector("[data-phase]");
    const tokensEl = root.querySelector("[data-tokens]");
    const passesEl = root.querySelector("[data-passes]");
    const aloneEl = root.querySelector("[data-alone]");

    let tokens = 0;
    let passes = 0;

    const setPhase = (text) => { if (phaseEl) phaseEl.textContent = text || " "; };

    const render = () => {
      if (tokensEl) tokensEl.textContent = tokens;
      if (passesEl) passesEl.textContent = passes;
      if (aloneEl) aloneEl.textContent = `${tokens} ${tokens === 1 ? "pass" : "passes"}`;
    };

    const reset = () => {
      line.replaceChildren();
      tokens = 0;
      passes = 0;
      render();
      setPhase("");
    };

    // Reduced motion: show the finished output with the target's own tokens marked.
    if (reduced) {
      for (const r of rounds) {
        r.draft.slice(0, r.accept).forEach((t) => line.append(tok(t)));
        if (r.own) line.append(tok(r.own, "target"));
        tokens += r.accept + (r.own ? 1 : 0);
        passes += 1;
      }
      render();
      return;
    }

    // Only advance while the demo is on screen.
    let visible = false;
    let wake = null;
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && wake) { wake(); wake = null; }
    }, { threshold: 0.25 }).observe(line);
    const whenVisible = () => (visible ? Promise.resolve() : new Promise((r) => { wake = r; }));

    async function playRound({ draft, accept, own }) {
      await whenVisible();

      setPhase(`draft proposes ${draft.length}`);
      const proposed = [];
      for (const t of draft) {
        const s = tok(t, "draft");
        line.append(s);
        proposed.push(s);
        await sleep(260);
      }
      await sleep(450);

      passes += 1;
      render();
      setPhase("target checks all of them in one pass");
      await sleep(700);

      const kept = proposed.slice(0, accept);
      const rejected = proposed.slice(accept);
      for (const s of kept) {
        s.className = "tok ok";
        tokens += 1;
        render();
        await sleep(160);
      }
      rejected.forEach((s) => { s.className = "tok rejected"; });

      if (rejected.length) {
        setPhase(accept ? `kept ${accept}, rejected ${rejected.length}` : "rejected all of them");
        await sleep(900);
        rejected.forEach((s) => s.classList.add("gone"));
        await sleep(350);
        rejected.forEach((s) => s.remove());
      } else {
        setPhase(`kept all ${accept}`);
        await sleep(600);
      }

      if (own) {
        setPhase("target adds its own next token");
        line.append(tok(own, "target"));
        tokens += 1;
        render();
      } else {
        setPhase("grammar complete");
      }

      await sleep(500);
      kept.forEach((s) => { s.className = "tok"; });
      await sleep(600);
    }

    (async function loop() {
      for (;;) {
        reset();
        line.style.opacity = "1";
        for (const round of rounds) await playRound(round);
        setPhase(`done: ${tokens} tokens in ${passes} target passes`);
        await sleep(4500);
        line.style.opacity = "0";
        await sleep(400);
      }
    })();
  }
})();
