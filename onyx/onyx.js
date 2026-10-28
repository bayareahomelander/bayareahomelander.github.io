"use strict";

/* ==========================================================================
   Onyx page demos
   1. Regex engine: parse -> Thompson NFA -> subset-construction DFA (no DOM)
   2. Speculative decoding demo and draft-length widget
   3. Grammar playground
   ========================================================================== */

/* ---------- 1. Regex engine ---------- */

class RegexError extends Error {}

const MAX_REPEAT = 64;
const MAX_NFA = 4000;
const MAX_DFA = 300;
const DIGITS = "0123456789";

// Supported: literals, \d and escaped symbols, [...] classes with ranges,
// {n} {n,m} {n,}, ? * +, |, and (...) groups. Everything else gets a clear error.
function parseRegex(src) {
  let i = 0;
  const fail = (msg, at = i) => { throw new RegexError(`${msg} (position ${at + 1})`); };
  const isQuant = (c) => c === "?" || c === "*" || c === "+" || c === "{";

  function alt() {
    const a = [seq()];
    while (src[i] === "|") { i++; a.push(seq()); }
    return a.length === 1 ? a[0] : { t: "alt", a };
  }

  function seq() {
    const a = [];
    while (i < src.length && src[i] !== "|" && src[i] !== ")") a.push(rep());
    return { t: "seq", a };
  }

  function rep() {
    let n = atom();
    if (isQuant(src[i])) {
      const at = i, c = src[i++];
      let min, max;
      if (c === "?") [min, max] = [0, 1];
      else if (c === "*") [min, max] = [0, Infinity];
      else if (c === "+") [min, max] = [1, Infinity];
      else [min, max] = braces(at);
      n = { t: "rep", n, min, max };
      if (isQuant(src[i])) fail("Stacked quantifiers are not supported");
    }
    return n;
  }

  function braces(at) {
    const m = /^(\d+)(?:(,)(\d*))?\}/.exec(src.slice(i));
    if (!m) fail("Invalid repeat; use {n}, {n,m} or {n,}", at);
    i += m[0].length;
    const min = +m[1];
    const max = m[2] ? (m[3] === "" ? Infinity : +m[3]) : min;
    if (max < min) fail("Invalid repeat: the maximum is below the minimum", at);
    if (min > MAX_REPEAT || (max !== Infinity && max > MAX_REPEAT)) fail(`Repeat counts are limited to ${MAX_REPEAT}`, at);
    return [min, max];
  }

  // Reads the character after a backslash. Returns a string of one or more characters.
  function esc() {
    if (i >= src.length) fail("Trailing backslash", i - 1);
    const c = src[i++];
    if (c === "d") return DIGITS;
    if (/[A-Za-z0-9]/.test(c)) fail(`Unsupported escape \\${c}; only \\d and escaped symbols work`, i - 2);
    return c;
  }

  function atom() {
    const at = i, c = src[i++];
    if (c === "(") {
      if (src[i] === "?") fail("Group modifiers such as (?:...) are not supported");
      const n = alt();
      if (src[i] !== ")") fail("Missing ')' for the group opened here", at);
      i++;
      return n;
    }
    if (c === "[") return cls(at);
    if (c === "\\") return { t: "set", s: new Set(esc()) };
    if (c === ".") fail("The wildcard '.' is not supported; use a class such as [a-z]", at);
    if (c === "^" || c === "$") fail("Anchors are not needed: the whole output must match", at);
    if (isQuant(c)) fail("Nothing to repeat", at);
    if (c === "]" || c === "}") fail(`Unescaped '${c}'; write \\${c} for a literal`, at);
    return { t: "set", s: new Set([c]) };
  }

  function cls(at) {
    if (src[i] === "^") fail("Negated classes [^...] are not supported");
    const s = new Set();
    const item = () => (src[i] === "\\" ? (i++, esc()) : src[i++]);
    while (i < src.length && src[i] !== "]") {
      const from = i, lo = item();
      if (lo.length > 1) { for (const ch of lo) s.add(ch); continue; }
      if (src[i] === "-" && i + 1 < src.length && src[i + 1] !== "]") {
        i++;
        const hi = item();
        if (hi.length > 1 || hi < lo) fail(`Invalid range '${lo}-${hi}'`, from);
        if (hi.charCodeAt(0) - lo.charCodeAt(0) > 255) fail("Ranges are limited to 256 characters", from);
        for (let c = lo.charCodeAt(0); c <= hi.charCodeAt(0); c++) s.add(String.fromCharCode(c));
      } else s.add(lo);
    }
    if (i >= src.length) fail("Missing ']' for the class opened here", at);
    i++;
    if (!s.size) fail("Empty class", at);
    return { t: "set", s };
  }

  const ast = alt();
  if (i < src.length) fail("Unmatched ')'");
  return ast;
}

