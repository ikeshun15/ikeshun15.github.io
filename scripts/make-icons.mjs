/**
 * favicon / apple-touch-icon / OGP 画像を生成する。
 * ロゴ（src/lib/strawberry.js）やドットフォント（src/lib/dotfont.js）を変えたら再実行:
 *   node scripts/make-icons.mjs
 */
import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { strawberryDots } from '../src/lib/strawberry.js';
import { layoutText } from '../src/lib/dotfont.js';

const OUT = new URL('../public/', import.meta.url);
const BERRY = '#e5392b';
const LEAF_LIGHT = '#111111';
const LEAF_DARK = '#ececea';
const BG_LIGHT = '#f3f3f1';
const BG_DARK = '#0b0b0b';

const { cols, rows, dots } = strawberryDots();

function markCircles({ x0 = 0, y0 = 0, unit = 1, leaf = LEAF_LIGHT, leafClass = false } = {}) {
  return dots
    .map((d) => {
      const fill = d.leaf ? (leafClass ? '' : `fill="${leaf}"`) : `fill="${BERRY}"`;
      const cls = d.leaf && leafClass ? 'class="leaf"' : '';
      return `<circle cx="${x0 + (d.x + 0.5) * unit}" cy="${y0 + (d.y + 0.5) * unit}" r="${0.42 * unit}" ${fill} ${cls}/>`;
    })
    .join('');
}

// favicon.svg（ブラウザのダークモードで葉の色を反転）
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 0 ${cols + 2} ${rows}">
<style>.leaf{fill:${LEAF_LIGHT}}@media (prefers-color-scheme:dark){.leaf{fill:${LEAF_DARK}}}</style>
${markCircles({ leafClass: true })}
</svg>`;
await writeFile(new URL('favicon.svg', OUT), faviconSvg);

// favicon.ico（PNG を埋め込んだ ICO）
const iconSvg = (size) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-1 0 ${cols + 2} ${rows}">${markCircles()}</svg>`);
const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map((s) => sharp(iconSvg(s)).resize(s, s).png().toBuffer()));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s, 0);
  e.writeUInt8(s, 1);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngs[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  return e;
});
await writeFile(new URL('favicon.ico', OUT), Buffer.concat([header, ...entries, ...pngs]));

// apple-touch-icon.png
const touchUnit = 120 / rows;
const touchSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180">
<rect width="180" height="180" fill="${BG_LIGHT}"/>
${markCircles({ x0: (180 - cols * touchUnit) / 2, y0: 30, unit: touchUnit })}
</svg>`;
await sharp(Buffer.from(touchSvg)).png().toFile(new URL('apple-touch-icon.png', OUT).pathname);

// og.png（1200×630）: ドットで描いた SHUN15
const W = 1200;
const H = 630;
const text = layoutText(['SHUN15'], 4);
const S = Math.min((W * 0.7) / text.cols, (H * 0.42) / text.rows);
const tx0 = (W - (text.cols - 1) * S) / 2;
const ty0 = (H - (text.rows - 1) * S) / 2;
let og = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${BG_DARK}"/>`;
for (let r = Math.ceil(-ty0 / S); r <= Math.floor((H - ty0) / S); r++) {
  for (let c = Math.ceil(-tx0 / S); c <= Math.floor((W - tx0) / S); c++) {
    const x = tx0 + c * S;
    const y = ty0 + r * S;
    const k = text.cells.get(`${c},${r}`);
    if (k) og += `<circle cx="${x}" cy="${y}" r="${S * 0.38}" fill="${k === 2 ? BERRY : LEAF_DARK}"/>`;
    else og += `<circle cx="${x}" cy="${y}" r="${Math.max(1, S * 0.06)}" fill="${LEAF_DARK}" fill-opacity="0.22"/>`;
  }
}
og += markCircles({ x0: 56, y0: 52, unit: 6, leaf: LEAF_DARK });
og += '</svg>';
await sharp(Buffer.from(og)).png().toFile(new URL('og.png', OUT).pathname);

console.log('✓ icons written to public/');
