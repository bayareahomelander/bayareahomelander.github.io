// Datasheet cross-reference: hovering or focusing a pin in the Pin Configuration diagram
// highlights its row in the Pin Functions table, and the reverse. The table is the
// accessible source (its links are the tab stops); the diagram is aria-hidden and its
// pins are not in the tab order.
(() => {
  const root = document.querySelector("[data-pins]");
  if (!root) return;
  const parts = [...root.querySelectorAll("[data-pin]")];
  const pinOf = (node) => {
    const el = node && node.closest ? node.closest("[data-pin]") : null;
    return el && root.contains(el) ? el.dataset.pin : null;
  };

  let hovered = null;
  let focused = null;
  const paint = () => {
    const n = hovered || focused;
    parts.forEach((p) => p.toggleAttribute("data-on", p.dataset.pin === n));
  };

  root.addEventListener("pointerover", (e) => { hovered = pinOf(e.target); paint(); });
  root.addEventListener("pointerout", (e) => { hovered = pinOf(e.relatedTarget); paint(); });
  root.addEventListener("focusin", (e) => { focused = pinOf(e.target); paint(); });
  root.addEventListener("focusout", (e) => { focused = pinOf(e.relatedTarget); paint(); });
})();
