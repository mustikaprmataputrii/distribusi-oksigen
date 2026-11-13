/*!
 * charts.js — grafik SVG tanpa dependensi
 * Warna dibaca dari token CSS lalu ditulis sebagai nilai literal agar hasil
 * render tetap benar saat diekspor ke PNG/PDF (html2canvas tidak membaca var()).
 */
(function (root) {
  'use strict';
  const UI = root.UI;
  const esc = UI.esc;
  const fmt = UI.fmt;

  let uid = 0;
  const nextId = (p) => p + '-' + (++uid);

  function palette() {
    const cs = getComputedStyle(document.documentElement);
    const get = (name, fallback) => {
      const v = cs.getPropertyValue(name).trim();
      return v || fallback;
    };
    return {
      ink: get('--ink', '#131c1a'),
      ink2: get('--ink-2', '#3c4a47'),
      muted: get('--muted', '#6a7875'),
      faint: get('--faint', '#8d9a97'),
      line: get('--line', '#e2e0d7'),
      line2: get('--line-2', '#d3d1c6'),
      surface: get('--surface', '#fffefb'),
      surface2: get('--surface-2', '#faf9f5'),
      accent: get('--accent', '#0d5b51'),
      accentSoft: get('--accent-soft', '#e4efec'),
      warn: get('--warn', '#8a5a08'),
      warnSoft: get('--warn-soft', '#f7eeda'),
      danger: get('--danger', '#97281d'),
      dangerSoft: get('--danger-soft', '#f8e5e1'),
      ok: get('--ok', '#14603c'),
      info: get('--info', '#2a5570')
    };
  }

  const font = (weight, size) => weight + ' ' + size + 'px "Segoe UI", system-ui, -apple-system, sans-serif';

  /* ==================================================================== *
   * Diagram koridor + rute
   * Rute digambar sebagai jalur bertingkat: setiap perjalanan menempati
   * lajur sendiri sehingga arah dan urutan kunjungan terbaca jelas.
   * ==================================================================== */
  function routeDiagram(opts) {
    const p = palette();
    const depot = Number(opts.depot) || 0;
    const points = (opts.points || []).slice();
    const end = Math.max(Number(opts.corridorEnd) || 0, depot, ...points, 1);
    const compact = !!opts.compact;
    const W = 880, padL = 34, padR = 34;
    const x = (v) => padL + (v / end) * (W - padL - padR);

    // hitung lajur tiap perjalanan
    const legs = [];
    let prev = depot;
    points.forEach((v) => {
      if (v !== prev) legs.push({ a: prev, b: v });
      prev = v;
    });
    const laneOf = (i) => (i % 2 === 0 ? -1 : 1) * (11 + Math.floor(i / 2) * 12);
    const maxLane = legs.length ? Math.max(...legs.map((_, i) => Math.abs(laneOf(i)))) : 11;
    const axisY = 26 + maxLane + (compact ? 10 : 16);
    const H = axisY + (compact ? 44 : 52);

    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opts.aria || 'Diagram koridor dan rute') + '">';
    const markId = nextId('arr');
    s += '<defs><marker id="' + markId + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">'
      + '<path d="M0 0 L10 5 L0 10 Z" fill="' + p.accent + '"/></marker></defs>';

    // garis koridor
    s += '<line x1="' + padL + '" y1="' + axisY + '" x2="' + (W - padR) + '" y2="' + axisY + '" stroke="' + p.line2 + '" stroke-width="1.5" stroke-linecap="round"/>';

    // skala
    const ticks = niceTicks(0, end, compact ? 4 : 5);
    ticks.forEach((t, i) => {
      s += '<line x1="' + x(t) + '" y1="' + (axisY - 4) + '" x2="' + x(t) + '" y2="' + (axisY + 4) + '" stroke="' + p.line2 + '" stroke-width="1"/>';
      s += '<text x="' + x(t) + '" y="' + (axisY + 19) + '" text-anchor="middle" fill="' + p.faint + '" style="font:' + font(500, 8.5) + '">'
        + t + (i === ticks.length - 1 ? ' km' : '') + '</text>';
    });

    // jalur rute per perjalanan
    legs.forEach((leg, i) => {
      const laneY = axisY + laneOf(i);
      const xa = x(leg.a), xb = x(leg.b);
      const dir = xb > xa ? 1 : -1;
      const xbAdj = xb - dir * 6;
      s += '<path d="M' + xa + ' ' + axisY + ' L' + xa + ' ' + laneY + ' L' + xbAdj + ' ' + laneY + '" fill="none" stroke="' + p.accent
        + '" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round" marker-end="url(#' + markId + ')"/>';
      s += '<circle cx="' + xa + '" cy="' + laneY + '" r="1.8" fill="' + p.accent + '"/>';
    });

    // fasilitas + nomor urut kunjungan (label di bawah sumbu, depot di atas)
    const seen = new Map();
    points.forEach((v, i) => {
      if (!seen.has(v)) seen.set(v, i + 1);
    });
    const placed = [];
    seen.forEach((order, v) => {
      const cx = x(v);
      s += '<circle cx="' + cx + '" cy="' + axisY + '" r="4" fill="' + p.surface + '" stroke="' + p.ink + '" stroke-width="1.4"/>';
      const collide = placed.some((px) => Math.abs(px - cx) < 30);
      placed.push(cx);
      if (!collide) {
        s += '<text x="' + cx + '" y="' + (axisY + 34) + '" text-anchor="middle" fill="' + p.ink + '" style="font:' + font(600, 8.5) + '">' + v + ' km</text>';
        if (!compact) {
          s += '<text x="' + cx + '" y="' + (axisY + 45) + '" text-anchor="middle" fill="' + p.faint + '" style="font:' + font(500, 7.5) + '">kunjungan #' + order + '</text>';
        }
      }
    });

    // depot digambar terakhir agar menimpa garis
    s += '<rect x="' + (x(depot) - 4.5) + '" y="' + (axisY - 4.5) + '" width="9" height="9" rx="1.5" fill="' + p.accent + '"/>';
    s += '<text x="' + x(depot) + '" y="' + (axisY - 11) + '" text-anchor="middle" fill="' + p.accent + '" style="font:' + font(600, 8.5) + '">DEPOT</text>';

    s += '</svg>';
    return s;
  }

  /* ==================================================================== *
   * Grafik garis (mis. episode vs τ)
   * ==================================================================== */
  function lineChart(opts) {
    const p = palette();
    const cats = opts.categories || [];
    const series = opts.series || [];
    const W = 720, H = opts.height || 260;
    const m = { t: 16, r: 18, b: 40, l: 42 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const maxV = Math.max(1, ...series.flatMap((s) => s.values.filter((v) => v != null)));
    const yMax = Math.max(opts.yMax || 0, niceMax(maxV));
    const x = (i) => m.l + (cats.length <= 1 ? iw / 2 : (i / (cats.length - 1)) * iw);
    const y = (v) => m.t + ih - (v / yMax) * ih;

    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opts.aria || 'Grafik garis') + '">';

    const yTicks = niceTicks(0, yMax, 4);
    yTicks.forEach((t) => {
      s += '<line class="grid-line" x1="' + m.l + '" y1="' + y(t) + '" x2="' + (W - m.r) + '" y2="' + y(t) + '" stroke="' + p.line + '" stroke-width="1"/>';
      s += '<text x="' + (m.l - 8) + '" y="' + (y(t) + 3.5) + '" text-anchor="end" fill="' + p.faint + '" style="font:' + font(500, 9.5) + '">' + fmt.int(t) + '</text>';
    });

    s += '<line x1="' + m.l + '" y1="' + (m.t + ih) + '" x2="' + (W - m.r) + '" y2="' + (m.t + ih) + '" stroke="' + p.line2 + '" stroke-width="1"/>';

    cats.forEach((c, i) => {
      s += '<text x="' + x(i) + '" y="' + (m.t + ih + 20) + '" text-anchor="middle" fill="' + p.faint + '" style="font:' + font(500, 10) + '">' + esc(c) + '</text>';
    });
    if (opts.xTitle) {
      s += '<text x="' + (m.l + iw / 2) + '" y="' + (H - 4) + '" text-anchor="middle" fill="' + p.faint + '" style="font:' + font(600, 9) + ';letter-spacing:.08em">' + esc(opts.xTitle) + '</text>';
    }
    if (opts.yTitle) {
      s += '<text x="' + m.l + '" y="' + (m.t - 4) + '" fill="' + p.faint + '" style="font:' + font(600, 9) + ';letter-spacing:.08em">' + esc(opts.yTitle) + '</text>';
    }

    series.forEach((ser, si) => {
      const color = ser.color || (si === 0 ? p.accent : si === 1 ? p.warn : p.faint);
      const dash = ser.dashed ? ' stroke-dasharray="5 4"' : '';
      const pts = ser.values.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean);
      if (!pts.length) return;
      if (ser.area) {
        const areaId = nextId('ar');
        s += '<defs><linearGradient id="' + areaId + '" x1="0" y1="0" x2="0" y2="1">'
          + '<stop offset="0%" stop-color="' + color + '" stop-opacity="0.16"/>'
          + '<stop offset="100%" stop-color="' + color + '" stop-opacity="0"/>'
          + '</linearGradient></defs>';
        s += '<path d="M' + pts[0][0] + ' ' + (m.t + ih) + ' L' + pts.map((q) => q[0] + ' ' + q[1]).join(' L') + ' L' + pts[pts.length - 1][0] + ' ' + (m.t + ih) + ' Z" fill="url(#' + areaId + ')"/>';
      }
      s += '<path d="M' + pts.map((q) => q[0] + ' ' + q[1]).join(' L') + '" fill="none" stroke="' + color + '" stroke-width="' + (ser.width || 2) + '" stroke-linejoin="round" stroke-linecap="round"' + dash + '/>';
      ser.values.forEach((v, i) => {
        if (v == null) return;
        s += '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="3.6" fill="' + p.surface + '" stroke="' + color + '" stroke-width="2"/>';
        if (opts.showValues !== false) {
          s += '<text x="' + x(i) + '" y="' + (y(v) - 9) + '" text-anchor="middle" fill="' + p.ink + '" style="font:' + font(600, 10) + '">' + fmt.int(v) + '</text>';
        }
      });
    });

    // penanda deadlock
    (opts.markers || []).forEach((mk) => {
      const i = cats.indexOf(mk.category);
      if (i < 0) return;
      s += '<line x1="' + x(i) + '" y1="' + m.t + '" x2="' + x(i) + '" y2="' + (m.t + ih) + '" stroke="' + p.danger + '" stroke-width="1" stroke-dasharray="3 3"/>';
      s += '<text x="' + (x(i) + 4) + '" y="' + (m.t + 10) + '" fill="' + p.danger + '" style="font:' + font(600, 9) + '">' + esc(mk.label) + '</text>';
    });

    s += '</svg>';
    return s;
  }

  /* ==================================================================== *
   * Grafik batang horizontal
   * ==================================================================== */
  function barChart(opts) {
    const p = palette();
    const items = opts.items || [];
    const W = 720;
    const rowH = opts.rowH || 34;
    const H = Math.max(60, items.length * rowH + 26);
    const labelW = opts.labelW || 150;
    const valueW = 84;
    const iw = W - labelW - valueW - 12;
    const maxV = Math.max(1, ...items.map((it) => it.value));
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opts.aria || 'Grafik batang') + '">';

    items.forEach((it, i) => {
      const yy = i * rowH + 8;
      const bh = Math.min(20, rowH - 14);
      const color = it.color || (it.highlight ? p.accent : p.line2);
      const w = Math.max(2, (it.value / maxV) * iw);
      s += '<text x="0" y="' + (yy + bh / 2 + 4) + '" fill="' + (it.highlight ? p.ink : p.ink2) + '" style="font:' + font(it.highlight ? 600 : 500, 11.5) + '">' + esc(it.label) + '</text>';
      s += '<rect x="' + labelW + '" y="' + yy + '" width="' + iw + '" height="' + bh + '" rx="3" fill="' + p.surface2 + '"/>';
      s += '<rect x="' + labelW + '" y="' + yy + '" width="' + w + '" height="' + bh + '" rx="3" fill="' + color + '"/>';
      s += '<text x="' + (labelW + iw + valueW - 4) + '" y="' + (yy + bh / 2 + 4) + '" text-anchor="end" fill="' + p.ink + '" style="font:' + font(600, 11) + '">' + esc(it.display != null ? it.display : fmt.int(it.value)) + '</text>';
      if (it.note) {
        s += '<text x="' + (labelW + 2) + '" y="' + (yy + bh + 9) + '" fill="' + p.faint + '" style="font:' + font(400, 9.5) + '">' + esc(it.note) + '</text>';
      }
    });

    s += '</svg>';
    return s;
  }

  /* ==================================================================== *
   * Batang bertumpuk untuk pemenuhan (diberikan vs tidak)
   * ==================================================================== */
  function stackBar(opts) {
    const p = palette();
    const parts = opts.parts || [];
    const total = Math.max(1, parts.reduce((a, b) => a + b.value, 0));
    const W = 720, H = 44;
    let x = 0;
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opts.aria || 'Komposisi') + '">';
    parts.forEach((pt) => {
      const w = (pt.value / total) * W;
      if (w > 0) {
        s += '<rect x="' + x + '" y="10" width="' + Math.max(0, w - 1) + '" height="16" rx="3" fill="' + pt.color + '"/>';
      }
      x += w;
    });
    x = 0;
    parts.forEach((pt) => {
      const w = (pt.value / total) * W;
      if (w > 54) {
        s += '<text x="' + (x + 7) + '" y="' + (H - 6) + '" fill="' + p.muted + '" style="font:' + font(500, 10) + '">' + esc(pt.label) + ' · ' + fmt.int(pt.value) + '</text>';
      }
      x += w;
    });
    s += '</svg>';
    return s;
  }

  /* ==================================================================== *
   * Pembantu skala
   * ==================================================================== */
  function niceMax(v) {
    if (v <= 0) return 1;
    const exp = Math.floor(Math.log10(v));
    const base = Math.pow(10, exp);
    const f = v / base;
    const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return step * base;
  }

  function niceTicks(min, max, count) {
    const span = max - min || 1;
    const rough = span / count;
    const exp = Math.floor(Math.log10(rough));
    const base = Math.pow(10, exp);
    const f = rough / base;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * base;
    const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
    return out;
  }

  root.Charts = { palette, routeDiagram, lineChart, barChart, stackBar, niceTicks };
})(typeof globalThis !== 'undefined' ? globalThis : this);
