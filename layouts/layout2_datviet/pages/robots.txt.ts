// /robots.txt — sinh lúc build (Astro static endpoint) nên luôn khớp nội dung thật.
//
// Lưu ý: KHÔNG chặn /content/** vì ảnh nội dung nằm ở đó
// (/content/vi/images/*) và cần được crawl để lên Google Images.
import type { APIRoute } from 'astro';
import { SITE_URL } from '@/lib/seo.js';

export const prerender = true;

export const GET: APIRoute = () => {
  const body = [
    '# robots.txt — tdt2.com',
    '',
    'User-agent: *',
    'Allow: /',
    '',
    '# Khu vực quản trị — không bao giờ cho search engine index',
    'Disallow: /admin',
    '',
    '# Mã nguồn layout (không phải nội dung công khai)',
    'Disallow: /layouts/',
    '',
    '# Trang công cụ nội bộ của admin (nút "Đồng bộ lại nội dung")',
    'Disallow: /*__sync=1',
    'Disallow: /vi/home/generated/',
    'Disallow: /en/home/generated/',
    '',
    '# /content/** được crawl bình thường (ảnh tour, tin tức)',
    '',
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
