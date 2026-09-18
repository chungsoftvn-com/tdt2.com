/**
 * seo.js — toàn bộ logic SEO dùng chung: canonical, hreflang, breadcrumb và
 * structured data (JSON-LD).
 *
 * Vị trí: `site/src/lib/` → KHÔNG bị `scripts/copy-layout.mjs` ghi đè (giống
 * content.js / rich.js). Mọi trang (BaseLayout, sitemap endpoint) đều import
 * từ đây, nên chỉ cần sửa 1 chỗ khi thêm loại trang mới.
 *
 * Nguyên tắc:
 *  - Không bịa dữ liệu: schema chỉ dùng field có thật trong `content/<lang>/*.json`.
 *    (Không có toạ độ → không sinh `geo`; chưa có review thật → không sinh
 *    `aggregateRating`.)
 *  - Đọc file thiếu/ lỗi KHÔNG được làm sập build → mọi truy cập đi qua `safeContent()`.
 *  - Mọi thứ trả về chỉ là dữ liệu thuần (object/string) để BaseLayout tự render.
 */
import {
  DEFAULT_LANG,
  LANGS,
  ROOT_PAGE_EQUIV,
  getContent,
  resolveMovedPath,
  viMirrorTarget,
  viOnlyRootSlug,
} from './content.js';

export { DEFAULT_LANG, LANGS, viOnlyRootSlug };

/** Domain chính — phải khớp `site` trong astro.config.mjs và file CNAME. */
export const SITE_URL = 'https://tdt2.com';

const BRAND_FALLBACK = 'TODAYTOURIST';
/** Ảnh chia sẻ mặc định (1200×630) — sinh bởi `site/scripts/make-brand-assets.py`. */
export const DEFAULT_OG_IMAGE = '/og-default.jpg';

const ORG_ID = `${SITE_URL}/#travelagency`;
const WEBSITE_ID = `${SITE_URL}/#website`;

/** Đọc content an toàn — file thiếu/JSON lỗi trả null thay vì throw. */
function safeContent(lang, file) {
  try {
    return getContent(lang, file);
  } catch {
    return null;
  }
}

/** `common.json` của ngôn ngữ, fallback sang ngôn ngữ mặc định rồi {}. */
function commonOf(lang) {
  return safeContent(lang, 'common') || safeContent(DEFAULT_LANG, 'common') || {};
}

/* ------------------------------------------------------------------ *
 * URL
 * ------------------------------------------------------------------ */

