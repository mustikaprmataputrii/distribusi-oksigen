/*!
 * views.js — perender setiap tampilan aplikasi
 */
(function (root) {
  'use strict';
  const Oxy = root.Oxy;
  const UI = root.UI;
  const Charts = root.Charts;
  const fmt = UI.fmt;
  const esc = UI.esc;
  const icon = UI.icon;

  const STATUS_BADGE = {
    DISETUJUI: 'ok',
    PARSIAL: 'warn',
    TUNDA: 'danger',
    DITOLAK: 'danger',
    SELESAI: 'neutral'
  };

  const badge = (text, kind) => '<span class="badge ' + (kind || 'neutral') + '">' + esc(text) + '</span>';
  const statusBadge = (s) => badge(s, STATUS_BADGE[s] || 'neutral');

  function card(title, body, opts) {
    const o = opts || {};
    return '<section class="card' + (o.cls ? ' ' + o.cls : '') + '">'
      + (title ? '<div class="card-head"><div class="grow"><h2>' + title + '</h2>'
        + (o.sub ? '<p>' + o.sub + '</p>' : '') + '</div>'
        + (o.actions || '') + '</div>' : '')
      + '<div class="card-body' + (o.tight ? ' tight' : '') + '">' + body + '</div>'
      + (o.foot ? '<div class="card-foot">' + o.foot + '</div>' : '')
      + '</section>';
  }

  function kpi(label, value, unit, note, kind) {
    return '<div class="kpi' + (kind ? ' ' + kind : '') + '">'
      + '<div class="kpi-label">' + esc(label) + '</div>'
      + '<div class="kpi-value">' + value + (unit ? '<span class="unit">' + esc(unit) + '</span>' : '') + '</div>'
      + (note ? '<div class="kpi-note">' + note + '</div>' : '')
      + '</div>';
  }

  function note(text, kind) {
    const ic = kind === 'danger' || kind === 'warn' ? icon.warn : kind === 'ok' ? icon.check : icon.info;
    return '<div class="note' + (kind ? ' ' + kind : '') + '">' + ic + '<div>' + text + '</div></div>';
  }

  /* ==================================================================== *
   * DASHBOARD
   * ==================================================================== */
  function renderDashboard(R) {
    const a = R.allocation;
    const m = a.metrics;
    const routes = R.routes;
    const by = Object.fromEntries(routes.map((r) => [r.key, r]));
    const tunda = R.escalation.filter((e) => e.status === 'TUNDA');
    const parsial = R.escalation.filter((e) => e.status === 'PARSIAL');
    const tertinggi = R.escalation[0];

    const kpis = '<div class="kpis">'
      + kpi('Pemenuhan permintaan', fmt.pct(m.pemenuhan, 1), '',
        fmt.int(m.diberikan) + ' dari ' + fmt.int(m.diminta) + ' tabung diminta', m.pemenuhan >= 0.8 ? 'ok' : m.pemenuhan >= 0.5 ? '' : 'warn')
      + kpi('Fasilitas terlayani', fmt.int(m.dilayani) + '<span class="unit">/ ' + m.jumlahFasilitas + '</span>', '',
        fmt.pct(m.cakupan, 0) + ' cakupan fasilitas', '')
      + kpi('Hemat rute LOOK', fmt.dec(by.look.hemat * 100, 1) + '<span class="unit">%</span>', '',
        by.look.distance + ' km vs ' + by.fcfs.distance + ' km FCFS', by.look.hemat > 0 ? 'ok' : '')
      + kpi('Stok tersisa', fmt.int(m.sisaStok), 'tabung',
        m.sisaStok === 0 ? 'Seluruh stok terpakai' : 'Belum dialokasikan', m.sisaStok === 0 ? 'warn' : '')
      + kpi('Keadaan akhir', m.akhirAman ? 'Aman' : 'Tidak aman', '',
        m.akhirAman ? 'Masih ada safe sequence' : 'Tidak ada urutan tersisa', m.akhirAman ? 'ok' : 'danger')
      + '</div>';

    // tabel keputusan ringkas
    const rows = a.decisions.map((d) => {
      const f = a.facilities.find((x) => x.id === d.id);
      return '<tr>'
        + '<td class="name">' + esc(d.nama) + '<span class="sub">km ' + fmt.int(f.pos) + ' · skor ' + fmt.skor(d.skor) + '</span></td>'
        + '<td class="r">' + fmt.int(d.minta) + '</td>'
        + '<td class="r">' + fmt.int(d.diberi) + '</td>'
        + '<td class="r">' + fmt.int(Math.max(0, d.minta - d.diberi)) + '</td>'
        + '<td>' + statusBadge(d.status) + '</td>'
        + '</tr>';
    }).join('');
    const decisionTable = '<div class="table-wrap"><table class="data">'
      + '<thead><tr><th>Fasilitas</th><th class="r">Minta</th><th class="r">Diberi</th><th class="r">Kurang</th><th>Status</th></tr></thead>'
      + '<tbody>' + rows + '</tbody>'
      + '<tfoot><tr><td>Total</td><td class="r">' + fmt.int(m.diminta) + '</td><td class="r">' + fmt.int(m.diberikan) + '</td><td class="r">' + fmt.int(m.diminta - m.diberikan) + '</td><td></td></tr></tfoot>'
      + '</table></div>';

    // kartu rute
    const routeCards = routes.map((r) => {
      const isBest = r.key === 'look';
      const svg = Charts.routeDiagram({
        depot: R.input.depot, corridorEnd: R.input.corridorEnd,
        points: r.points, compact: true, arrows: true,
        aria: 'Rute ' + r.name
      });
      return '<div class="rc" style="border:1px solid var(--line);border-radius:10px;padding:12px">'
        + '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:2px">'
        + '<b style="font:600 13.5px var(--sans)">' + esc(r.name) + '</b>'
        + '<span class="num" style="font:600 15px var(--serif)">' + fmt.int(r.distance) + ' km</span></div>'
        + '<div class="xsmall faint" style="margin-bottom:8px">' + (r.hemat > 0 ? 'Hemat ' + fmt.pct(r.hemat, 1) + ' vs FCFS' : 'Acuan') + '</div>'
        + '<div class="chart">' + svg + '</div>'
        + '<div class="xsmall muted mono" style="margin-top:6px">' + esc(r.urutan) + '</div>'
        + '</div>';
    }).join('');

    const attention = (tunda.length || parsial.length)
      ? '<div class="note warn">' + icon.warn + '<div><strong>' + tunda.length + ' fasilitas ditunda'
        + (parsial.length ? ' dan ' + parsial.length + ' menerima sebagian' : '') + '.</strong> '
        + (tertinggi ? 'Prioritas tindak lanjut: ' + esc(tertinggi.nama) + ' — Level ' + tertinggi.level + ' (' + esc(tertinggi.levelNama) + '), sisa cadangan ' + fmt.dec(tertinggi.jam, 1) + ' jam.' : '')
        + '</div></div>'
      : note('Seluruh permintaan terpenuhi pada siklus ini.', 'ok');

    return kpis
      + '<div class="grid g-side" style="margin-top:16px">'
      + card('Keputusan alokasi', decisionTable, {
        tight: true,
        sub: 'Urutan evaluasi: ' + (a.order === 'prioritas' ? 'skor prioritas tertinggi lebih dulu' : 'urutan masuk'),
        actions: '<button class="btn quiet sm" data-goto="bankers" type="button">Rincian ' + icon.arrow + '</button>',
        foot: 'Stok awal ' + fmt.int(R.input.available) + ' tabung · stok akhir ' + fmt.int(m.sisaStok) + ' tabung · ' + (m.akhirAman ? 'keadaan akhir aman' : 'keadaan akhir tidak aman')
      })
      + card('Rute pengantaran', '<div class="grid" style="gap:12px">' + routeCards + '</div>', {
        sub: 'Koridor 0–' + fmt.int(R.input.corridorEnd) + ' km, depot km ' + fmt.int(R.input.depot),
        actions: '<button class="btn quiet sm" data-goto="rute" type="button">Rincian ' + icon.arrow + '</button>'
      })
      + '</div>'
      + '<div class="grid g-2" style="margin-top:16px">'
      + card('Perlu perhatian', attention + '<div class="defs" style="margin-top:12px">'
        + '<div><dt>Fasilitas ditunda</dt><dd>' + fmt.int(tunda.length) + '</dd></div>'
        + '<div><dt>Fasilitas parsial</dt><dd>' + fmt.int(parsial.length) + '</dd></div>'
        + '<div><dt>Tabung kurang</dt><dd>' + fmt.int(m.diminta - m.diberikan) + ' tabung</dd></div>'
        + '<div><dt>Pemenuhan berbobot pasien kritis</dt><dd>' + fmt.pct(m.berbobotKritis, 1) + '</dd></div>'
        + '</div>', { sub: 'Berdasarkan sisa cadangan oksigen tiap fasilitas' })
      + card('Alur satu siklus', '<div class="flow">'
        + flowStep(1, 'Muat data &amp; hitung skor', 'Stok depot ' + fmt.int(R.input.available) + ' tabung; ' + a.facilities.length + ' fasilitas; bobot ' + fmt.dec(R.input.w1, 1) + ' / ' + fmt.dec(R.input.w2, 1) + '.', true)
        + flowStep(2, 'Uji safe state (Banker&rsquo;s)', fmt.int(m.diberikan) + ' tabung disetujui, keadaan akhir ' + (m.akhirAman ? 'aman' : 'tidak aman') + '.', true)
        + flowStep(3, 'Urutkan rute (SCAN / LOOK)', 'LOOK ' + fmt.int(by.look.distance) + ' km · SCAN ' + fmt.int(by.scan.distance) + ' km · FCFS ' + fmt.int(by.fcfs.distance) + ' km.', true)
        + flowStep(4, 'Eskalasi &amp; siklus berikutnya', fmt.int(tunda.length) + ' fasilitas ditunda; tabung kosong kembali setelah τ = ' + fmt.int(R.input.tau) + ' siklus.', false, true)
        + '</div>', { sub: 'Ringkas: dari masukan ke tindak lanjut' })
      + '</div>';
  }

  function flowStep(n, title, text, on, last) {
    return '<div class="flow-step"><div class="flow-rail"><div class="flow-dot' + (on ? ' on' : '') + '">' + n + '</div>'
      + (last ? '' : '<div class="flow-line"></div>') + '</div>'
      + '<div class="flow-body"><b>' + title + '</b><span class="xsmall muted">' + text + '</span></div></div>';
  }

  /* ==================================================================== *
   * DATA & PARAMETER
   * ==================================================================== */
  function renderData(state, R) {
    const f = state.form;
    const head = '<div class="grid g-2">'
      + card('Parameter sistem', '<div class="form-grid">'
        + field('Stok depot (tabung)', '<input class="input" type="number" min="0" step="1" data-bind="available" value="' + f.available + '">', 'Available pada awal siklus')
        + field('Posisi depot (km)', '<input class="input" type="number" min="0" step="1" data-bind="depot" value="' + f.depot + '">', 'Titik awal armada')
        + field('Ujung koridor (km)', '<input class="input" type="number" min="1" step="1" data-bind="corridorEnd" value="' + f.corridorEnd + '">', 'Batas SCAN berbalik arah')
        + '</div>', { sub: 'Satu depot, satu jenis tabung, koridor linear' })
      + card('Skor prioritas', '<div class="form-grid">'
        + field('Bobot pasien kritis (w₁)', '<div class="range-row"><input type="range" min="0" max="1" step="0.05" data-bind="w1" value="' + f.w1 + '" aria-label="Bobot pasien kritis"><output class="num" data-out="w1" style="min-width:34px;text-align:right">' + fmt.dec(f.w1, 2) + '</output></div>', '')
        + field('Bobot cadangan (w₂)', '<div class="range-row"><input type="range" min="0" max="1" step="0.05" data-bind="w2" value="' + f.w2 + '" aria-label="Bobot cadangan oksigen"><output class="num" data-out="w2" style="min-width:34px;text-align:right">' + fmt.dec(f.w2, 2) + '</output></div>', '')
        + field('Urutan evaluasi', '<select class="select" data-bind="order">'
          + '<option value="prioritas"' + (f.order === 'prioritas' ? ' selected' : '') + '>Skor prioritas</option>'
          + '<option value="masuk"' + (f.order === 'masuk' ? ' selected' : '') + '>Urutan masuk</option>'
          + '</select>', '')
        + '</div>'
        + '<p class="xsmall faint" style="margin-top:12px">Skor = w₁ × (K / K<sub>maks</sub>) + w₂ × (1 − min(C, 24) / 24). Skor hanya mengatur urutan uji; keputusan akhir tetap uji safe state.</p>'
        + '<div class="note info" style="margin-top:10px">' + icon.info + '<div>Pasangan bobot yang diuji pada laporan: 0,5/0,5 · 0,6/0,4 · 0,7/0,3 · 0,8/0,2.</div></div>'
        + '<div class="form-row" style="margin-top:12px">'
        + [[0.5, 0.5], [0.6, 0.4], [0.7, 0.3], [0.8, 0.2]].map(([a, b]) =>
          '<button class="btn ghost sm" type="button" data-weights="' + a + '/' + b + '"'
          + (Math.abs(f.w1 - a) < 0.001 && Math.abs(f.w2 - b) < 0.001 ? ' style="border-color:var(--accent);color:var(--accent)"' : '')
          + '>' + fmt.dec(a, 1) + ' / ' + fmt.dec(b, 1) + '</button>').join('')
        + '</div>', { sub: 'Mengatur siapa diuji lebih dahulu' })
      + '</div>';

    const rows = state.facilities.map((row, i) => {
      const need = Math.max(0, row.max - row.alokasi);
      return '<tr data-row="' + i + '">'
        + '<td><input class="input cell name" data-f="nama" value="' + esc(row.nama) + '" aria-label="Nama fasilitas ' + (i + 1) + '"></td>'
        + '<td><input class="input cell num" type="number" min="0" step="1" data-f="pos" value="' + row.pos + '" aria-label="Posisi km"></td>'
        + '<td><input class="input cell num" type="number" min="0" step="1" data-f="max" value="' + row.max + '" aria-label="Max"></td>'
        + '<td><input class="input cell num" type="number" min="0" step="1" data-f="alokasi" value="' + row.alokasi + '" aria-label="Alokasi"></td>'
        + '<td class="r num" data-need>' + fmt.int(need) + '</td>'
        + '<td><input class="input cell num" type="number" min="0" step="1" data-f="minta" value="' + row.minta + '" aria-label="Minta"></td>'
        + '<td><input class="input cell num" type="number" min="0" step="1" data-f="kritis" value="' + row.kritis + '" aria-label="Pasien kritis"></td>'
        + '<td><input class="input cell num" type="number" min="0" step="0.5" data-f="jam" value="' + row.jam + '" aria-label="Cadangan jam"></td>'
        + '<td><input class="input cell num" type="number" min="1" step="1" data-f="masuk" value="' + row.masuk + '" aria-label="Urutan masuk"></td>'
        + '<td class="actions"><button class="btn quiet sm" data-del="' + i + '" type="button" aria-label="Hapus ' + esc(row.nama) + '" title="Hapus baris">✕</button></td>'
        + '</tr>';
    }).join('');

    const table = '<div class="table-wrap"><table class="data" id="facTable">'
      + '<thead><tr><th style="min-width:170px">Fasilitas</th><th class="r">Posisi km</th><th class="r">Max</th><th class="r">Alokasi</th><th class="r">Need</th><th class="r">Minta</th><th class="r">Kritis</th><th class="r">Cadangan jam</th><th class="r">Masuk</th><th></th></tr></thead>'
      + '<tbody>' + rows + '</tbody></table></div>';

    const totals = state.facilities.reduce((acc, r) => {
      acc.max += Number(r.max) || 0; acc.alokasi += Number(r.alokasi) || 0; acc.minta += Number(r.minta) || 0;
      return acc;
    }, { max: 0, alokasi: 0, minta: 0 });

    const tableCard = card('Data fasilitas', table, {
      tight: true,
      sub: state.facilities.length + ' fasilitas · Need = Max − Alokasi · isian langsung dihitung ulang',
      actions: '<div style="display:flex;gap:6px;flex-wrap:wrap">'
        + '<button class="btn ghost sm" id="addRowBtn" type="button">+ Tambah baris</button>'
        + '<button class="btn ghost sm" id="addSampleBtn" type="button">Muat 5 fasilitas contoh</button></div>',
      foot: 'Total Max ' + fmt.int(totals.max) + ' · Alokasi ' + fmt.int(totals.alokasi) + ' · Minta ' + fmt.int(totals.minta)
        + ' · tabung di sistem ' + fmt.int(R.totalTabung) + ' (stok + alokasi)'
    });

    const validation = [];
    state.facilities.forEach((r) => {
      if (Number(r.alokasi) > Number(r.max)) validation.push(esc(r.nama) + ': Alokasi melebihi Max, akan dibatasi ke Max.');
      if (Number(r.minta) > Number(r.max) - Number(r.alokasi)) validation.push(esc(r.nama) + ': Minta melebihi Need, permintaan akan ditolak.');
    });
    if (Number(f.corridorEnd) <= Number(f.depot)) validation.push('Ujung koridor harus lebih besar dari posisi depot.');
    const valBox = validation.length
      ? '<div style="margin-top:16px">' + note('<strong>Pemeriksaan masukan.</strong><ul style="margin:6px 0 0;padding-left:18px">'
        + validation.slice(0, 6).map((v) => '<li>' + v + '</li>').join('') + '</ul>', 'warn') + '</div>'
      : '<div style="margin-top:16px">' + note('Data masukan konsisten: Alokasi ≤ Max dan Minta ≤ Need untuk seluruh fasilitas.', 'ok') + '</div>';

    return head + '<div style="margin-top:16px">' + tableCard + '</div>' + valBox;
  }

  function field(label, control, hint) {
    return '<div class="field"><label>' + label + '</label>' + control + (hint ? '<span class="hint">' + hint + '</span>' : '') + '</div>';
  }

  /* ==================================================================== *
   * BANKER'S
   * ==================================================================== */
  function renderBankers(R) {
    const a = R.allocation;
    const m = a.metrics;

    const safe = a.safeInitial;
    const safeCard = card('Kondisi awal', (safe.safe
      ? note('<strong>Aman.</strong> Ada safe sequence sehingga seluruh fasilitas dapat diselesaikan bergiliran.', 'ok')
        + '<div class="steps" style="margin-top:12px">' + safe.steps.map((s, i) =>
          '<div class="step ok"><span class="mark">' + (i + 1) + '</span><div class="txt"><b>' + esc(s.nama) + '</b>'
          + '<span class="seq">Need ' + fmt.int(s.need) + ' ≤ Work ' + fmt.int(s.workBefore) + ' → Work menjadi ' + fmt.int(s.workAfter) + '</span>'
          + '</div><span class="badge ok plain">selesai</span></div>').join('') + '</div>'
      : note('<strong>Tidak aman.</strong> Tidak ada urutan yang memungkinkan semua fasilitas terpenuhi dengan stok ini.', 'danger')
        + '<p class="small muted" style="margin-top:10px">Fasilitas yang tidak dapat diselesaikan: ' + esc(safe.stuck.join(', ')) + '</p>'), {
      sub: 'Safety algorithm: Work = Available, cari Need ≤ Work, Work = Work + Allocation'
    });

    const kpis = '<div class="kpis">'
      + kpi('Diminta', fmt.int(m.diminta), 'tabung', 'Total permintaan siklus ini')
      + kpi('Disetujui', fmt.int(m.diberikan), 'tabung', fmt.pct(m.pemenuhan, 1) + ' dari permintaan', 'accent')
      + kpi('Ditunda / ditolak', fmt.int(a.decisions.filter((d) => d.status === 'TUNDA' || d.status === 'DITOLAK').length), 'fasilitas', fmt.int(a.decisions.filter((d) => d.status === 'PARSIAL').length) + ' menerima sebagian', 'warn')
      + kpi('Sisa stok', fmt.int(m.sisaStok), 'tabung', m.akhirAman ? 'Keadaan akhir aman' : 'Keadaan akhir tidak aman', m.akhirAman ? 'ok' : 'danger')
      + '</div>';

    const rows = a.decisions.map((d) => {
      const f = a.facilities.find((x) => x.id === d.id);
      const steps = d.attempts && d.attempts.length
        ? '<div class="steps" style="margin-top:8px">' + d.attempts.map((t) =>
          '<div class="step ' + (t.aman ? 'ok' : 'no') + '"><span class="mark">' + t.j + '</span><div class="txt">'
          + 'Coba <b>' + t.j + ' tabung</b> → sisa stok ' + fmt.int(t.sisa) + ': ' + (t.aman ? 'aman' : 'tidak aman')
          + (t.aman ? '<span class="seq">safe sequence: ' + esc(t.urutan.join(' → ')) + '</span>'
            : (t.buntu && t.buntu.length ? '<span class="seq">buntu pada: ' + esc(t.buntu.slice(0, 4).join(', ')) + (t.buntu.length > 4 ? '…' : '') + '</span>' : ''))
          + '</div><span class="badge ' + (t.aman ? 'ok' : 'danger') + ' plain">' + (t.aman ? 'aman' : 'buntu') + '</span></div>').join('') + '</div>'
        : '<span class="xsmall faint">' + esc(d.alasan || '') + '</span>';

      return '<tr>'
        + '<td class="name">' + esc(d.nama) + '<span class="sub">km ' + fmt.int(f.pos) + ' · ' + fmt.int(f.kritis) + ' pasien kritis · cadangan ' + fmt.dec(f.jam, 1) + ' jam</span></td>'
        + '<td class="r">' + fmt.skor(d.skor) + '</td>'
        + '<td class="r">' + fmt.int(d.need) + '</td>'
        + '<td class="r">' + fmt.int(d.minta) + '</td>'
        + '<td class="r"><strong>' + fmt.int(d.diberi) + '</strong></td>'
        + '<td>' + statusBadge(d.status) + '</td>'
        + '<td class="r">' + fmt.int(d.available) + '</td>'
        + '<td style="min-width:260px">' + steps + '</td>'
        + '</tr>';
    }).join('');

    const table = '<div class="table-wrap"><table class="data">'
      + '<thead><tr><th>Fasilitas</th><th class="r">Skor</th><th class="r">Need</th><th class="r">Minta</th><th class="r">Diberi</th><th>Status</th><th class="r">Sisa stok</th><th>Uji safe state</th></tr></thead>'
      + '<tbody>' + rows + '</tbody></table></div>';

    const finalSafe = a.safeFinal;
    return kpis
      + '<div style="margin-top:16px">' + card('Keputusan per permintaan', table, {
        tight: true,
        sub: 'Diuji menurut ' + (a.order === 'prioritas' ? 'skor prioritas' : 'urutan masuk') + '; bila jumlah penuh tidak aman, dicoba jumlah yang lebih kecil',
        foot: 'Keadaan akhir ' + (finalSafe.safe ? 'aman' : 'tidak aman')
          + (finalSafe.safe ? ' dengan safe sequence: ' + esc(finalSafe.order.join(' → ')) : '')
      }) + '</div>'
      + '<div class="grid g-2" style="margin-top:16px">'
      + safeCard
      + card('Cara membaca hasil', '<ul class="list">'
        + '<li><span class="idx">1</span><div class="grow"><b>Disetujui</b> — permintaan penuh lolos uji safe state.</div></li>'
        + '<li><span class="idx">2</span><div class="grow"><b>Parsial</b> — jumlah penuh membuat keadaan tidak aman, sistem memberi jumlah terbesar yang masih aman.</div></li>'
        + '<li><span class="idx">3</span><div class="grow"><b>Ditunda</b> — tidak ada jumlah yang aman atau stok habis; dilayani pada siklus berikutnya.</div></li>'
        + '<li><span class="idx">4</span><div class="grow"><b>Ditolak</b> — permintaan melebihi Need sehingga tidak masuk uji.</div></li>'
        + '</ul>', { sub: 'Empat status keputusan' })
      + '</div>';
  }

  /* ==================================================================== *
   * RUTE
   * ==================================================================== */
  function renderRute(R) {
    const routes = R.routes;
    const by = Object.fromEntries(routes.map((r) => [r.key, r]));
    const targets = R.targets;

    if (!targets.length) {
      return card('Rute pengantaran', note('Tidak ada fasilitas yang menerima tabung pada siklus ini, sehingga tidak ada rute yang perlu ditempuh.', 'warn'), {
        sub: 'Koridor 0–' + fmt.int(R.input.corridorEnd) + ' km'
      });
    }

    const kpis = '<div class="kpis">'
      + kpi('FCFS', fmt.int(by.fcfs.distance), 'km', 'Acuan urutan masuk')
      + kpi('SCAN', fmt.int(by.scan.distance), 'km', 'Hemat ' + fmt.pct(by.scan.hemat, 1) + ' vs FCFS', 'accent')
      + kpi('LOOK', fmt.int(by.look.distance), 'km', 'Hemat ' + fmt.pct(by.look.hemat, 1) + ' vs FCFS', 'ok')
      + kpi('Titik kunjungan', fmt.int(targets.length), 'fasilitas', fmt.int(targets.reduce((s, t) => s + t.diberi, 0)) + ' tabung diantar')
      + '</div>';

    const big = routes.map((r) => card(esc(r.name), ''
      + '<div class="chart">' + Charts.routeDiagram({ depot: R.input.depot, corridorEnd: R.input.corridorEnd, points: r.points, arrows: true, aria: 'Rute ' + r.name }) + '</div>'
      + '<div class="defs" style="margin-top:14px">'
      + '<div><dt>Urutan kunjungan</dt><dd class="mono" style="font-weight:500">' + esc(r.urutan) + '</dd></div>'
      + '<div><dt>Perhitungan</dt><dd class="mono" style="font-weight:500">' + esc(r.detail.text) + '</dd></div>'
      + '<div><dt>Total jarak</dt><dd>' + fmt.int(r.distance) + ' km</dd></div>'
      + '<div><dt>Selisih terhadap FCFS</dt><dd>' + (r.key === 'fcfs' ? '—' : (r.hemat > 0 ? '−' + fmt.int(by.fcfs.distance - r.distance) + ' km (' + fmt.pct(r.hemat, 1) + ')' : '+' + fmt.int(r.distance - by.fcfs.distance) + ' km')) + '</dd></div>'
      + '</div>', {
      sub: r.key === 'fcfs' ? 'Urutan permintaan masuk' : r.key === 'scan' ? 'Sampai ujung koridor lalu berbalik' : 'Berbalik di fasilitas terjauh',
      actions: r.key === 'look' ? '<span class="badge ok">paling hemat</span>' : (r.key === 'scan' ? '<span class="badge info">acuan laporan</span>' : '')
    })).join('');

    const tripRows = targets.slice().sort((a, b) => a.pos - b.pos).map((t) => {
      const d = R.allocation.decisions.find((x) => x.id === t.id);
      return '<tr><td class="name">' + esc(t.nama) + '<span class="sub">km ' + fmt.int(t.pos) + '</span></td>'
        + '<td class="r">' + fmt.int(d ? d.diberi : 0) + '</td>'
        + '<td class="r">' + fmt.int(Math.abs(t.pos - R.input.depot)) + ' km</td>'
        + '<td>' + statusBadge(d ? d.status : 'DISETUJUI') + '</td></tr>';
    }).join('');

    return kpis
      + '<div style="margin-top:16px">' + card('Diagram rute', '<div class="grid" style="gap:14px">' + big + '</div>', {
        sub: 'Koridor 0–' + fmt.int(R.input.corridorEnd) + ' km · depot km ' + fmt.int(R.input.depot) + ' · ' + targets.length + ' titik kunjungan',
        foot: 'SCAN murni menempuh perjalanan sampai ujung koridor, sehingga dapat lebih jauh daripada LOOK.'
      }) + '</div>'
      + '<div style="margin-top:16px">' + card('Fasilitas yang dikirimi', '<div class="table-wrap"><table class="data">'
        + '<thead><tr><th>Fasilitas</th><th class="r">Tabung</th><th class="r">Jarak dari depot</th><th>Status</th></tr></thead>'
        + '<tbody>' + tripRows + '</tbody></table></div>', {
        tight: true,
        sub: 'Hanya fasilitas dengan keputusan diberi > 0'
      }) + '</div>';
  }

  /* ==================================================================== *
   * ESKALASI
   * ==================================================================== */
  function renderEskalasi(R) {
    const list = R.escalation;
    const levels = [
      { level: 1, nama: 'Waspada', ambang: '≤ 12 jam', warna: 'warn' },
      { level: 2, nama: 'Siaga', ambang: '≤ 8 jam', warna: 'warn' },
      { level: 3, nama: 'Darurat', ambang: '≤ 4 jam', warna: 'danger' }
    ];

    const legend = '<div class="grid g-3" style="gap:12px">' + levels.map((l) => {
      const count = list.filter((e) => e.level === l.level).length;
      return '<div class="kpi' + (l.level === 3 ? ' danger' : l.level === 2 ? ' warn' : '') + '">'
        + '<div class="kpi-label">Level ' + l.level + ' · ' + l.nama + '</div>'
        + '<div class="kpi-value">' + count + '<span class="unit">fasilitas</span></div>'
        + '<div class="kpi-note">Pemicu: ditunda &amp; cadangan ' + l.ambang + '</div>'
        + '</div>';
    }).join('') + '</div>';

    if (!list.length) {
      return legend + '<div style="margin-top:16px">' + card('Status eskalasi',
        note('Tidak ada fasilitas yang perlu dieskalasi: seluruh permintaan terpenuhi pada siklus ini.', 'ok'),
        { sub: 'Protokol hanya berlaku untuk fasilitas yang belum terpenuhi' }) + '</div>';
    }

    const cards = list.map((e) => {
      const kind = e.level === 3 ? 'danger' : e.level === 2 ? 'warn' : 'info';
      const donor = e.donors.length
        ? '<div class="table-wrap" style="margin-top:8px"><table class="data"><thead><tr><th>Kandidat pemasok</th><th class="r">Cadangan</th><th class="r">Jarak</th></tr></thead><tbody>'
          + e.donors.map((d) => '<tr><td class="name">' + esc(d.nama) + '<span class="sub">km ' + fmt.int(d.pos) + ' · alokasi ' + fmt.int(d.alokasi) + '</span></td>'
            + '<td class="r">' + fmt.dec(d.jam, 1) + ' jam</td><td class="r">' + fmt.int(d.jarak) + ' km</td></tr>').join('')
          + '</tbody></table></div>'
        : '';
      return '<div style="border:1px solid var(--line);border-radius:10px;padding:14px;background:var(--surface)">'
        + '<div style="display:flex;align-items:flex-start;gap:10px;justify-content:space-between;flex-wrap:wrap">'
        + '<div><div style="font:600 14px var(--sans)">' + esc(e.nama) + '</div>'
        + '<div class="xsmall faint">' + esc(e.kategori) + ' · kurang ' + fmt.int(e.kurang) + ' tabung · km ' + fmt.int(e.pos) + '</div></div>'
        + '<div style="display:flex;gap:6px;align-items:center">' + statusBadge(e.status) + badge('Level ' + e.level + ' · ' + e.levelNama, kind) + '</div>'
        + '</div>'
        + '<div class="defs" style="margin-top:10px">'
        + '<div><dt>Cadangan oksigen</dt><dd>' + fmt.dec(e.jam, 1) + ' jam</dd></div>'
        + '<div><dt>Jarak dari depot</dt><dd>' + fmt.int(e.jarakDepot) + ' km</dd></div>'
        + '</div>'
        + '<p class="small" style="margin-top:10px;color:var(--ink-2)"><strong>Tindakan.</strong> ' + esc(e.tindakan) + '</p>'
        + donor
        + '</div>';
    }).join('');

    return legend + '<div style="margin-top:16px">' + card('Fasilitas yang perlu tindak lanjut', '<div class="grid" style="gap:12px">' + cards + '</div>', {
      sub: list.length + ' fasilitas belum terpenuhi penuh',
      foot: 'Ambang jam (12 / 8 / 4) adalah asumsi rancangan pada laporan dan belum diuji secara klinis.'
    }) + '</div>';
  }

  /* ==================================================================== *
   * MULTISIKLUS
   * ==================================================================== */
  function renderMultisiklus(state, R) {
    const c = R.cycles;
    const sweep = R.sweep;
    const f = state.form;

    const controls = '<div class="form-grid">'
      + field('Waktu pengisian ulang (τ)', '<input class="input" type="number" min="0" max="12" step="1" data-bind="tau" value="' + f.tau + '">', 'Siklus sebelum tabung kosong kembali')
      + field('Jumlah siklus', '<input class="input" type="number" min="1" max="60" step="1" data-bind="cycles" value="' + f.cycles + '">', 'Panjang horizon simulasi')
      + field('Panjang satu siklus (jam)', '<input class="input" type="number" min="1" max="48" step="1" data-bind="cycleHours" value="' + f.cycleHours + '">', 'Dipakai untuk konteks waktu')
      + field('Kebijakan', '<select class="select" data-bind="policy">'
        + '<option value="banker"' + (f.policy === 'banker' ? ' selected' : '') + '>Banker&rsquo;s (uji aman + parsial)</option>'
        + '<option value="naif"' + (f.policy === 'naif' ? ' selected' : '') + '>Naif (tanpa uji aman)</option>'
        + '</select>', 'Pembanding pada laporan')
      + '</div>';

    const kpis = '<div class="kpis">'
      + kpi('Episode layanan selesai', fmt.int(c.totalEpisode), 'episode', 'Allocation = Max lalu tabung dilepas', 'accent')
      + kpi('Deadlock', c.deadlockAt ? 'Siklus ' + c.deadlockAt : 'Tidak ada', '', c.deadlockAt ? 'Simulasi berhenti pada siklus tersebut' : 'Seluruh ' + c.rows.length + ' siklus berjalan', c.deadlockAt ? 'danger' : 'ok')
      + kpi('Tabung dikirim', fmt.int(c.totalDiberi), 'tabung', 'Akumulasi seluruh siklus')
      + kpi('Total jarak', fmt.int(c.totalKm.look), 'km', 'Rute LOOK; FCFS ' + fmt.int(c.totalKm.fcfs) + ' km', '')
      + '</div>';

    const chart = Charts.lineChart({
      categories: sweep.map((s) => 'τ = ' + s.tau),
      series: [
        { name: 'Banker\'s', values: sweep.map((s) => s.bankerEpisode), color: Charts.palette().accent, area: true },
        { name: 'Naif', values: sweep.map((s) => s.naifEpisode), color: Charts.palette().warn, dashed: true }
      ],
      yTitle: 'Episode selesai',
      xTitle: 'Waktu pengisian ulang τ',
      aria: 'Episode layanan selesai terhadap τ'
    });

    const sweepRows = sweep.map((s) => '<tr>'
      + '<td class="r">' + s.tau + '</td>'
      + '<td class="r">' + fmt.int(s.bankerEpisode) + '</td>'
      + '<td>' + (s.bankerDeadlock ? badge('siklus ' + s.bankerDeadlock, 'danger') : badge('aman', 'ok')) + '</td>'
      + '<td class="r">' + fmt.int(s.naifEpisode) + '</td>'
      + '<td>' + (s.naifDeadlock ? badge('siklus ' + s.naifDeadlock, 'danger') : badge('—', 'neutral')) + '</td>'
      + '</tr>').join('');

    const cycleRows = c.rows.map((r) => '<tr>'
      + '<td class="r">' + r.t + '</td>'
      + '<td class="r">' + fmt.int(r.availStart) + '</td>'
      + '<td class="r">' + fmt.int(r.diberi) + '</td>'
      + '<td class="r">' + (r.kembali ? '+' + fmt.int(r.kembali) : '0') + '</td>'
      + '<td class="r">' + fmt.int(r.availEnd) + '</td>'
      + '<td class="r">' + fmt.int(r.selesai) + '</td>'
      + '<td class="r">' + fmt.int(r.antreIsi) + '</td>'
      + '<td class="r">' + (r.routes ? fmt.int(r.kmLook) + ' km' : '—') + '</td>'
      + '</tr>').join('');

    const episodeRows = c.episodes.map((e) => '<tr>'
      + '<td class="name">' + esc(e.nama) + '<span class="sub">km ' + fmt.int(e.pos) + ' · Max ' + fmt.int(e.max) + ' tabung</span></td>'
      + '<td class="r">' + fmt.int(e.episode) + '</td>'
      + '<td class="r">' + fmt.dec(c.rows.length ? (e.episode / c.rows.length) * 100 : 0, 1) + '%</td>'
      + '<td>' + barMini(c.rows.length ? e.episode / Math.max(1, Math.max(...c.episodes.map((x) => x.episode))) : 0) + '</td>'
      + '</tr>').join('');

    const bandingkan = c.policy === 'banker' ? 'naif' : 'banker';
    const band = simulateFor(R, bandingkan);
    const compareRow = '<tr class="total">'
      + '<td>Kebijakan ' + (c.policy === 'naif' ? 'naif' : 'Banker&rsquo;s') + '</td>'
      + '<td class="r">' + fmt.int(c.totalEpisode) + '</td>'
      + '<td>' + (c.deadlockAt ? badge('Deadlock siklus ' + c.deadlockAt, 'danger') : badge('Tanpa deadlock', 'ok')) + '</td>'
      + '<td class="r">' + fmt.int(c.totalDiberi) + '</td></tr>'
      + '<tr><td>Kebijakan ' + (bandingkan === 'naif' ? 'naif' : 'Banker&rsquo;s') + '</td>'
      + '<td class="r">' + fmt.int(band.totalEpisode) + '</td>'
      + '<td>' + (band.deadlockAt ? badge('Deadlock siklus ' + band.deadlockAt, 'danger') : badge('Tanpa deadlock', 'ok')) + '</td>'
      + '<td class="r">' + fmt.int(band.totalDiberi) + '</td></tr>';

    return card('Parameter simulasi', controls, { sub: 'Available(t+1) = Available(t) − Diberikan(t) + Kembali(t−τ)' })
      + '<div style="margin-top:16px">' + kpis + '</div>'
      + '<div class="grid g-side-r" style="margin-top:16px">'
      + card('Episode selesai terhadap τ', '<div class="chart">' + chart + '</div>'
        + '<div class="chart-legend"><span><i style="background:var(--accent)"></i>Banker&rsquo;s</span><span><i style="background:var(--warn)"></i>Naif (tanpa uji aman)</span></div>', {
        sub: 'Laju layanan turun saat τ naik'
      })
      + card('Ringkasan τ', '<div class="table-wrap"><table class="data">'
        + '<thead><tr><th class="r">τ</th><th class="r">Banker&rsquo;s</th><th>Deadlock</th><th class="r">Naif</th><th>Deadlock</th></tr></thead>'
        + '<tbody>' + sweepRows + '</tbody></table></div>', { tight: true, sub: 'Perbandingan kebijakan' })
      + '</div>'
      + '<div class="grid g-2" style="margin-top:16px">'
      + card('Perbandingan kebijakan', '<div class="table-wrap"><table class="data">'
        + '<thead><tr><th>Kebijakan</th><th class="r">Episode</th><th>Deadlock</th><th class="r">Tabung dikirim</th></tr></thead>'
        + '<tbody>' + compareRow + '</tbody></table></div>', {
        tight: true,
        sub: 'τ = ' + c.tau + ' · ' + c.rows.length + ' siklus · urutan masuk',
        foot: 'Uji aman menahan pemberian yang membuat keadaan buntu, sehingga laju layanan lebih rendah tetapi tanpa deadlock.'
      })
      + card('Episode per fasilitas', '<div class="table-wrap"><table class="data">'
        + '<thead><tr><th>Fasilitas</th><th class="r">Episode</th><th class="r">Rasio</th><th style="min-width:120px">Sebaran</th></tr></thead>'
        + '<tbody>' + episodeRows + '</tbody></table></div>', {
        tight: true,
        sub: 'Fasilitas selesai bila Allocation = Max'
      })
      + '</div>'
      + '<div style="margin-top:16px">' + card('Jejak siklus — kebijakan ' + (c.policy === 'naif' ? 'naif' : 'Banker&rsquo;s') + ', τ = ' + c.tau,
        '<div class="table-wrap"><table class="data">'
        + '<thead><tr><th class="r">Siklus</th><th class="r">Stok awal</th><th class="r">Diberikan</th><th class="r">Kembali</th><th class="r">Stok akhir</th><th class="r">Selesai</th><th class="r">Antre isi ulang</th><th class="r">Jarak LOOK</th></tr></thead>'
        + '<tbody>' + cycleRows + '</tbody></table></div>', {
        tight: true,
        sub: c.rows.length + ' siklus · urutan evaluasi ' + (c.order === 'prioritas' ? 'skor prioritas' : 'urutan masuk'),
        foot: c.deadlockAt ? 'Deadlock terdeteksi pada siklus ' + c.deadlockAt + '; simulasi dihentikan.' : 'Tidak ada deadlock terdeteksi selama ' + c.rows.length + ' siklus.'
      }) + '</div>';
  }

  /** Menjalankan ulang simulasi multisiklus dengan kebijakan pembanding. */
  function simulateFor(R, policy) {
    return Oxy.simulateCycles({
      facilities: R.facilities,
      available: R.input.available,
      depot: R.input.depot,
      corridorEnd: R.input.corridorEnd,
      w1: R.input.w1, w2: R.input.w2,
      order: R.input.orderSiklus,
      policy,
      tau: R.input.tau,
      cycles: R.input.cycles,
      cycleHours: R.input.cycleHours
    });
  }

  /** Batang mini untuk kolom sebaran. */
  function barMini(ratio) {
    const w = Math.max(0, Math.min(1, ratio)) * 100;
    return '<div style="height:6px;background:var(--surface-2);border-radius:3px;overflow:hidden">'
      + '<div style="height:100%;width:' + w.toFixed(1) + '%;background:var(--accent);border-radius:3px"></div></div>';
  }

  /* ==================================================================== *
   * SKENARIO
   * ==================================================================== */
  function renderSkenario(state, batch) {
    const f = state.form;
    const controls = '<div class="form-row">'
      + '<div class="field" style="max-width:150px"><label>Jumlah skenario</label><input class="input" type="number" min="1" max="24" step="1" data-bind="scenarioCount" value="' + f.scenarioCount + '"></div>'
      + '<div class="field" style="max-width:150px"><label>Benih acak</label><input class="input" type="number" min="1" step="1" data-bind="scenarioSeed" value="' + f.scenarioSeed + '"></div>'
      + '<button class="btn" id="runBatchBtn" type="button">Bangkitkan &amp; uji</button>'
      + '<span class="xsmall faint" style="padding-bottom:9px">10–20 fasilitas · koridor 0–100 km · depot km 50 · rasio permintaan/stok 1,0–5,8</span>'
      + '</div>';

    if (!batch) {
      return card('Pembangkit skenario', controls + '<div style="margin-top:14px">'
        + note('Tekan <strong>Bangkitkan &amp; uji</strong> untuk membuat skenario acak terkontrol dengan benih tetap sehingga hasil dapat direproduksi.', 'info')
        + '</div>', { sub: 'Pengujian pada laporan memakai 12 skenario, benih 2026' });
    }

    const s = batch.summary;
    const kpis = '<div class="kpis">'
      + kpi('Pemenuhan rata-rata', fmt.pct(s.pemenuhan, 1), '', 'Diberikan ÷ diminta')
      + kpi('Berbobot kritis — prioritas', fmt.pct(s.kritisPrioritas, 1), '', 'Naif ' + fmt.pct(s.kritisNaif, 1) + ' · masuk ' + fmt.pct(s.kritisMasuk, 1), 'accent')
      + kpi('Cakupan fasilitas', fmt.pct(s.cakupan, 1), '', 'Fasilitas terlayani')
      + kpi('Keadaan akhir tidak aman', fmt.int(s.tidakAman) + '<span class="unit">/ ' + s.total + '</span>', '', 'Satu siklus alokasi', s.tidakAman ? 'danger' : 'ok')
      + '</div>';

    const rows = batch.rows.map((r) => '<tr>'
      + '<td class="r">' + r.no + '</td>'
      + '<td class="r">' + r.fasilitas + '</td>'
      + '<td class="r">' + fmt.int(r.stok) + '</td>'
      + '<td class="r">' + fmt.dec(r.rasio, 2) + '</td>'
      + '<td class="r">' + fmt.pct(r.pemenuhan, 1) + '</td>'
      + '<td class="r">' + fmt.pct(r.kritisNaif, 1) + '</td>'
      + '<td class="r">' + fmt.pct(r.kritisMasuk, 1) + '</td>'
      + '<td class="r"><strong>' + fmt.pct(r.kritisPrioritas, 1) + '</strong></td>'
      + '<td class="r">' + fmt.int(r.kmFcfs) + '</td>'
      + '<td class="r">' + fmt.int(r.kmScan) + '</td>'
      + '<td class="r">' + fmt.int(r.kmLook) + '</td>'
      + '</tr>').join('');

    const routeChart = Charts.barChart({
      items: [
        { label: 'FCFS', value: s.kmFcfs, display: fmt.int(s.kmFcfs) + ' km', color: Charts.palette().line2 },
        { label: 'SCAN', value: s.kmScan, display: fmt.int(s.kmScan) + ' km', color: Charts.palette().info },
        { label: 'LOOK', value: s.kmLook, display: fmt.int(s.kmLook) + ' km', color: Charts.palette().accent, highlight: true }
      ],
      aria: 'Rata-rata jarak per metode'
    });

    const policyChart = Charts.barChart({
      items: [
        { label: 'Naif (urutan masuk)', value: s.kritisNaif * 100, display: fmt.pct(s.kritisNaif, 1), color: Charts.palette().line2 },
        { label: 'Banker\'s (urutan masuk)', value: s.kritisMasuk * 100, display: fmt.pct(s.kritisMasuk, 1), color: Charts.palette().info },
        { label: 'Banker\'s + prioritas', value: s.kritisPrioritas * 100, display: fmt.pct(s.kritisPrioritas, 1), color: Charts.palette().accent, highlight: true }
      ],
      aria: 'Pemenuhan berbobot pasien kritis'
    });

    return card('Pembangkit skenario', controls, { sub: 'Benih ' + f.scenarioSeed + ' · ' + s.total + ' skenario' })
      + '<div style="margin-top:16px">' + kpis + '</div>'
      + '<div class="grid g-2" style="margin-top:16px">'
      + card('Rata-rata jarak per metode', '<div class="chart">' + routeChart + '</div>', { sub: 'Hemat LOOK ' + fmt.pct(1 - s.kmLook / Math.max(1, s.kmFcfs), 1) + ' terhadap FCFS' })
      + card('Pemenuhan berbobot pasien kritis', '<div class="chart">' + policyChart + '</div>', { sub: 'Selisih prioritas vs urutan masuk: ' + fmt.dec((s.kritisPrioritas - s.kritisMasuk) * 100, 1) + ' poin persentase' })
      + '</div>'
      + '<div style="margin-top:16px">' + card('Hasil per skenario', '<div class="table-wrap"><table class="data">'
        + '<thead><tr><th class="r">No</th><th class="r">Faskes</th><th class="r">Stok</th><th class="r">Rasio</th><th class="r">Pemenuhan</th><th class="r">Kritis naif</th><th class="r">Kritis masuk</th><th class="r">Kritis prioritas</th><th class="r">FCFS km</th><th class="r">SCAN km</th><th class="r">LOOK km</th></tr></thead>'
        + '<tbody>' + rows + '</tbody></table></div>', {
        tight: true,
        sub: 'Rasio = total permintaan ÷ stok; seluruh skenario dipastikan aman pada kondisi awal',
        foot: 'Hasil sintetis untuk perbandingan relatif antarkebijakan, bukan ukuran kinerja lapangan.'
      }) + '</div>';
  }

  /* ==================================================================== *
   * EKSPOR
   * ==================================================================== */
  const EXPORT_ITEMS = [
    { id: 'pdf', title: 'Laporan PDF', desc: 'Ringkasan eksekutif, tabel keputusan, rute, dan grafik', ext: '.pdf' },
    { id: 'docx', title: 'Dokumen Word', desc: 'Laporan terstruktur yang dapat disunting', ext: '.docx' },
    { id: 'xlsx', title: 'Buku kerja Excel', desc: 'Satu lembar per bagian, siap dihitung ulang', ext: '.xlsx' },
    { id: 'csv', title: 'Data CSV', desc: 'Tabel keputusan dan rute untuk diolah lanjut', ext: '.csv' },
    { id: 'json', title: 'Data JSON', desc: 'Seluruh masukan dan hasil untuk reproduksi', ext: '.json' },
    { id: 'png', title: 'Gambar PNG', desc: 'Tangkapan dashboard resolusi tinggi', ext: '.png' }
  ];

  function renderEkspor(state, R) {
    const cards = EXPORT_ITEMS.map((it) => '<div style="border:1px solid var(--line);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:8px">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">'
      + '<div style="font:600 13.5px var(--sans)">' + esc(it.title) + '</div>'
      + '<span class="badge neutral plain mono">' + it.ext + '</span></div>'
      + '<p class="xsmall muted" style="margin:0;flex:1">' + esc(it.desc) + '</p>'
      + '<button class="btn ghost sm" data-export="' + it.id + '" type="button">' + icon.download + ' Unduh</button>'
      + '</div>').join('');

    const preview = '<div class="defs">'
      + '<div><dt>Fasilitas</dt><dd>' + R.facilities.length + '</dd></div>'
      + '<div><dt>Stok depot</dt><dd>' + fmt.int(R.input.available) + ' tabung</dd></div>'
      + '<div><dt>Tabung disetujui</dt><dd>' + fmt.int(R.allocation.metrics.diberikan) + ' tabung</dd></div>'
      + '<div><dt>Rute LOOK</dt><dd>' + fmt.int(R.routes[2].distance) + ' km</dd></div>'
      + '<div><dt>Siklus disimulasikan</dt><dd>' + R.cycles.rows.length + '</dd></div>'
      + '</div>';

    return '<div class="grid g-3" style="gap:12px">' + cards + '</div>'
      + '<div class="grid g-2" style="margin-top:16px">'
      + card('Isi laporan', preview, { sub: 'Data yang akan disertakan pada setiap berkas' })
      + card('Catatan penting', note('Setiap berkas memuat pernyataan bahwa hasil berasal dari data hipotetis dan bukan alat keputusan klinis.', 'warn')
        + '<p class="small muted" style="margin-top:10px">Berkas dibuat sepenuhnya di peramban. Tidak ada data yang dikirim ke server mana pun.</p>', {
        sub: 'Batasan dan privasi'
      })
      + '</div>';
  }

  /* ==================================================================== *
   * METODE
   * ==================================================================== */
  function renderMetode() {
    return '<div class="grid g-2">'
      + card('Banker&rsquo;s Algorithm', '<p class="small">Setiap fasilitas dipandang sebagai proses dan tabung oksigen sebagai sumber daya. Data yang dipakai: Available (stok depot), Max, Allocation, dan Need = Max − Allocation.</p>'
        + '<p class="small">Saat fasilitas meminta: (1) ditolak bila Request &gt; Need; (2) ditunda bila Request &gt; Available; (3) bila lolos, sistem mensimulasikan pemberian lalu menjalankan safety algorithm. Bila jumlah penuh tidak aman, dicoba jumlah yang lebih kecil (alokasi parsial).</p>'
        + '<div class="note info" style="margin-top:10px">' + icon.info + '<div>Safety algorithm: <span class="mono">Work = Available</span>; cari fasilitas dengan <span class="mono">Need ≤ Work</span>; <span class="mono">Work = Work + Allocation</span>. Aman bila semua fasilitas dapat selesai.</div></div>', { sub: 'Alokasi sumber daya yang aman' })
      + card('SCAN dan LOOK', '<p class="small">Armada bergerak ke satu arah sambil melayani fasilitas yang dilewati sampai ujung koridor, lalu berbalik arah melayani sisanya. Total jarak = jumlah selisih posisi antar titik berurutan.</p>'
        + '<p class="small">Varian LOOK berbalik di fasilitas terjauh, bukan di ujung koridor, sehingga biasanya lebih hemat. Masukan SCAN hanya fasilitas yang sudah disetujui Banker&rsquo;s.</p>'
        + '<div class="defs" style="margin-top:10px"><div><dt>FCFS</dt><dd>urutan permintaan masuk</dd></div><div><dt>SCAN</dt><dd>sampai ujung koridor</dd></div><div><dt>LOOK</dt><dd>berbalik di titik terjauh</dd></div></div>', { sub: 'Penjadwalan rute armada' })
      + card('Skor prioritas', '<p class="small mono" style="background:var(--surface-2);padding:10px;border-radius:7px;border:1px solid var(--line)">Skor = w₁ × (K / K<sub>maks</sub>) + w₂ × (1 − min(C, 24) / 24)</p>'
        + '<p class="small" style="margin-top:10px">K = jumlah pasien kritis, C = sisa cadangan oksigen dalam jam. Bobot awal 0,6 dan 0,4 adalah asumsi, belum divalidasi klinis.</p>'
        + '<p class="small">Skor hanya mengatur urutan evaluasi; keputusan akhir tetap ditentukan uji safe state.</p>', { sub: 'Mengurutkan siapa diuji lebih dahulu' })
      + card('Turnaround dan eskalasi', '<p class="small">Sumber daya yang dialokasikan adalah <strong>tabung (wadah)</strong>, bukan gas. Tabung kosong dikembalikan ke depot, diisi ulang, dan baru menjadi Available setelah τ siklus.</p>'
        + '<p class="small mono" style="background:var(--surface-2);padding:10px;border-radius:7px;border:1px solid var(--line)">Available(t+1) = Available(t) − Diberikan(t) + Kembali(t − τ)</p>'
        + '<p class="small" style="margin-top:10px">Fasilitas yang ditunda diperiksa terhadap sisa cadangan: ≤ 12 jam (Waspada), ≤ 8 jam (Siaga), ≤ 4 jam (Darurat).</p>', { sub: 'Revisi 2: tabung kembali, gas habis dipakai' })
      + card('Batasan model', '<ul class="list">'
        + '<li><span class="idx">·</span><div class="grow">Data bersifat hipotetis; tidak ada wawancara dengan tenaga medis.</div></li>'
        + '<li><span class="idx">·</span><div class="grow">Satu depot dan satu jenis tabung.</div></li>'
        + '<li><span class="idx">·</span><div class="grow">Jaringan jalan disederhanakan menjadi koridor linear satu dimensi.</div></li>'
        + '<li><span class="idx">·</span><div class="grow">Gas sisa dalam tabung dan kapasitas pabrik pengisian tidak dimodelkan.</div></li>'
        + '<li><span class="idx">·</span><div class="grow">Bobot prioritas belum divalidasi secara klinis.</div></li>'
        + '</ul>', { sub: 'Yang tidak dimodelkan' })
      + card('Pernyataan penggunaan', '<p class="small">Prototipe ini adalah alat bantu akademik untuk memperlihatkan penerapan algoritma sistem operasi pada masalah distribusi. Keluaran simulasi <strong>bukan</strong> rekomendasi klinis dan tidak menggantikan penilaian tenaga medis maupun pengelola logistik.</p>'
        + '<p class="small">Rujukan: Silberschatz, Galvin, &amp; Gagne (2018); Denning (1967). Model mengikuti laporan progres proyek Revisi 2 (10 November 2026).</p>', { sub: 'Bukan alat keputusan klinis' })
      + '</div>';
  }

  root.Views = {
    renderDashboard, renderData, renderBankers, renderRute, renderEskalasi,
    renderMultisiklus, renderSkenario, renderEkspor, renderMetode,
    badge, statusBadge, note, card, kpi
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
