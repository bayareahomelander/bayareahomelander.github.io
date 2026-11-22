(function () {
  "use strict";
  var root = document.querySelector("[data-onyx]");
  if (!root) return;

  // The final output, split into illustrative tokens. Both runs produce exactly this.
  var OUT = ['{"', "name", '":', ' "', "Ada", " Lov", "elace", '",', ' "', "born", '":', " 18", "15", ",", ' "', "field", '":', ' "', "mathematics", '"}'];
  var END = "end";
  var TOTAL_PASSES = OUT.length + 1; // the target alone: one pass per token, plus one to end

  // Rounds: what the draft proposes, how many the target keeps, and why it rejects the rest.
  var SCENARIOS = {
    aware: [
      { draft: ["name", '":', ' "'], accept: 3, note: "The schema only allows its own keys here, and the draft knows it." },
      { draft: [" Lov", "elace", '",'], accept: 3 },
      { draft: ["born", '":', " 19"], accept: 2, why: "A digit is legal here, since born is an integer, but the target’s best guess is 18, not 19." },
      { draft: ["15", ",", ' "'], accept: 3 },
      { draft: ['":', ' "', "math"], accept: 2, why: "The target prefers the whole word as one token." },
      { draft: ['"}', END], accept: 2, note: "After the closing brace the grammar allows nothing else, so the draft proposes the end." }
    ],
    plain: [
      { draft: ["name", '":', " '"], accept: 2, why: "A plain draft doesn’t know the grammar: JSON forbids single quotes, so the grammar mask rules it out." },
      { draft: ["Ada", " Lov", "elace"], accept: 3 },
      { draft: [' "', "birth", '":'], accept: 1, why: "The schema has no key called birth, and everything drafted after a rejection is discarded too." },
      { draft: ['":', ' "', "18"], accept: 1, why: "The schema says born is an integer, so an opening quote is illegal here." },
      { draft: ["15", ",", ' "'], accept: 3 },
      { draft: ['":', ' "', "math"], accept: 2, why: "The target prefers the whole word as one token." },
      { draft: ['"}', END], accept: 2 }
    ]
  };

  // Tokens in captions are wrapped in markers and drawn as code, spaces kept.
  function q(t) { return "" + (t === END ? "end" : t) + ""; }
  function list(ts) {
    var s = ts.map(q);
    if (s.length < 2) return s.join("");
    return s.slice(0, -1).join(", ") + " and " + s[s.length - 1];
  }
  var WORDS = ["none", "one", "two", "three", "four"];

  function build(rounds) {
    var frames = [];
    var committed = [];
    var perPass = [];
    var pos = 0;

    frames.push({
      onyx: [], onyxPasses: 0, alonePasses: 0, perPass: [],
      status: "Both runs get the same prompt. Press Next step to start."
    });

    committed = [{ t: OUT[0], c: "bonus" }];
    pos = 1;
    perPass.push(1);
    frames.push({
      onyx: committed.slice(), onyxPasses: 1, alonePasses: 1, perPass: perPass.slice(),
      status: "Pass 1. Both runs start the same way: the target reads the prompt and writes the first token, " + q(OUT[0]) + "."
    });

    rounds.forEach(function (r, i) {
      var passNo = perPass.length + 1;
      committed = committed.map(function (x) { return { t: x.t, c: x.c === "end bonus" ? x.c : "acc" }; });

      // Draft phase: no target pass yet.
      frames.push({
        onyx: committed.concat(r.draft.map(function (t) { return { t: t, c: t === END ? "end draft" : "draft" }; })),
        onyxPasses: perPass.length, alonePasses: perPass.length, perPass: perPass.slice(),
        status: "Round " + (i + 1) + ". The small draft model proposes " + list(r.draft) + "." + (r.note ? " " + r.note : "")
      });

      // Verify phase: one target pass.
      var kept = r.draft.slice(0, r.accept);
      var rejected = r.draft.slice(r.accept);
      var endsHere = kept.indexOf(END) !== -1;
      var keptToks = kept.map(function (t) { return { t: t, c: t === END ? "end acc" : "acc" }; });
      var rejToks = rejected.map(function (t) { return { t: t, c: "reject" }; });
      var own = null;
      if (!endsHere) {
        var ownText = pos + kept.length < OUT.length ? OUT[pos + kept.length] : END;
        own = { t: ownText, c: ownText === END ? "end bonus" : "bonus" };
      }
      pos += kept.filter(function (t) { return t !== END; }).length + (own && own.t !== END ? 1 : 0);
      var produced = kept.length + (own ? 1 : 0);
      perPass.push(produced);

      var s = "Pass " + passNo + ". The target checks " + (r.draft.length === 1 ? "the guess" : "all " + WORDS[r.draft.length] + " guesses") + " in one forward pass";
      if (!rejected.length && endsHere) {
        s += " and agrees with every one, so the output ends here.";
      } else if (!rejected.length) {
        s += ", agrees with every one, and adds its own next token, " + q(own.t) + ".";
      } else {
        s += (kept.length ? ", keeps " + list(kept) : ", keeps none of them") +
          ", rejects " + q(rejected[0]) + (rejected.length > 1 ? " and what follows it" : "") +
          ", and writes its own token, " + q(own.t) + ".";
      }
      s += " " + produced + (produced === 1 ? " token" : " tokens") + " this pass.";
      if (r.why) s += " " + r.why;

      frames.push({
        onyx: committed.concat(keptToks, rejToks, own ? [own] : []),
        onyxPasses: perPass.length, alonePasses: perPass.length, perPass: perPass.slice(),
        status: s
      });
      committed = committed.concat(keptToks, own ? [own] : []);
    });

    var onyxPasses = perPass.length;
    var final = committed.map(function (x) { return { t: x.t, c: x.c.indexOf("end") === 0 ? "end acc" : "acc" }; });
    frames.push({
      onyx: final, onyxPasses: onyxPasses, alonePasses: onyxPasses, perPass: perPass.slice(),
      status: "Onyx is done after " + onyxPasses + " target passes. Running alone, the target has written " + onyxPasses + " of its " + OUT.length + " tokens by now."
    });
    frames.push({
      onyx: final, onyxPasses: onyxPasses, alonePasses: TOTAL_PASSES, perPass: perPass.slice(), done: true,
      status: "Run to the end, the target alone needs " + TOTAL_PASSES + " passes for the same " + OUT.length + " tokens. The two outputs are identical, token for token."
    });
    return frames;
  }

  var outOnyx = root.querySelector('[data-out="onyx"]');
  var outAlone = root.querySelector('[data-out="alone"]');
  var countOnyx = root.querySelector('[data-count="onyx"]');
  var countAlone = root.querySelector('[data-count="alone"]');
  var passesOnyx = root.querySelector('[data-passes="onyx"]');
  var passesAlone = root.querySelector('[data-passes="alone"]');
  var status = root.querySelector("[data-status]");
  var stepLabel = root.querySelector("[data-step]");
  var back = root.querySelector("[data-back]");
  var next = root.querySelector("[data-next]");
  var play = root.querySelector("[data-play]");
  var reset = root.querySelector("[data-reset]");
  var aware = root.querySelector("[data-aware]");

  var frames = build(SCENARIOS.aware);
  var step = 0;
  var timer = null;

  function tokens(el, toks) {
    el.textContent = "";
    toks.forEach(function (x) {
      var s = document.createElement("i");
      s.className = "tok " + x.c;
      s.textContent = x.t;
      el.appendChild(s);
    });
  }

  function slots(el, counts) {
    el.textContent = "";
    for (var i = 0; i < TOTAL_PASSES; i++) {
      var s = document.createElement("span");
      if (i < counts.length) {
        var b = document.createElement("i");
        b.style.setProperty("--n", counts[i]);
        s.appendChild(b);
      }
      el.appendChild(s);
    }
  }

  function tokenCount(toks) {
    return toks.filter(function (x) { return x.c.indexOf("end") !== 0 && x.c !== "draft" && x.c !== "reject"; }).length;
  }

  function render() {
    var f = frames[step];
    tokens(outOnyx, f.onyx);
    var alone = OUT.slice(0, Math.min(f.alonePasses, OUT.length)).map(function (t) { return { t: t, c: "acc" }; });
    if (f.alonePasses > OUT.length) alone.push({ t: END, c: "end acc" });
    tokens(outAlone, alone);

    countOnyx.textContent = f.onyxPasses + (f.onyxPasses === 1 ? " pass" : " passes") + " · " + tokenCount(f.onyx) + " of " + OUT.length + " tokens";
    countAlone.textContent = f.alonePasses + (f.alonePasses === 1 ? " pass" : " passes") + " · " + Math.min(f.alonePasses, OUT.length) + " of " + OUT.length + " tokens";

    slots(passesOnyx, f.perPass);
    var ones = [];
    for (var i = 0; i < f.alonePasses; i++) ones.push(1);
    slots(passesAlone, ones);

    status.textContent = "";
    f.status.split(/([^]*)/).forEach(function (part) {
      if (!part) return;
      if (part.charAt(0) === "") {
        var c = document.createElement("code");
        c.className = "qt";
        c.textContent = part.slice(1, -1);
        status.appendChild(c);
      } else {
        status.appendChild(document.createTextNode(part));
      }
    });
    if (f.done) {
      var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 18");
      svg.setAttribute("class", "done");
      svg.setAttribute("aria-hidden", "true");
      svg.innerHTML = '<path d="M2.5 9.8c2 1.3 3.6 3 5 5.4C10.4 9.6 15 4.7 21.5 2.6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>';
      status.insertBefore(svg, status.firstChild);
    }

    stepLabel.textContent = "Step " + (step + 1) + " of " + frames.length;
    back.disabled = step === 0;
    next.disabled = step === frames.length - 1;
    if (step === frames.length - 1) stop();
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    play.textContent = "Play";
  }

  back.addEventListener("click", function () { stop(); if (step > 0) { step--; render(); } });
  next.addEventListener("click", function () { stop(); if (step < frames.length - 1) { step++; render(); } });
  reset.addEventListener("click", function () { stop(); step = 0; render(); });
  play.addEventListener("click", function () {
    if (timer) { stop(); return; }
    if (step === frames.length - 1) step = 0;
    play.textContent = "Pause";
    step++; render();
    timer = setInterval(function () {
      if (step < frames.length - 1) { step++; render(); } else { stop(); }
    }, 1400);
  });
  aware.addEventListener("change", function () {
    stop();
    frames = build(aware.checked ? SCENARIOS.aware : SCENARIOS.plain);
    step = Math.min(step, frames.length - 1);
    render();
  });

  render();
})();
