/*!
 * exporters.js — pembuatan berkas hasil: PDF, Word, Excel, CSV, JSON, PNG
 * Semua proses berjalan di peramban; tidak ada data yang dikirim ke server.
 */
(function (root) {
  'use strict';
  const UI = root.UI;
  const fmt = UI.fmt;
  const esc = UI.esc;

  const TITLE = 'Laporan Simulasi Distribusi Tabung Oksigen Medis';
  const SUBTITLE = 'Banker\'s Algorithm dan penjadwalan rute SCAN / LOOK';
  const DISCLAIMER = 'Data pada laporan ini bersifat hipotetis untuk keperluan akademik. Hasil simulasi bukan rekomendasi klinis dan tidak menggantikan penilaian tenaga medis.';

  /** jsPDF memakai WinAnsiEncoding; ganti karakter di luar itu dengan padanan ASCII. */
  function ascii(s) {
    return String(s == null ? '' : s)
      .replace(/\u2192/g, '->').replace(/\u2190/g, '<-')
      .replace(/\u2264/g, '<=').replace(/\u2265/g, '>=')
      .replace(/[\u2212\u2013\u2014]/g, '-')
      .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
      .replace(/\u00D7/g, 'x').replace(/\u2026/g, '...')
      .replace(/\u03C4/g, 'tau')
      .replace(/\u2081/g, '1').replace(/\u2082/g, '2').replace(/\u2098/g, 'm')
      .replace(/\u00B7/g, '-').replace(/\u2022/g, '-')
      .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF]/g, '');
  }

  function meta(R) {
    const a = R.allocation.metrics;
    return {
      tanggal: UI.todayLong(),
      fasilitas: R.facilities.length,
      stok: R.input.available,
      depot: R.input.depot,
      ujung: R.input.corridorEnd,
      bobot: fmt.dec(R.input.w1, 2) + ' / ' + fmt.dec(R.input.w2, 2),
      urutan: R.input.order === 'prioritas' ? 'Skor prioritas' : 'Urutan masuk',
      diminta: a.diminta,
      diberikan: a.diberikan,
      pemenuhan: a.pemenuhan,
      sisa: a.sisaStok,
      aman: a.akhirAman,
      kmFcfs: R.routes[0].distance,
      kmScan: R.routes[1].distance,
      kmLook: R.routes[2].distance,
      tau: R.cycles.tau,
      siklus: R.cycles.rows.length,
      episode: R.cycles.totalEpisode,
      deadlock: R.cycles.deadlockAt
    };
  }

  function baseName() {
    return 'hasil-simulasi-oksigen-' + UI.stamp();
  }

  /* ==================================================================== *
   * PDF
   * ==================================================================== */
  function buildPDF(R) {
    const jsPDFCtor = (root.jspdf && root.jspdf.jsPDF) || root.jsPDF;
    if (!jsPDFCtor) throw new Error('Pustaka PDF tidak termuat.');
    const doc = new jsPDFCtor({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const m = meta(R);
    const W = 210, H = 297, M = 16;
    const accent = [13, 91, 81];
    const ink = [19, 28, 26];
    const muted = [106, 120, 117];
    const line = [226, 224, 215];
    let y = M;

    const setFont = (size, style, color) => {
      doc.setFont('helvetica', style || 'normal');
      doc.setFontSize(size);
      doc.setTextColor.apply(doc, color || ink);
    };

    const newPageIfNeeded = (need) => {
      if (y + need > H - 22) {
        doc.addPage();
        y = M;
        drawContinuation();
      }
    };

    function drawContinuation() {
      setFont(8, 'normal', muted);
      doc.text(ascii(TITLE + ' (lanjutan)'), M, 10);
      doc.setDrawColor.apply(doc, line);
      doc.line(M, 12, W - M, 12);
    }

    function heading(text, size) {
      newPageIfNeeded(14);
      y += 3;
      setFont(size || 12, 'bold', accent);
      doc.text(ascii(text), M, y);
      y += 2.5;
      doc.setDrawColor.apply(doc, line);
      doc.setLineWidth(0.3);
      doc.line(M, y, W - M, y);
      y += 5;
    }

    function para(text, opts) {
      const o = opts || {};
      setFont(o.size || 9, o.bold ? 'bold' : 'normal', o.color || ink);
      const lines = doc.splitTextToSize(ascii(text), W - 2 * M - (o.indent || 0));
      lines.forEach((ln) => {
        newPageIfNeeded(6);
        doc.text(ln, M + (o.indent || 0), y);
        y += (o.size || 9) * 0.46;
      });
      y += o.gap == null ? 2 : o.gap;
    }

    function table(head, body, opts) {
      const o = opts || {};
      doc.autoTable({
        head: [head.map(ascii)],
        body: body.map((row) => row.map((c) => ascii(c))),
        startY: y,
        margin: { left: M, right: M, top: M, bottom: 20 },
        styles: { font: 'helvetica', fontSize: o.size || 8, cellPadding: 1.8, textColor: ink, lineColor: line, lineWidth: 0.15, overflow: 'linebreak' },
        headStyles: { fillColor: [244, 243, 238], textColor: [70, 84, 81], fontStyle: 'bold', fontSize: 7.4, lineWidth: 0.15, lineColor: line },
        alternateRowStyles: { fillColor: [252, 251, 248] },
        columnStyles: o.columnStyles || {},
        didDrawPage: (data) => { y = data.cursor.y; }
      });
      y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 5 : y + 5;
    }

    /* ---------- Kop ---------- */
    doc.setFillColor.apply(doc, accent);
    doc.rect(0, 0, W, 3, 'F');

    setFont(7.6, 'bold', muted);
    doc.text('SISTEM OPERASI - PROTOTIPE AKADEMIK', M, y + 2);
    y += 9;

    setFont(17, 'bold', ink);
    doc.text(ascii('Distribusi tabung oksigen medis'), M, y);
    y += 7;
    setFont(9.5, 'normal', muted);
    doc.text(ascii(SUBTITLE), M, y);
    y += 9;

    doc.setDrawColor.apply(doc, line);
    doc.setLineWidth(0.3);
    doc.line(M, y, W - M, y);
    y += 5;

    setFont(8, 'normal', muted);
    doc.text(ascii('Tanggal: ' + m.tanggal), M, y);
    doc.text(ascii('Sumber: masukan pengguna pada prototipe web'), W - M, y, { align: 'right' });
    y += 8;

    /* ---------- Ringkasan ---------- */
    heading('1. Ringkasan hasil');
    table(
      ['Indikator', 'Nilai', 'Keterangan'],
      [
        ['Fasilitas diuji', String(m.fasilitas), 'satu depot di km ' + m.depot + ', koridor 0-' + m.ujung + ' km'],
        ['Stok depot awal', m.stok + ' tabung', 'Available pada awal siklus'],
        ['Permintaan total', m.diminta + ' tabung', 'jumlah permintaan seluruh fasilitas'],
        ['Disetujui', m.diberikan + ' tabung', 'pemenuhan ' + fmt.pct(m.pemenuhan, 1)],
        ['Stok tersisa', m.sisa + ' tabung', m.aman ? 'keadaan akhir aman' : 'keadaan akhir tidak aman'],
        ['Bobot prioritas (w1/w2)', m.bobot, 'urutan evaluasi: ' + m.urutan],
        ['Jarak FCFS', m.kmFcfs + ' km', 'acuan urutan masuk'],
        ['Jarak SCAN', m.kmScan + ' km', 'hemat ' + fmt.pct((m.kmFcfs - m.kmScan) / Math.max(1, m.kmFcfs), 1) + ' terhadap FCFS'],
        ['Jarak LOOK', m.kmLook + ' km', 'hemat ' + fmt.pct((m.kmFcfs - m.kmLook) / Math.max(1, m.kmFcfs), 1) + ' terhadap FCFS'],
        ['Multisiklus', m.episode + ' episode / ' + m.siklus + ' siklus', 'tau = ' + m.tau + (m.deadlock ? ', deadlock pada siklus ' + m.deadlock : ', tanpa deadlock')]
      ],
      { columnStyles: { 0: { cellWidth: 52 }, 1: { cellWidth: 38, fontStyle: 'bold' }, 2: { cellWidth: 'auto' } } }
    );

    /* ---------- Data fasilitas ---------- */
    heading('2. Data fasilitas');
    para('Need = Max - Allocation. Urutan masuk dipakai untuk perbandingan rute FCFS.', { size: 8.4, color: muted });
    table(
      ['Fasilitas', 'Km', 'Max', 'Alok', 'Need', 'Minta', 'Kritis', 'Cadangan', 'Masuk'],
      R.facilities.map((f) => [
        f.nama, String(f.pos), String(f.max), String(f.alokasi),
        String(Math.max(0, f.max - f.alokasi)), String(f.minta),
        String(f.kritis), fmt.dec(f.jam, 1) + ' jam', String(f.masuk)
      ]),
      { columnStyles: { 0: { cellWidth: 52 }, 1: { cellWidth: 13, halign: 'right' }, 2: { cellWidth: 13, halign: 'right' }, 3: { cellWidth: 14, halign: 'right' }, 4: { cellWidth: 14, halign: 'right' }, 5: { cellWidth: 14, halign: 'right' }, 6: { cellWidth: 14, halign: 'right' }, 7: { cellWidth: 22, halign: 'right' }, 8: { cellWidth: 14, halign: 'right' } } }
    );

    /* ---------- Banker's ---------- */
    heading('3. Keputusan Banker\'s Algorithm');
    const safe = R.allocation.safeInitial;
    para(safe.safe
      ? 'Kondisi awal aman. Safe sequence: ' + safe.order.join(' -> ') + '.'
      : 'Kondisi awal tidak aman: tidak ada urutan yang memenuhi seluruh fasilitas.', { size: 8.4, bold: true });
    table(
      ['Fasilitas', 'Skor', 'Need', 'Minta', 'Diberi', 'Status', 'Sisa stok', 'Alasan'],
      R.allocation.decisions.map((d) => [
        d.nama, fmt.skor(d.skor), String(d.need), String(d.minta), String(d.diberi),
        d.status, String(d.available), d.alasan || ''
      ]),
      { columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 14, halign: 'right' }, 2: { cellWidth: 12, halign: 'right' }, 3: { cellWidth: 13, halign: 'right' }, 4: { cellWidth: 14, halign: 'right' }, 5: { cellWidth: 20 }, 6: { cellWidth: 15, halign: 'right' }, 7: { cellWidth: 'auto' } } }
    );

    const detail = R.allocation.decisions.filter((d) => d.attempts && d.attempts.length);
    if (detail.length) {
      para('Jejak uji safe state (alokasi parsial):', { size: 8.4, bold: true });
      detail.forEach((d) => {
        const t = d.attempts.map((x) => x.j + ' tabung -> ' + (x.aman ? 'aman' : 'tidak aman') + ' (sisa ' + x.sisa + ')').join('; ');
        para('- ' + d.nama + ': ' + t + '. Keputusan: ' + d.diberi + ' tabung (' + d.status + ').', { size: 8, indent: 2, color: muted });
      });
    }

    /* ---------- Rute ---------- */
    heading('4. Rute pengantaran');
    table(
      ['Metode', 'Urutan kunjungan', 'Perhitungan', 'Jarak', 'Hemat vs FCFS'],
      R.routes.map((r) => [
        r.name, r.urutan, r.detail.text + ' = ' + r.distance + ' km', r.distance + ' km',
        r.key === 'fcfs' ? '-' : fmt.pct(r.hemat, 1)
      ]),
      { columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 58 }, 2: { cellWidth: 40 }, 3: { cellWidth: 18, halign: 'right', fontStyle: 'bold' }, 4: { cellWidth: 'auto', halign: 'right' } } }
    );

    // diagram koridor sederhana
    newPageIfNeeded(44);
    const gx = M, gw = W - 2 * M, gy = y + 12;
    const end = Math.max(m.ujung, m.depot, ...R.routes.flatMap((r) => r.points), 1);
    const px = (v) => gx + (v / end) * gw;
    setFont(8.4, 'bold', ink);
    doc.text(ascii('Diagram koridor (0-' + end + ' km)'), gx, y + 3);
    y += 8;
    doc.setDrawColor(211, 209, 198);
    doc.setLineWidth(0.5);
    doc.line(gx, y + 6, gx + gw, y + 6);
    // skala
    setFont(6.6, 'normal', muted);
    for (let i = 0; i <= 4; i++) {
      const v = (end / 4) * i;
      const xx = px(v);
      doc.setDrawColor(211, 209, 198);
      doc.line(xx, y + 4, xx, y + 8);
      doc.text(String(Math.round(v)), xx, y + 12, { align: 'center' });
    }
    // depot
    doc.setFillColor.apply(doc, accent);
    doc.rect(px(m.depot) - 1.4, y + 4.6, 2.8, 2.8, 'F');
    setFont(6.6, 'bold', accent);
    doc.text('DEPOT ' + m.depot, px(m.depot), y + 2.4, { align: 'center' });
    // titik + garis LOOK
    const look = R.routes[2].points;
    const seen = new Set();
    doc.setDrawColor.apply(doc, accent);
    doc.setLineWidth(0.5);
    let prev = m.depot;
    look.forEach((v) => {
      doc.line(px(prev), y + 6, px(v), y + 6);
      prev = v;
    });
    look.concat([m.depot]).forEach((v) => {
      if (seen.has(v)) return;
      seen.add(v);
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor.apply(doc, ink);
      doc.setLineWidth(0.35);
      doc.circle(px(v), y + 6, 1.3, 'FD');
      setFont(6.4, 'normal', ink);
      doc.text(String(v), px(v), y + 3.2, { align: 'center' });
    });
    y += 17;
    setFont(7.4, 'normal', muted);
    doc.text(ascii('Garis tebal menunjukkan urutan LOOK: ' + R.routes[2].urutan + '.'), gx, y);
    y += 6;

    /* ---------- Eskalasi ---------- */
    heading('5. Protokol eskalasi');
    if (R.escalation.length) {
      table(
        ['Fasilitas', 'Status', 'Kurang', 'Cadangan', 'Level', 'Tindakan'],
        R.escalation.map((e) => [e.nama, e.kategori, e.kurang + ' tabung', fmt.dec(e.jam, 1) + ' jam', e.level + ' - ' + e.levelNama, e.tindakan]),
        { size: 7.4, columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 17 }, 2: { cellWidth: 15, halign: 'right' }, 3: { cellWidth: 18, halign: 'right' }, 4: { cellWidth: 22 }, 5: { cellWidth: 'auto' } } }
      );
    } else {
      para('Tidak ada fasilitas yang perlu dieskalasi pada siklus ini.', { size: 8.4, color: muted });
    }

    /* ---------- Multisiklus ---------- */
    heading('6. Simulasi multisiklus (turnaround)');
    para('Available(t+1) = Available(t) - Diberikan(t) + Kembali(t - tau). Fasilitas selesai bila Allocation = Max lalu melepas tabungnya.', { size: 8.4, color: muted });
    table(
      ['tau', 'Kebijakan', 'Episode selesai', 'Deadlock'],
      R.sweep.map((s) => [
        String(s.tau), 'Banker\'s', String(s.bankerEpisode), s.bankerDeadlock ? 'siklus ' + s.bankerDeadlock : 'tidak terdeteksi'
      ]).concat(R.sweep.map((s) => [
        String(s.tau), 'Naif', String(s.naifEpisode), s.naifDeadlock ? 'siklus ' + s.naifDeadlock : 'tidak terdeteksi'
      ])),
      { columnStyles: { 0: { cellWidth: 16, halign: 'right' }, 1: { cellWidth: 40 }, 2: { cellWidth: 32, halign: 'right' }, 3: { cellWidth: 'auto' } } }
    );

    /* ---------- Penutup ---------- */
    newPageIfNeeded(28);
    heading('7. Catatan dan batasan');
    para('1. Sumber daya yang dialokasikan adalah tabung (wadah), bukan gas. Tabung kosong kembali ke depot dan diisi ulang setelah tau siklus.', { size: 8 });
    para('2. Satu depot, satu jenis tabung, dan koridor linear satu dimensi; jaringan jalan nyata tidak dimodelkan.', { size: 8 });
    para('3. Bobot skor prioritas (w1 dan w2) adalah asumsi awal dan belum divalidasi secara klinis.', { size: 8 });
    para('4. Ambang protokol eskalasi (12 / 8 / 4 jam) adalah asumsi rancangan, belum diuji.', { size: 8 });
    y += 2;
    setFont(7.6, 'italic', muted);
    doc.splitTextToSize(ascii(DISCLAIMER), W - 2 * M).forEach((ln) => {
      doc.text(ln, M, y);
      y += 3.4;
    });

    /* ---------- Nomor halaman ---------- */
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      setFont(7.2, 'normal', muted);
      doc.setDrawColor.apply(doc, line);
      doc.setLineWidth(0.2);
      doc.line(M, H - 14, W - M, H - 14);
      doc.text(ascii(TITLE), M, H - 9);
      doc.text('Halaman ' + i + ' dari ' + pages, W - M, H - 9, { align: 'right' });
    }

    return doc;
  }

  function exportPDF(R) {
    const doc = buildPDF(R);
    doc.save(baseName() + '.pdf');
  }

  /* ==================================================================== *
   * WORD (.docx)
   * ==================================================================== */
  function buildDOCX(R) {
    const D = root.docx;
    if (!D) throw new Error('Pustaka Word tidak termuat.');
    const m = meta(R);
    const {
      Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
      HeadingLevel, AlignmentType, WidthType, BorderStyle, ShadingType, Footer, PageNumber
    } = D;

    const ink = '131C1A';
    const muted = '6A7875';
    const accent = '0D5B51';

    const p = (text, opts) => {
      const o = opts || {};
      return new Paragraph({
        alignment: o.align,
        spacing: { before: o.before == null ? 0 : o.before, after: o.after == null ? 90 : o.after, line: 276 },
        heading: o.heading,
        children: [new TextRun({
          text: String(text == null ? '' : text),
          bold: !!o.bold, italics: !!o.italics,
          size: o.size || 20, color: o.color || ink, font: o.mono ? 'Consolas' : 'Calibri'
        })]
      });
    };

    const h = (text, level) => new Paragraph({
      heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
      spacing: { before: 260, after: 120 },
      children: [new TextRun({ text: String(text), bold: true, color: accent, size: level === 1 ? 28 : 23 })]
    });

    const cell = (text, opts) => {
      const o = opts || {};
      return new TableCell({
        width: o.width ? { size: o.width, type: WidthType.PERCENTAGE } : undefined,
        shading: o.head ? { type: ShadingType.CLEAR, fill: 'F4F3EE' } : undefined,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({
          alignment: o.align || AlignmentType.LEFT,
          spacing: { after: 0, line: 240 },
          children: [new TextRun({
            text: String(text == null ? '' : text),
            bold: !!o.head || !!o.bold,
            size: o.head ? 16 : 18,
            color: o.head ? '465451' : ink
          })]
        })]
      });
    };

    const table = (head, rows, widths) => new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 2, color: 'E2E0D7' },
        bottom: { style: BorderStyle.SINGLE, size: 2, color: 'E2E0D7' },
        left: { style: BorderStyle.SINGLE, size: 2, color: 'E2E0D7' },
        right: { style: BorderStyle.SINGLE, size: 2, color: 'E2E0D7' },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'E2E0D7' },
        insideVertical: { style: BorderStyle.SINGLE, size: 2, color: 'E2E0D7' }
      },
      rows: [
        new TableRow({
          tableHeader: true,
          children: head.map((t, i) => cell(t, { head: true, width: widths ? widths[i] : undefined }))
        })
      ].concat(rows.map((r) => new TableRow({
        children: r.map((t, i) => cell(t, { width: widths ? widths[i] : undefined, align: i === 0 ? AlignmentType.LEFT : AlignmentType.RIGHT }))
      })))
    });

    const children = [
      p('SISTEM OPERASI - PROTOTIPE AKADEMIK', { size: 15, bold: true, color: muted, after: 40 }),
      new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text: 'Distribusi tabung oksigen medis', bold: true, size: 40, color: ink })]
      }),
      p(SUBTITLE, { size: 22, color: muted, after: 40 }),
      p('Tanggal: ' + m.tanggal, { size: 18, color: muted, after: 220 }),

      h('1. Ringkasan hasil', 1),
      table(['Indikator', 'Nilai', 'Keterangan'], [
        ['Fasilitas diuji', String(m.fasilitas), 'depot km ' + m.depot + ', koridor 0-' + m.ujung + ' km'],
        ['Stok depot awal', m.stok + ' tabung', 'Available awal siklus'],
        ['Permintaan total', m.diminta + ' tabung', 'seluruh fasilitas'],
        ['Disetujui', m.diberikan + ' tabung', 'pemenuhan ' + fmt.pct(m.pemenuhan, 1)],
        ['Stok tersisa', m.sisa + ' tabung', m.aman ? 'keadaan akhir aman' : 'keadaan akhir tidak aman'],
        ['Bobot prioritas', m.bobot, 'urutan evaluasi: ' + m.urutan],
        ['Jarak FCFS / SCAN / LOOK', m.kmFcfs + ' / ' + m.kmScan + ' / ' + m.kmLook + ' km', 'hemat LOOK ' + fmt.pct((m.kmFcfs - m.kmLook) / Math.max(1, m.kmFcfs), 1)],
        ['Multisiklus', m.episode + ' episode / ' + m.siklus + ' siklus', 'tau = ' + m.tau + (m.deadlock ? ', deadlock siklus ' + m.deadlock : ', tanpa deadlock')]
      ], [40, 26, 34]),

      h('2. Data fasilitas', 1),
      p('Need = Max - Allocation.', { size: 18, color: muted }),
      table(['Fasilitas', 'Km', 'Max', 'Alok', 'Need', 'Minta', 'Kritis', 'Cadangan', 'Masuk'],
        R.facilities.map((f) => [f.nama, f.pos, f.max, f.alokasi, Math.max(0, f.max - f.alokasi), f.minta, f.kritis, fmt.dec(f.jam, 1) + ' jam', f.masuk]),
        [26, 8, 8, 8, 8, 8, 8, 13, 8]),

      h('3. Keputusan Banker\'s Algorithm', 1),
      p(R.allocation.safeInitial.safe
        ? 'Kondisi awal aman. Safe sequence: ' + R.allocation.safeInitial.order.join(' -> ') + '.'
        : 'Kondisi awal tidak aman: tidak ada urutan yang memenuhi seluruh fasilitas.', { bold: true, size: 19 }),
      table(['Fasilitas', 'Skor', 'Need', 'Minta', 'Diberi', 'Status', 'Sisa', 'Alasan'],
        R.allocation.decisions.map((d) => [d.nama, fmt.skor(d.skor), d.need, d.minta, d.diberi, d.status, d.available, d.alasan || '']),
        [24, 9, 8, 9, 9, 12, 8, 21]),

      h('4. Rute pengantaran', 1),
      table(['Metode', 'Urutan kunjungan', 'Perhitungan', 'Jarak', 'Hemat'],
        R.routes.map((r) => [r.name, r.urutan, r.detail.text, r.distance + ' km', r.key === 'fcfs' ? '-' : fmt.pct(r.hemat, 1)]),
        [18, 32, 26, 12, 12]),

      h('5. Protokol eskalasi', 1)
    ];

    if (R.escalation.length) {
      children.push(table(['Fasilitas', 'Status', 'Kurang', 'Cadangan', 'Level', 'Tindakan'],
        R.escalation.map((e) => [e.nama, e.kategori, e.kurang + ' tabung', fmt.dec(e.jam, 1) + ' jam', e.level + ' - ' + e.levelNama, e.tindakan]),
        [18, 10, 10, 11, 13, 38]));
    } else {
      children.push(p('Tidak ada fasilitas yang perlu dieskalasi pada siklus ini.', { color: muted }));
    }

    children.push(h('6. Simulasi multisiklus (turnaround)', 1));
    children.push(p('Available(t+1) = Available(t) - Diberikan(t) + Kembali(t - tau).', { size: 18, color: muted, mono: true }));
    children.push(table(['tau', 'Kebijakan', 'Episode selesai', 'Deadlock'],
      R.sweep.map((s) => [s.tau, 'Banker\'s', s.bankerEpisode, s.bankerDeadlock ? 'siklus ' + s.bankerDeadlock : 'tidak terdeteksi'])
        .concat(R.sweep.map((s) => [s.tau, 'Naif', s.naifEpisode, s.naifDeadlock ? 'siklus ' + s.naifDeadlock : 'tidak terdeteksi'])),
      [12, 30, 28, 30]));

    children.push(h('7. Catatan dan batasan', 1));
    [
      'Sumber daya yang dialokasikan adalah tabung (wadah), bukan gas. Tabung kosong kembali ke depot dan diisi ulang setelah tau siklus.',
      'Satu depot, satu jenis tabung, dan koridor linear satu dimensi; jaringan jalan nyata tidak dimodelkan.',
      'Bobot skor prioritas (w1 dan w2) adalah asumsi awal dan belum divalidasi secara klinis.',
      'Ambang protokol eskalasi (12 / 8 / 4 jam) adalah asumsi rancangan, belum diuji.'
    ].forEach((t, i) => children.push(p((i + 1) + '. ' + t, { size: 18 })));
    children.push(p(DISCLAIMER, { size: 16, italics: true, color: muted, before: 200 }));

    const doc = new Document({
      creator: 'Prototipe Simulasi Distribusi Oksigen',
      title: TITLE,
      description: SUBTITLE,
      styles: {
        default: {
          document: { run: { font: 'Calibri', size: 20, color: ink } }
        }
      },
      sections: [{
        properties: {
          page: { margin: { top: 1000, right: 900, bottom: 1000, left: 900 } }
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: 'Halaman ', size: 14, color: muted }), new TextRun({ children: [PageNumber.CURRENT], size: 14, color: muted })]
            })]
          })
        },
        children
      }]
    });

    return doc;
  }

  async function exportDOCX(R) {
    const D = root.docx;
    if (!D) throw new Error('Pustaka Word tidak termuat.');
    const doc = buildDOCX(R);
    const blob = await D.Packer.toBlob(doc);
    UI.downloadBlob(blob, baseName() + '.docx');
  }

  /* ==================================================================== *
   * EXCEL (.xlsx)
   * ==================================================================== */
  function buildWorkbook(R) {
    const X = root.XLSX;
    if (!X) throw new Error('Pustaka Excel tidak termuat.');
    const m = meta(R);
    const wb = X.utils.book_new();

    const add = (name, aoa, widths) => {
      const ws = X.utils.aoa_to_sheet(aoa);
      if (widths) ws['!cols'] = widths.map((w) => ({ wch: w }));
      X.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    };

    add('Ringkasan', [
      ['Laporan Simulasi Distribusi Tabung Oksigen Medis'],
      ['Banker\'s Algorithm dan penjadwalan rute SCAN / LOOK'],
      [],
      ['Tanggal', m.tanggal],
      ['Fasilitas diuji', m.fasilitas],
      ['Stok depot (tabung)', m.stok],
      ['Posisi depot (km)', m.depot],
      ['Ujung koridor (km)', m.ujung],
      ['Bobot prioritas w1/w2', m.bobot],
      ['Urutan evaluasi', m.urutan],
      [],
      ['Indikator', 'Nilai'],
      ['Permintaan total (tabung)', m.diminta],
      ['Disetujui (tabung)', m.diberikan],
      ['Pemenuhan', Number(m.pemenuhan.toFixed(4))],
      ['Stok tersisa (tabung)', m.sisa],
      ['Keadaan akhir aman', m.aman ? 'ya' : 'tidak'],
      ['Jarak FCFS (km)', m.kmFcfs],
      ['Jarak SCAN (km)', m.kmScan],
      ['Jarak LOOK (km)', m.kmLook],
      ['Hemat LOOK vs FCFS', Number(((m.kmFcfs - m.kmLook) / Math.max(1, m.kmFcfs)).toFixed(4))],
      ['Episode selesai', m.episode],
      ['Siklus disimulasikan', m.siklus],
      ['Deadlock', m.deadlock ? 'siklus ' + m.deadlock : 'tidak terdeteksi'],
      [],
      ['Catatan', DISCLAIMER]
    ], [30, 24, 60]);

    add('Data Fasilitas', [
      ['Nama', 'Posisi km', 'Max', 'Alokasi', 'Need', 'Minta', 'Pasien kritis', 'Cadangan jam', 'Urutan masuk'],
      ...R.facilities.map((f) => [f.nama, f.pos, f.max, f.alokasi, Math.max(0, f.max - f.alokasi), f.minta, f.kritis, f.jam, f.masuk])
    ], [28, 11, 9, 10, 9, 9, 14, 14, 13]);

    add('Keputusan Banker', [
      ['Fasilitas', 'Skor', 'Need', 'Minta', 'Diberi', 'Kurang', 'Status', 'Sisa stok', 'Alasan'],
      ...R.allocation.decisions.map((d) => [
        d.nama, Number(d.skor.toFixed(3)), d.need, d.minta, d.diberi,
        Math.max(0, d.minta - d.diberi), d.status, d.available, d.alasan || ''
      ]),
      [],
      ['Safe sequence awal', R.allocation.safeInitial.order.join(' -> ')],
      ['Keadaan akhir aman', R.allocation.metrics.akhirAman ? 'ya' : 'tidak'],
      ['Pemenuhan berbobot kritis', Number(R.allocation.metrics.berbobotKritis.toFixed(4))]
    ], [28, 9, 8, 8, 8, 8, 12, 10, 44]);

    add('Uji Safe State', [
      ['Fasilitas', 'Dicoba (tabung)', 'Sisa stok', 'Hasil', 'Safe sequence'],
      ...R.allocation.decisions.flatMap((d) => (d.attempts || []).map((t) => [
        d.nama, t.j, t.sisa, t.aman ? 'aman' : 'tidak aman', (t.urutan || []).join(' -> ')
      ]))
    ], [28, 14, 11, 12, 60]);

    add('Rute', [
      ['Metode', 'Urutan kunjungan', 'Perhitungan', 'Total jarak (km)', 'Hemat vs FCFS'],
      ...R.routes.map((r) => [r.name, r.urutan, r.detail.text, r.distance, Number(r.hemat.toFixed(4))])
    ], [22, 34, 26, 16, 16]);

    add('Eskalasi', [
      ['Fasilitas', 'Status', 'Kurang (tabung)', 'Cadangan (jam)', 'Level', 'Nama level', 'Tindakan'],
      ...R.escalation.map((e) => [e.nama, e.kategori, e.kurang, e.jam, e.level, e.levelNama, e.tindakan])
    ], [28, 12, 14, 14, 8, 14, 70]);

    add('Multisiklus', [
      ['Siklus', 'Stok awal', 'Diberikan', 'Kembali', 'Stok akhir', 'Fasilitas selesai', 'Antre isi ulang', 'Jarak FCFS', 'Jarak SCAN', 'Jarak LOOK'],
      ...R.cycles.rows.map((r) => [r.t, r.availStart, r.diberi, r.kembali, r.availEnd, r.selesai, r.antreIsi, r.kmFcfs, r.kmScan, r.kmLook])
    ], [9, 11, 11, 10, 11, 16, 16, 12, 12, 12]);

    add('Sweep Tau', [
      ['Tau', 'Banker episode', 'Banker deadlock', 'Naif episode', 'Naif deadlock'],
      ...R.sweep.map((s) => [s.tau, s.bankerEpisode, s.bankerDeadlock || 'tidak ada', s.naifEpisode, s.naifDeadlock || 'tidak ada'])
    ], [8, 16, 18, 14, 16]);

    return wb;
  }

  function exportXLSX(R) {
    const X = root.XLSX;
    if (!X) throw new Error('Pustaka Excel tidak termuat.');
    const wb = buildWorkbook(R);
    const out = X.write(wb, { bookType: 'xlsx', type: 'array' });
    UI.downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), baseName() + '.xlsx');
  }

  /* ==================================================================== *
   * CSV
   * ==================================================================== */
  function exportCSV(R) {
    const m = meta(R);
    const rows = [];
    rows.push(['Laporan Simulasi Distribusi Tabung Oksigen Medis']);
    rows.push(['Tanggal', m.tanggal]);
    rows.push(['Stok depot', m.stok, 'Posisi depot (km)', m.depot, 'Ujung koridor (km)', m.ujung]);
    rows.push(['Bobot w1/w2', m.bobot, 'Urutan evaluasi', m.urutan]);
    rows.push([]);
    rows.push(['DATA FASILITAS']);
    rows.push(['Nama', 'Posisi km', 'Max', 'Alokasi', 'Need', 'Minta', 'Kritis', 'Cadangan jam', 'Masuk']);
    R.facilities.forEach((f) => rows.push([f.nama, f.pos, f.max, f.alokasi, Math.max(0, f.max - f.alokasi), f.minta, f.kritis, f.jam, f.masuk]));
    rows.push([]);
    rows.push(['KEPUTUSAN BANKER']);
    rows.push(['Fasilitas', 'Skor', 'Need', 'Minta', 'Diberi', 'Status', 'Sisa stok', 'Alasan']);
    R.allocation.decisions.forEach((d) => rows.push([d.nama, d.skor.toFixed(3), d.need, d.minta, d.diberi, d.status, d.available, d.alasan || '']));
    rows.push([]);
    rows.push(['RUTE']);
    rows.push(['Metode', 'Urutan', 'Perhitungan', 'Jarak km', 'Hemat vs FCFS']);
    R.routes.forEach((r) => rows.push([r.name, r.urutan, r.detail.text, r.distance, r.hemat.toFixed(4)]));
    rows.push([]);
    rows.push(['ESKALASI']);
    rows.push(['Fasilitas', 'Status', 'Kurang', 'Cadangan jam', 'Level', 'Tindakan']);
    R.escalation.forEach((e) => rows.push([e.nama, e.kategori, e.kurang, e.jam, e.level, e.tindakan]));
    rows.push([]);
    rows.push(['MULTISIKLUS']);
    rows.push(['Siklus', 'Stok awal', 'Diberikan', 'Kembali', 'Stok akhir', 'Selesai', 'Antre isi ulang']);
    R.cycles.rows.forEach((r) => rows.push([r.t, r.availStart, r.diberi, r.kembali, r.availEnd, r.selesai, r.antreIsi]));
    rows.push([]);
    rows.push(['Catatan', DISCLAIMER]);

    UI.downloadBlob(new Blob([UI.toCSV(rows)], { type: 'text/csv;charset=utf-8' }), baseName() + '.csv');
  }

  /* ==================================================================== *
   * JSON
   * ==================================================================== */
  function exportJSON(R, state) {
    const payload = {
      meta: {
        judul: TITLE,
        subjudul: SUBTITLE,
        tanggal: UI.todayLong(),
        dibuatPada: new Date().toISOString(),
        catatan: DISCLAIMER,
        versi: '1.0.0'
      },
      masukan: Object.assign({}, R.input, { fasilitas: R.facilities }),
      hasil: {
        kondisiAwal: { aman: R.allocation.safeInitial.safe, safeSequence: R.allocation.safeInitial.order },
        keputusan: R.allocation.decisions,
        metrik: R.allocation.metrics,
        rute: R.routes.map((r) => ({ metode: r.name, urutan: r.urutan, jarak: r.distance, hemat: r.hemat, perhitungan: r.detail.text })),
        eskalasi: R.escalation,
        multisiklus: {
          tau: R.cycles.tau, siklus: R.cycles.rows.length, episode: R.cycles.totalEpisode,
          deadlock: R.cycles.deadlockAt, jejak: R.cycles.rows, sweep: R.sweep
        }
      }
    };
    if (state && state.batch) payload.hasil.skenario = state.batch.summary;
    UI.downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), baseName() + '.json');
  }

  /* ==================================================================== *
   * PNG
   * ==================================================================== */
  async function exportPNG(targetId) {
    if (!root.html2canvas) throw new Error('Pustaka tangkapan gambar tidak termuat.');

    // Bila tampilan tujuan sedang tidak aktif, pindah sementara agar terlihat.
    let el = document.getElementById(targetId || 'view-dashboard');
    let switched = false;
    if (!el || el.offsetParent === null) {
      const dash = document.getElementById('view-dashboard');
      if (dash) { el = dash; }
      const wasActive = el && el.classList.contains('active');
      if (!wasActive) {
        document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
        el.classList.add('active');
        switched = true;
        await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 120)));
      }
    }
    if (!el) throw new Error('Tampilan yang akan diambil tidak ditemukan.');

    const p = root.Charts.palette();
    try {
      const canvas = await root.html2canvas(el, {
        backgroundColor: p.surface2,
        scale: 2,
        useCORS: true,
        logging: false,
        imageTimeout: 3000,
        scrollX: 0,
        scrollY: -window.scrollY,
        windowWidth: Math.max(el.scrollWidth, 1100)
      });
      if (!canvas || !canvas.width || !canvas.height) throw new Error('Kanvas kosong.');
      const blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png', 1));
      if (!blob) throw new Error('Gambar gagal dikonversi.');
      UI.downloadBlob(blob, baseName() + '.png');
    } finally {
      if (switched) {
        el.classList.remove('active');
        const cur = document.querySelector('.view.active');
        if (!cur && root.App && root.App.navigate) root.App.navigate('dashboard', { scroll: false });
      }
    }
  }

  /* ==================================================================== *
   * Dispatcher
   * ==================================================================== */
  async function run(kind, R, state) {
    switch (kind) {
      case 'pdf': exportPDF(R); return 'PDF siap diunduh.';
      case 'docx': await exportDOCX(R); return 'Dokumen Word siap diunduh.';
      case 'xlsx': exportXLSX(R); return 'Buku kerja Excel siap diunduh.';
      case 'csv': exportCSV(R); return 'Data CSV siap diunduh.';
      case 'json': exportJSON(R, state); return 'Data JSON siap diunduh.';
      case 'png': await exportPNG('view-dashboard'); return 'Gambar PNG siap diunduh.';
      default: throw new Error('Jenis berkas tidak dikenal: ' + kind);
    }
  }

  root.Exporters = { run, buildPDF, buildDOCX, buildWorkbook, ascii, baseName, DISCLAIMER, TITLE, SUBTITLE };
})(typeof globalThis !== 'undefined' ? globalThis : this);
