/* Uji mesin simulasi terhadap angka acuan Laporan Progres Revisi 2. */
const assert = require('node:assert');
const Oxy = require('../assets/js/core/engine.js');

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}
const near = (a, b, tol, msg) => {
  if (Math.abs(a - b) > (tol == null ? 1e-6 : tol)) {
    throw new Error((msg || '') + ' diharapkan ' + b + ', didapat ' + a);
  }
};

const caseInput = {
  facilities: Oxy.DEFAULT_FACILITIES,
  available: 8, depot: 40, corridorEnd: 80,
  w1: 0.6, w2: 0.4, order: 'prioritas', policy: 'banker',
  tau: 0, cycles: 12, cycleHours: 6
};

console.log('\n== Studi kasus 5 fasilitas (Tabel 1-3) ==');
const r = Oxy.runAll(caseInput);

check('kondisi awal aman dengan safe sequence laporan', () => {
  assert.strictEqual(r.allocation.safeInitial.safe, true);
  assert.deepStrictEqual(r.allocation.safeInitial.order, [
    'RS Rujukan Utama', 'RSUD Kota', 'RS Swasta Sehat', 'Puskesmas Induk', 'Klinik Pratama'
  ]);
});

check('skor prioritas 0,933 / 0,600 / 0,400 / 0,267 / 0,100', () => {
  const s = Object.fromEntries(r.allocation.ranked.map((f) => [f.nama, f.skor]));
  near(s['RS Rujukan Utama'], 0.933, 0.001, 'skor RSU');
  near(s['RSUD Kota'], 0.600, 0.001, 'skor RSUD');
  near(s['RS Swasta Sehat'], 0.400, 0.001, 'skor Swasta');
  near(s['Puskesmas Induk'], 0.267, 0.001, 'skor Puskesmas');
  near(s['Klinik Pratama'], 0.100, 0.001, 'skor Klinik');
});

check('keputusan Banker\'s 4 / 2 / 0 / 0 / 2 (Tabel 2)', () => {
  const d = Object.fromEntries(r.allocation.decisions.map((x) => [x.nama, [x.diberi, x.status]]));
  assert.deepStrictEqual(d['RS Rujukan Utama'], [4, 'DISETUJUI']);
  assert.deepStrictEqual(d['RSUD Kota'], [2, 'PARSIAL']);
  assert.deepStrictEqual(d['RS Swasta Sehat'], [0, 'TUNDA']);
  assert.deepStrictEqual(d['Puskesmas Induk'], [0, 'TUNDA']);
  assert.deepStrictEqual(d['Klinik Pratama'], [2, 'DISETUJUI']);
});

check('seluruh stok 8 terpakai, 8 dari 13 permintaan (61,5%)', () => {
  near(r.allocation.metrics.diberikan, 8);
  near(r.allocation.metrics.diminta, 13);
  near(r.allocation.metrics.pemenuhan, 8 / 13, 1e-9);
  near(r.allocation.metrics.sisaStok, 0);
});

check('safe sequence akhir tetap aman (tidak deadlock)', () => {
  assert.strictEqual(r.allocation.safeFinal.safe, true);
});

check('rute FCFS 135 km, SCAN 110 km, LOOK 90 km (Tabel 3)', () => {
  const by = Object.fromEntries(r.routes.map((x) => [x.key, x]));
  near(by.fcfs.distance, 135, 1e-9, 'FCFS');
  near(by.scan.distance, 110, 1e-9, 'SCAN');
  near(by.look.distance, 90, 1e-9, 'LOOK');
  assert.strictEqual(by.fcfs.urutan, '40 → 70 → 10 → 55');
  assert.strictEqual(by.scan.urutan, '40 → 55 → 70 → 80 → 10');
  assert.strictEqual(by.look.urutan, '40 → 55 → 70 → 10');
  assert.strictEqual(by.fcfs.detail.text, '30 + 60 + 45');
  assert.strictEqual(by.scan.detail.text, '15 + 15 + 10 + 70');
  assert.strictEqual(by.look.detail.text, '15 + 15 + 60');
});

check('penghematan 18,5% (SCAN) dan 33,3% (LOOK) terhadap FCFS', () => {
  const by = Object.fromEntries(r.routes.map((x) => [x.key, x]));
  near(by.scan.hemat, 0.185185, 1e-5);
  near(by.look.hemat, 0.333333, 1e-5);
});

