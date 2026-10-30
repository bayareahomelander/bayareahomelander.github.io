(() => {
  'use strict';
  const root = document.getElementById('tmap');
  if (!root) return;
  const panel = document.getElementById('tmap-panel');
  const side = root.querySelector('.tmap-side');
  const items = [...root.querySelectorAll('.tmap-list > li[data-i]')];
  const articles = [...document.querySelectorAll('table.articles tbody tr')].map((li) => ({
    href: li.querySelector('a.t').href,
    title: li.querySelector('a.t').textContent.trim(),
    desc: li.querySelector('.d').textContent.trim(),
  }));
  if (articles.length < items.length) return;

  const NS = 'http://www.w3.org/2000/svg';
  const TOKENS = ['The', ' cat', ' sat', ' on', ' the'];
  const IDS = [464, 3797, 3332, 319, 262];
  const NAMES = ['The whole path', 'Text → tokens', 'Token IDs → embeddings', 'Adding position',
    'Attention scores and causal mask', 'Queries, keys, values', 'Multiple heads',
    'Residual, layer norm, feed-forward', 'Final state → logits → softmax', 'Sampling the next token'];

  // Deterministic pseudo-random value in [0, 1) from integers.
  const h = (a, b, c) => {
    let x = Math.imul(a + 1, 73856093) ^ Math.imul(b + 1, 19349663) ^ Math.imul(c + 1, 83492791);
    x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
    x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
    return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
  };

  const svg = (w, hgt, inner, label) =>
    `<svg viewBox="0 0 ${w} ${hgt}" role="img" aria-label="${label}">${inner}</svg>`;
  const r = (x, y, w, hh, cls, op) =>
    `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${hh}"${op === undefined ? '' : ` fill-opacity="${op.toFixed(3)}"`}/>`;
  const t = (x, y, s, extra = '') => `<text x="${x}" y="${y}" ${extra}>${s}</text>`;
  const arrow = (x1, y, x2) =>
    `<path class="arrow" d="M${x1} ${y}H${x2}M${x2 - 4} ${y - 3}L${x2} ${y}L${x2 - 4} ${y + 3}"/>`;

  // Row-normalised causal attention weights, seed s.
  const attn = (s) => {
    const m = [];
    for (let i = 0; i < 5; i++) {
      const row = [];
      let sum = 0;
      for (let j = 0; j <= i; j++) { const v = 0.15 + h(i, j, s) + (j === i ? 0.35 : 0); row.push(v); sum += v; }
      m.push(row.map((v) => v / sum));
    }
    return m;
  };
  const heat = (m, x0, y0, c, causal) => {
    let o = '';
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      if (j <= i) o += r(x0 + j * c, y0 + i * c, c - 2, c - 2, 'cell', 0.08 + 0.92 * Math.min(1, m[i][j] * 1.6));
      else if (causal) o += r(x0 + j * c, y0 + i * c, c - 2, c - 2, 'void');
    }
    return o;
  };
  // Five thin strips, each standing for one 4096-d vector (48 cells shown).
  const strips = (x0, y0, w, seed, labels) => {
    const n = 48, cw = w / n;
    let o = '';
    for (let i = 0; i < 5; i++) {
      if (labels) o += t(x0 - 6, y0 + i * 16 + 9, TOKENS[i].trim(), 'text-anchor="end"');
      for (let j = 0; j < n; j++) o += r(x0 + j * cw, y0 + i * 16, cw + 0.3, 12, 'cell', 0.1 + 0.9 * h(i, j, seed));
    }
    return o;
  };
  const matrix = (x0, y0, rows, cols, c, seed) => {
    let o = '';
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++)
      o += r(x0 + j * c, y0 + i * c, c - 2, c - 2, 'cell', 0.1 + 0.9 * h(i, j, seed));
    return o;
  };

  const cap = (txt) => `<figcaption><span class="ill">Illustration.</span> ${txt}</figcaption>`;

  const visuals = [
    // 0 overview
    () => {
      let o = '';
      const lab = ['tok', 'emb', 'pos', 'attn', 'qkv', 'heads', 'block', 'logits', 'sample'];
      const w = 40, g = 8;
      lab.forEach((l, i) => {
        const x = i * (w + g) + 2;
        o += `<rect class="box" x="${x}" y="30" width="${w}" height="34" rx="5"/>` + t(x + w / 2, 51, l, 'text-anchor="middle" class="strong"');
        if (i < lab.length - 1) o += arrow(x + w + 1, 47, x + w + g - 1);
      });
      o += t(2, 14, 'The cat sat on the') + t(2, 92, 'the next token');
      return { html: svg(450, 100, o, 'The prompt passes through nine stages to the next token'),
        cap: cap('The nine stages below, in order, from prompt to the next token.') };
    },
    // 1 tokens (real)
    () => ({
      html: `<div class="chips" role="img" aria-label="Tokens The, cat, sat, on, the with IDs 464, 3797, 3332, 319, 262">${
        TOKENS.map((k, i) => `<div class="chip"><code>${k.startsWith(' ') ? '<i>&middot;</i>' + k.slice(1) : k}</code><span>${IDS[i]}</span></div>`).join('')}</div>` +
        `<p class="ids-line">[${IDS.join(', ')}]</p>`,
      cap: `<figcaption>Real GPT-2 tokens and IDs for the running example. A dot marks a leading space, which belongs to the token.</figcaption>`,
    }),
    // 2 embeddings
    () => ({
      html: svg(450, 100, strips(52, 8, 330, 1, true) + t(392, 50, '[5 × 4096]', 'class="strong"'), 'Five heat strips, one per token, forming a 5 by 4096 matrix'),
      cap: cap('The shape <code>[5 × 4096]</code> is real; the colours are placeholders, and each strip is cut to 48 cells.'),
    }),
    // 3 position
    () => {
      let o = strips(52, 8, 150, 1, true) + t(208, 50, '+', 'class="strong"');
      const n = 24, cw = 150 / n;
      for (let i = 0; i < 5; i++) for (let j = 0; j < n; j++) {
        const v = 0.5 + 0.5 * Math.sin((i + 1) * (j + 1) * 0.22);
        o += r(222 + j * cw, 8 + i * 16, cw + 0.3, 12, 'gray', 0.12 + 0.88 * v);
      }
      o += t(222, 98, 'position pattern') + t(52, 98, 'embeddings');
      return { html: svg(450, 106, o, 'Embedding strips plus a position pattern'),
        cap: cap('Each position adds its own pattern to the token vector. Values are not from a real model.') };
    },
    // 4 attention
    () => {
      const c = 22; let o = heat(attn(3), 52, 8, c, true);
      for (let i = 0; i < 5; i++) { o += t(46, 8 + i * c + 14, TOKENS[i].trim(), 'text-anchor="end"'); }
      o += t(52 + 5 * c + 14, 40, 'Each token attends') + t(52 + 5 * c + 14, 54, 'only to itself and') + t(52 + 5 * c + 14, 68, 'earlier tokens.');
      return { html: svg(450, 124, o, 'A five by five lower-triangular attention heatmap'),
        cap: cap('Dashed cells are masked: no token sees the future. Weights are made up, not from a model.') };
    },
    // 5 QKV
    () => {
      const c = 14; let o = '';
      o += matrix(2, 8, 5, 4, c, 11) + t(2, 108, 'input');
      const xs = [118, 214, 310];
      ['Q', 'K', 'V'].forEach((l, k) => {
        o += `<path class="arrow" d="M30 80V92H${xs[k] + 26}V82M${xs[k] + 23} 85L${xs[k] + 26} 82L${xs[k] + 29} 85"/>` + matrix(xs[k], 8, 5, 4, c, 21 + k) + t(xs[k], 108, l, 'class="strong"');
      });
      return { html: svg(450, 114, o, 'One input matrix projected into query, key and value matrices'),
        cap: cap('One input, three learned projections. The small matrices are schematic.') };
    },
    // 6 heads
    () => {
      const c = 20; let o = heat(attn(5), 2, 8, c, true) + heat(attn(9), 130, 8, c, true);
      o += t(2, 126, 'head A') + t(130, 126, 'head B');
      return { html: svg(450, 134, o, 'Two different five by five attention heatmaps side by side'),
        cap: cap('Two heads look at the same tokens and weight them differently. Weights are made up.') };
    },
    // 7 block
    () => {
      const labs = ['Residual add', 'Layer norm', 'Feed-forward'];
      let o = '';
      labs.forEach((l, i) => {
        const x = i * 146 + 2;
        o += `<rect class="box" x="${x}" y="22" width="118" height="38" rx="6"/>` + t(x + 59, 45, l, 'text-anchor="middle" class="strong"');
        if (i < 2) o += arrow(x + 120, 41, x + 144);
      });
      o += `<path class="arrow" d="M60 22V8H354V22"/>` + t(207, 5, 'skip connection', 'text-anchor="middle"');
      return { html: svg(450, 92, o, 'Flow: residual add, then layer norm, then feed-forward'),
        cap: cap('The second half of the block. Boxes are schematic; no values are shown.') };
    },
    // 8 logits
    () => {
      const cand = [[' mat', 0.46], [' floor', 0.21], [' couch', 0.13], [' bed', 0.09], [' chair', 0.06]];
      let o = '';
      cand.forEach(([k, p], i) => {
        const y = 4 + i * 20;
        o += t(70, y + 11, k.trim(), 'text-anchor="end"' + (i === 0 ? ' class="strong"' : ''));
        o += r(78, y, 300, 14, 'barbase') + `<rect class="${i === 0 ? 'cell' : 'gray'}" x="78" y="${y}" width="${(300 * p / 0.5).toFixed(1)}" height="14"/>`;
        o += t(78 + 300 * p / 0.5 + 6, y + 11, p.toFixed(2));
      });
      return { html: svg(450, 108, o, 'Bars of candidate next tokens, with mat the highest'),
        cap: cap('Candidate next tokens after the final softmax. Probabilities are made up.') };
    },
    // 9 sampling
    () => {
      const toks = ['mat', 'floor', 'couch', 'bed', 'chair'];
      const base = [0.46, 0.21, 0.13, 0.09, 0.06];
      const norm = (a) => { const z = a.reduce((x, y) => x + y, 0); return a.map((v) => v / z); };
      const p = norm(base);
      const temp = norm(p.map((v) => v ** (1 / 1.5)));
      const topk = norm(p.map((v, i) => (i < 3 ? v : 0)));
      let acc = 0;
      const topp = norm(p.map((v) => { const keep = acc < 0.7; acc += v; return keep ? v : 0; }));
      const greedy = p.map((v, i) => (i === 0 ? 1 : 0));
      const cols = [['greedy', greedy], ['temp 1.5', temp], ['top-k 3', topk], ['top-p 0.7', topp]];
      let o = '';
      toks.forEach((k, i) => { o += t(40, 24 + i * 16 + 9, k, 'text-anchor="end"' + (i === 0 ? ' class="strong"' : '')); });
      cols.forEach(([label, d], c) => {
        const x = 48 + c * 100;
        o += t(x, 12, label, 'class="strong"');
        d.forEach((v, i) => {
          const y = 24 + i * 16;
          o += r(x, y, 88, 11, 'barbase');
          if (v > 0) o += `<rect class="${i === 0 ? 'cell' : 'gray'}" x="${x}" y="${y}" width="${(88 * v).toFixed(1)}" height="11"/>`;
        });
      });
      return { html: svg(450, 108, o, 'One distribution reshaped four ways: greedy, temperature, top-k and top-p'),
        cap: cap('The same five candidates under four decoding rules, before the random draw. Probabilities are made up.') };
    },
  ];

  let current = -1;
  const mq = window.matchMedia('(max-width: 800px)');

  const place = () => {
    const li = items[current];
    if (mq.matches && li) li.appendChild(panel); else side.appendChild(panel);
  };

  const select = (i, opts = {}) => {
    if (i === current) return;
    current = i;
    const a = articles[i];
    const v = visuals[i]();
    const isOv = i === 0;
    panel.innerHTML =
      `<h3><span class="num"><span class="sr-only">Article </span>${String(i + 1).padStart(2, '0')}</span> <span>${NAMES[i]}</span>${isOv ? '<span class="sr-only"> (overview)</span>' : ''}</h3>` +
      `<p class="art">${a.title}</p><p class="desc">${a.desc}</p>` +
      `<p class="read"><a href="${a.href}">Read article</a></p>` +
      `<figure class="viz" style="margin-bottom:0"><div class="viz-box">${v.html}</div>${v.cap}</figure>`;
    items.forEach((li, k) => {
      const on = k === i;
      li.classList.toggle('is-active', on);
      li.querySelector('.node').setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    place();
  };

  items.forEach((li, i) => {
    const btn = li.querySelector('.node');
    btn.addEventListener('click', () => select(i));
    btn.addEventListener('focus', () => select(i));
    li.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && !mq.matches) select(i); });
  });
  mq.addEventListener('change', place);

  select(1);
})();
