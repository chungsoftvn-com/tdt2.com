#!/usr/bin/env node
/**
 * build-legacy-redirects.mjs — sinh "trang chuyển hướng" cho các URL CŨ.
 *
 * BỐI CẢNH
 * GitHub Pages không có 301 server-side và trả 404 cho mọi path không có file.
 * Các URL cũ của todaytourist.com (site ASP.NET/CMS trước, xem
 * `legacy-redirects.json`) đang được Google index và trả 404 → mất traffic.
 *
 * CÁCH LÀM
 * Với mỗi cặp `"/duong-dan-cu": "/duong-dan-moi/"` trong `site/legacy-redirects.json`,
 * script ghi `.astro-dist/<duong-dan-cu>/index.html`:
 *   - HTTP 200 (không còn 404),
 *   - `<link rel="canonical" href="<đích>">` → Google gộp tín hiệu về URL mới,
 *   - `<meta http-equiv="refresh" content="8; url=<đích>">` (fallback khi tắt JS),
 *   - đếm giờ bằng JS rồi `location.replace(<đích>)` — chuyển hướng thật,
 *   - giao diện đề xuất: nút "Đi tới trang mới ngay" + link nhanh tới các mục chính.
 *
 * LƯU Ý SEO
 * Trang này CỐ Ý KHÔNG đặt `noindex`: Google bỏ qua `canonical` khi có `noindex`,
 * nên nếu noindex thì tín hiệu sẽ KHÔNG được gộp về URL mới. Chỉ dùng canonical
 * (+ meta refresh + JS) là cách gộp tín hiệu đúng chuẩn.
 *
 * Không ghi đè: path nào đã có thư mục trong output (trang thật) thì bỏ qua, nên
 * thêm URL mới vào site sau này sẽ tự "thắng" bản chuyển hướng.
 *
 * Được gọi bởi `npm run build` (site/package.json) và CI (.github/workflows/build.yml).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(ROOT, '..');
const DIST = path.join(ROOT, '.astro-dist');
const MAP_FILE = path.join(ROOT, 'legacy-redirects.json');

/** Domain chính — phải khớp `site` trong astro.config.mjs + file CNAME + lib/seo.js. */
const SITE_URL = 'https://tdt2.com';
/** Số giây đếm ngược trước khi tự chuyển hướng. */
const DELAY = 8;

if (!fs.existsSync(DIST)) {
  console.error('[legacy] Không thấy .astro-dist — chạy `astro build` trước.');
  process.exit(1);
}
if (!fs.existsSync(MAP_FILE)) {
  console.error(`[legacy] Không thấy ${path.relative(REPO, MAP_FILE)}.`);
  process.exit(1);
}

const map = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
const c = JSON.parse(fs.readFileSync(path.join(REPO, 'content', 'vi', 'common.json'), 'utf8'));

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Link nhanh (nhãn lấy từ content/vi/common.json — không hard-code chữ trong script). */
const QUICK = [
  { href: '/vi/tours/', label: c.nav_tours },
  { href: '/vi/tim-tour/', label: c.nav_find_tour },
  { href: '/vi/tin-tuc/', label: c.nav_news },
  { href: '/vi/y-kien-khach-hang/', label: c.nav_testimonials },
  { href: '/vi/ve-may-bay/', label: c.nav_tickets },
  { href: '/vi/cho-thue-xe/', label: c.nav_car },
  { href: '/vi/contact/', label: c.nav_contact },
].filter((x) => x.label);