check('protokol eskalasi: Swasta & Puskesmas Ditunda Level 1, RSUD Parsial Level 2', () => {
  assert.strictEqual(r.escalation.length, 3);
  const by = Object.fromEntries(r.escalation.map((e) => [e.nama, e]));
  assert.strictEqual(by['RS Swasta Sehat'].level, 1);
  assert.strictEqual(by['RS Swasta Sehat'].kategori, 'Ditunda');
  assert.strictEqual(by['Puskesmas Induk'].level, 1);
  assert.strictEqual(by['Puskesmas Induk'].kategori, 'Ditunda');
  // RSUD hanya mendapat 2 dari 3 tabung dan cadangan 6 jam -> Level 2 (Siaga).
  assert.strictEqual(by['RSUD Kota'].level, 2);
  assert.strictEqual(by['RSUD Kota'].kategori, 'Parsial');
  assert.strictEqual(r.escalation[0].nama, 'RSUD Kota', 'level tertinggi diurutkan lebih dulu');
});

check('pemenuhan berbobot kritis studi kasus 71,4% (Tabel 21)', () => {
  near(r.allocation.metrics.berbobotKritis, 5 / 7, 1e-9);
});

console.log('\n== Multisiklus (Bab 10.4, Tabel 17) ==');
const expectEpisodes = { 0: 11, 1: 6, 2: 4, 3: 3 };
[0, 1, 2, 3].forEach((tau) => {
  check('tau=' + tau + ' -> ' + expectEpisodes[tau] + ' episode selesai, Banker\'s tanpa deadlock', () => {
    const s = Oxy.simulateCycles(Object.assign({}, caseInput, { tau, cycles: 12, policy: 'banker', order: 'masuk' }));
    assert.strictEqual(s.deadlockAt, null);
    assert.strictEqual(s.totalEpisode, expectEpisodes[tau]);
  });
});

[0, 1, 2].forEach((tau) => {
  check('tau=' + tau + ' -> kebijakan naif deadlock pada siklus ' + [5, 8, 11][tau], () => {
    const s = Oxy.simulateCycles(Object.assign({}, caseInput, { tau, cycles: 12, policy: 'naif', order: 'masuk' }));
    assert.strictEqual(s.deadlockAt, [5, 8, 11][tau]);
  });
});

check('tau=3 kebijakan naif belum terdeteksi deadlock, 3 episode', () => {
  const s = Oxy.simulateCycles(Object.assign({}, caseInput, { tau: 3, cycles: 12, policy: 'naif', order: 'masuk' }));
  assert.strictEqual(s.deadlockAt, null);
  assert.strictEqual(s.totalEpisode, 3);
});

check('sweep tau 0..3 menghasilkan kurva menurun', () => {
  const sweep = Oxy.tauSweep(Object.assign({}, caseInput, { maxTau: 3, order: 'masuk' }));
  assert.deepStrictEqual(sweep.map((s) => s.bankerEpisode), [11, 6, 4, 3]);
  sweep.forEach((s) => assert.strictEqual(s.bankerDeadlock, null));
  assert.deepStrictEqual(sweep.map((s) => s.naifDeadlock), [5, 8, 11, null]);
});

check('runAll memakai urutan masuk untuk multisiklus (Bab 10.4)', () => {
  assert.strictEqual(r.input.orderSiklus, 'masuk');
  assert.strictEqual(r.cycles.totalEpisode, 11);
  assert.strictEqual(r.sweep.length, 4);
});

console.log('\n== Sensitivitas bobot (Tabel 21) ==');
[[0.5, 0.5], [0.6, 0.4], [0.7, 0.3], [0.8, 0.2]].forEach(([w1, w2]) => {
  check('bobot ' + w1 + '/' + w2 + ' -> keputusan studi kasus tetap 4,2,0,0,2', () => {
    const a = Oxy.allocate(Object.assign({}, caseInput, { w1, w2 }));
    assert.deepStrictEqual(a.decisions.map((d) => d.diberi), [4, 2, 0, 0, 2]);
    near(a.metrics.berbobotKritis, 5 / 7, 1e-9);
  });
});

