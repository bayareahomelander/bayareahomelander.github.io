// GoatCounter: page views come from count.js (loaded in each page's head).
// This adds click events for actions worth knowing about: the resume PDF,
// outbound links (GitHub, Medium, the Onyx repo), and email.
(() => {
  const eventFor = (a) => {
    const href = a.getAttribute("href") || "";
    if (href.endsWith(".pdf")) return "download-resume-pdf";
    if (href.startsWith("mailto:")) return "click-email";
    if (/github\.com\/bayareahomelander\/Onyx/.test(href)) return "click-onyx-repo";
    if (href.includes("github.com")) return "click-github";
    if (href.includes("medium.com/@pacosun/")) return "click-medium-article";
    if (href.includes("medium.com")) return "click-medium";
    return null;
  };

  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a || !window.goatcounter || !window.goatcounter.count) return;
    const name = eventFor(a);
    if (!name) return;
    window.goatcounter.count({ path: name, title: a.textContent.trim().slice(0, 80), event: true });
  });
})();