function html(from, to) {
  const abs = SITE_URL + to;
  const brand = c.brand_name || 'TODAYTOURIST';
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Trang đã chuyển địa chỉ · ${esc(brand)}</title>
<meta name="description" content="Địa chỉ cũ ${esc(from)} đã được chuyển sang ${esc(to)}.">
<link rel="canonical" href="${esc(abs)}">
<meta http-equiv="refresh" content="${DELAY}; url=${esc(abs)}">
<style>
  :root { --sea:#0f766e; --ink:#1b2a2a; --paper:#fffdf7; --sand:#f6efe3; }
  * { box-sizing:border-box; }
  body { margin:0; min-height:100dvh; display:flex; flex-direction:column;
         font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
         color:var(--ink); background:var(--sand); }
  header, footer { padding:18px 20px; text-align:center; }
  header strong { letter-spacing:.08em; font-size:14px; }
  main { flex:1; display:grid; place-items:center; padding:16px 20px 40px; }
  .card { width:100%; max-width:660px; background:var(--paper); border-radius:18px;
          padding:32px 26px; text-align:center;
          box-shadow:0 18px 40px rgba(15,118,110,.14); }
  .kicker { font-size:13px; text-transform:uppercase; letter-spacing:.12em;
            color:var(--sea); font-weight:600; margin:0 0 10px; }
  h1 { font-size:clamp(1.35rem,4vw,2rem); line-height:1.25; margin:0 0 12px; }
  .old { display:inline-block; max-width:100%; overflow-wrap:anywhere; font-size:13px;
         background:var(--sand); border-radius:8px; padding:4px 10px; color:#5b6b6b; }
  .timer { font-size:15px; margin:18px 0 4px; }
  .timer b { font-size:24px; color:var(--sea); font-variant-numeric:tabular-nums; }
  .bar { height:6px; border-radius:99px; background:#e6ded1; overflow:hidden; margin:12px auto 22px; max-width:340px; }
  .bar i { display:block; height:100%; width:0; background:var(--sea); transition:width 1s linear; }
  .btn { display:inline-flex; align-items:center; justify-content:center; min-height:48px;
         padding:12px 26px; border-radius:99px; background:var(--sea); color:#fff;
         font-weight:600; text-decoration:none; }
  .btn:hover { filter:brightness(1.08); }
  .quick { margin:26px 0 0; padding:0; list-style:none; display:flex; flex-wrap:wrap;
           gap:8px; justify-content:center; }
  .quick a { display:inline-block; padding:7px 14px; border-radius:99px; font-size:14px;
             color:var(--ink); text-decoration:none; border:1px solid rgba(27,42,42,.16); }
  .quick a:hover { border-color:var(--sea); color:var(--sea); }
  footer { font-size:13px; color:#5b6b6b; }
  footer a { color:var(--sea); }
</style>
</head>
<body>
<header><strong>${esc(brand)}</strong></header>
<main>
  <div class="card">
    <p class="kicker">Địa chỉ cũ</p>
    <h1>Trang này đã chuyển sang địa chỉ mới</h1>
    <p class="old">${esc(from)}</p>
    <p class="timer">Tự động chuyển sau <b id="cd">${DELAY}</b> giây…</p>
    <div class="bar"><i id="bar"></i></div>
    <p><a class="btn" id="go" href="${esc(to)}">Đi tới trang mới ngay</a></p>
    <ul class="quick">
${QUICK.map((q) => `      <li><a href="${esc(q.href)}">${esc(q.label)}</a></li>`).join('\n')}
    </ul>
  </div>
</main>
<footer>
  ${esc(brand)} · Hotline <a href="tel:${esc(String(c.hotline || '').replace(/[^0-9+]/g, ''))}">${esc(c.hotline || '')}</a>
</footer>
<script>
  (function () {
    var TARGET = ${JSON.stringify(to)};
    var left = ${DELAY};
    var cd = document.getElementById('cd');
    var bar = document.getElementById('bar');
    var go = document.getElementById('go');
    go.addEventListener('click', function (e) {
      e.preventDefault();
      window.location.replace(TARGET);
    });
    bar.style.width = (100 / ${DELAY}) + '%';
    var t = setInterval(function () {
      left -= 1;
      if (cd) cd.textContent = left > 0 ? left : 0;
      if (bar) bar.style.width = (100 * (${DELAY} - left) / ${DELAY}) + '%';
      if (left <= 0) {
        clearInterval(t);
        window.location.replace(TARGET);
      }
    }, 1000);
  })();
</script>
</body>
</html>
`;
}

let created = 0;
let skipped = 0;
let failed = 0;

for (const [rawFrom, to] of Object.entries(map)) {
  if (rawFrom.startsWith('_')) continue;
  if (typeof to !== 'string' || !to.startsWith('/')) {
    console.error(`[legacy] Bỏ qua "${rawFrom}" — đích không hợp lệ: ${to}`);
    failed += 1;
    continue;
  }
  let from;
  try {
    from = decodeURIComponent(rawFrom);
  } catch {
    from = rawFrom;
  }
  const seg = from.split('/').filter(Boolean);
  if (!seg.length) continue;

  const dir = path.join(DIST, ...seg);
  // Path đã là trang thật trong site mới → không ghi đè.
  if (fs.existsSync(dir)) {
    console.log(`[legacy] bỏ qua (đã có trang thật): ${from}`);
    skipped += 1;
    continue;
  }
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html(from, to), 'utf8');
    created += 1;
  } catch (err) {
    console.error(`[legacy] LỖI khi tạo "${from}": ${err.message}`);
    failed += 1;
  }
}

console.log(
  `[legacy] đã tạo ${created} trang chuyển hướng (bỏ qua ${skipped} path đã có trang thật` +
    (failed ? `, ${failed} lỗi` : '') +
    ').',
);
