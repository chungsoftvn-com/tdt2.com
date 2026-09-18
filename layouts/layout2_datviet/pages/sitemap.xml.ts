// /sitemap.xml — sinh lúc build từ chính dữ liệu content/.
//
// Vì sao tự viết thay vì dùng @astrojs/sitemap: site build hoàn toàn tĩnh và mọi
// trang đều đã có trong content/ (PAGE_SLUGS + tours + khu vực + news + testimonials).
// Tự sinh giúp kiểm soát tuyệt đối việc LOẠI trừ:
//   /admin/**, /vi/home/generated/, '/' (bản trùng của '/vi/'),
//   các BẢN SAO CẤP GỐC ('/tim-tour/', '/tours/<slug>/' — canonical trỏ về '/vi/…')
//   và các URL CŨ ('/vi/tour/<slug>/' — canonical trỏ về '/vi/tours/<slug>/').
// Đưa URL không phải canonical vào sitemap là tự mâu thuẫn với chính canonical
// (Google báo "Duplicate, Google chose different canonical").
//
// Không phát <lastmod>: CI checkout ghi mọi file cùng một mtime nên lastmod sẽ
// SAI (Google bỏ qua hoặc giảm tin cậy nếu lastmod không chính xác).
import type { APIRoute } from 'astro';
import {
  LANGS,
  PAGE_SLUGS,
  ROOT_PAGE_EQUIV,
  getNews,
  getTestimonials,
  getTourRegions,
  getTours,
} from '@/lib/content.js';
import { DEFAULT_LANG, absUrl, altPath, alternates, viOnlyRootSlug } from '@/lib/seo.js';

export const prerender = true;

/**
 * Có đưa BẢN SAO CẤP GỐC ('/tim-tour/', '/tours/<slug>/', '/tours/khu-vuc/<region>/')
 * vào sitemap không?
 *
 * Mặc định KHÔNG: canonical của chúng đã trỏ về '/vi/…' nên liệt kê chúng là mâu
 * thuẫn với canonical. Đổi thành `true` nếu muốn Google ưu tiên crawl bản không
 * tiền tố ngôn ngữ.
 */
const INCLUDE_ROOT_MIRRORS = false;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Tất cả path công khai được index, cho cả 2 ngôn ngữ.
 *
 * Slug lấy từ bản 'vi' cho CẢ 2 ngôn ngữ — y hệt `getStaticPaths()` trong
 * `src/pages/[lang]/tours/[slug].astro`, `[lang]/tours/khu-vuc/[region].astro`,
 * `[lang]/tin-tuc/[slug].astro`, `[lang]/y-kien-khach-hang/[slug].astro`
 * (slug độc lập ngôn ngữ).
 *
 * Bắt buộc phải khớp router: nếu lấy slug theo từng ngôn ngữ, một bài chỉ có
 * ở bản EN (vd testimonials khi content/vi rỗng) sẽ vào sitemap dù KHÔNG có
 * trang nào được build → Google nhận 404 từ sitemap.
 */
function collectPaths() {
  const paths = new Set();
  const tourSlugs = getTours('vi').map((t: { slug: string }) => t.slug);
  const regionSlugs = getTourRegions().map((r) => r.slug);
  const newsSlugs = getNews('vi').map((n: { slug: string }) => n.slug);
  const testimonialSlugs = getTestimonials('vi').map((x: { slug: string }) => x.slug);

  for (const lang of LANGS) {
    paths.add(`/${lang}/`);
    for (const page of PAGE_SLUGS) paths.add(`/${lang}/${page}/`);
    paths.add(`/${lang}/tin-tuc/`);
    for (const slug of tourSlugs) paths.add(`/${lang}/tours/${slug}/`);
    for (const slug of regionSlugs) paths.add(`/${lang}/tours/khu-vuc/${slug}/`);
    for (const slug of newsSlugs) paths.add(`/${lang}/tin-tuc/${slug}/`);
    for (const slug of testimonialSlugs) paths.add(`/${lang}/y-kien-khach-hang/${slug}/`);
  }

  // Trang VI cấp gốc viết riêng ('/<slug>/'): canonical là chính nó → CÓ trong sitemap.
  for (const slug of Object.keys(ROOT_PAGE_EQUIV)) paths.add(`/${slug}/`);

  if (INCLUDE_ROOT_MIRRORS) {
    // Bản sao cấp gốc của mọi trang VI: '/<path>/' = '/vi/<path>/'.
    paths.add('/');
    for (const p of [...paths]) {
      if (p.startsWith('/vi/')) paths.add(p.slice(3));
    }
  }

  return [...paths].sort();
}

export const GET: APIRoute = () => {
  const urls = collectPaths().map((path) => {
    const lines = [`    <loc>${escapeXml(absUrl(path))}</loc>`];
    // Chỉ phát alternate cho bản ngôn ngữ THỰC SỰ tồn tại: trang VI-only ở cấp gốc
    // không có '/en/<slug>/' → phát vào sẽ khiến Google nhận 404 từ sitemap.
    for (const a of alternates(path)) {
      lines.push(
        `    <xhtml:link rel="alternate" hreflang="${a.lang}" href="${escapeXml(a.href)}"/>`,
      );
    }
    const xDefault = viOnlyRootSlug(path) ? path : altPath(path, DEFAULT_LANG);
    lines.push(
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(absUrl(xDefault))}"/>`,
    );
    return ['  <url>', ...lines, '  </url>'].join('\n');
  });

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">`,
    ...urls,
    '</urlset>',
    '',
  ].join('\n');

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
