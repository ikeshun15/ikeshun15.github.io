/**
 * ビルド後の安全確認：dist/ 内の画像に位置情報（GPS）が残っていないか調べる。
 * 1枚でも見つかったら終了コード 1 でビルドを失敗させ、公開を止める。
 *
 * src/photos/ の写真は Astro が再エンコードするので通常はメタデータが残らない。
 * public/ に直接置いた画像はそのままコピーされるため、ここで検出される。
 */
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import exifr from 'exifr';
import sharp from 'sharp';

const DIST = path.resolve(process.argv[2] ?? 'dist');
const IMAGE_EXT = /\.(jpe?g|png|webp|avif|tiff?|heic|heif)$/i;

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (IMAGE_EXT.test(entry.name)) yield p;
  }
}

async function hasGps(file) {
  const meta = await sharp(file).metadata().catch(() => null);
  if (!meta) return false;

  if (meta.exif) {
    // sharp の exif バッファは "Exif\0\0" + TIFF。TIFF 部分を exifr に渡す
    const tiff = meta.exif.subarray(0, 6).toString('latin1') === 'Exif\0\0' ? meta.exif.subarray(6) : meta.exif;
    const gps = await exifr.parse(tiff, { gps: true, tiff: false, exif: false, ifd1: false }).catch(() => null);
    if (gps && Object.keys(gps).some((k) => k.startsWith('GPS') || k === 'latitude')) return true;
  }
  if (meta.xmp && /GPS(Latitude|Longitude)/i.test(meta.xmp.toString('utf8'))) return true;
  return false;
}

let checked = 0;
const offenders = [];
for await (const file of walk(DIST)) {
  checked++;
  if (await hasGps(file)) offenders.push(path.relative(process.cwd(), file));
}

if (offenders.length) {
  console.error('\n✖ 位置情報（GPS）を含む画像が見つかりました。公開を中止します:');
  for (const f of offenders) console.error(`  - ${f}`);
  console.error('  写真は public/ ではなく src/photos/ に置いてください（自動でメタデータが除去されます）。\n');
  process.exit(1);
}
console.log(`✓ check-exif: ${checked} images, no GPS metadata found.`);