/** URL tuyệt đối từ path nội bộ (giữ nguyên nếu đã là URL đầy đủ). */
export function absUrl(path) {
  const p = String(path || '/');
  if (/^https?:\/\//i.test(p)) return p;
  return new URL(p.startsWith('/') ? p : `/${p}`, SITE_URL).href;
}

/** URL trang chủ của 1 ngôn ngữ: '/vi/', '/en/'. */
export function homePath(lang) {
  return `/${lang}/`;
}

/**
 * Path đã QUY VỀ URL THẬT đang được index — MỌI hàm SEO phải đi qua đây trước:
 *
 *   '/tim-tour/'          (bản sao cấp gốc) → '/vi/tim-tour/'
 *   '/tours/<slug>/'      (bản sao cấp gốc) → '/vi/tours/<slug>/'
 *   '/vi/tour/<slug>/'    (mục đổi tên)      → '/vi/tours/<slug>/'
 *   '/vi/tim-tour/'        giữ nguyên
 *
 * Nhờ vậy mọi URL trùng nội dung (bản sao cấp gốc, path cũ sau khi đổi tên) đều
 * trỏ canonical/hreflang về cùng 1 URL duy nhất → không sinh duplicate content.
 */
function seoPath(pathname) {
  return viMirrorTarget(pathname) ?? resolveMovedPath(pathname);
}

/**
 * Chuẩn hoá pathname về dạng canonical (khớp `build.format: 'directory'`).
 * Trang chủ '/' và bản sao cấp gốc đều trỏ về bản '/vi/' tương ứng
 * (GitHub Pages không hỗ trợ redirect server-side nên dùng canonical thay thế).
 */
export function canonicalPath(pathname) {
  const clean = seoPath(pathname).split('#')[0].split('?')[0];
  if (clean === '' || clean === '/') return homePath(DEFAULT_LANG);
  return clean.endsWith('/') ? clean : `${clean}/`;
}

/** Cùng trang nhưng ở ngôn ngữ khác: '/vi/tours/x/' → '/en/tours/x/'. */
export function altPath(pathname, lang) {
  const seg = String(pathname || '/').split('/').filter(Boolean);
  if (seg[0] === 'vi' || seg[0] === 'en') seg[0] = lang;
  else seg.unshift(lang);
  return `/${seg.join('/')}/`;
}

/**
 * Các bản ngôn ngữ THỰC SỰ tồn tại của 1 path → [{ lang, href }] (href tuyệt đối).
 *
 * Khác `LANGS.map(altPath)`: trang VI-only ở cấp gốc ('/<slug>/' — xem
 * ROOT_PAGE_EQUIV trong lib/content.js) KHÔNG có URL '/en/<slug>/'. Nếu vẫn map
 * qua LANGS thì HTML sẽ phát hreflang `en` trỏ tới URL 404 (đúng loại lỗi đã
 * từng gặp khi sitemap lấy slug theo từng ngôn ngữ). Vì vậy MỌI nơi phát
 * alternate (BaseLayout, sitemap.xml.ts) phải đi qua hàm này.
 */
export function alternates(pathname) {
  if (viOnlyRootSlug(pathname)) {
    // Trang VI cấp gốc viết riêng: chỉ có 1 bản tiếng Việt → trỏ về chính nó.
    return [{ lang: DEFAULT_LANG, href: absUrl(canonicalPath(pathname)) }];
  }
  // seoPath() đã quy bản sao cấp gốc ('/tim-tour/') và mục đổi tên
  // ('/vi/tour/<slug>/') về URL thật → chỉ cần đổi tiền tố ngôn ngữ.
  const real = seoPath(pathname);
  return LANGS.map((lang) => ({ lang, href: absUrl(altPath(real, lang)) }));
}

/** Path cho hreflang="x-default" (mặc định: trang chủ VI; trang cấp gốc: chính nó). */
export function xDefaultPath(pathname) {
  return viOnlyRootSlug(pathname) ? canonicalPath(pathname) : homePath(DEFAULT_LANG);
}

/**
 * Trang KHÔNG được index (trang công cụ nội bộ do admin dùng để đồng bộ nội dung).
 * `?__sync=1` được xử lý riêng trong BaseLayout (là query param, không phải path).
 */
export function isNoindexPath(pathname) {
  return /\/home\/generated\/?$/.test(String(pathname || '/'));
}

/* ------------------------------------------------------------------ *
 * Title / description
 * ------------------------------------------------------------------ */

/** Key trong `content/<lang>/seo.json` tương ứng với pathname hiện tại. */
export function seoKey(pathname) {
  // Quy về URL thật trước: bản sao cấp gốc ('/tours/<slug>/') và path cũ
  // ('/vi/tour/<slug>/') phải dùng CHUNG key với trang thật ('tours-detail'),
  // nếu không sẽ lấy nhầm title/description của trang danh sách '/vi/tours/'.
  const seg = seoPath(pathname).split('/').filter(Boolean);
  if (seg[0] === 'vi' || seg[0] === 'en') seg.shift();
  if (!seg.length) return 'home';
  // Trang chi tiết không khai báo trong seo.json — tự sinh từ nội dung bài.
  // ('tour' giữ lại cho URL cũ nếu có ngày nào còn sót.)
  if (seg.length > 1 && ['tour', 'tours', 'tin-tuc', 'y-kien-khach-hang'].includes(seg[0])) {
    return `${seg[0]}-detail`;
  }
  if (seg[0] === 'home') return 'home'; // /vi/home/generated/ (đã noindex)
  return seg[0];
}

/**
 * Metadata SEO của 1 trang.
 * Thứ tự ưu tiên title:  seo.json → `<title>` do trang truyền → common.meta_title
 * Thứ tự ưu tiên desc:   do trang truyền → seo.json → common.meta_description
 */
export function pageSeo(lang, pathname) {
  const c = commonOf(lang);
  const table = safeContent(lang, 'seo') || safeContent(DEFAULT_LANG, 'seo') || {};
  const key = seoKey(pathname);
  const entry = table[key] && typeof table[key] === 'object' ? table[key] : {};
  return {
    key,
    title: typeof entry.title === 'string' ? entry.title : '',
    description: typeof entry.description === 'string' ? entry.description : '',
    brand: c.brand_name || BRAND_FALLBACK,
    metaTitle: c.meta_title || BRAND_FALLBACK,
    metaDescription: c.meta_description || '',
    common: c,
  };
}

/* ------------------------------------------------------------------ *
 * Breadcrumb
 * ------------------------------------------------------------------ */

/** slug trang → key nhãn trong common.json. */
const CRUMB_LABELS = {
  about: 'nav_about',
  tours: 'nav_tours',
  contact: 'nav_contact',
  've-may-bay': 'nav_tickets',
  'cho-thue-xe': 'nav_car',
  'tin-tuc': 'nav_news',
  'y-kien-khach-hang': 'nav_testimonials',
  'doi-tac': 'nav_partners',
  'dat-tour': 'nav_book',
  'tim-tour': 'nav_find_tour',
  'tuyen-dung': 'nav_recruit',
  'chi-duong': 'nav_directions',
  tour: 'nav_tours',
};

/**
 * Breadcrumb cho mọi trang (trang chủ trả [] để không sinh schema thừa).
 * `leafLabel` = tên tour/ bài tin, dùng cho trang chi tiết.
 */
export function breadcrumbs(lang, pathname, leafLabel) {
  const c = commonOf(lang);
  // Quy về URL thật trước: bản sao cấp gốc ('/tim-tour/', '/tours/<slug>/') và
  // path cũ ('/vi/tour/<slug>/') dùng CHUNG breadcrumb với trang thật.
  const seg = seoPath(pathname).split('/').filter(Boolean);
  if (seg[0] === 'vi' || seg[0] === 'en') seg.shift();
  if (!seg.length) return [];

  const items = [{ name: c.nav_home || 'Trang chủ', url: homePath(lang) }];
  const section = seg[0];
  const isDetail =
    seg.length > 1 && ['tour', 'tours', 'tin-tuc', 'y-kien-khach-hang'].includes(section);

  if (isDetail) {
    const listSection = section === 'tour' ? 'tours' : section;
    items.push({
      name: c[CRUMB_LABELS[listSection]] || listSection,
      url: `/${lang}/${listSection}/`,
    });
    // Thiếu nhãn bài → dừng ở trang danh sách (tránh 2 crumb trùng tên).
    if (!leafLabel) return items;
    items.push({ name: leafLabel, url: canonicalPath(pathname) });
    return items;
  }

  items.push({
    // Trang cấp gốc ('/<slug>/') lấy nhãn của trang tương đương trong PAGE_SLUGS.
    name: c[CRUMB_LABELS[ROOT_PAGE_EQUIV[section] ?? section]] || leafLabel || section,
    url: canonicalPath(pathname),
  });
  return items;
}

export function breadcrumbLd(items) {
  if (!Array.isArray(items) || items.length < 2) return null;
  return {
    '@type': 'BreadcrumbList',
    '@id': `${absUrl(items[items.length - 1].url)}#breadcrumb`,
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: absUrl(it.url),
    })),
  };
}

