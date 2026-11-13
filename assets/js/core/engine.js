/*!
 * engine.js — Mesin simulasi alokasi & distribusi tabung oksigen
 * Banker's Algorithm (safe state + alokasi parsial) + SCAN / LOOK / FCFS,
 * model turnaround multisiklus, protokol eskalasi, dan pembangkit skenario.
 *
 * Modul ini tidak menyentuh DOM sehingga dapat diuji langsung dengan Node.
 * Semua data bersifat hipotetis: hasil simulasi bukan alat keputusan klinis.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Oxy = Object.assign(root.Oxy || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Data contoh (Tabel 1 laporan: 5 fasilitas, depot km 40, stok 8)
   * ------------------------------------------------------------------ */
  const FACILITY_FIELDS = ['nama', 'pos', 'max', 'alokasi', 'minta', 'kritis', 'jam', 'masuk'];

  const DEFAULT_FACILITIES = [
    { nama: 'RS Rujukan Utama', pos: 55, max: 12, alokasi: 4, minta: 4, kritis: 18, jam: 4, masuk: 3 },
    { nama: 'RSUD Kota', pos: 70, max: 8, alokasi: 3, minta: 3, kritis: 9, jam: 6, masuk: 1 },
    { nama: 'RS Swasta Sehat', pos: 20, max: 6, alokasi: 3, minta: 2, kritis: 5, jam: 10, masuk: 5 },
    { nama: 'Puskesmas Induk', pos: 75, max: 4, alokasi: 1, minta: 2, kritis: 2, jam: 12, masuk: 4 },
    { nama: 'Klinik Pratama', pos: 10, max: 3, alokasi: 1, minta: 2, kritis: 1, jam: 20, masuk: 2 }
  ];

  const DEFAULTS = {
    available: 8,
    depot: 40,
    corridorEnd: 80,
    w1: 0.6,
    w2: 0.4,
    order: 'prioritas',      // 'prioritas' | 'masuk'
    orderSiklus: 'masuk',    // Bab 10.4 memakai urutan masuk agar efek uji aman terisolasi
    tau: 0,
    cycles: 12,
    cycleHours: 6,
    policy: 'banker'         // 'banker' | 'naif'
  };

  /* ------------------------------------------------------------------ *
   * Utilitas
   * ------------------------------------------------------------------ */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const num = (v) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const sum = (arr, pick) => arr.reduce((s, x) => s + (pick ? pick(x) : x), 0);

  /** Menormalkan masukan mentah menjadi daftar fasilitas yang konsisten. */
  function normalizeFacilities(raw) {
    return (raw || []).map((f, i) => {
      const max = Math.max(0, Math.round(num(f.max)));
      const alokasi = clamp(Math.round(num(f.alokasi)), 0, max);
      return {
        id: f.id || 'F' + (i + 1),
        nama: String(f.nama || 'Fasilitas ' + (i + 1)).slice(0, 80),
        pos: clamp(num(f.pos), 0, 100000),
        max,
        alokasi,
        minta: clamp(Math.round(num(f.minta)), 0, 100000),
        kritis: Math.max(0, Math.round(num(f.kritis))),
        jam: Math.max(0, num(f.jam)),
        masuk: Math.max(1, Math.round(num(f.masuk) || i + 1))
      };
    });
  }

  /* ------------------------------------------------------------------ *
   * Skor prioritas (Bab 2.3)
   * Skor = w1 * (K / Kmaks) + w2 * (1 - min(C, 24) / 24)
   * ------------------------------------------------------------------ */
  function scoreFacilities(facilities, weights) {
    const w1 = weights && Number.isFinite(weights.w1) ? weights.w1 : DEFAULTS.w1;
    const w2 = weights && Number.isFinite(weights.w2) ? weights.w2 : DEFAULTS.w2;
    const kmax = Math.max(1, ...facilities.map((f) => f.kritis));
    return facilities.map((f) => {
      const sKritis = f.kritis / kmax;
      const sCadangan = 1 - Math.min(f.jam, 24) / 24;
      const skor = w1 * sKritis + w2 * sCadangan;
      return Object.assign({}, f, { skor, sKritis, sCadangan, need: Math.max(0, f.max - f.alokasi) });
    });
  }

  /** Urutan evaluasi: skor tertinggi lebih dulu; seri dipecah oleh urutan masuk. */
  function rankFacilities(scored) {
    return scored.slice().sort((a, b) => b.skor - a.skor || a.masuk - b.masuk || a.pos - b.pos);
  }

  /* ------------------------------------------------------------------ *
   * Safety algorithm (Bab 2.1)
   * Work = Available; cari Need <= Work; Work = Work + Allocation.
   * ------------------------------------------------------------------ */
  function safetyCheck(available, list) {
    let work = available;
    const done = new Set();
    const order = [];
    const steps = [];
    let guard = 0;
    while (done.size < list.length && guard++ < 10000) {
      let found = false;
      for (const f of list) {
        if (done.has(f.id)) continue;
        const need = Math.max(0, f.max - f.alokasi);
        if (need <= work) {
          steps.push({
            id: f.id,
            nama: f.nama,
            need,
            alokasi: f.alokasi,
            workBefore: work,
            workAfter: work + f.alokasi
          });
          work += f.alokasi;
          done.add(f.id);
          order.push(f.nama);
          found = true;
        }
      }
      if (!found) break;
    }
    const safe = done.size === list.length;
    return { safe, order, steps, work, stuck: list.filter((f) => !done.has(f.id)).map((f) => f.nama) };
  }

  /* ------------------------------------------------------------------ *
   * Resource-request dengan alokasi parsial (Bab 2.1, Gambar 2)
   * ------------------------------------------------------------------ */
  function processRequest(list, index, available, requested) {
    const target = list[index];
    const need = Math.max(0, target.max - target.alokasi);
    const attempts = [];
    const req = Math.max(0, Math.round(requested));

    if (req > need) {
      return {
        id: target.id, nama: target.nama, minta: req, diberi: 0, status: 'DITOLAK',
        available, need, attempts,
        alasan: 'Minta ' + req + ' melebihi Need ' + need
      };
    }

    const limit = Math.min(req, Math.floor(available));
    for (let j = limit; j >= 1; j--) {
      const trial = list.map((o) => (o.id === target.id ? Object.assign({}, o, { alokasi: o.alokasi + j }) : o));
      const res = safetyCheck(available - j, trial);
      attempts.push({
        j,
        sisa: available - j,
        aman: res.safe,
        urutan: res.order,
        buntu: res.stuck
      });
      if (res.safe) {
        target.alokasi += j;
        const final = safetyCheck(available - j, list);
        return {
          id: target.id, nama: target.nama, minta: req, diberi: j,
          status: j === req ? 'DISETUJUI' : 'PARSIAL',
          available: available - j, need, attempts,
          alasan: j === req
            ? (target.max - target.alokasi === 0 ? 'Need menjadi 0, fasilitas dapat selesai' : 'Lolos uji safe state')
            : req + ' tabung tidak aman, ' + j + ' tabung aman',
          safeAfter: final.safe,
          urutanSetelah: final.order
        };
      }
    }

    const kosong = limit === 0;
    return {
      id: target.id, nama: target.nama, minta: req, diberi: 0, status: 'TUNDA',
      available, need, attempts,
      alasan: kosong ? 'Stok depot habis' : 'Tidak ada safe sequence yang aman'
    };
  }

  /* ------------------------------------------------------------------ *
   * Satu siklus alokasi penuh
   * ------------------------------------------------------------------ */
  function allocate(input) {
    const facilities = normalizeFacilities(input.facilities);
    const available0 = Math.max(0, Math.round(num(input.available)));
    const weights = { w1: num(input.w1 == null ? DEFAULTS.w1 : input.w1), w2: num(input.w2 == null ? DEFAULTS.w2 : input.w2) };
    const order = input.order === 'masuk' ? 'masuk' : 'prioritas';
    const policy = input.policy === 'naif' ? 'naif' : 'banker';

    const scored = scoreFacilities(facilities, weights);
    const safeInitial = safetyCheck(available0, scored);

    const queue = order === 'prioritas'
      ? rankFacilities(scored)
      : scored.slice().sort((a, b) => a.masuk - b.masuk);

    const working = scored.map((f) => Object.assign({}, f));
    let avail = available0;
    const decisions = [];

    for (const f of queue) {
      const idx = working.findIndex((w) => w.id === f.id);
      let d;
      if (policy === 'naif') {
        const need = Math.max(0, working[idx].max - working[idx].alokasi);
        const minta = Math.min(f.minta, need);
        const j = Math.min(minta, avail);
        if (minta <= 0) {
          d = { id: f.id, nama: f.nama, minta: f.minta, diberi: 0, status: 'SELESAI', available: avail, need, attempts: [], alasan: 'Kebutuhan sudah terpenuhi (Need 0)' };
        } else {
          working[idx].alokasi += j;
          avail -= j;
          d = {
            id: f.id, nama: f.nama, minta: minta, diberi: j,
            status: j === minta ? 'DISETUJUI' : (j === 0 ? 'TUNDA' : 'PARSIAL'),
            available: avail, need, attempts: [],
            alasan: j === 0 ? 'Stok depot habis (tanpa uji aman)' : 'Diberikan tanpa uji safe state'
          };
        }
      } else {
        d = processRequest(working, idx, avail, f.minta);
        avail = d.available;
      }
      decisions.push(Object.assign({ skor: f.skor, kritis: f.kritis, jam: f.jam, pos: f.pos, masuk: f.masuk, max: f.max }, d));
    }

    const safeFinal = safetyCheck(avail, working);
    const diminta = sum(decisions, (d) => d.minta);
    const diberikan = sum(decisions, (d) => d.diberi);
    const totalKritis = sum(scored, (f) => f.kritis);
    const berbobot = totalKritis
      ? sum(decisions, (d) => {
          const f = scored.find((x) => x.id === d.id);
          const rasio = d.minta > 0 ? Math.min(1, d.diberi / d.minta) : 0;
          return (f ? f.kritis : 0) * rasio;
        }) / totalKritis
      : 0;
    const dilayani = decisions.filter((d) => d.diberi > 0).length;

    return {
      policy, order, weights, available0, availableEnd: avail,
      facilities: working,
      ranked: rankFacilities(scored),
      decisions,
      safeInitial, safeFinal,
      metrics: {
        diminta, diberikan,
        pemenuhan: diminta ? diberikan / diminta : 0,
        berbobotKritis: berbobot,
        cakupan: decisions.length ? dilayani / decisions.length : 0,
        dilayani,
        jumlahFasilitas: decisions.length,
        sisaStok: avail,
        akhirAman: safeFinal.safe
      }
    };
  }

  /* ------------------------------------------------------------------ *
   * Rute: FCFS, SCAN, LOOK pada koridor linear (Bab 2.2)
   * ------------------------------------------------------------------ */
  function distanceOf(depot, points) {
    let d = 0;
    let prev = depot;
    for (const p of points) { d += Math.abs(p - prev); prev = p; }
    return d;
  }

  function routeDetail(depot, points) {
    const seq = [depot].concat(points);
    const legs = [];
    for (let i = 1; i < seq.length; i++) legs.push(Math.abs(seq[i] - seq[i - 1]));
    return { legs, total: sum(legs), text: legs.join(' + ') };
  }

  function buildRoutes(input) {
    const depot = num(input.depot);
    const end = Math.max(depot + 1, num(input.corridorEnd));
    const targets = (input.targets || []).slice().sort((a, b) => a.pos - b.pos);
    if (!targets.length) {
      return ['fcfs', 'scan', 'look'].map((key) => ({
        key, name: key === 'fcfs' ? 'FCFS' : key.toUpperCase(), points: [], stops: [],
        distance: 0, detail: { legs: [], total: 0, text: '0' }, hemat: 0
      }));
    }
    const pos = targets.map((t) => t.pos);
    const up = pos.filter((p) => p >= depot).sort((a, b) => a - b);
    const down = pos.filter((p) => p < depot).sort((a, b) => b - a);

    const fcfs = targets.slice().sort((a, b) => a.masuk - b.masuk).map((t) => t.pos);
    const scan = down.length ? up.concat([end], down) : up.slice();
    const look = up.concat(down);

    const base = distanceOf(depot, fcfs);
    const out = [
      { key: 'fcfs', name: 'FCFS (urutan masuk)', points: fcfs },
      { key: 'scan', name: 'SCAN', points: scan },
      { key: 'look', name: 'LOOK', points: look }
    ].map((r) => {
      const detail = routeDetail(depot, r.points);
      return Object.assign({}, r, {
        distance: detail.total,
        detail,
        hemat: base > 0 ? (base - detail.total) / base : 0,
        urutan: [depot].concat(r.points).join(' → ')
      });
    });
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Protokol eskalasi (Bab 9.3)
   * ------------------------------------------------------------------ */
  const ESCALATION_LEVELS = [
    { level: 0, nama: 'Pantau', ambang: Infinity, tindakan: 'Tidak perlu tindakan khusus; dipantau pada siklus berikutnya.' },
    { level: 1, nama: 'Waspada', ambang: 12, tindakan: 'Diprioritaskan pada evaluasi siklus berikutnya; siklus dapat dimajukan bila ada tabung kembali; koordinator diberi tahu.' },
    { level: 2, nama: 'Siaga', ambang: 8, tindakan: 'Pengalihan tabung dari fasilitas terdekat yang cadangannya melebihi 24 jam (pinjaman antar-fasilitas, dicatat sebagai perubahan Allocation).' },
    { level: 3, nama: 'Darurat', ambang: 4, tindakan: 'Permintaan pasokan darurat dari depot sekunder atau produsen dengan pengantaran khusus; eskalasi ke koordinator dinas kesehatan.' }
  ];

  function escalationFor(level) {
    return ESCALATION_LEVELS.find((l) => l.level === level) || ESCALATION_LEVELS[0];
  }

  function levelOf(jam) {
    if (jam <= 4) return 3;
    if (jam <= 8) return 2;
    if (jam <= 12) return 1;
    return 0;
  }

  function escalate(input) {
    const decisions = input.decisions || [];
    const facilities = input.facilities || [];
    const depot = num(input.depot);
    // Protokol pada laporan menyasar status Ditunda; kekurangan pada status
    // Parsial tetap ditampilkan karena juga menyisakan pasien tanpa tabung.
    const pending = decisions.filter((d) => d.diberi < d.minta);
    return pending.map((d) => {
      const f = facilities.find((x) => x.id === d.id) || {};
      const level = levelOf(num(f.jam));
      const def = escalationFor(level);
      const donors = level >= 2
        ? facilities
            .filter((x) => x.id !== d.id && num(x.jam) > 24 && x.alokasi > 0)
            .map((x) => ({ id: x.id, nama: x.nama, pos: x.pos, jam: x.jam, alokasi: x.alokasi, jarak: Math.abs(num(x.pos) - num(f.pos)) }))
            .sort((a, b) => a.jarak - b.jarak)
            .slice(0, 3)
        : [];
      return {
        id: d.id, nama: d.nama, status: d.status, minta: d.minta, diberi: d.diberi,
        kategori: d.status === 'TUNDA' ? 'Ditunda' : 'Parsial',
        kurang: Math.max(0, d.minta - d.diberi), jam: num(f.jam), pos: num(f.pos),
        level, levelNama: def.nama, tindakan: def.tindakan, donors,
        jarakDepot: Math.abs(num(f.pos) - depot)
      };
    }).sort((a, b) => b.level - a.level || a.jam - b.jam);
  }

  /* ------------------------------------------------------------------ *
   * Multisiklus dengan waktu pengisian ulang τ (Bab 10)
   * Available(t+1) = Available(t) − Diberikan(t) + Kembali(t − τ)
   * ------------------------------------------------------------------ */
  function simulateCycles(input) {
    const facilities = normalizeFacilities(input.facilities);
    const tau = clamp(Math.round(num(input.tau)), 0, 12);
    const cycles = clamp(Math.round(num(input.cycles) || 12), 1, 60);
    const policy = input.policy === 'naif' ? 'naif' : 'banker';
    const order = input.order === 'prioritas' ? 'prioritas' : 'masuk';
    const weights = { w1: num(input.w1 == null ? DEFAULTS.w1 : input.w1), w2: num(input.w2 == null ? DEFAULTS.w2 : input.w2) };
    const depot = num(input.depot);
    const end = num(input.corridorEnd);

    const F = facilities.map((f) => Object.assign({}, f));
    const scored = scoreFacilities(F, weights);
    const kmax = Math.max(1, ...scored.map((f) => f.kritis));

    let avail = Math.max(0, Math.round(num(input.available)));
    const lepas = new Array(cycles + 1).fill(0);
    const selesai = new Array(F.length).fill(0);
    const rows = [];
    let deadlockAt = null;

    for (let t = 0; t < cycles; t++) {
      const availStart = avail;
      const urutan = order === 'prioritas'
        ? scored.slice().sort((a, b) => b.skor - a.skor || a.masuk - b.masuk)
        : scored.slice().sort((a, b) => a.masuk - b.masuk);

      let diberi = 0;
      const perFasilitas = [];
      for (const f of urutan) {
        const item = F.find((x) => x.id === f.id);
        const need = Math.max(0, item.max - item.alokasi);
        const minta = Math.min(item.minta, need);
        if (minta <= 0) { perFasilitas.push({ id: item.id, nama: item.nama, diberi: 0, need }); continue; }
        let j = 0;
        if (policy === 'naif') {
          j = Math.min(minta, avail);
        } else {
          const idx = F.indexOf(item);
          const d = processRequest(F, idx, avail, minta);
          j = d.diberi;
          avail = d.available;
        }
        if (policy === 'naif') { item.alokasi += j; avail -= j; }
        diberi += j;
        perFasilitas.push({ id: item.id, nama: item.nama, diberi: j, need });
      }

      let nsel = 0;
      for (const item of F) {
        if (item.alokasi >= item.max && item.max > 0) {
          selesai[F.indexOf(item)] += 1;
          nsel += 1;
          lepas[t] += item.max;
          item.alokasi = 0;
        }
      }
      const kembali = t - tau >= 0 ? lepas[t - tau] : 0;
      avail += kembali;

      const pendingQ = tau > 0
        ? sum(lepas.slice(Math.max(0, t - tau + 1), t + 1))
        : 0;
      const buntu = F.every((f) => (f.max - f.alokasi) <= 0 || avail < (f.max - f.alokasi));

      const delivered = F.filter((f) => perFasilitas.find((p) => p.id === f.id && p.diberi > 0));
      const routeInput = {
        depot, corridorEnd: end,
        targets: perFasilitas
          .filter((p) => p.diberi > 0)
          .map((p) => Object.assign({ masuk: (facilities.find((x) => x.id === p.id) || {}).masuk || 0 }, F.find((x) => x.id === p.id)))
      };
      const routes = routeInput.targets.length ? buildRoutes(routeInput) : null;

      rows.push({
        t: t + 1,
        availStart,
        diberi,
        kembali,
        availEnd: avail,
        selesai: nsel,
        antreIsi: lepas[t],
        pendingQ,
        perFasilitas,
        routes,
        kmFcfs: routes ? routes[0].distance : 0,
        kmScan: routes ? routes[1].distance : 0,
        kmLook: routes ? routes[2].distance : 0
      });

      if (diberi === 0 && nsel === 0 && pendingQ === 0 && buntu && deadlockAt === null) {
        deadlockAt = t + 1;
        break;
      }
    }

    const totalEpisode = sum(selesai);
    return {
      tau, cycles, policy, order, weights,
      rows,
      deadlockAt,
      episodes: F.map((f, i) => ({
        id: f.id, nama: f.nama, pos: f.pos, max: f.max, episode: selesai[i], kritis: f.kritis, jam: f.jam
      })),
      totalEpisode,
      totalKm: {
        fcfs: sum(rows, (r) => r.kmFcfs),
        scan: sum(rows, (r) => r.kmScan),
        look: sum(rows, (r) => r.kmLook)
      },
      totalDiberi: sum(rows, (r) => r.diberi)
    };
  }

  /** Kurva episode selesai terhadap τ (Gambar 5). */
  function tauSweep(input) {
    const maxTau = clamp(Math.round(num(input.maxTau == null ? 3 : input.maxTau)), 0, 6);
    const out = [];
    for (let tau = 0; tau <= maxTau; tau++) {
      const banker = simulateCycles(Object.assign({}, input, { tau, policy: 'banker' }));
      const naif = simulateCycles(Object.assign({}, input, { tau, policy: 'naif' }));
      out.push({
        tau,
        bankerEpisode: banker.totalEpisode,
        naifEpisode: naif.totalEpisode,
        bankerDeadlock: banker.deadlockAt,
        naifDeadlock: naif.deadlockAt
      });
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Pembangkit skenario uji (Bab 11)
   * ------------------------------------------------------------------ */
  const SCENARIO_SPEC = [
    { n: 10, stok: 23, rasio: 1.0 }, { n: 10, stok: 15, rasio: 1.5 },
    { n: 12, stok: 12, rasio: 2.0 }, { n: 12, stok: 16, rasio: 2.6 },
    { n: 14, stok: 9, rasio: 3.1 }, { n: 14, stok: 9, rasio: 3.3 },
    { n: 16, stok: 10, rasio: 3.9 }, { n: 16, stok: 8, rasio: 4.6 },
    { n: 18, stok: 11, rasio: 4.8 }, { n: 18, stok: 8, rasio: 5.1 },
    { n: 20, stok: 7, rasio: 5.7 }, { n: 20, stok: 10, rasio: 5.8 }
  ];

  function makeScenario(seed, spec) {
    const rnd = mulberry32(seed);
    const n = spec.n;
    const stok = spec.stok;
    for (let attempt = 0; attempt < 60; attempt++) {
      const facilities = [];
      let needTotal = 0;
      for (let i = 0; i < n; i++) {
        const max = 4 + Math.floor(rnd() * 12);
        const need = 1 + Math.floor(rnd() * max);
        const alokasi = max - need;
        const pos = Math.round(rnd() * 100);
        const kritis = 1 + Math.floor(rnd() * 20);
        const jam = Math.round(4 + rnd() * 20);
        facilities.push({
          id: 'S' + (i + 1), nama: 'Faskes ' + (i + 1), pos, max, alokasi, need, kritis, jam,
          masuk: i + 1, minta: 1
        });
        needTotal += need;
      }
      // Sebar permintaan agar totalnya mendekati rasio permintaan/stok yang dituju.
      const target = spec.rasio * stok;
      const k = Math.min(1, target / Math.max(1, needTotal));
      facilities.forEach((f) => {
        f.minta = Math.max(1, Math.min(f.need, Math.round(f.need * k)));
      });
      // Pastikan kondisi awal aman (ada safe sequence).
      const safe = safetyCheck(stok, facilities);
      if (safe.safe) {
        const diminta = sum(facilities, (f) => f.minta);
        return {
          id: seed,
          facilities: facilities.map(({ need, ...rest }) => rest),
          available: stok,
          depot: 50,
          corridorEnd: 100,
          w1: DEFAULTS.w1,
          w2: DEFAULTS.w2,
          rasio: diminta / stok,
          safeInitial: true
        };
      }
    }
    // Jaring pengaman: longgarkan kebutuhan dengan menaikkan alokasi.
    const facilities = Array.from({ length: n }, (_, i) => {
      const max = 4 + Math.floor(rnd() * 12);
      return { id: 'S' + (i + 1), nama: 'Faskes ' + (i + 1), pos: Math.round(rnd() * 100), max, alokasi: max, minta: 1, kritis: 1 + Math.floor(rnd() * 20), jam: 12, masuk: i + 1 };
    });
    return { id: seed, facilities, available: stok, depot: 50, corridorEnd: 100, w1: DEFAULTS.w1, w2: DEFAULTS.w2, rasio: 0, safeInitial: true };
  }

  function runScenarioBatch(input) {
    const count = clamp(Math.round(num(input.count) || 12), 1, 24);
    const baseSeed = Math.round(num(input.seed) || 2026);
    const weights = { w1: num(input.w1 == null ? DEFAULTS.w1 : input.w1), w2: num(input.w2 == null ? DEFAULTS.w2 : input.w2) };
    const rows = [];
    for (let i = 0; i < count; i++) {
      const spec = SCENARIO_SPEC[i % SCENARIO_SPEC.length];
      const sc = makeScenario(baseSeed + i * 7919, spec);
      const common = { facilities: sc.facilities, available: sc.available, weights, depot: sc.depot, corridorEnd: sc.corridorEnd };
      const naif = allocate(Object.assign({}, common, { policy: 'naif', order: 'masuk' }));
      const bankerMasuk = allocate(Object.assign({}, common, { policy: 'banker', order: 'masuk' }));
      const bankerPrioritas = allocate(Object.assign({}, common, { policy: 'banker', order: 'prioritas' }));
      const targets = bankerPrioritas.decisions.filter((d) => d.diberi > 0).map((d) => {
        const f = sc.facilities.find((x) => x.id === d.id);
        return Object.assign({}, f, { masuk: f.masuk });
      });
      const routes = buildRoutes({ depot: sc.depot, corridorEnd: sc.corridorEnd, targets });
      rows.push({
        no: i + 1,
        fasilitas: sc.facilities.length,
        stok: sc.available,
        rasio: sc.rasio,
        pemenuhan: bankerPrioritas.metrics.pemenuhan,
        kritisNaif: naif.metrics.berbobotKritis,
        kritisMasuk: bankerMasuk.metrics.berbobotKritis,
        kritisPrioritas: bankerPrioritas.metrics.berbobotKritis,
        cakupan: bankerPrioritas.metrics.cakupan,
        kmFcfs: routes[0].distance,
        kmScan: routes[1].distance,
        kmLook: routes[2].distance,
        aman: bankerPrioritas.metrics.akhirAman,
        scenario: sc
      });
    }
    const avg = (pick) => (rows.length ? sum(rows, pick) / rows.length : 0);
    return {
      rows,
      summary: {
        pemenuhan: avg((r) => r.pemenuhan),
        kritisNaif: avg((r) => r.kritisNaif),
        kritisMasuk: avg((r) => r.kritisMasuk),
        kritisPrioritas: avg((r) => r.kritisPrioritas),
        cakupan: avg((r) => r.cakupan),
        kmFcfs: avg((r) => r.kmFcfs),
        kmScan: avg((r) => r.kmScan),
        kmLook: avg((r) => r.kmLook),
        tidakAman: rows.filter((r) => !r.aman).length,
        total: rows.length
      }
    };
  }

  /* ------------------------------------------------------------------ *
   * Orkestrator: satu panggilan untuk seluruh hasil
   * ------------------------------------------------------------------ */
  function runAll(input) {
    const facilities = normalizeFacilities(input.facilities);
    const alloc = allocate(Object.assign({}, input, { facilities }));
    const targets = alloc.decisions
      .filter((d) => d.diberi > 0)
      .map((d) => {
        const f = facilities.find((x) => x.id === d.id);
        return Object.assign({}, f, { masuk: f.masuk, diberi: d.diberi });
      });
    const routes = buildRoutes({ depot: input.depot, corridorEnd: input.corridorEnd, targets });
    const escalation = escalate({ decisions: alloc.decisions, facilities: alloc.facilities, depot: input.depot });
    const orderSiklus = input.orderSiklus === 'prioritas' ? 'prioritas' : 'masuk';
    const cycles = simulateCycles(Object.assign({}, input, { facilities, order: orderSiklus }));
    const sweep = tauSweep(Object.assign({}, input, {
      facilities, order: orderSiklus,
      cycles: Math.min(num(input.cycles) || 12, 12),
      maxTau: input.maxTau
    }));
    const totalDiminta = alloc.metrics.diminta;
    const totalTabung = alloc.metrics.diberikan + alloc.metrics.sisaStok;
    return {
      input: {
        available: Math.max(0, Math.round(num(input.available))),
        depot: num(input.depot),
        corridorEnd: num(input.corridorEnd),
        w1: num(input.w1), w2: num(input.w2),
        order: input.order, orderSiklus,
        policy: input.policy,
        tau: num(input.tau), cycles: num(input.cycles), cycleHours: num(input.cycleHours)
      },
      facilities,
      allocation: alloc,
      targets,
      routes,
      escalation,
      cycles,
      sweep,
      totalTabung
    };
  }

  return {
    FACILITY_FIELDS,
    DEFAULT_FACILITIES,
    DEFAULTS,
    ESCALATION_LEVELS,
    SCENARIO_SPEC,
    normalizeFacilities,
    scoreFacilities,
    rankFacilities,
    safetyCheck,
    processRequest,
    allocate,
    buildRoutes,
    distanceOf,
    escalate,
    levelOf,
    escalationFor,
    simulateCycles,
    tauSweep,
    makeScenario,
    runScenarioBatch,
    runAll,
    mulberry32
  };
});
