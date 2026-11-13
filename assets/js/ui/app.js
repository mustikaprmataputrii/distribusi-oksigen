/*!
 * app.js — pengendali aplikasi: state, navigasi, penyuntingan, ekspor
 */
(function (root) {
  'use strict';
  const Oxy = root.Oxy;
  const UI = root.UI;
  const Views = root.Views;
  const Charts = root.Charts;
  const Exporters = root.Exporters;
  const fmt = UI.fmt;
  const esc = UI.esc;

  const STORAGE_KEY = 'oxy.simulasi.v1';

  const VIEW_META = {
    dashboard: { title: 'Dashboard', crumb: 'Ringkasan hasil simulasi' },
    data: { title: 'Data & parameter', crumb: 'Masukan dan pengaturan' },
    bankers: { title: 'Keputusan Banker\'s', crumb: 'Alokasi per permintaan' },
    rute: { title: 'Rute pengantaran', crumb: 'FCFS, SCAN, dan LOOK' },
    eskalasi: { title: 'Eskalasi', crumb: 'Tindak lanjut fasilitas tertunda' },
    multisiklus: { title: 'Multisiklus & τ', crumb: 'Turnaround tabung kosong' },
    skenario: { title: 'Skenario uji', crumb: 'Pengujian acak terkontrol' },
    ekspor: { title: 'Unduh hasil', crumb: 'PDF, Word, Excel, CSV, JSON, PNG' },
    metode: { title: 'Metode & batasan', crumb: 'Dokumentasi model' }
  };

  const EXPORT_LIST = [
    { id: 'pdf', label: 'Laporan PDF', hint: 'Ringkasan, tabel, dan grafik' },
    { id: 'docx', label: 'Dokumen Word', hint: 'Laporan yang dapat disunting' },
    { id: 'xlsx', label: 'Buku kerja Excel', hint: 'Satu lembar per bagian' },
    { id: 'csv', label: 'Data CSV', hint: 'Tabel untuk diolah lanjut' },
    { id: 'json', label: 'Data JSON', hint: 'Masukan dan hasil lengkap' },
    { id: 'png', label: 'Gambar PNG', hint: 'Tangkapan dashboard' }
  ];

  const state = {
    view: 'dashboard',
    form: {
      available: Oxy.DEFAULTS.available,
      depot: Oxy.DEFAULTS.depot,
      corridorEnd: Oxy.DEFAULTS.corridorEnd,
      w1: Oxy.DEFAULTS.w1,
      w2: Oxy.DEFAULTS.w2,
      order: Oxy.DEFAULTS.order,
      orderSiklus: Oxy.DEFAULTS.orderSiklus,
      tau: Oxy.DEFAULTS.tau,
      cycles: Oxy.DEFAULTS.cycles,
      cycleHours: Oxy.DEFAULTS.cycleHours,
      policy: Oxy.DEFAULTS.policy,
      scenarioCount: 12,
      scenarioSeed: 2026
    },
    facilities: [],
    batch: null,
    result: null,
    entered: false
  };

  /* ------------------------------------------------------------------ *
   * State
   * ------------------------------------------------------------------ */
  function cloneFacilities(list) {
    return list.map((f) => ({
      nama: f.nama, pos: f.pos, max: f.max, alokasi: f.alokasi,
      minta: f.minta, kritis: f.kritis, jam: f.jam, masuk: f.masuk
    }));
  }

  function resetFacilities() {
    state.facilities = cloneFacilities(Oxy.DEFAULT_FACILITIES);
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ form: state.form, facilities: state.facilities }));
    } catch (e) { /* mode privat atau kuota penuh */ }
  }

  function load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { saved = null; }
    if (saved && Array.isArray(saved.facilities) && saved.facilities.length) {
      state.form = Object.assign({}, state.form, saved.form || {});
      state.facilities = cloneFacilities(saved.facilities);
      return true;
    }
    resetFacilities();
    return false;
  }

  function recompute() {
    state.result = Oxy.runAll(Object.assign({}, state.form, { facilities: state.facilities }));
    return state.result;
  }

  /* ------------------------------------------------------------------ *
   * Navigasi
   * ------------------------------------------------------------------ */
  function navigate(view, opts) {
    if (!VIEW_META[view]) view = 'dashboard';
    state.view = view;

    document.querySelectorAll('.view').forEach((el) => el.classList.toggle('active', el.id === 'view-' + view));
    document.querySelectorAll('.nav-item').forEach((el) => {
      const on = el.dataset.view === view;
      if (on) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });

    const meta = VIEW_META[view];
    document.getElementById('topTitle').textContent = meta.title;
    document.getElementById('topCrumb').textContent = meta.crumb;

    render(view);

    if (opts && opts.scroll !== false) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    closeSidebar();
    if (location.hash !== '#' + view) {
      history.replaceState(null, '', '#' + view);
    }
  }

  function render(view) {
    const R = state.result || recompute();
    const body = {
      dashboard: 'dashBody',
      data: 'dataBody',
      bankers: 'bankersBody',
      rute: 'ruteBody',
      eskalasi: 'eskalasiBody',
      multisiklus: 'multisiklusBody',
      skenario: 'skenarioBody',
      ekspor: 'eksporBody',
      metode: 'metodeBody'
    }[view];
    const el = document.getElementById(body);
    if (!el) return;

    switch (view) {
      case 'dashboard': el.innerHTML = Views.renderDashboard(R); break;
      case 'data': el.innerHTML = Views.renderData(state, R); break;
      case 'bankers': el.innerHTML = Views.renderBankers(R); break;
      case 'rute': el.innerHTML = Views.renderRute(R); break;
      case 'eskalasi': el.innerHTML = Views.renderEskalasi(R); break;
      case 'multisiklus': el.innerHTML = Views.renderMultisiklus(state, R); break;
      case 'skenario': el.innerHTML = Views.renderSkenario(state, state.batch); break;
      case 'ekspor': el.innerHTML = Views.renderEkspor(state, R); break;
      case 'metode': el.innerHTML = Views.renderMetode(); break;
      default: break;
    }
    decorateCharts(el);
  }

  /** Menyisipkan label aksesibel pada grafik hasil render. */
  function decorateCharts(scope) {
    scope.querySelectorAll('.chart svg').forEach((svg) => {
      if (!svg.getAttribute('role')) svg.setAttribute('role', 'img');
    });
  }

  /* ------------------------------------------------------------------ *
   * Penyuntingan data
   * ------------------------------------------------------------------ */
  const refreshTotals = UI.debounce(function () {
    recompute();
    const R = state.result;
    document.querySelectorAll('#facTable tbody tr').forEach((tr) => {
      const i = Number(tr.dataset.row);
      const row = state.facilities[i];
      const cell = tr.querySelector('[data-need]');
      if (row && cell) cell.textContent = fmt.int(Math.max(0, Number(row.max) - Number(row.alokasi)));
    });
    const foot = document.querySelector('#view-data .card-foot');
    if (foot) {
      const totals = state.facilities.reduce((acc, r) => {
        acc.max += Number(r.max) || 0; acc.alokasi += Number(r.alokasi) || 0; acc.minta += Number(r.minta) || 0;
        return acc;
      }, { max: 0, alokasi: 0, minta: 0 });
      foot.innerHTML = 'Total Max ' + fmt.int(totals.max) + ' · Alokasi ' + fmt.int(totals.alokasi)
        + ' · Minta ' + fmt.int(totals.minta) + ' · tabung di sistem ' + fmt.int(R.totalTabung) + ' (stok + alokasi)';
    }
    save();
  }, 240);

  function bindDataEvents(rootEl) {
    rootEl.addEventListener('input', (e) => {
      const t = e.target;

      // parameter global
      const bind = t.dataset ? t.dataset.bind : null;
      if (bind) {
        handleBind(bind, t);
        return;
      }

      // sel tabel fasilitas
      const field = t.dataset ? t.dataset.f : null;
      if (!field) return;
      const tr = t.closest('tr');
      const i = Number(tr.dataset.row);
      if (!Number.isInteger(i) || !state.facilities[i]) return;

      if (field === 'nama') state.facilities[i].nama = t.value.slice(0, 80);
      else state.facilities[i][field] = Number(t.value) || 0;

      if (field === 'max' || field === 'alokasi') {
        const cell = tr.querySelector('[data-need]');
        if (cell) cell.textContent = fmt.int(Math.max(0, Number(state.facilities[i].max) - Number(state.facilities[i].alokasi)));
      }
      refreshTotals();
    });

    rootEl.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset && t.dataset.bind && (t.dataset.bind === 'order' || t.dataset.bind === 'policy')) {
        handleBind(t.dataset.bind, t, true);
      }
    });
  }

  function handleBind(name, el, immediate) {
    const raw = el.type === 'range' || el.type === 'number' ? Number(el.value) : el.value;

    if (name === 'available' || name === 'depot' || name === 'corridorEnd') {
      state.form[name] = Number.isFinite(raw) ? raw : 0;
    } else if (name === 'w1' || name === 'w2') {
      state.form[name] = Number.isFinite(raw) ? raw : 0;
      const out = document.querySelector('[data-out="' + name + '"]');
      if (out) out.textContent = fmt.dec(state.form[name], 2);
    } else if (name === 'order' || name === 'policy') {
      state.form[name] = raw;
    } else if (name === 'tau' || name === 'cycles' || name === 'cycleHours' || name === 'scenarioCount' || name === 'scenarioSeed') {
      state.form[name] = Number.isFinite(raw) ? raw : 0;
    }

    recompute();
    save();

    // Tampilan yang punya kontrol sendiri perlu digambar ulang agar angka ikut berubah.
    if (immediate && (state.view === 'multisiklus' || state.view === 'data')) {
      if (name === 'policy') render('multisiklus');
    }
  }

  function addRow() {
    const nextMasuk = state.facilities.reduce((m, f) => Math.max(m, Number(f.masuk) || 0), 0) + 1;
    state.facilities.push({
      nama: 'Fasilitas ' + (state.facilities.length + 1),
      pos: Math.round((Number(state.form.depot) + Number(state.form.corridorEnd)) / 2) || 0,
      max: 6, alokasi: 1, minta: 3, kritis: 2, jam: 12, masuk: nextMasuk
    });
    recompute(); save(); render('data');
    const rows = document.querySelectorAll('#facTable tbody tr');
    const last = rows[rows.length - 1];
    if (last) {
      const input = last.querySelector('input[data-f="nama"]');
      if (input) { input.focus(); input.select(); }
    }
  }

  function deleteRow(i) {
    if (state.facilities.length <= 1) {
      UI.toast('Minimal satu fasilitas harus ada.', 'error');
      return;
    }
    state.facilities.splice(i, 1);
    recompute(); save(); render('data');
  }

  /* ------------------------------------------------------------------ *
   * Ekspor
   * ------------------------------------------------------------------ */
  function buildExportMenu() {
    const panel = document.getElementById('exportMenu');
    panel.innerHTML = EXPORT_LIST.map((it) => '<button class="menu-item" role="menuitem" data-export="' + it.id + '" type="button">'
      + UI.icon.download + '<span>' + esc(it.label) + '<small>' + esc(it.hint) + '</small></span></button>').join('')
      + '<div class="menu-sep"></div>'
      + '<button class="menu-item" role="menuitem" data-print="1" type="button">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 17h12v4H6z"/></svg>'
      + '<span>Cetak tampilan<small>Lewat dialog cetak peramban</small></span></button>';
  }

  function toggleExportMenu(force) {
    const panel = document.getElementById('exportMenu');
    const btn = document.getElementById('exportMenuBtn');
    const open = force != null ? force : panel.hidden;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  async function doExport(kind) {
    toggleExportMenu(false);
    const R = state.result || recompute();
    UI.overlay(true, kind === 'png' ? 'Menangkap tampilan…' : 'Menyiapkan berkas…');
    try {
      // beri kesempatan peramban melukis overlay sebelum kerja berat
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 60)));
      const msg = await Exporters.run(kind, R, state);
      UI.toast(msg);
    } catch (err) {
      console.error(err);
      UI.toast('Gagal membuat berkas: ' + (err && err.message ? err.message : 'kesalahan tidak dikenal'), 'error');
    } finally {
      UI.overlay(false);
    }
  }

  /* ------------------------------------------------------------------ *
   * Impor CSV
   * ------------------------------------------------------------------ */
  function importCSV(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const facilities = UI.facilitiesFromCSV(String(reader.result));
        state.facilities = cloneFacilities(facilities);
        recompute(); save(); render('data');
        UI.toast(facilities.length + ' fasilitas dimuat dari CSV.');
      } catch (err) {
        UI.toast(err.message || 'Berkas CSV tidak dapat dibaca.', 'error');
      }
    };
    reader.onerror = () => UI.toast('Berkas tidak dapat dibaca.', 'error');
    reader.readAsText(file);
  }

  /* ------------------------------------------------------------------ *
   * Halaman masuk
   * ------------------------------------------------------------------ */
  function enter() {
    state.entered = true;
    document.getElementById('landing').hidden = true;
    document.getElementById('app').hidden = false;
    document.body.style.overflow = '';
    const hash = (location.hash || '').replace('#', '');
    navigate(VIEW_META[hash] ? hash : 'dashboard', { scroll: false });
    window.scrollTo(0, 0);
  }

  function exit() {
    state.entered = false;
    document.getElementById('app').hidden = true;
    document.getElementById('landing').hidden = false;
    history.replaceState(null, '', location.pathname + location.search);
    window.scrollTo(0, 0);
  }

  function renderLandingFigure() {
    const host = document.getElementById('landingFigure');
    if (!host) return;
    const R = Oxy.runAll({
      facilities: Oxy.DEFAULT_FACILITIES,
      available: 8, depot: 40, corridorEnd: 80,
      w1: 0.6, w2: 0.4, order: 'prioritas', policy: 'banker',
      tau: 0, cycles: 12, cycleHours: 6
    });
    const look = R.routes.find((r) => r.key === 'look');
    host.innerHTML = Charts.routeDiagram({
      depot: 40, corridorEnd: 80, points: look.points, arrows: true,
      aria: 'Contoh rute LOOK dari depot km 40'
    })
      + '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:14px;font-size:12px;color:var(--muted)">'
      + '<span>FCFS <strong class="num" style="color:var(--ink)">135 km</strong></span>'
      + '<span>SCAN <strong class="num" style="color:var(--ink)">110 km</strong></span>'
      + '<span>LOOK <strong class="num" style="color:var(--accent)">90 km</strong></span>'
      + '</div>';
  }

  /* ------------------------------------------------------------------ *
   * Sidebar seluler
   * ------------------------------------------------------------------ */
  function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('scrim').hidden = false;
  }
  function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('scrim').hidden = true;
  }

  /* ------------------------------------------------------------------ *
   * Inisialisasi
   * ------------------------------------------------------------------ */
  function init() {
    UI.theme.init();
    load();
    recompute();
    renderLandingFigure();
    buildExportMenu();

    document.getElementById('enterBtn').addEventListener('click', enter);
    document.getElementById('exitBtn').addEventListener('click', exit);
    document.getElementById('themeToggle').addEventListener('click', UI.theme.cycle);
    document.getElementById('menuToggle').addEventListener('click', openSidebar);
    document.getElementById('scrim').addEventListener('click', closeSidebar);

    document.getElementById('navList').addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-item');
      if (btn) navigate(btn.dataset.view);
    });

    document.body.addEventListener('click', (e) => {
      const goto = e.target.closest('[data-goto]');
      if (goto) { navigate(goto.dataset.goto); return; }

      const exp = e.target.closest('[data-export]');
      if (exp) { doExport(exp.dataset.export); return; }

      const printBtn = e.target.closest('[data-print]');
      if (printBtn) { toggleExportMenu(false); window.print(); return; }

      const del = e.target.closest('[data-del]');
      if (del) { deleteRow(Number(del.dataset.del)); return; }

      if (e.target.id === 'addRowBtn') { addRow(); return; }

      const weights = e.target.closest('[data-weights]');
      if (weights) {
        const [w1, w2] = weights.dataset.weights.split('/').map(Number);
        state.form.w1 = w1; state.form.w2 = w2;
        recompute(); save(); render('data');
        UI.toast('Bobot diubah menjadi ' + fmt.dec(w1, 1) + ' / ' + fmt.dec(w2, 1) + '.');
        return;
      }
      if (e.target.id === 'addSampleBtn') {
        resetFacilities(); recompute(); save(); render('data');
        UI.toast('Data contoh 5 fasilitas dimuat.');
        return;
      }
      if (e.target.id === 'resetDataBtn') {
        state.form = {
          available: Oxy.DEFAULTS.available, depot: Oxy.DEFAULTS.depot, corridorEnd: Oxy.DEFAULTS.corridorEnd,
          w1: Oxy.DEFAULTS.w1, w2: Oxy.DEFAULTS.w2, order: Oxy.DEFAULTS.order,
          orderSiklus: Oxy.DEFAULTS.orderSiklus, tau: Oxy.DEFAULTS.tau,
          cycles: Oxy.DEFAULTS.cycles, cycleHours: Oxy.DEFAULTS.cycleHours, policy: Oxy.DEFAULTS.policy,
          scenarioCount: 12, scenarioSeed: 2026
        };
        resetFacilities(); recompute(); save(); render('data');
        UI.toast('Seluruh data dikembalikan ke contoh laporan.');
        return;
      }
      if (e.target.id === 'importCsvBtn') {
        document.getElementById('csvInput').click();
        return;
      }
      if (e.target.id === 'runBatchBtn') {
        UI.overlay(true, 'Menjalankan ' + state.form.scenarioCount + ' skenario…');
        setTimeout(() => {
          state.batch = Oxy.runScenarioBatch({
            count: state.form.scenarioCount,
            seed: state.form.scenarioSeed,
            w1: state.form.w1,
            w2: state.form.w2
          });
          render('skenario');
          UI.overlay(false);
          UI.toast(state.batch.rows.length + ' skenario diuji.');
        }, 30);
        return;
      }

      // tutup menu ekspor bila klik di luar
      if (!e.target.closest('#exportMenuWrap')) toggleExportMenu(false);
    });

    // data view butuh delegasi khusus
    bindDataEvents(document.getElementById('view-data'));

    // kontrol yang memicu render ulang saat nilainya berubah
    document.getElementById('view-multisiklus').addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset && (t.dataset.bind === 'tau' || t.dataset.bind === 'cycles' || t.dataset.bind === 'cycleHours' || t.dataset.bind === 'policy')) {
        recompute(); save(); render('multisiklus');
      }
    });

    document.getElementById('runBtnTop').addEventListener('click', () => {
      recompute(); render(state.view);
      UI.toast('Simulasi dihitung ulang.');
    });

    document.getElementById('exportMenuBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleExportMenu();
    });

    document.getElementById('csvInput').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) importCSV(file);
      e.target.value = '';
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        toggleExportMenu(false);
        closeSidebar();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && state.entered) {
        e.preventDefault();
        recompute(); render(state.view);
        UI.toast('Simulasi dihitung ulang.');
      }
    });

    window.addEventListener('hashchange', () => {
      if (!state.entered) return;
      const v = (location.hash || '').replace('#', '');
      if (VIEW_META[v] && v !== state.view) navigate(v, { scroll: false });
    });

    window.addEventListener('resize', UI.debounce(() => {
      if (window.innerWidth > 860) closeSidebar();
    }, 150));

    // Mulai dari halaman masuk; hash langsung membuka tampilan terkait.
    const hash = (location.hash || '').replace('#', '');
    if (hash && VIEW_META[hash]) enter();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // dipakai modul ekspor untuk memulihkan tampilan aktif
  root.App = { navigate: (v, o) => navigate(v, o), state };
})(typeof globalThis !== 'undefined' ? globalThis : this);