/* ------------------------------------------------------------------ *
 * Dữ liệu doanh nghiệp (NAP)
 * ------------------------------------------------------------------ */

/** '0913.78.76.47' → '+84913787647' (E.164 cho schema.org/telephone). */
export function toE164(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const plus = s.startsWith('+');
  const digits = s.replace(/[^\d]/g, '');
  if (!digits) return '';
  if (plus) return `+${digits}`;
  if (digits.startsWith('0')) return `+84${digits.slice(1)}`;
  if (digits.startsWith('84')) return `+${digits}`;
  return `+${digits}`;
}

/** Trích link Facebook/TikTok/Zalo từ khối HTML footer (admin toàn quyền sửa). */
function socialLinks(c) {
  const html = [c.footer_social_body, c.footer_contact_body, c.footer_about_body]
    .filter((s) => typeof s === 'string')
    .join(' ');
  const out = [];
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const url = m[1];
    if (!/^https?:\/\//i.test(url)) continue;
    if (!/(facebook|tiktok|zalo|youtube|instagram)\.[a-z]/i.test(url)) continue;
    if (!out.includes(url)) out.push(url);
  }
  return out;
}

/** Địa chỉ → PostalAddress. Chỉ tách `addressRegion` khi chuỗi có 'TP.'/'Tỉnh'. */
function postalAddress(c) {
  const full = String(c.address || '').trim();
  if (!full) return null;
  const region = full.match(/(?:TP\.?|Tỉnh|Thành phố)\s+([^,]+)/i);
  return {
    '@type': 'PostalAddress',
    streetAddress: full,
    ...(region ? { addressRegion: region[1].trim() } : {}),
    addressCountry: 'VN',
  };
}

