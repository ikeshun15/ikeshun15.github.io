/**
 * 写真の読み込み。
 * src/photos/ に画像を置くと自動で一覧に追加される。
 * タイトルや並び順は src/photos/meta.json で上書きできる（任意）。
 *
 * EXIF は撮影データ（カメラ・レンズ・F値など）の表示にだけ使い、
 * 位置情報（GPS）は読み込まない。出力画像は sharp で再エンコードされ、メタデータは残らない。
 */
import type { ImageMetadata } from 'astro';
import path from 'node:path';
import exifr from 'exifr';
import sharp from 'sharp';
import type { Locale } from '../i18n/ui';

type Title = { ja?: string; en?: string };

interface MetaEntry {
  title?: Title | string;
  /** トップページに載せる */
  featured?: boolean;
  /** 小さいほど先頭。未指定は撮影日の新しい順 */
  order?: number;
  /** true でサイトに出さない */
  hidden?: boolean;
}

interface MetaFile {
  photos?: Record<string, MetaEntry>;
}

export interface Exif {
  camera?: string;
  lens?: string;
  focal?: string;
  aperture?: string;
  shutter?: string;
  iso?: string;
}

export interface Photo {
  slug: string;
  file: string;
  image: ImageMetadata;
  /** 縦横比 (width / height)。EXIF の回転を考慮済み */
  ar: number;
  title: Title;
  /** "2024.08.03" 形式。不明なら null */
  date: string | null;
  sortKey: string;
  exif: Exif;
  /** 読み込み前に敷く平均色 */
  color: string;
  featured: boolean;
  order?: number;
}

const imageModules = import.meta.glob<{ default: ImageMetadata }>(
  '/src/photos/*.{jpg,jpeg,JPG,JPEG,png,PNG,webp,WEBP,avif,AVIF,tif,tiff,TIF,TIFF}',
  { eager: true },
);

const metaModules = import.meta.glob<{ default: MetaFile }>('/src/photos/meta.json', {
  eager: true,
});

const meta: Record<string, MetaEntry> = Object.values(metaModules)[0]?.default?.photos ?? {};

const EXIF_TAGS = [
  'Make',
  'Model',
  'LensModel',
  'FocalLength',
  'FNumber',
  'ExposureTime',
  'ISO',
  'DateTimeOriginal',
  'CreateDate',
];

function toSlug(file: string) {
  return (
    path
      .parse(file)
      .name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'photo'
  );
}

const trimNum = (n: number, digits = 1) => String(Number(n.toFixed(digits)));

function formatExif(raw: Record<string, unknown> | undefined): Exif {
  if (!raw) return {};
  const exif: Exif = {};
  const make = typeof raw.Make === 'string' ? raw.Make.trim() : '';
  const model = typeof raw.Model === 'string' ? raw.Model.trim() : '';
  if (model) {
    exif.camera = model.toLowerCase().startsWith(make.toLowerCase().split(' ')[0])
      ? model
      : `${make} ${model}`.trim();
  }
  if (typeof raw.LensModel === 'string' && raw.LensModel.trim()) exif.lens = raw.LensModel.trim();
  if (typeof raw.FocalLength === 'number') exif.focal = `${Math.round(raw.FocalLength)}mm`;
  if (typeof raw.FNumber === 'number') exif.aperture = `f/${trimNum(raw.FNumber)}`;
  if (typeof raw.ExposureTime === 'number' && raw.ExposureTime > 0) {
    const t = raw.ExposureTime;
    exif.shutter = t >= 0.3 ? `${trimNum(t)}s` : `1/${Math.round(1 / t)}s`;
  }
  if (typeof raw.ISO === 'number') exif.iso = `ISO ${raw.ISO}`;
  return exif;
}

/** "2024:08:03 19:30:00" → ["2024.08.03", "2024-08-03T19:30:00"] */
function parseExifDate(v: unknown): [string, string] | null {
  if (typeof v !== 'string') return null;
  const m = v.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return [`${y}.${mo}.${d}`, `${y}-${mo}-${d}T${h}:${mi}:${s}`];
}

async function averageColor(file: string) {
  try {
    const { data } = await sharp(file)
      .rotate()
      .resize(1, 1, { fit: 'cover' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return `rgb(${data[0]} ${data[1]} ${data[2]})`;
  } catch {
    return 'var(--surface)';
  }
}

async function loadPhoto(key: string, image: ImageMetadata): Promise<Photo | null> {
  const file = path.basename(key);
  const entry = meta[file] ?? {};
  if (entry.hidden) return null;

  const abs = path.join(process.cwd(), key);
  const [raw, info, color] = await Promise.all([
    exifr
      .parse(abs, { pick: EXIF_TAGS, gps: false, reviveValues: false })
      .catch(() => undefined) as Promise<Record<string, unknown> | undefined>,
    sharp(abs).metadata(),
    averageColor(abs),
  ]);

  const rotated = (info.orientation ?? 1) >= 5;
  const w = (rotated ? info.height : info.width) ?? image.width;
  const h = (rotated ? info.width : info.height) ?? image.height;
  const date = parseExifDate(raw?.DateTimeOriginal ?? raw?.CreateDate);
  const title: Title =
    typeof entry.title === 'string' ? { ja: entry.title, en: entry.title } : (entry.title ?? {});

  return {
    slug: toSlug(file),
    file,
    image,
    ar: w / h,
    title,
    date: date?.[0] ?? null,
    sortKey: date?.[1] ?? '',
    exif: formatExif(raw),
    color,
    featured: !!entry.featured,
    order: entry.order,
  };
}

let cache: Promise<Photo[]> | undefined;

/** 全写真（並び順適用済み） */
export function getPhotos(): Promise<Photo[]> {
  cache ??= (async () => {
    const loaded = await Promise.all(
      Object.entries(imageModules).map(([key, mod]) => loadPhoto(key, mod.default)),
    );
    const photos = loaded.filter((p): p is Photo => p !== null);

    photos.sort((a, b) => {
      const ao = a.order ?? Infinity;
      const bo = b.order ?? Infinity;
      if (ao !== bo) return ao - bo;
      if (a.sortKey !== b.sortKey) return a.sortKey < b.sortKey ? 1 : -1;
      return a.file.localeCompare(b.file);
    });

    // slug の重複を解消
    const seen = new Map<string, number>();
    for (const p of photos) {
      const n = seen.get(p.slug) ?? 0;
      seen.set(p.slug, n + 1);
      if (n > 0) p.slug = `${p.slug}-${n + 1}`;
    }
    return photos;
  })();
  return cache;
}

/** トップページ用。featured 指定がなければ先頭から */
export async function getFeaturedPhotos(limit = 8) {
  const photos = await getPhotos();
  const featured = photos.filter((p) => p.featured);
  return (featured.length ? featured : photos).slice(0, limit);
}

export function photoTitle(p: Photo, lang: Locale) {
  return p.title[lang] ?? p.title.ja ?? p.title.en ?? '';
}

/** "50mm  f/1.8  1/250s  ISO 100" のような一行表記 */
export function exifLine(e: Exif) {
  return [e.focal, e.aperture, e.shutter, e.iso].filter(Boolean).join('  ');
}
