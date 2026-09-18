/**
 * Cấu hình + helper cho Admin UI.
 * Worker dùng chung (đa site): <site-id>/api/...
 * - Dev:  Worker local (npm run dev trong worker/) tại localhost:8787
 * - Prod: Worker trên *.workers.dev (điền subdomain sau khi `wrangler deploy`)
 */
export const ADMIN_SITE_ID = 'tdt2';

export const ADMIN_WORKER_ORIGIN = import.meta.env.DEV
  ? 'http://localhost:8787'
  : 'https://site-admin-worker.nvtuan1689.workers.dev'; // Worker DÙNG CHUNG cho mọi site

/** Repo GitHub mà Worker commit nội dung bài viết (khớp github.owner/repo trong worker/sites.config.json). */
export const ADMIN_GITHUB_REPO = 'chungsoftvn-com/tdt2.com';

export function adminApi(path) {
  return `${ADMIN_WORKER_ORIGIN}/${ADMIN_SITE_ID}/api${path}`;
}

/**
 * Gọi API worker với credentials (cookie httpOnly được gửi tự động).
 * Trả { status, data }. Lỗi mạng/timeout trả status 0 (KHÔNG ném) để UI hiển
 * thị thông báo thay vì "đứng im" — hay gặp khi payload có ảnh nặng.
 */
export async function api(method, path, body) {
  try {
    const res = await fetch(adminApi(path), {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* không phải JSON (ví dụ trang lỗi 502/524 của Cloudflare) */
    }
    return { status: res.status, data };
  } catch (err) {
    return { status: 0, data: null, networkError: err instanceof Error ? err.message : String(err) };
  }
}

/** Thông báo lỗi đọc được cho admin (dùng chung mọi trang admin). */
export function describeSaveError(r) {
  const data = r && r.data;
  if (!r || r.status === 0) {
    return 'Không kết nối được tới máy chủ (mạng chậm hoặc bị ngắt khi gửi ảnh). Nội dung chưa được lưu — vui lòng thử lại.';
  }
  if (r.status === 401) {
    return 'Phiên đăng nhập đã hết hạn. Vui lòng mở /admin đăng nhập lại rồi bấm Lưu lại (nội dung chưa được lưu).';
  }
  if (data && data.error === 'forbidden_origin') {
    return 'Origin không được phép (kiểm tra ALLOWED_ORIGIN của site).';
  }
  if (data && typeof data.message === 'string' && data.message) {
    return `Lưu thất bại: ${data.message}`;
  }
  if (data && typeof data.detail === 'string' && data.detail) {
    return `Lưu thất bại (lỗi máy chủ): ${data.detail}`;
  }
  if (data && typeof data.error === 'string' && data.error) {
    return `Lưu thất bại (${data.error}).`;
  }
  return `Lưu thất bại (HTTP ${r.status}).`;
}

/**
 * Vô hiệu hoá nút + hiện spinner "loading" ngay cạnh khi đang xử lý
 * (tránh user bấm nhiều lần). Gọi setBusy(btn, true, '...') rồi setBusy(btn, false) khi xong.
 */
export function setBusy(btn, busy, loadingText = 'Đang xử lý...') {
  if (!btn) return;
  if (busy) {
    if (!btn.dataset._orig) btn.dataset._orig = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('cursor-wait', 'opacity-70');
    btn.innerHTML = `<span class="inline-flex items-center justify-center gap-2"><span class="spinner"></span>${loadingText}</span>`;
  } else {
    btn.disabled = false;
    btn.classList.remove('cursor-wait', 'opacity-70');
    if (btn.dataset._orig) btn.innerHTML = btn.dataset._orig;
  }
}
/**
 * "Nhịp tim" giữ phiên đăng nhập admin không hết hạn giữa chừng.
 *
 * Cơ chế: gửi NGẦM một request vô nghĩa `POST /session/refresh` (không mang dữ
 * liệu, không thay đổi nội dung) — server gia hạn phiên thêm 1 TTL và cấp lại
 * cookie với Max-Age mới. Nhờ vậy admin soạn tour dài (kèm ảnh) không bị hết
 * phiên lúc bấm Lưu.
 *
 * Chỉ chạy khi tab admin đang hiển thị; đóng tab thì hết nhịp tim => phiên vẫn
 * tự hết hạn như cũ. Mọi lỗi (chưa đăng nhập, mất mạng) đều bỏ qua im lặng.
 */
export function startSessionKeepAlive({ intervalMs = 10 * 60 * 1000 } = {}) {
  if (typeof window === 'undefined' || window.__ttKeepAlive) return;
  window.__ttKeepAlive = true;

  const ping = () => {
    if (document.visibilityState !== 'visible') return;
    api('POST', '/session/refresh'); // api() không ném — lỗi thì bỏ qua
  };

  // Nhịp đầu tiên sau 1 phút (trang vừa mở thường đã vừa kiểm tra phiên rồi).
  setTimeout(ping, 60 * 1000);
  setInterval(ping, intervalMs);
  // Quay lại tab sau khi đi làm việc khác => gia hạn ngay.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') ping();
  });
}

