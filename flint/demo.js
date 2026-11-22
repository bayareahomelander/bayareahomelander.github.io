(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";

  /* ---------------- Inside one GEMM: a stepper ---------------- */
  var gemm = document.querySelector("[data-gemm]");
  if (gemm) {
    var svg = gemm.querySelector("[data-svg]");
    var stage = gemm.querySelector("[data-stage]");
    var status = gemm.querySelector("[data-status]");
    var stepLabel = gemm.querySelector("[data-step]");
    var back = gemm.querySelector("[data-back]");
    var next = gemm.querySelector("[data-next]");
    var reset = gemm.querySelector("[data-reset]");

    var CELL = 30, N = 8, SIZE = CELL * N;
    var A = { x: 40, y: 316 }, B = { x: 320, y: 36 }, C = { x: 320, y: 316 };
    var layer;

    function el(name, attrs, text) {
      var e = document.createElementNS(NS, name);
      for (var k in attrs) e.setAttribute(k, attrs[k]);
      if (text) e.textContent = text;
      layer.appendChild(e);
      return e;
    }
    function rect(x, y, w, h, cls, extra) {
      var a = { x: x, y: y, width: w, height: h, "class": cls };
      for (var k in extra || {}) a[k] = extra[k];
      return el("rect", a);
    }
    function grid(m) {
      var d = "";
      for (var i = 1; i < N; i++) {
        d += "M" + (m.x + i * CELL) + " " + m.y + "v" + SIZE;
        d += "M" + m.x + " " + (m.y + i * CELL) + "h" + SIZE;
      }
      el("path", { d: d, "class": "grid" });
      rect(m.x, m.y, SIZE, SIZE, "frame");
    }
    function label(x, y, name, dims) {
      var t = el("text", { x: x, y: y, "class": "label" });
      var b = document.createElementNS(NS, "tspan");
      b.setAttribute("class", "em");
      b.textContent = name + "  ";
      t.appendChild(b);
      t.appendChild(document.createTextNode(dims));
    }
    function cuts() {
      el("path", { d: "M" + (C.x + SIZE / 2) + " " + C.y + "v" + SIZE + "M" + C.x + " " + (C.y + SIZE / 2) + "h" + SIZE, "class": "cut" });
    }
    function kProgress(done, current) {
      el("text", { x: 40, y: 140, "class": "label" }, "K, in four slices");
      for (var i = 0; i < 4; i++) {
        var cls = i === current ? "hl" : i < done ? "acc" : "need";
        rect(40 + i * 58, 156, 48, 30, cls, i < done && i !== current ? { opacity: 0.85 } : null);
      }
    }
    function base() {
      grid(A); grid(B); grid(C);
      label(B.x, 24, "B", "K × N");
      label(A.x, 580, "A", "M × K");
      label(C.x, 580, "C", "M × N");
    }

    var STEPS = [
      {
        stage: "C = A × B",
        text: "Every element of C is a dot product: one row of A against one column of B, summed along K. For GPT-2’s MLP up-projection at 8,192 tokens, that is 8,192 × 3,072 outputs, each a sum of 768 products.",
        draw: function () {
          rect(A.x, A.y + 2 * CELL, SIZE, CELL, "hl");
          rect(B.x + 5 * CELL, B.y, CELL, SIZE, "hl");
          rect(C.x + 5 * CELL, C.y + 2 * CELL, CELL, CELL, "acc");
          el("text", { x: 40, y: 150, "class": "label" }, "C[i,j] = Σ A[i,k] · B[k,j]");
          el("text", { x: 40, y: 176, "class": "label" }, "summed over k");
        }
      },
      {
        stage: "One thread block, one tile of C",
        text: "Flint splits C into tiles and gives each tile to a thread block. To compute its tile, a block needs a band of rows from A and a band of columns from B, shown dashed.",
        draw: function () {
          cuts();
          rect(C.x, C.y, SIZE / 2, SIZE / 2, "hl");
          rect(A.x, A.y, SIZE, SIZE / 2, "need");
          rect(B.x, B.y, SIZE / 2, SIZE, "need");
        }
      }
    ];
    [0, 1, 2, 3].forEach(function (s) {
      STEPS.push({
        stage: "Walk along K: slice " + (s + 1) + " of 4",
        text: s === 0
          ? "The block walks along K one slice at a time. Each slice of A and B is copied from global memory into shared memory, where every warp in the block can reuse it."
          : s < 3
            ? "Next slice. The partial sums for the tile stay in registers, in FP32, and grow with every slice; nothing is written to C yet."
            : "Last slice. After it, every element of the tile holds its full dot product, still in registers.",
        draw: function () {
          cuts();
          if (s > 0) {
            rect(A.x, A.y, 2 * CELL * s, SIZE / 2, "done");
            rect(B.x, B.y, SIZE / 2, 2 * CELL * s, "done");
          }
          rect(C.x, C.y, SIZE / 2, SIZE / 2, "acc", { opacity: ((s + 1) / 4 * 0.85).toFixed(2) });
          rect(A.x + 2 * CELL * s, A.y, 2 * CELL, SIZE / 2, "hl");
          rect(B.x, B.y + 2 * CELL * s, SIZE / 2, 2 * CELL, "hl");
          kProgress(s, s);
        }
      });
    });
    STEPS.push({
      stage: "Warps and tensor cores",
      text: "Inside the block, warps split the tile. Each warp loads its fragments from shared memory with ldmatrix and multiplies them on the tensor cores with mma.sync: FP16 inputs, FP32 accumulation.",
      draw: function () {
        cuts();
        rect(C.x, C.y, SIZE / 2, SIZE / 2, "acc", { opacity: 0.85 });
        el("path", { d: "M" + (C.x + SIZE / 4) + " " + C.y + "v" + SIZE / 2 + "M" + C.x + " " + (C.y + SIZE / 4) + "h" + SIZE / 2, "class": "warp" });
        rect(C.x, C.y, SIZE / 4, SIZE / 4, "hl");
        el("text", { x: C.x, y: C.y - 12, "class": "stamp" }, "one warp");
        rect(A.x + 4 * CELL, A.y, 2 * CELL, CELL * 2, "hl");
        rect(B.x, B.y + 4 * CELL, CELL * 2, 2 * CELL, "hl");
        el("text", { x: 40, y: 150, "class": "label" }, "ldmatrix: load fragments");
        el("text", { x: 40, y: 176, "class": "label" }, "mma.sync: multiply them");
      }
    });
    STEPS.push({
      stage: "Epilogue, then one write",
      text: "When K is done the finished tile is still in registers. Flint applies the bias, GELU or residual add right there and writes C once. Unfused, a second kernel would read all of C back from memory and write it again.",
      draw: function () {
        cuts();
        rect(C.x, C.y, SIZE / 2, SIZE / 2, "acc");
        el("text", { x: C.x + 12, y: C.y + 66, "class": "on-ink" }, "+ bias, GELU");
        rect(C.x, C.y, SIZE / 2, SIZE / 2, "hl", { fill: "none" });
        el("text", { x: C.x, y: C.y - 12, "class": "stamp" }, "written once");
      }
    });

    var step = 0;
    function render() {
      while (svg.lastChild && svg.lastChild.nodeName !== "title") svg.removeChild(svg.lastChild);
      layer = document.createElementNS(NS, "g");
      svg.appendChild(layer);
      base();
      STEPS[step].draw();
      stage.textContent = STEPS[step].stage;
      status.textContent = STEPS[step].text;
      stepLabel.textContent = "Step " + (step + 1) + " of " + STEPS.length;
      back.disabled = step === 0;
      next.disabled = step === STEPS.length - 1;
    }
    back.addEventListener("click", function () { if (step > 0) { step--; render(); } });
    next.addEventListener("click", function () { if (step < STEPS.length - 1) { step++; render(); } });
    reset.addEventListener("click", function () { step = 0; render(); });
    render();
  }

  /* ---------------- Same numbers, same bits ---------------- */
  var sum = document.querySelector("[data-sum]");
  if (sum) {
    var f = Math.fround;
    var P = [3.1415927, -1234.5677, 0.00012207031, 98765.43, -45678.902, 7.0001, 0.33333334, -51853.1].map(f);
    var list = sum.querySelector("[data-partials]");
    var log = sum.querySelector("[data-log]");
    var sumStatus = sum.querySelector("[data-sum-status]");
    var runs = 0;
    var finishSums = [];
    var dv = new DataView(new ArrayBuffer(4));

    P.forEach(function (v, i) {
      var li = document.createElement("li");
      li.innerHTML = '<span class="k">Block ' + (i + 1) + "</span>";
      li.appendChild(document.createTextNode(v.toPrecision(8)));
      list.appendChild(li);
    });

    function add(order) {
      return order.reduce(function (acc, i) { return f(acc + P[i]); }, f(0));
    }
    function bits(x) {
      dv.setFloat32(0, x);
      return "0x" + ("00000000" + dv.getUint32(0).toString(16)).slice(-8);
    }
    var FIXED = add([0, 1, 2, 3, 4, 5, 6, 7]);
    var FIXED_TXT = FIXED.toPrecision(8);

    function marked(txt) {
      var i = 0;
      while (i < txt.length && txt[i] === FIXED_TXT[i]) i++;
      if (i === txt.length) return document.createTextNode(txt);
      var frag = document.createDocumentFragment();
      frag.appendChild(document.createTextNode(txt.slice(0, i)));
      var s = document.createElement("span");
      s.className = "diff";
      s.textContent = txt.slice(i);
      frag.appendChild(s);
      return frag;
    }

    function record(order, fixed) {
      runs++;
      var x = add(order);
      var tr = document.createElement("tr");
      if (fixed) tr.className = "fixed";
      var cells = [String(runs), order.map(function (i) { return i + 1; }).join(" ")];
      cells.forEach(function (c, j) {
        var td = document.createElement("td");
        if (j === 1) td.className = "order";
        td.textContent = j === 0 ? c + (fixed ? ", fixed" : "") : c;
        tr.appendChild(td);
      });
      var td = document.createElement("td");
      td.className = "num";
      td.appendChild(marked(x.toPrecision(8)));
      tr.appendChild(td);
      var tb = document.createElement("td");
      tb.className = "num";
      tb.textContent = bits(x);
      tr.appendChild(tb);
      log.insertBefore(tr, log.firstChild);
      while (log.children.length > 8) log.removeChild(log.lastChild);

      if (fixed) {
        sumStatus.textContent = "Fixed order: block 1 to block 8, every time. The sum is " + FIXED_TXT + ", bits " + bits(FIXED) + ", on every run.";
      } else {
        finishSums.push(x);
        var distinct = finishSums.filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
        sumStatus.textContent = finishSums.length + (finishSums.length === 1 ? " run" : " runs") + " in finish order gave " + distinct + (distinct === 1 ? " sum" : " different sums") + ". Underlined digits differ from the fixed-order sum.";
      }
    }

    sum.querySelector("[data-random]").addEventListener("click", function () {
      var o = [0, 1, 2, 3, 4, 5, 6, 7];
      for (var i = o.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = o[i]; o[i] = o[j]; o[j] = t;
      }
      record(o, false);
    });
    sum.querySelector("[data-fixed]").addEventListener("click", function () { record([0, 1, 2, 3, 4, 5, 6, 7], true); });
    sum.querySelector("[data-clear]").addEventListener("click", function () {
      log.textContent = "";
      runs = 0;
      finishSums = [];
      sumStatus.textContent = "Add them a few times in finish order, then in fixed order.";
    });
  }
})();