// Thompson construction. Every fragment is [start, end]; epsilon moves live in eps,
// character moves in edges (each edge carries the set of characters it accepts).
function buildNfa(ast) {
  const eps = [], edges = [];
  const node = () => {
    if (eps.length >= MAX_NFA) throw new RegexError("The pattern is too large for this demo");
    eps.push([]); edges.push([]);
    return eps.length - 1;
  };
  const link = (a, b) => eps[a].push(b);

  function frag(n) {
    if (n.t === "set") {
      const s = node(), e = node();
      edges[s].push({ set: n.s, to: e });
      return [s, e];
    }
    if (n.t === "seq") {
      const s = node();
      let end = s;
      for (const x of n.a) { const [fs, fe] = frag(x); link(end, fs); end = fe; }
      return [s, end];
    }
    if (n.t === "alt") {
      const s = node(), e = node();
      for (const x of n.a) { const [fs, fe] = frag(x); link(s, fs); link(fe, e); }
      return [s, e];
    }
    // Repeat: `min` mandatory copies, then either a loop or (max - min) optional copies.
    const s = node();
    let cur = s;
    for (let k = 0; k < n.min; k++) { const [fs, fe] = frag(n.n); link(cur, fs); cur = fe; }
    if (n.max === Infinity) {
      const loop = node();
      link(cur, loop);
      const [fs, fe] = frag(n.n);
      link(loop, fs); link(fe, loop);
      return [s, loop];
    }
    const e = node();
    for (let k = n.min; k < n.max; k++) { link(cur, e); const [fs, fe] = frag(n.n); link(cur, fs); cur = fe; }
    link(cur, e);
    return [s, e];
  }

  const [start, accept] = frag(ast);
  return { eps, edges, start, accept };
}

// Subset construction over the characters the pattern mentions. States that cannot
// reach acceptance are cut so a token never leads into a dead end.
function buildDfa({ eps, edges, start, accept }) {
  const closure = (ids) => {
    const seen = new Set(ids), stack = [...ids];
    while (stack.length) for (const t of eps[stack.pop()]) if (!seen.has(t)) { seen.add(t); stack.push(t); }
    return [...seen].sort((a, b) => a - b);
  };
  const alphabet = [...new Set(edges.flatMap((l) => l.flatMap((e) => [...e.set])))].sort();
  const states = [], index = new Map();
  const add = (set) => {
    const key = set.join(",");
    if (!index.has(key)) {
      if (states.length >= MAX_DFA) throw new RegexError("The pattern needs too many DFA states for this demo");
      index.set(key, states.length);
      states.push({ set, trans: new Map(), accepting: set.includes(accept) });
    }
    return index.get(key);
  };

  add(closure([start]));
  for (let s = 0; s < states.length; s++) {
    for (const ch of alphabet) {
      const next = new Set();
      for (const n of states[s].set) for (const e of edges[n]) if (e.set.has(ch)) next.add(e.to);
      if (next.size) states[s].trans.set(ch, add(closure([...next])));
    }
  }

  // dist[s]: fewest characters needed to reach an accepting state.
  const dist = states.map((st) => (st.accepting ? 0 : Infinity));
  for (let changed = true; changed;) {
    changed = false;
    states.forEach((st, s) => st.trans.forEach((t) => {
      if (dist[t] + 1 < dist[s]) { dist[s] = dist[t] + 1; changed = true; }
    }));
  }
  states.forEach((st) => st.trans.forEach((t, ch) => { if (dist[t] === Infinity) st.trans.delete(ch); }));
  if (dist[0] === Infinity) throw new RegexError("This pattern cannot match anything");
  return { states, alphabet, dist, start: 0 };
}

