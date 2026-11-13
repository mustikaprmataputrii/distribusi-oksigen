# Distribusi Oksigen — Simulasi Banker's Algorithm & SCAN

Prototipe web untuk **alokasi tabung oksigen medis** dengan *Banker's Algorithm* dan
**penjadwalan rute armada** dengan *SCAN* / *LOOK*. Aplikasi berjalan sepenuhnya di
peramban: tanpa server, tanpa akun, tanpa registrasi.

> **Batasan akademik.** Seluruh data contoh bersifat hipotetis. Keluaran simulasi bukan
> rekomendasi klinis dan tidak menggantikan penilaian tenaga medis.

---

## Daftar isi

- [Fitur](#fitur)
- [Cara menjalankan](#cara-menjalankan)
- [Struktur berkas](#struktur-berkas)
- [Model perhitungan](#model-perhitungan)
- [Format berkas ekspor](#format-berkas-ekspor)
- [Format CSV masukan](#format-csv-masukan)
- [Pengujian](#pengujian)
- [Dasar laporan](#dasar-laporan)
- [Batasan](#batasan)

---

## Fitur

**Halaman masuk sederhana** — satu tombol "Masuk ke dashboard", tanpa login.

**Dashboard** — ringkasan siklus: pemenuhan permintaan, fasilitas terlayani, penghematan
rute, stok tersisa, keadaan akhir aman/tidak aman, tabel keputusan, tiga diagram rute,
serta panel tindak lanjut.

**Data & parameter (dapat diubah bebas)**

- Stok depot, posisi depot, ujung koridor.
- Data fasilitas: nama, posisi km, Max, Alokasi, Minta, pasien kritis, cadangan jam,
  urutan masuk. Baris dapat ditambah dan dihapus.
- `Need = Max − Alokasi` dihitung langsung saat mengetik.
- Bobot skor prioritas `w₁`/`w₂` dengan penggeser dan tombol pasangan bobot laporan
  (0,5/0,5 · 0,6/0,4 · 0,7/0,3 · 0,8/0,2).
- Urutan evaluasi: skor prioritas atau urutan masuk.
- Impor data fasilitas dari CSV.
- Data tersimpan di `localStorage` sehingga tidak hilang saat halaman dimuat ulang.

**Keputusan Banker's Algorithm**

- Uji kondisi awal dan *safe sequence* langkah demi langkah.
- Tiga gerbang: `Request ≤ Need`, `Request ≤ Available`, lalu uji *safe state*.
- **Alokasi parsial**: bila jumlah penuh tidak aman, dicoba jumlah yang lebih kecil
  sampai ditemukan yang aman.
- Status per fasilitas: **Disetujui / Parsial / Ditunda / Ditolak**, lengkap dengan
  jejak setiap percobaan dan alasannya.

**Rute pengantaran**

- FCFS, SCAN, dan LOOK dihitung pada koridor yang sama.
- Urutan kunjungan, perhitungan jarak per segmen, total km, dan persentase penghematan
  terhadap FCFS.
- Diagram koridor dengan lajur per perjalanan sehingga arah dan urutan terbaca.

**Protokol eskalasi**

- Level 1 Waspada (≤ 12 jam), Level 2 Siaga (≤ 8 jam), Level 3 Darurat (≤ 4 jam).
- Kandidat pemasok terdekat untuk level 2 (fasilitas dengan cadangan > 24 jam).

**Simulasi multisiklus & turnaround**

- `Available(t+1) = Available(t) − Diberikan(t) + Kembali(t−τ)`.
- Parameter τ, jumlah siklus, dan kebijakan (Banker's vs naif tanpa uji aman).
- Grafik episode selesai terhadap τ, perbandingan kebijakan, episode per fasilitas,
  dan jejak tiap siklus.

**Skenario uji**

- Pembangkit 12 skenario acak terkontrol (benih tetap sehingga dapat direproduksi):
  10–20 fasilitas, koridor 0–100 km, depot km 50, rasio permintaan/stok 1,0–5,8.
- Perbandingan naif / Banker's urutan masuk / Banker's prioritas.
- Rata-rata pemenuhan, pemenuhan berbobot pasien kritis, cakupan fasilitas, dan jarak rute.

**Ekspor hasil** — lihat [Format berkas ekspor](#format-berkas-ekspor).

**Tampilan** — mode terang/gelap/mengikuti sistem, tata letak responsif hingga lebar
ponsel, dan gaya cetak.

---

## Cara menjalankan

Aplikasi berupa berkas statis. Pilihan termudah:

```bash
# 1. Buka langsung
#    klik dua kali index.html

# 2. Atau jalankan server statis lokal (disarankan)
python -m http.server 8000
# lalu buka http://localhost:8000
```

Seluruh pustaka ekspor sudah disertakan di `vendor/`, jadi aplikasi tetap berfungsi
tanpa koneksi internet.

---

## Struktur berkas

```
.
├── index.html                  # kerangka halaman + seluruh tampilan
├── assets/
│   ├── css/
│   │   └── styles.css          # token desain, komponen, cetak, responsif
│   └── js/
│       ├── core/
│       │   └── engine.js       # mesin simulasi (tanpa DOM, dapat diuji Node)
│       ├── ui/
│       │   ├── util.js         # format angka, notifikasi, tema, CSV
│       │   ├── charts.js       # grafik SVG (rute, garis, batang)
│       │   ├── views.js        # perender setiap tampilan
│       │   └── app.js          # state, navigasi, penyuntingan, ekspor
│       └── export/
│           └── exporters.js    # PDF, Word, Excel, CSV, JSON, PNG
├── vendor/                     # pustaka pihak ketiga (disertakan)
│   ├── jspdf.umd.min.js
│   ├── jspdf.autotable.min.js
│   ├── docx.umd.js
│   ├── xlsx.full.min.js
│   └── html2canvas.min.js
└── tests/
    ├── engine.test.js          # 33 uji mesin simulasi
    ├── ui.test.js              # uji antarmuka + semua ekspor (Playwright)
    └── serve.js                # server statis untuk pengujian
```

---

## Model perhitungan

### Banker's Algorithm

Fasilitas dipandang sebagai proses, tabung sebagai sumber daya.

```
Need = Max − Allocation
```

Untuk setiap permintaan `Request`:

1. `Request > Need` → **Ditolak**
2. `Request > Available` → **Ditunda**
3. Simulasikan pemberian, lalu jalankan *safety algorithm*:
   ```
   Work = Available
   selama ada fasilitas dengan Need ≤ Work:
       Work = Work + Allocation(fasilitas itu)
   ```
   Bila semua fasilitas dapat selesai → **Disetujui**. Bila tidak, coba jumlah yang
   lebih kecil (**Parsial**); bila tidak ada yang aman → **Ditunda**.

### Skor prioritas

```
Skor = w₁ × (K / K_maks) + w₂ × (1 − min(C, 24) / 24)
```

`K` = jumlah pasien kritis, `C` = sisa cadangan oksigen (jam). Skor hanya mengatur
**urutan evaluasi**; keputusan akhir tetap ditentukan uji *safe state*.

### Rute

Koridor linear dengan satu depot.

| Metode | Aturan |
| --- | --- |
| FCFS | urutan permintaan masuk |
| SCAN | bergerak sampai ujung koridor, lalu berbalik |
| LOOK | berbalik di fasilitas terjauh |

Total jarak = jumlah selisih posisi antar titik berurutan.

### Turnaround

```
Available(t+1) = Available(t) − Diberikan(t) + Kembali(t − τ)
```

Fasilitas dianggap selesai satu episode bila `Allocation = Max`; tabungnya dilepas,
diisi ulang, dan kembali menjadi `Available` setelah τ siklus.

---

## Format berkas ekspor

| Berkas | Isi |
| --- | --- |
| **PDF** (`.pdf`) | Kop, ringkasan indikator, data fasilitas, keputusan Banker's, jejak uji *safe state*, perbandingan rute, diagram koridor, protokol eskalasi, hasil multisiklus, catatan batasan, nomor halaman |
| **Word** (`.docx`) | Laporan terstruktur dengan 6 tabel yang dapat disunting |
| **Excel** (`.xlsx`) | 8 lembar: Ringkasan, Data Fasilitas, Keputusan Banker, Uji Safe State, Rute, Eskalasi, Multisiklus, Sweep Tau |
| **CSV** (`.csv`) | Data tabular (pemisah `;`, UTF-8 BOM) untuk diolah lanjut |
| **JSON** (`.json`) | Masukan dan hasil lengkap, dapat dipakai untuk reproduksi |
| **PNG** (`.png`) | Tangkapan dashboard resolusi 2× |

Setiap berkas memuat pernyataan bahwa hasil berasal dari data hipotetis dan bukan alat
keputusan klinis. Berkas dibuat di peramban; tidak ada data yang dikirim ke server.

---

## Format CSV masukan

Kolom yang dikenali (urutan bebas, nama kolom toleran):

```csv
nama,pos,max,alokasi,minta,kritis,jam,masuk
RS Rujukan Utama,55,12,4,4,18,4,3
RSUD Kota,70,8,3,3,9,6,1
RS Swasta Sehat,20,6,3,2,5,10,5
Puskesmas Induk,75,4,1,2,2,12,4
Klinik Pratama,10,3,1,2,1,20,2
```

Kolom `nama` wajib; kolom lain bernilai 0 bila tidak ada.

---

## Pengujian

```bash
node tests/engine.test.js     # 33 uji mesin simulasi
node tests/ui.test.js         # antarmuka + 6 format ekspor (butuh Playwright)
```

`engine.test.js` memverifikasi keluaran mesin terhadap angka acuan laporan:

- keputusan `4 / 2 / 0 / 0 / 2` (Tabel 2),
- jarak FCFS 135 km, SCAN 110 km, LOOK 90 km (Tabel 3),
- penghematan 18,5% dan 33,3%,
- episode multisiklus 11 / 6 / 4 / 3 untuk τ = 0…3, dan deadlock naif pada siklus 5, 8, 11
  (Tabel 17),
- skor prioritas 0,933 / 0,600 / 0,400 / 0,267 / 0,100,
- pemenuhan berbobot kritis 71,4% (Tabel 21),
- 12 skenario acak dengan keadaan akhir aman.

Untuk `ui.test.js`, pasang Playwright lebih dahulu dan sesuaikan jalur peramban pada
berkas bila perlu:

```bash
npm install --no-save playwright
node tests/ui.test.js
```

---

## Dasar laporan

Model mengikuti laporan progres proyek **"Sistem Penyediaan dan Distribusi Tabung
Oksigen Medis saat Pandemi berbasis Banker's Algorithm dan SCAN Algorithm"** (Revisi 2,
10 November 2026):

| Bab laporan | Implementasi |
| --- | --- |
| 2.1 Banker's Algorithm | `safetyCheck`, `processRequest`, `allocate` |
| 2.2 SCAN Algorithm | `buildRoutes` (FCFS, SCAN, LOOK) |
| 2.3 Skor prioritas | `scoreFacilities`, `rankFacilities` |
| 2.4 Penegasan sumber daya (tabung, bukan gas) | ditampilkan pada halaman Metode |
| 3 Flowchart sistem | alur pada Dashboard dan halaman Metode |
| 9.3 Protokol eskalasi | `escalate`, `levelOf` |
| 10 Turnaround | `simulateCycles`, `tauSweep` |
| 11 Skenario & sensitivitas | `runScenarioBatch`, pengaturan bobot |

Rujukan: Silberschatz, Galvin, & Gagne (2018); Denning (1967).

---

## Batasan

- Data bersifat hipotetis; tidak ada wawancara dengan tenaga medis.
- Satu depot dan satu jenis tabung.
- Jaringan jalan disederhanakan menjadi koridor linear satu dimensi.
- Gas sisa dalam tabung dan kapasitas pabrik pengisian tidak dimodelkan.
- Bobot prioritas dan ambang eskalasi belum divalidasi secara klinis.
- Hasil simulasi bukan kinerja lapangan dan bukan alat keputusan klinis.

---

## Lisensi

Kode proyek ini dilisensikan under MIT — lihat [LICENSE](LICENSE).
Pustaka pihak ketiga di `vendor/` memakai lisensinya masing-masing
(jsPDF MIT, jsPDF-AutoTable MIT, docx MIT, SheetJS Apache-2.0, html2canvas MIT).
