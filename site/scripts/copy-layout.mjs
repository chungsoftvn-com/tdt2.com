import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(ROOT, '..');

export function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

export function cp(src, dst) {
  fs.cpSync(src, dst, { recursive: true, force: true });
}

/** Layout mặc định khi `content/site.json` chưa có (hoặc không đọc được). */
export const DEFAULT_THEME = 'layout2_datviet';

/**
 * Theme đang bật = `theme` trong `content/site.json` (do admin đặt ở /admin).
 * File này nằm trong content/ nên worker ghi được, và CI đọc lại khi build.
 */
export function resolveTheme() {
  const cfgPath = path.join(REPO_ROOT, 'content', 'site.json');
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const theme = typeof cfg?.theme === 'string' ? cfg.theme.trim() : '';
    if (theme) return theme;
  } catch {
    // Chưa có file / JSON lỗi -> dùng mặc định.
  }
  return DEFAULT_THEME;
}

/**
 * Copy the active layout's `pages/` and `components/` into Astro's `src/`.
 *
 * `layouts/<name>/pages/*`      -> `src/pages/*`
 * `layouts/<name>/components/*` -> `src/components/*`
 *
 * Because only one layout is active per build, clearing both folders first
 * guarantees the output never mixes templates from different layouts.
 */
export function copyLayout(layout) {
  const layoutDir = path.join(REPO_ROOT, 'layouts', layout);
  if (!fs.existsSync(layoutDir)) {
    throw new Error(
      `[layout] Layout not found: "${layout}" (expected at ${layoutDir})`,
    );
  }

  const dstPages = path.join(ROOT, 'src', 'pages');
  const dstComponents = path.join(ROOT, 'src', 'components');

  rmrf(dstPages);
  rmrf(dstComponents);
  fs.mkdirSync(dstPages, { recursive: true });
  fs.mkdirSync(dstComponents, { recursive: true });

  const srcPages = path.join(layoutDir, 'pages');
  const srcComponents = path.join(layoutDir, 'components');

  if (fs.existsSync(srcPages)) cp(srcPages, dstPages);
  if (fs.existsSync(srcComponents)) cp(srcComponents, dstComponents);

  // CSS riêng của theme (palette/font/class) -> src/styles/.
  // Dọn theme.css cũ trước để không sót CSS của theme vừa đổi.
  const dstStyles = path.join(ROOT, 'src', 'styles');
  fs.mkdirSync(dstStyles, { recursive: true });
  const staleThemeCss = path.join(dstStyles, 'theme.css');
  if (fs.existsSync(staleThemeCss)) rmrf(staleThemeCss);
  const srcStyles = path.join(layoutDir, 'styles');
  if (fs.existsSync(srcStyles)) cp(srcStyles, dstStyles);

  console.log(`[layout] active layout: ${layout}`);
  console.log(`[layout] pages copied:      ${path.relative(ROOT, dstPages)}`);
  console.log(`[layout] components copied: ${path.relative(ROOT, dstComponents)}`);
  console.log(`[layout] styles copied:     ${path.relative(ROOT, path.join(ROOT, 'src', 'styles'))}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const layout = process.argv[2] ?? resolveTheme();
  copyLayout(layout);
}
