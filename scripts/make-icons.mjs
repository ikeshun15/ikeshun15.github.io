/**
 * favicon / apple-touch-icon / OGP 画像を生成する。
 *   node scripts/make-icons.mjs [OGP に使う写真のパス]
 * ロゴ（src/lib/strawberry.js）やドットフォント（src/lib/dotfont.js）を変えたら再実行:
 *   node scripts/make-icons.mjs
 */
import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { strawberryDots } from '../src/lib/strawberry.js';

const OUT = new URL('../public/', import.meta.url);
const BERRY = '#e5392b';
const LEAF_LIGHT = '#111111';
const LEAF_DARK = '#ececea';
const BG_LIGHT = '#f3f3f1';

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

// og.png（1200×630）: 写真が粒子から現れる途中のような点描。左ほど粒がまばらになる
// 元にする写真は引数で指定（既定: src/photos/fireworks.jpg）
const W = 1200;
const H = 630;
const source = new URL(`../${process.argv[2] ?? 'src/photos/fireworks.jpg'}`, import.meta.url);
const ogCols = 150;
const ogRows = Math.round((ogCols * H) / W);
const S = W / ogCols;
let og = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${BG_LIGHT}"/>`;
try {
  const { data } = await sharp(source.pathname).rotate().resize(ogCols, ogRows, { fit: 'cover' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let seed = 15;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  for (let y = 0; y < ogRows; y++) {
    for (let x = 0; x < ogCols; x++) {
      const u = x / (ogCols - 1);
      const f = Math.min(1, Math.max(0, (u - 0.18) / 0.42));
      if (rnd() > f * f * 0.9 + 0.1 * f) continue;
      const i = (y * ogCols + x) * 3;
      const jitter = (1 - f) * S * 1.6;
      const cx = (x + 0.5) * S + (rnd() - 0.5) * jitter;
      const cy = (y + 0.5) * S + (rnd() - 0.5) * jitter;
      og += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(S * 0.46 * (0.45 + 0.55 * f)).toFixed(2)}" fill="rgb(${data[i]},${data[i + 1]},${data[i + 2]})"/>`;
    }
  }
} catch {
  console.warn(`! ${source.pathname} を読めなかったため、写真なしの OGP 画像を作ります`);
}
og += markCircles({ x0: 72, y0: H - 72 - rows * 7, unit: 7 });
og += '</svg>';
await sharp(Buffer.from(og)).png().toFile(new URL('og.png', OUT).pathname);

console.log('✓ icons written to public/');