/** Hạn mỗi ảnh phía server — phải KHỚP `MAX_IMAGE_BYTES` trong dev/worker/src/image.ts. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** Đích AN TOÀN sau khi nén: mọi ảnh gửi lên đều được tự động giảm về mức này. */
export const IMAGE_TARGET_BYTES = 1200 * 1024;
/** Thang giảm dần khi nén: hạ cạnh dài rồi hạ chất lượng cho tới khi đạt đích. */
const SIZE_LADDER = [1600, 1280, 1024, 800, 640, 480];
const QUALITY_LADDER = [0.82, 0.7, 0.6, 0.5, 0.42, 0.35];
/** Định dạng gửi nguyên file gốc cũng hiển thị được trên web. */
const RAW_OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
/** Định dạng gửi lên server (suy từ tên file sau khi nén). */
const EXT_BY_MIME = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function extForBlob(blob, fallbackName) {
  if (EXT_BY_MIME[blob.type]) return EXT_BY_MIME[blob.type];
  const m = String(fallbackName || '').match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : 'webp';
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000; // từng khối để tránh tràn stack khi ảnh lớn
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Giải mã file ảnh thành nguồn vẽ được lên canvas.
 * Thử `createImageBitmap` trước (nhanh, tôn trọng EXIF), nếu không được thì
 * fallback qua thẻ <img> + objectURL (một số máy/định dạng chỉ <img> đọc được).
 * Ném lỗi nếu trình duyệt không giải mã được file nào cả (HEIC/TIFF/RAW...).
 */
async function decodeSource(file) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { image: bmp, width: bmp.width, height: bmp.height, dispose: () => bmp.close?.() };
  } catch {
    /* thử tiếp bằng <img> */
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode failed'));
      el.src = url;
    });
    const width = img.naturalWidth || img.width || 0;
    const height = img.naturalHeight || img.height || 0;
    if (!width || !height) throw new Error('image has no intrinsic size');
    return { image: img, width, height, dispose: () => URL.revokeObjectURL(url) };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

/**
 * Nén ảnh (WebP, fallback JPEG nếu trình duyệt không encode được WebP) xuống
 * ≤ `budget`: đi qua thang kích thước × chất lượng, sau đó nếu vẫn quá lớn thì
 * thu nhỏ tiếp từng bước 75% cho tới khi đạt — nên ảnh giải mã được LUÔN có kết
 * quả nằm trong mức an toàn.
 */
async function compressToBudget(source, budget) {
  const dims = (edge) => {
    const scale = Math.min(1, edge / Math.max(source.width, source.height));
    return [Math.max(1, Math.round(source.width * scale)), Math.max(1, Math.round(source.height * scale))];
  };
  const encode = async (w, h, quality) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(source.image, 0, 0, w, h);
    let blob = await canvasToBlob(canvas, 'image/webp', quality);
    // Trình duyệt không encode được WebP -> toBlob trả PNG (nặng) -> chuyển sang JPEG.
    if (!blob || blob.type !== 'image/webp') {
      const jpeg = await canvasToBlob(canvas, 'image/jpeg', quality);
      if (jpeg && (!blob || jpeg.size < blob.size)) blob = jpeg;
    }
    return blob;
  };

  let best = null;
  for (const edge of SIZE_LADDER) {
    const [w, h] = dims(edge);
    for (const quality of QUALITY_LADDER) {
      const blob = await encode(w, h, quality);
      if (!blob) continue;
      if (!best || blob.size < best.size) best = blob;
      if (best.size <= budget) return best;
    }
  }

  // Vẫn quá lớn (ảnh rất chi tiết): thu nhỏ tiếp cho tới khi đạt mức an toàn.
  let [w, h] = dims(SIZE_LADDER[SIZE_LADDER.length - 1]);
  for (let i = 0; best && best.size > budget && Math.max(w, h) > 64 && i < 12; i++) {
    w = Math.max(64, Math.round(w * 0.75));
    h = Math.max(64, Math.round(h * 0.75));
    for (const quality of [0.6, 0.5]) {
      const blob = await encode(w, h, quality);
      if (!blob) continue;
      if (blob.size < best.size) best = blob;
      if (best.size <= budget) return best;
    }
  }
  return best;
}