console.log('\n== 12 skenario acak (Tabel 19-20) ==');
const batch = Oxy.runScenarioBatch({ count: 12, seed: 2026, w1: 0.6, w2: 0.4 });
check('menghasilkan 12 skenario dengan 10-20 fasilitas', () => {
  assert.strictEqual(batch.rows.length, 12);
  batch.rows.forEach((row) => assert.ok(row.fasilitas >= 10 && row.fasilitas <= 20, 'fasilitas=' + row.fasilitas));
});
check('rasio permintaan/stok berada pada rentang 1,0 - 5,8', () => {
  batch.rows.forEach((row) => assert.ok(row.rasio >= 0.95 && row.rasio <= 6.2, 'rasio=' + row.rasio.toFixed(2)));
});
check('seluruh skenario berakhir pada keadaan aman', () => {
  assert.strictEqual(batch.summary.tidakAman, 0);
});
check('prioritas menaikkan pemenuhan berbobot kritis vs urutan masuk', () => {
  assert.ok(batch.summary.kritisPrioritas > batch.summary.kritisMasuk,
    'prioritas=' + batch.summary.kritisPrioritas.toFixed(3) + ' masuk=' + batch.summary.kritisMasuk.toFixed(3));
});
check('Banker\'s menahan stok agar keadaan akhir tetap aman, naif tidak', () => {
  // Stok habis terpakai bisa membuat keadaan akhir tidak aman; uji aman
  // karena itu boleh memberi lebih sedikit daripada kebijakan naif.
  batch.rows.forEach((row) => {
    const sc = row.scenario;
    const common = { facilities: sc.facilities, available: sc.available, weights: { w1: 0.6, w2: 0.4 }, depot: sc.depot, corridorEnd: sc.corridorEnd };
    const naif = Oxy.allocate(Object.assign({}, common, { policy: 'naif', order: 'masuk' }));
    const banker = Oxy.allocate(Object.assign({}, common, { policy: 'banker', order: 'masuk' }));
    assert.ok(banker.metrics.diberikan <= naif.metrics.diberikan, 'baris ' + row.no);
    assert.ok(banker.metrics.akhirAman, 'keadaan akhir Banker\'s harus aman pada baris ' + row.no);
  });
  assert.ok(batch.rows.some((row) => {
    const sc = row.scenario;
    const common = { facilities: sc.facilities, available: sc.available, weights: { w1: 0.6, w2: 0.4 }, depot: sc.depot, corridorEnd: sc.corridorEnd };
    return Oxy.allocate(Object.assign({}, common, { policy: 'naif', order: 'masuk' })).metrics.diberikan >
      Oxy.allocate(Object.assign({}, common, { policy: 'banker', order: 'masuk' })).metrics.diberikan;
  }), 'harus ada skenario yang menunjukkan Banker\'s lebih konservatif');
});

console.log('\n== Validasi masukan ==');
check('minta > need -> DITOLAK', () => {
  const facs = Oxy.normalizeFacilities([{ nama: 'A', pos: 10, max: 5, alokasi: 3, minta: 9, kritis: 1, jam: 10, masuk: 1 }]);
  const d = Oxy.processRequest(facs, 0, 10, 9);
  assert.strictEqual(d.status, 'DITOLAK');
  assert.strictEqual(d.diberi, 0);
});
check('stok 0 -> TUNDA', () => {
  const facs = Oxy.normalizeFacilities(Oxy.DEFAULT_FACILITIES);
  const d = Oxy.processRequest(facs, 0, 0, 4);
  assert.strictEqual(d.status, 'TUNDA');
});
check('klien menormalkan nilai negatif dan alokasi > max', () => {
  const f = Oxy.normalizeFacilities([{ nama: 'X', pos: -5, max: 4, alokasi: 9, minta: -2, kritis: -1, jam: -3, masuk: 0 }])[0];
  assert.strictEqual(f.alokasi, 4);
  assert.strictEqual(f.pos, 0);
  assert.strictEqual(f.minta, 0);
  assert.strictEqual(f.kritis, 0);
  assert.strictEqual(f.jam, 0);
  assert.strictEqual(f.masuk, 1);
});
check('koridor tanpa target menghasilkan rute 0 km', () => {
  const routes = Oxy.buildRoutes({ depot: 40, corridorEnd: 80, targets: [] });
  routes.forEach((rt) => assert.strictEqual(rt.distance, 0));
});
check('SCAN murni dapat lebih jauh daripada LOOK', () => {
  const routes = Oxy.buildRoutes({
    depot: 40, corridorEnd: 100,
    targets: [{ pos: 20, masuk: 1 }, { pos: 60, masuk: 2 }]
  });
  const by = Object.fromEntries(routes.map((x) => [x.key, x]));
  assert.ok(by.scan.distance > by.look.distance, 'scan=' + by.scan.distance + ' look=' + by.look.distance);
});

console.log('\n' + (fail ? 'GAGAL ' + fail + ' / ' + (pass + fail) : 'LULUS ' + pass + ' uji'));
process.exit(fail ? 1 : 0);
