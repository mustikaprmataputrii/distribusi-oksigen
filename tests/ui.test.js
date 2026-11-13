/* Uji antarmuka dengan Chromium/Edge terpasang: memuat halaman, menelusuri
 * semua tampilan, mengubah data, dan menjalankan setiap jenis ekspor. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', '_artifacts');

const VIEWS = ['dashboard', 'data', 'bankers', 'rute', 'eskalasi', 'multisiklus', 'skenario', 'ekspor', 'metode'];
const EXPORTS = ['pdf', 'docx', 'xlsx', 'csv', 'json', 'png'];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 980 }, acceptDownloads: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(500);

  // --- halaman masuk ---
  const landingVisible = await page.isVisible('#landing');
  const heroTitle = (await page.textContent('.landing h1')).replace(/\s+/g, ' ').trim();
  console.log('landing visible:', landingVisible);
  console.log('hero:', heroTitle);
  await page.screenshot({ path: path.join(OUT, '01-landing.png'), fullPage: true });

  // --- masuk ---
  await page.click('#enterBtn');
  await page.waitForTimeout(600);
  console.log('app visible:', await page.isVisible('#app'));
  console.log('dashboard KPI count:', await page.locator('#dashBody .kpi').count());
  await page.screenshot({ path: path.join(OUT, '02-dashboard.png'), fullPage: true });

  // --- angka kunci pada dashboard ---
  const dashText = (await page.textContent('#dashBody')).replace(/\s+/g, ' ');
  const checks = [
    ['pemenuhan 61,5%', /61,5\s*%/],
    ['hemat LOOK 33,3%', /33,3/],
    ['jarak 135 km', /135/],
    ['jarak 90 km', /90\s*km/],
    ['status Parsial', /Parsial/i],
    ['status Ditunda', /Ditunda/i]
  ];
  checks.forEach(([name, re]) => console.log('  dashboard ' + name + ':', re.test(dashText)));

  // --- semua tampilan ---
  for (const v of VIEWS) {
    await page.click('.nav-item[data-view="' + v + '"]');
    await page.waitForTimeout(350);
    const visible = await page.isVisible('#view-' + v);
    const html = await page.innerHTML('#view-' + v);
    console.log('view ' + v + ': visible=' + visible + ' len=' + html.length);
    if (v !== 'skenario') {
      await page.screenshot({ path: path.join(OUT, '10-' + v + '.png'), fullPage: true });
    }
  }

  // --- skenario: jalankan batch ---
  await page.click('.nav-item[data-view="skenario"]');
  await page.waitForTimeout(250);
  await page.click('#runBatchBtn');
  await page.waitForTimeout(900);
  const batchRows = await page.locator('#skenarioBody table.data tbody tr').count();
  console.log('skenario rows:', batchRows);
  await page.screenshot({ path: path.join(OUT, '10-skenario.png'), fullPage: true });

  // --- ubah data: stok & bobot ---
  await page.click('.nav-item[data-view="data"]');
  await page.waitForTimeout(250);
  await page.fill('input[data-bind="available"]', '20');
  await page.waitForTimeout(500);
  await page.click('.nav-item[data-view="dashboard"]');
  await page.waitForTimeout(400);
  const dash2 = (await page.textContent('#dashBody')).replace(/\s+/g, ' ');
  console.log('setelah stok 20 -> pemenuhan 100%:', /100,0\s*%/.test(dash2) || /100\s*%/.test(dash2));
  await page.screenshot({ path: path.join(OUT, '20-dashboard-stok20.png'), fullPage: true });

  // kembali ke data contoh
  await page.click('.nav-item[data-view="data"]');
  await page.waitForTimeout(200);
  await page.click('#resetDataBtn');
  await page.waitForTimeout(400);

  // --- tambah & hapus baris ---
  await page.click('#addRowBtn');
  await page.waitForTimeout(300);
  const rowsAfterAdd = await page.locator('#facTable tbody tr').count();
  await page.click('[data-del="5"]');
  await page.waitForTimeout(300);
  const rowsAfterDel = await page.locator('#facTable tbody tr').count();
  console.log('tabel: setelah tambah=' + rowsAfterAdd + ' setelah hapus=' + rowsAfterDel);

  // --- tema gelap ---
  await page.click('#themeToggle');
  await page.click('#themeToggle');
  await page.waitForTimeout(400);
  console.log('tema:', await page.getAttribute('html', 'data-theme'));
  await page.screenshot({ path: path.join(OUT, '30-dashboard-dark.png'), fullPage: true });
  await page.click('#themeToggle');
  await page.waitForTimeout(300);

  // --- ekspor ---
  const downloads = [];
  page.on('download', async (d) => {
    const name = d.suggestedFilename();
    const file = path.join(OUT, name);
    await d.saveAs(file);
    downloads.push({ name, size: fs.statSync(file).size });
  });

  await page.click('.nav-item[data-view="ekspor"]');
  await page.waitForTimeout(300);
  for (const kind of EXPORTS) {
    await page.click('#view-ekspor [data-export="' + kind + '"]');
    await page.waitForTimeout(kind === 'png' ? 3500 : 1800);
    if (kind === 'png') {
      const hint = await page.textContent('#toasts').catch(() => '');
      if (/Gagal|error/i.test(hint || '')) console.log('  catatan PNG:', (hint || '').trim());
    }
  }
  console.log('unduhan:', JSON.stringify(downloads, null, 1));

  // --- menu ekspor di topbar ---
  await page.click('#exportMenuBtn');
  await page.waitForTimeout(200);
  console.log('menu ekspor terbuka:', await page.isVisible('#exportMenu'));
  await page.keyboard.press('Escape');

  // --- muat ulang: state harus tersimpan ---
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(500);
  if (await page.isVisible('#enterBtn')) {
    await page.click('#enterBtn');
    await page.waitForTimeout(400);
  }
  await page.click('.nav-item[data-view="data"]');
  await page.waitForTimeout(300);
  console.log('state tersimpan setelah muat ulang:', await page.inputValue('input[data-bind="available"]'));

  console.log('\nERRORS (' + errors.length + '):');
  errors.slice(0, 20).forEach((e) => console.log('  ' + e));

  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