/** Structured data cho công ty — nhúng ở MỌI trang để Google gắn thực thể. */
export function travelAgencyLd(lang) {
  const c = commonOf(lang);
  const tel = toE164(c.hotline);
  const social = socialLinks(c);
  return {
    '@type': 'TravelAgency',
    '@id': ORG_ID,
    name: c.brand_name || BRAND_FALLBACK,
    alternateName: c.footer_about_title || undefined,
    url: absUrl(homePath(lang)),
    description: c.meta_description || undefined,
    slogan: c.brand_tagline || undefined,
    logo: { '@type': 'ImageObject', url: absUrl('/content/vi/images/logo.png') },
    image: absUrl(DEFAULT_OG_IMAGE),
    telephone: tel || undefined,
    email: c.email || undefined,
    address: postalAddress(c) || undefined,
    areaServed: [{ '@type': 'Country', name: 'Vietnam' }],
    sameAs: social.length ? social : undefined,
    ...(tel || c.email
      ? {
          contactPoint: {
            '@type': 'ContactPoint',
            contactType: 'sales',
            telephone: tel || undefined,
            email: c.email || undefined,
            availableLanguage: LANGS,
          },
        }
      : {}),
  };
}

/** WebSite (2 ngôn ngữ, gắn với thực thể công ty). */
export function websiteLd(lang) {
  const c = commonOf(lang);
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: absUrl(homePath(DEFAULT_LANG)),
    name: c.brand_name || BRAND_FALLBACK,
    alternateName: c.brand_tagline || undefined,
    inLanguage: LANGS,
    publisher: { '@id': ORG_ID },
  };
}

/* ------------------------------------------------------------------ *
 * Tour / tin tức
 * ------------------------------------------------------------------ */

/** Tên file ảnh → URL tuyệt đối (ảnh luôn nằm trong content/vi/images/). */
export function imageUrl(name) {
  const s = String(name || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s) || s.startsWith('/')) return absUrl(s);
  return absUrl(`/content/vi/images/${s}`);
}

/**
 * '2.790.000đ/khách' → '2790000'. Trả '' khi giá là chữ ("Liên hệ") để
 * KHÔNG sinh `offers` sai (schema giá sai bị Google phạt nặng).
 */
export function parsePrice(raw) {
  const m = String(raw || '').match(/\d[\d.,\s]*/);
  if (!m) return '';
  const digits = m[0].replace(/[^\d]/g, '');
  if (!digits) return '';
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? String(n) : '';
}

/** `published_at` ('2025-12-20') → ISO date; '' nếu không hợp lệ. */
function isoDate(raw) {
  const s = String(raw || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (!s) return '';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/** Product + Offer cho trang chi tiết tour (giá lấy đúng chuỗi admin đã nhập). */
export function tourLd(lang, tour) {
  const c = commonOf(lang);
  const url = absUrl(`/${lang}/tours/${tour.slug}/`);
  const image = imageUrl(tour.image);
  const price = parsePrice(tour.price);
  return {
    '@type': 'Product',
    '@id': `${url}#tour`,
    name: tour.name,
    description: tour.desc || undefined,
    url,
    sku: tour.slug,
    category: tour.regionName || undefined,
    brand: { '@type': 'Brand', name: c.brand_name || BRAND_FALLBACK },
    additionalType: 'https://schema.org/TouristTrip',
    ...(image ? { image: [image] } : {}),
    ...(price
      ? {
          offers: {
            '@type': 'Offer',
            url,
            price,
            priceCurrency: 'VND',
            availability: 'https://schema.org/InStock',
            seller: { '@id': ORG_ID },
          },
        }
      : {}),
  };
}

/** NewsArticle cho trang chi tiết tin tức. */
export function newsLd(lang, item) {
  const url = absUrl(`/${lang}/tin-tuc/${item.slug}/`);
  const image = imageUrl(item.image);
  const published = isoDate(item.published_at);
  return {
    '@type': 'NewsArticle',
    '@id': `${url}#article`,
    headline: item.title,
    description: item.summary || undefined,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    articleSection: item.category || undefined,
    inLanguage: lang,
    isAccessibleForFree: true,
    author: { '@id': ORG_ID },
    publisher: { '@id': ORG_ID },
    ...(image ? { image: [image] } : {}),
    ...(published ? { datePublished: published } : {}),
  };
}