function compileGrammar(src) {
  if (!src) throw new RegexError("Enter a pattern.");
  return buildDfa(buildNfa(parseRegex(src)));
}

// Feed a token's characters through the DFA from `state`. Legal only if every one is consumed.
function walk(g, state, token) {
  const steps = [];
  let s = state;
  for (const ch of token) {
    const to = g.states[s].trans.get(ch);
    steps.push({ ch, to: to === undefined ? null : to });
    if (to === undefined) return { ok: false, steps, end: s };
    s = to;
  }
  return { ok: true, steps, end: s };
}

const legalMask = (g, state, vocab) => vocab.map((t) => walk(g, state, t));

function matches(g, str) {
  const r = walk(g, g.start, str);
  return r.ok && g.states[r.end].accepting;
}

// Deterministic pseudo-score (FNV-1a). Stands in for a model's preference; it is not a model.
function score(str) {
  let h = 2166136261;
  for (let k = 0; k < str.length; k++) { h ^= str.charCodeAt(k); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

const EOS = -2, STUCK = -1, EOS_AFTER = 4, STEP_LIMIT = 12;

// Index of the picked token, EOS, or STUCK when nothing in the vocabulary can continue.
function choose(g, state, mask, vocab, n) {
  const cands = [];
  mask.forEach((m, i) => { if (m.ok) cands.push(i); });
  if (g.states[state].accepting && (n >= EOS_AFTER || !cands.length)) return EOS;
  if (!cands.length) return STUCK;
  const key = (i) => score(`${state}|${n}|${vocab[i]}`);
  // Past the step limit, steer toward the nearest accepting state so unbounded patterns finish.
  const better = (a, b) => {
    if (n >= STEP_LIMIT && g.dist[mask[a].end] !== g.dist[mask[b].end]) return g.dist[mask[a].end] < g.dist[mask[b].end];
    return key(a) >= key(b);
  };
  return cands.reduce((a, b) => (better(a, b) ? a : b));
}

// Toy vocabulary: single characters, multi-character pieces, and some that fit nothing here.
const VOCAB = [
  "A", "B", "C", "Q", "AB", "BC", "ABC", "XYZ", "C-",
  "0", "1", "2", "3", "7", "9", "01", "12", "20", "24", "99", "2024", "-1", "-",
  "y", "e", "s", "o", "n", "a", "b", "x", "ye", "yes", "no", "ys", "yep", "nope", "ok",
  " ", "_", ",", ".", ":",
  "Yes", "true", "null", "maybe", "{", "}", "!", "x9",
];

if (typeof module !== "undefined") {
  module.exports = { RegexError, parseRegex, compileGrammar, walk, legalMask, matches, choose, score, VOCAB, EOS, STUCK };
}

/* ---------- Shared page helpers ---------- */

const CANCEL = Symbol("cancel");

function initPage() {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const hasIO = "IntersectionObserver" in window;

  // Calls cb(true/false) as the element enters and leaves the viewport.
  const onScreen = (el, cb) => {
    if (!hasIO) { cb(true); return; }
    new IntersectionObserver(([e]) => cb(e.isIntersecting), { threshold: 0.15 }).observe(el);
  };

  const tok = (text, cls) => {
    const s = document.createElement("span");
    s.className = cls ? `tok ${cls}` : "tok";
    s.textContent = text;
    return s;
  };

  const setPressed = (buttons, on) => buttons.forEach((b) => b.setAttribute("aria-pressed", String(b === on)));

  /* ---------- 2a. Speculative decoding demo ---------- */

  // Each round: [what the draft proposes, how many the target keeps, the target's own token].
  // A null own token means the grammar is complete. Accept patterns follow the measured
  // ranking only qualitatively; nothing here is a measurement.
  const WORKLOADS = [
    { id: "code", x: "2.44", bench: "Code, 6 cases", end: "end of output", rounds: [
      [["for", " i", " in"], 3, " range"],
      [["(", "10", "]"], 2, "):"],
      [[" print", "(", "i"], 3, ")"],
      [[";", " total", " ="], 3, " sum"],
      [["(", "range", "("], 3, "10))"],
    ] },
    { id: "json", x: "2.11", bench: "JSON Schema output, 4 cases", end: "grammar complete", rounds: [
      [['{"', "name", '":'], 3, ' "'],
      [["On", "yx", '"'], 2, '",'],
      [[' "', "ok", '":'], 3, " true"],
      [["}"], 1, null],
    ] },
    { id: "regex", x: "2.07", bench: "Regex-constrained output, 4 cases", end: "grammar complete", rounds: [
      [["40", "21", "-"], 3, "77"],
      [["88", "-", "12"], 2, "13"],
      [["05", "-", "98"], 2, "99"],
      [["42"], 1, null],
    ] },
    { id: "prose", x: "1.22", bench: "Prose, 8 cases", end: "end of output", rounds: [
      [["The", " main", " point"], 1, " key"],
      [[" point", " is", " that"], 0, " idea"],
      [[" is", " that", " the"], 1, " simple:"],
      [[" the", " model", " can"], 1, " target"],
      [[" checks", " each", " guess"], 1, " many"],
      [[" guesses", " at", " once"], 3, "."],
    ] },
    { id: "short", x: "1.13", bench: "Short replies, 8 cases", end: "end of reply", rounds: [
      [["Sure", ",", " I"], 0, "Yes"],
      [[",", " I", " can"], 0, "."],
      [[" I", " will", " do"], 1, " can"],
      [[" do", " it", "."], 1, " that"],
      [["."], 1, null],
    ] },
  ];

  function initDemo(root) {
    const $ = (s) => root.querySelector(s);
    const line = $("[data-line]"), phaseEl = $("[data-phase]"), status = $("[data-status]");
    const tokensEl = $("[data-tokens]"), passesEl = $("[data-passes]"), aloneEl = $("[data-alone]");
    const xEl = $("[data-x]"), benchEl = $("[data-bench]");
    const playBtn = $("[data-play]"), stepBtn = $("[data-step]"), restartBtn = $("[data-restart]");
    const wlBtns = [...root.querySelectorAll("[data-wl]")];

    let wl = WORKLOADS[0], idx = 0, tokens = 0, passes = 0, text = "";
    let epoch = 0, playing = false, busy = false, looping = false;
    let visible = !hasIO, started = false, waiting = [];

    const done = () => idx >= wl.rounds.length;
    const whenVisible = () => (visible ? Promise.resolve() : new Promise((r) => waiting.push(r)));
    const setPhase = (t) => { phaseEl.textContent = t || " "; };

    // Reserve the tallest state any workload can reach (every committed token plus a full
    // round of boxed drafts) so the token area never grows mid-animation.
    const reserve = () => {
      if (!line.offsetWidth) return; // not laid out yet; the CSS fallback applies
      const probe = line.cloneNode(false);
      probe.removeAttribute("data-line");
      probe.style.cssText = `position:absolute;visibility:hidden;left:0;top:0;min-height:0;width:${line.offsetWidth}px`;
      line.parentNode.appendChild(probe);
      let max = 0;
      for (const w of WORKLOADS) {
        probe.replaceChildren();
        for (const [draft, accept, own] of w.rounds) {
          draft.slice(0, accept).forEach((t) => probe.append(tok(t)));
          if (own) probe.append(tok(own, "target"));
        }
        [" draft", " draft", " draft"].forEach((t) => probe.append(tok(t, "draft")));
        max = Math.max(max, probe.offsetHeight);
      }
      probe.remove();
      line.style.minHeight = `${max}px`;
    };
    reserve();
    let rz = 0;
    window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(reserve, 150); });

    const render = () => {
      tokensEl.textContent = tokens;
      passesEl.textContent = passes;
      aloneEl.textContent = `${tokens} ${tokens === 1 ? "pass" : "passes"}`;
    };

    const sync = () => {
      playBtn.textContent = playing ? "Pause" : done() ? "Replay" : idx ? "Resume" : "Play";
      stepBtn.disabled = busy || playing;
      restartBtn.disabled = !idx && !busy && !playing;
    };

    function reset() {
      epoch++;
      playing = busy = looping = false;
      line.replaceChildren();
      idx = tokens = passes = 0;
      text = "";
      setPhase("");
      status.textContent = "";
      render();
      sync();
    }

    // Plays one round. With animate = false the same steps run without pauses.
    async function runRound(animate) {
      const my = epoch;
      const w = async (ms) => {
        if (animate) { await sleep(ms); await whenVisible(); }
        if (my !== epoch) throw CANCEL;
      };
      busy = true;
      sync();
      try {
        const [draft, accept, own] = wl.rounds[idx];

        setPhase(`draft proposes ${draft.length}`);
        const proposed = [];
        for (const t of draft) {
          const s = tok(t, "draft");
          line.append(s);
          proposed.push(s);
          await w(260);
        }
        await w(450);

        passes += 1;
        render();
        setPhase("target checks all of them in one pass");
        await w(700);

        const kept = proposed.slice(0, accept), bad = proposed.slice(accept);
        for (const s of kept) {
          s.className = "tok ok";
          tokens += 1;
          render();
          await w(160);
        }
        bad.forEach((s) => { s.className = "tok rejected"; });
        if (bad.length) {
          setPhase(accept ? `kept ${accept}, rejected ${bad.length}` : "rejected all of them");
          await w(900);
          bad.forEach((s) => s.classList.add("gone"));
          await w(350);
          bad.forEach((s) => s.remove());
        } else {
          setPhase(`kept all ${accept}`);
          await w(600);
        }

        if (own !== null) {
          setPhase("target adds its own next token");
          line.append(tok(own, "target"));
          tokens += 1;
          render();
        } else setPhase(wl.end);
        text += draft.slice(0, accept).join("") + (own || "");
        idx += 1;
        status.textContent = `Round ${idx} of ${wl.rounds.length}: kept ${accept} of ${draft.length}. Output so far: ${text}`;
        await w(500);
        kept.forEach((s) => { s.className = "tok"; });
        await w(400);
        if (done()) setPhase(`done: ${tokens} tokens in ${passes} target passes`);
        return true;
      } catch (e) {
        if (e === CANCEL) return false;
        throw e;
      } finally {
        if (my === epoch) { busy = false; sync(); }
      }
    }

    async function loop() {
      const my = epoch;
      looping = true;
      while (playing && !done() && my === epoch) {
        await whenVisible();
        if (!playing || my !== epoch) break;
        if (!(await runRound(!reduced))) break;
        if (reduced && playing && !done()) await sleep(1300);
      }
      if (my === epoch) { looping = false; playing = false; sync(); }
    }

    function play() {
      if (done()) reset();
      started = true;
      playing = true;
      sync();
      if (!looping) loop();
    }

    // Reduced motion shows the finished script, with the target's own tokens marked.
    async function showFinished() {
      reset();
      const my = epoch;
      while (!done() && my === epoch) await runRound(false);
    }

    function select(btn) {
      wl = WORKLOADS.find((w) => w.id === btn.dataset.wl);
      setPressed(wlBtns, btn);
      xEl.innerHTML = `${wl.x}&times;`;
      benchEl.textContent = `Measured on the RTX 2080 Ti benchmark (Qwen3-8B target, greedy): ${wl.bench}.`;
      started = true;
      if (reduced) showFinished(); else { reset(); play(); }
    }

    wlBtns.forEach((b) => b.addEventListener("click", () => select(b)));
    playBtn.addEventListener("click", () => { if (playing) { playing = false; sync(); } else play(); });
    stepBtn.addEventListener("click", () => {
      if (busy || playing) return;
      started = true;
      if (done()) reset();
      runRound(!reduced);
    });
    restartBtn.addEventListener("click", () => { started = true; reset(); });

    onScreen(root, (v) => {
      visible = v;
      if (v) { waiting.splice(0).forEach((r) => r()); if (!started && !reduced) play(); }
    });

    reset();
    if (reduced) { started = true; showFinished(); }
  }

  /* ---------- 2b. Draft length (Apple Silicon table) ---------- */

  function initDraft(root) {
    const btns = [...root.querySelectorAll("button[data-g]")];
    const rows = [...root.querySelectorAll("tr[data-g]")];
    const read = root.querySelector("[data-read]");
    const baseTps = root.querySelector("[data-base]").dataset.base;

    // One line of text per option, stacked in the same grid cell so the tallest sets the height.
    const lines = new Map(btns.map((b) => {
      const d = rows.find((r) => r.dataset.g === b.dataset.g && r.dataset.tps).dataset;
      const p = document.createElement("p");
      p.textContent = `${d.name}: ${d.tps} tok/s, ${d.x}× the target alone (${baseTps} tok/s), ` +
        `${d.acc}% of drafted tokens accepted.${d.note ? " " + d.note : ""}`;
      read.append(p);
      return [b.dataset.g, p];
    }));

    function select(btn) {
      const g = btn.dataset.g;
      setPressed(btns, btn);
      rows.forEach((r) => r.classList.toggle("sel", r.dataset.g === g));
      lines.forEach((p, k) => p.classList.toggle("on", k === g));
    }
    btns.forEach((b) => b.addEventListener("click", () => select(b)));
    select(btns.find((b) => b.getAttribute("aria-pressed") === "true") || btns[0]);
  }

  /* ---------- 3. Grammar playground ---------- */

  function initGrammar(root) {
    const $ = (s) => root.querySelector(s);
    const input = $("[data-regex]"), msg = $("[data-msg]"), note = $("[data-note]"), status = $("[data-status]");
    const stateEl = $("[data-state]"), acceptEl = $("[data-accept]"), maskEl = $("[data-mask]"), cacheEl = $("[data-cache]");
    const outEl = $("[data-out]"), scanEl = $("[data-scan]"), vocabEl = $("[data-vocab]");
    const legalEl = $("[data-legal]"), pickEl = $("[data-pick]"), sizeEl = $("[data-size]");
    const stepBtn = $("[data-step]"), playBtn = $("[data-play]"), resetBtn = $("[data-reset]");
    const presets = [...root.querySelectorAll("[data-re]")];

    const SHOWN = (t) => (t === " " ? "␣" : t);   // visible space
    const EOS_LABEL = "<eos>";
    const items = [...VOCAB, EOS_LABEL].map((t) => {
      const li = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = SHOWN(t);
      const sr = document.createElement("span");
      sr.className = "sr-only";
      li.append(label, sr);
      vocabEl.append(li);
      return li;
    });
    sizeEl.textContent = `${items.length} tokens`;

    let g = null, masks, hits, misses;
    let state, mask, pick, out, n, finished, stuck;
    let playing = false, visible = !hasIO, timer = null, parked = false;

    const stop = () => { playing = false; clearTimeout(timer); timer = null; parked = false; };

    function enter(s) {
      state = s;
      const cached = masks.has(s);
      if (cached) hits += 1;
      else { masks.set(s, legalMask(g, s, VOCAB)); misses += 1; }
      mask = masks.get(s);
      pick = choose(g, s, mask, VOCAB, n);
      stuck = pick === STUCK;
      return cached;
    }

    let cachedNow = false;

    function restart() {
      stop();
      out = [];
      n = 0;
      finished = false;
      if (g) cachedNow = enter(g.start);
      render();
    }

    function load(src) {
      stop();
      g = null;
      try {
        g = compileGrammar(src);
        msg.textContent = "";
        note.classList.remove("bad");
        input.removeAttribute("aria-invalid");
      } catch (e) {
        if (!(e instanceof RegexError)) throw e;
        msg.textContent = e.message;
        note.classList.add("bad");
        input.setAttribute("aria-invalid", "true");
      }
      masks = new Map(); hits = 0; misses = 0;
      restart();
    }

    function commit() {
      if (!g || finished || stuck) return;
      if (pick === EOS) { finished = true; stop(); render(); return; }
      out.push(VOCAB[pick]);
      n += 1;
      cachedNow = enter(mask[pick].end);
      render();
    }

    const fmtSteps = (r) => r.steps.map((s) => (s.to === null ? `${s.ch}×` : `${s.ch}→S${s.to}`)).join(" ");

    function scanLine(label, token, r, note) {
      const p = document.createElement("p");
      const b = document.createElement("b");
      b.textContent = label;
      const c = document.createElement("code");
      c.textContent = SHOWN(token);
      p.append(b, " ", c, ` ${fmtSteps(r)}${note ? " " + note : ""}`);
      return p;
    }

    function render() {
      const ok = !!g;
      stepBtn.disabled = !ok || finished || stuck;
      playBtn.disabled = !ok || stuck;
      playBtn.textContent = playing ? "Pause" : "Play";
      resetBtn.disabled = !ok;
      outEl.replaceChildren(...out.map((t) => tok(t, "ok")));
      scanEl.replaceChildren();

      if (!ok) {
        stateEl.textContent = acceptEl.textContent = cacheEl.textContent = "–";
        maskEl.replaceChildren();
        legalEl.textContent = "";
        pickEl.textContent = "–";
        items.forEach((li) => { li.className = ""; li.lastChild.textContent = ""; });
        status.textContent = "";
        return;
      }

      const accepting = g.states[state].accepting;
      stateEl.textContent = `S${state} of ${g.states.length}`;
      acceptEl.textContent = accepting ? "yes" : "no";
      const pill = document.createElement("span");
      pill.className = `pill ${cachedNow ? "hit" : "new"}`;
      pill.textContent = cachedNow ? "cache hit" : "computed";
      maskEl.replaceChildren(pill);
      cacheEl.textContent = `${hits} hit${hits === 1 ? "" : "s"}, ${misses} computed`;

      let legalCount = 0;
      items.forEach((li, i) => {
        const legal = i === VOCAB.length ? accepting : mask[i].ok;
        if (legal) legalCount += 1;
        const picked = !finished && (pick === EOS ? i === VOCAB.length : i === pick);
        li.className = `${legal ? "legal" : "blocked"}${picked ? " pick" : ""}`;
        li.lastChild.textContent = legal ? (picked ? ", legal, next pick" : ", legal") : ", not legal";
      });
      legalEl.textContent = `${legalCount} of ${items.length} legal in S${state}`;
      pickEl.textContent = finished ? "done" : stuck ? "none" : pick === EOS ? EOS_LABEL : SHOWN(VOCAB[pick]);

      if (finished) {
        scanEl.append(Object.assign(document.createElement("p"), { textContent: "Finished: the model picked <eos> in an accepting state. The output matches the pattern." }));
      } else if (stuck) {
        scanEl.append(Object.assign(document.createElement("p"), { textContent: "No token in this toy vocabulary can continue from here. A real tokenizer also has single-byte fallbacks." }));
      } else {
        if (pick !== EOS) scanEl.append(scanLine("picked", VOCAB[pick], mask[pick], "all consumed"));
        else scanEl.append(Object.assign(document.createElement("p"), { textContent: "Only <eos> is legal here: the output is complete." }));
        // Show the blocked token that got furthest, to make the all-characters rule visible.
        let worst = -1;
        mask.forEach((m, i) => { if (!m.ok && (worst < 0 || m.steps.length > mask[worst].steps.length)) worst = i; });
        if (worst >= 0 && mask[worst].steps.length > 1) scanEl.append(scanLine("blocked", VOCAB[worst], mask[worst], "no transition"));
      }

      status.textContent = finished
        ? `Finished. Output: ${out.join("")}`
        : `State S${state}, ${accepting ? "can" : "cannot"} end here, mask ${cachedNow ? "cache hit" : "computed"}. Output so far: ${out.join("") || "empty"}. Next pick: ${pickEl.textContent}.`;
    }

    // Playback: one token per tick, parked while off screen.
    function tick() {
      timer = null;
      if (!playing) return;
      if (!visible) { parked = true; return; }
      commit();
      if (playing) timer = setTimeout(tick, 900);
      else render();
    }

    function setPreset(btn) {
      presets.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    }

    presets.forEach((b) => b.addEventListener("click", () => { input.value = b.dataset.re; setPreset(b); load(input.value); }));
    input.addEventListener("input", () => { setPreset(presets.find((b) => b.dataset.re === input.value)); load(input.value); });
    stepBtn.addEventListener("click", () => { stop(); commit(); render(); });
    resetBtn.addEventListener("click", restart);
    playBtn.addEventListener("click", () => {
      if (playing) { stop(); render(); return; }
      if (finished) restart();
      playing = true;
      render();
      timer = setTimeout(tick, 500);
    });

    onScreen(root, (v) => {
      visible = v;
      if (v && parked) { parked = false; timer = setTimeout(tick, 300); }
    });

    setPreset(presets.find((b) => b.dataset.re === input.value));
    load(input.value);
  }

  document.querySelectorAll("[data-demo-root]").forEach(initDemo);
  document.querySelectorAll("[data-draft-root]").forEach(initDraft);
  document.querySelectorAll("[data-grammar-root]").forEach(initGrammar);
}

if (typeof document !== "undefined") initPage();