/**
 * Chuyển file ảnh -> { name, data } base64, ĐÃ TỰ ĐỘNG GIẢM về ≤ IMAGE_TARGET_BYTES.
 *
 * Quy tắc:
 *  1. File đã đúng định dạng web và đã đủ nhỏ → dùng luôn (khỏi nén lại, giữ chất lượng gốc).
 *  2. Còn lại → tự nén, hạ dần kích thước + chất lượng tới mức an toàn (kể cả ảnh
 *     HEIC/AVIF nếu trình duyệt giải mã được → tự chuyển sang WebP/JPEG).
 *  3. Chỉ khi trình duyệt KHÔNG giải mã được file (HEIC/TIFF/RAW trên Chrome/Edge)
 *     mới báo lỗi rõ ràng — vì JS không thể nén thứ mình không đọc được.
 */
export async function fileToImage(file) {
  if (!file) return undefined;
  const originalName = file.name || 'image.webp';
  const stem = (originalName.replace(/\.[^.]+$/, '') || 'image').toLowerCase().slice(0, 80);
  const webSafe = RAW_OK_TYPES.includes(file.type);

  // (1) Ảnh đã đủ nhỏ & đúng định dạng web → không cần nén.
  if (webSafe && file.size <= IMAGE_TARGET_BYTES) {
    return { name: `${stem}.${extForBlob(file, originalName)}`, data: await blobToBase64(file) };
  }

  // (2) Tự động nén xuống mức an toàn.
  let source = null;
  try {
    source = await decodeSource(file);
  } catch {
    source = null;
  }
  let compressed = null;
  if (source) {
    try {
      compressed = await compressToBudget(source, IMAGE_TARGET_BYTES);
    } finally {
      source.dispose();
    }
  }

  let blob = compressed;
  if (!blob) {
    if (!webSafe || file.size > MAX_IMAGE_BYTES) {
      throw new Error(
        `Ảnh "${originalName}" (${mb(file.size)}) không xử lý/nén được trên trình duyệt này. ` +
          'Vui lòng chọn ảnh JPG/PNG/WebP (ảnh HEIC từ iPhone nên được lưu sang JPG trước khi tải lên).',
      );
    }
    blob = file; // nén lỗi nhưng file gốc đúng định dạng web và vẫn dưới hạn server
  }

  // Chốt chặn cuối — gần như không bao giờ tới đây.
  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error(
      `Ảnh "${originalName}" quá lớn (${mb(blob.size)} — tối đa ${mb(MAX_IMAGE_BYTES)}). ` +
        'Vui lòng chọn ảnh nhỏ hơn.',
    );
  }
  if (blob !== file && file.size > blob.size) {
    console.info(`[admin] tự giảm ảnh "${originalName}": ${mb(file.size)} → ${mb(blob.size)}`);
  }
  return { name: `${stem}.${extForBlob(blob, originalName)}`, data: await blobToBase64(blob) };
}

/**
 * Nén 1 data URL ảnh (ảnh dán/kéo thả vào editor) về ≤ IMAGE_TARGET_BYTES.
 * Trả { name, data } hoặc null nếu chuỗi không phải data URL ảnh.
 * Ném lỗi nếu ảnh quá lớn mà trình duyệt không giải mã/nén được.
 */
export async function shrinkImageDataUrl(dataUrl) {
  const m = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const base64 = m[2];

  if (RAW_OK_TYPES.includes(mime) && base64.length <= Math.ceil(IMAGE_TARGET_BYTES / 3) * 4) {
    return { name: null, data: base64 }; // đã đủ nhỏ
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ext = (mime.split('/')[1] || 'png').replace('jpeg', 'jpg');
  const file = new File([bytes], `pasted.${ext}`, { type: mime });
  const im = await fileToImage(file);
  return { name: im?.name || null, data: im?.data || '' };
}
