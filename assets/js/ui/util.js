/*!
 * util.js — pembantu antarmuka: format angka, notifikasi, tema, unduhan, CSV
 */
(function (root) {
  'use strict';
  const Oxy = root.Oxy;

  const nf0 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf3 = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  const fmt = {
    int: (v) => nf0.format(Number.isFinite(v) ? v : 0),
    dec: (v, d) => (d === 1 ? nf1 : d === 2 ? nf2 : d === 3 ? nf3 : nf0).format(Number.isFinite(v) ? v : 0),
    pct: (v, d) => nf1.format((Number.isFinite(v) ? v : 0) * 100) + '%',
    km: (v) => nf0.format(Number.isFinite(v) ? v : 0) + ' km',
    jam: (v) => nf1.format(Number.isFinite(v) ? v : 0) + ' jam',
    rp: (v) => 'Rp ' + nf0.format(Number.isFinite(v) ? v : 0),
    skor: (v) => nf3.format(Number.isFinite(v) ? v : 0),
    signed: (v, suffix) => (v > 0 ? '+' : v < 0 ? '−' : '') + nf1.format(Math.abs(v)) + (suffix || '')
  };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function debounce(fn, ms) {
    let t;
    return function () {
      const args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(ctx, args), ms);
    };
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function downloadDataUrl(dataUrl, filename) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function stamp(d) {
    const x = d || new Date();
    const p = (n) => String(n).padStart(2, '0');
    return x.getFullYear() + p(x.getMonth() + 1) + p(x.getDate()) + '-' + p(x.getHours()) + p(x.getMinutes());
  }

  function todayLong() {
    try {
      return new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  /* ---------- Notifikasi ---------- */
  let toastTimer = null;
  function toast(message, kind) {
    const host = document.getElementById('toasts');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast' + (kind === 'error' ? ' err' : '');
    const icon = kind === 'error'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16v.01"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 12.5 5 5L20 6.5"/></svg>';
    el.innerHTML = icon + '<span>' + esc(message) + '</span>';
    host.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.style.transition = 'opacity .2s ease, transform .2s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateY(6px)';
      setTimeout(() => el.remove(), 220);
    }, 3200);
  }

  /* ---------- Overlay proses ---------- */
  function overlay(show, text) {
    const el = document.getElementById('overlay');
    if (!el) return;
    if (text) document.getElementById('overlayText').textContent = text;
    el.hidden = !show;
  }

  /* ---------- Tema ---------- */
  const THEME_KEY = 'oxy.theme';
  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'auto';
  }
  function applyTheme(mode) {
    if (mode === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', mode);
    try { localStorage.setItem(THEME_KEY, mode); } catch (e) { /* mode privat */ }
    const btn = document.getElementById('themeToggle');
    if (btn) btn.title = 'Tema: ' + (mode === 'auto' ? 'mengikuti sistem' : mode === 'dark' ? 'gelap' : 'terang');
    document.dispatchEvent(new CustomEvent('oxy:theme', { detail: { mode } }));
  }
  function initTheme() {
    let saved = 'auto';
    try { saved = localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) { /* abaikan */ }
    applyTheme(saved);
  }
  function cycleTheme() {
    const order = ['auto', 'light', 'dark'];
    const next = order[(order.indexOf(currentTheme()) + 1) % order.length];
    applyTheme(next);
    toast('Tema: ' + (next === 'auto' ? 'mengikuti sistem' : next === 'dark' ? 'gelap' : 'terang'));
  }

  /* ---------- CSV ---------- */
  function parseCSV(text) {
    const clean = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < clean.length; i++) {
      const c = clean[i];
      if (quoted) {
        if (c === '"') {
          if (clean[i + 1] === '"') { field += '"'; i++; }
          else quoted = false;
        } else field += c;
      } else if (c === '"') {
        quoted = true;
      } else if (c === ',' || c === ';') {
        row.push(field); field = '';
      } else if (c === '\n') {
        row.push(field); rows.push(row); row = []; field = '';
      } else field += c;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
  }

  function toCSV(rows) {
    const cell = (v) => {
      const s = v == null ? '' : String(v);
      return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return '\uFEFF' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
  }

  /** Membaca berkas CSV fasilitas dengan pemetaan kolom yang toleran. */
  function facilitiesFromCSV(text) {
    const rows = parseCSV(text);
    if (rows.length < 2) throw new Error('Berkas CSV tidak memuat baris data.');
    const head = rows[0].map((h) => String(h).trim().toLowerCase());
    const find = (...names) => {
      for (const n of names) {
        const i = head.findIndex((h) => h === n || h.replace(/[^a-z]/g, '') === n.replace(/[^a-z]/g, ''));
        if (i >= 0) return i;
      }
      return -1;
    };
    const idx = {
      nama: find('nama', 'fasilitas', 'name', 'faskes', 'nama fasilitas'),
      pos: find('pos', 'posisi', 'posisi km', 'km', 'jarak'),
      max: find('max', 'maks', 'kebutuhan maksimum', 'kapasitas'),
      alokasi: find('alokasi', 'alloc', 'allocation', 'sudah dialokasikan'),
      minta: find('minta', 'request', 'permintaan'),
      kritis: find('kritis', 'pasien kritis', 'pasien'),
      jam: find('jam', 'cadangan', 'cadangan jam', 'cadangan oksigen', 'sisa cadangan'),
      masuk: find('masuk', 'urutan masuk', 'urutan', 'order')
    };
    if (idx.nama < 0) throw new Error('Kolom "nama" tidak ditemukan pada berkas CSV.');
    const out = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const get = (k) => (idx[k] >= 0 && row[idx[k]] != null ? String(row[idx[k]]).trim() : '');
      const name = get('nama');
      if (!name) continue;
      out.push({
        nama: name,
        pos: Number(get('pos').replace(',', '.')) || 0,
        max: Number(get('max').replace(',', '.')) || 0,
        alokasi: Number(get('alokasi').replace(',', '.')) || 0,
        minta: Number(get('minta').replace(',', '.')) || 0,
        kritis: Number(get('kritis').replace(',', '.')) || 0,
        jam: Number(get('jam').replace(',', '.')) || 0,
        masuk: Number(get('masuk').replace(',', '.')) || (out.length + 1)
      });
    }
    if (!out.length) throw new Error('Tidak ada baris fasilitas yang dapat dibaca.');
    return out;
  }

  /* ---------- Ikon ---------- */
  const icon = {
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4.5v15l14-7.5-14-7.5Z"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v9"/><path d="M12 16.5v.01"/><path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 12.5 5 5L20 6.5"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
  };

  root.UI = { fmt, esc, clamp, debounce, downloadBlob, downloadDataUrl, stamp, todayLong, toast, overlay, theme: { init: initTheme, apply: applyTheme, cycle: cycleTheme, current: currentTheme }, parseCSV, toCSV, facilitiesFromCSV, icon };
})(typeof globalThis !== 'undefined' ? globalThis : this);
