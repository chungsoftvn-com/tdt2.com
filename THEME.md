# Theme (giao diện) — tdt2.com

Repo này là bản fork của `tdt.com` với **hệ thống theme nhiều giao diện** và giao diện
mới `layout2_datviet`. Tài liệu dưới đây ghi cách hoạt động để sau này thêm/sửa theme.

## 1. Theme là gì

Theme = **một bộ `pages` + `components` + `styles`** nằm trong `layouts/<theme-id>/`:

```
layouts/
  layout1_xugawear.vercel.app/     # theme cũ (sand/teal, tối giản)
    pages/        -> copy vào site/src/pages
    components/   -> copy vào site/src/components
  layout2_datviet/                 # theme mặc định (xanh #27822a, Open Sans)
    pages/
    components/
    styles/theme.css               -> copy vào site/src/styles/theme.css
```

`site/scripts/copy-layout.mjs` là cầu nối duy nhất: nó **xoá sạch** `site/src/pages` +
`site/src/components`, copy theme đang bật vào, và copy `styles/*` của theme vào
`site/src/styles/`. Vì vậy `site/src/**` là thư mục **sinh tự động** — đừng sửa trực tiếp,
hãy sửa trong `layouts/<theme>/` rồi chạy lại script.

Ngoại lệ (KHÔNG bị ghi đè): `site/src/lib/**` (nội dung/schema/SEO…), `site/src/styles/global.css`
và `site/src/styles/fonts.css`.

## 2. Theme đang bật

Nguồn duy nhất là **`content/site.json`**:

```json
{
  "theme": "layout2_datviet",
  "themes": [ { "id": "layout2_datviet", "name": "DatViet (mặc định)" }, … ]
}
```

- `copy-layout.mjs` (không truyền tham số) đọc file này; nếu file thiếu/lỗi → dùng
  `layout2_datviet`.
- Ép tay khi build: `cd site; node scripts/copy-layout.mjs layout1_xugawear.vercel.app`.
- **Đổi theme qua admin**: `/admin/theme` (mục "Giao diện" ở header admin) → gọi
  `PUT /api/theme` → Worker ghi `content/site.json` và commit → CI build lại (~1–2 phút).

## 3. Đổi màu / font của một theme

Mỗi theme có `styles/theme.css` riêng, được `BaseLayout.astro` của theme đó import
**sau** `global.css`:

```astro
import '@/styles/global.css';
import '@/styles/theme.css'; // ghi đè token của global.css
```

⚠️ **Bài học quan trọng**: Tailwind v4 chỉ xử lý `@theme` trong file có
`@import "tailwindcss"` (tức `global.css`). Khai báo `@theme` trong `theme.css` sẽ bị
trình duyệt **bỏ qua hoàn toàn**. Muốn ghi đè token thì khai báo biến CSS thường:

```css
:root {
  --color-sea: #27822a;  /* các utility bg-sea/text-sea đều dùng var(--color-*) */
  --font-body: "Open Sans", system-ui, sans-serif;
}
```

Thêm token MỚI (ví dụ `--color-hot`) thì các utility kiểu `text-hot` sẽ không tồn tại —
dùng `text-[var(--color-hot)]` hoặc khai báo class riêng trong `theme.css`.

## 4. Thêm một theme mới

1. `layouts/mytheme/` = copy một theme đang chạy (pages + components), sửa giao diện.
2. Thêm `layouts/mytheme/styles/theme.css` (nếu muốn đổi màu/font) và import trong
   `components/BaseLayout.astro` của theme đó.
3. Thêm id vào danh sách cho phép: `content/site.json` → `themes` **và**
   `dev/worker/src/routes/theme.ts` → `THEMES` (worker chặn id lạ).
4. `node dev/worker`… deploy worker (nếu đổi route) rồi chọn theme ở `/admin/theme`.
5. Build thử: `cd site; node scripts/copy-layout.mjs mytheme; npm run build`.

## 5. Dữ liệu Facebook

`content/vi/facebook.json` (thông tin Page + danh sách ảnh) và ảnh trong
`content/vi/images/facebook/`. Trang chủ theme `layout2_datviet` render khối
"Hình ảnh mới nhất từ Facebook".

- Tải ảnh: `node dev/fb-download.mjs` (dán URL `scontent...` mới — URL Facebook CDN
  hết hạn sau vài ngày, phải lấy lại qua trình duyệt đã đăng nhập).
- Bản EN: `python site/scripts/translate.py --files content/vi/facebook.json`
  (CI cũng tự dịch khi file đổi).

## 6. Ghi chú hạ tầng

- GitHub Pages **không có redirect server-side** → mọi chuyển hướng là trang tĩnh HTTP 200
  (xem `site/legacy-redirects.json` + `site/scripts/build-legacy-redirects.mjs`).
- Repo phải ở chế độ **public** thì GitHub Pages mới bật được với tài khoản hiện tại.
- Worker quản trị (`dev/`) là thư mục gitignored — deploy tay:
  `cd dev/worker; npx wrangler deploy` (sau khi thêm site vào `sites.config.json` và chạy
  `node supabase.config.mjs all` + `node cloudflare.config.mjs all`).
- ⚠️ `dev/worker/src/routes/theme.ts` (API đổi theme) nằm trong `dev/` nên KHÔNG có trong
  git; nếu clone repo này ở máy khác thì phải copy file đó từ máy đang chạy.
