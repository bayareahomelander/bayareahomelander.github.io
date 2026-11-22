(function () {
  "use strict";
  var d = document.documentElement;

  /* Theme: follows the system until the visitor picks one */
  var toggle = document.querySelector("[data-theme-toggle]");
  var darkQuery = matchMedia("(prefers-color-scheme: dark)");
  function current() {
    return d.dataset.theme || (darkQuery.matches ? "dark" : "light");
  }
  function label() {
    if (toggle) toggle.setAttribute("aria-label", current() === "dark" ? "Switch to light theme" : "Switch to dark theme");
  }
  if (toggle) {
    label();
    toggle.addEventListener("click", function () {
      var next = current() === "dark" ? "light" : "dark";
      d.dataset.theme = next;
      try { localStorage.setItem("theme", next); } catch (e) {}
      label();
    });
    darkQuery.addEventListener("change", label);
  }

  /* Home: the sentence drafts in pencil and inks as it is verified,
     in Onyx's own rhythm: up to three drafted words a round, the
     target keeps what it agrees with and adds one word of its own. */
  var lede = document.querySelector("[data-ink]");
  if (!lede || !d.classList.contains("motion")) return;
  d.classList.add("inking");

  var w = Array.prototype.slice.call(lede.querySelectorAll(".w"));
  var tick = document.querySelector(".note .mark");
  var steps = [];
  var t = 250;
  function at(delay, fn) { t += delay; steps.push([t, fn]); }
  function set(i, cls, text) {
    return function () {
      if (text) w[i].textContent = text;
      w[i].className = "w " + cls;
    };
  }

  // The target picks the first word itself.
  at(0, set(0, "ink"));
  // Round 1: draft proposes three words, all accepted, target adds one.
  at(260, set(1, "draft")); at(70, set(2, "draft")); at(70, set(3, "draft"));
  at(420, function () { set(1, "ink")(); set(2, "ink")(); set(3, "ink")(); });
  at(90, set(4, "ink"));
  // Round 2: the third drafted word is wrong; the target rejects it and writes its own.
  at(330, set(5, "draft")); at(70, set(6, "draft")); at(70, set(7, "draft", "the"));
  at(420, function () { set(5, "ink")(); set(6, "ink")(); set(7, "reject")(); });
  at(420, set(7, "ink", "a"));
  // Round 3: three drafted words, all accepted; the sentence is done.
  at(300, set(8, "draft")); at(70, set(9, "draft")); at(70, set(10, "draft"));
  at(420, function () { set(8, "ink")(); set(9, "ink")(); set(10, "ink")(); });
  at(200, function () { if (tick) tick.classList.add("landed"); });

  var start = performance.now();
  var next = 0;
  function frame(now) {
    while (next < steps.length && now - start >= steps[next][0]) {
      steps[next][1]();
      next++;
    }
    if (next < steps.length) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
