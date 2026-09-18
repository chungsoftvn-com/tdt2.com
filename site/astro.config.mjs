import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

import cloudflare from "@astrojs/cloudflare";

// Astro writes the site into `.astro-dist/`.
// GitHub Pages CI (../.github/workflows/build.yml) uploads `.astro-dist`
// sau khi copy `../content` + `../layouts` vào output.
export default defineConfig({
  site: 'https://tdt2.com',
  outDir: './.astro-dist',

  // Mọi URL công khai đều kết thúc bằng '/'. Cùng với build.format='directory'
  // điều này loại bỏ các redirect 301 khi click link nội bộ
  // (vd '/vi/tours' -> '/vi/tours/') và giữ canonical khớp với URL thật.
  trailingSlash: 'always',

  build: {
    format: 'directory',
  },

  vite: {
    plugins: [tailwindcss()],
  },

  adapter: cloudflare()
});