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
  /** 写真の説明（画像の代替テキストと、写真ページを共有したときの説明文に使う） */
  description?: Title | string;
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
  description: Title;
  /** "2024.08.03" 形式。不明なら null */
  date: string | null;
  /** "2024-08-03T19:30:00" 形式（撮影地のローカル時刻）。不明なら空文字 */
  sortKey: string;
  exif: Exif;
  /** 読み込み前に敷く平均色 */
  color: string;
  /** 写真の中の鮮やかな色（ホバーや読み込み中のドットに使う）。色の少ない写真は null */
  accent: string | null;
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

/**
 * 写真の中から「その写真らしい鮮やかな色」を 1 つ選ぶ。
 * 縮小した画素の中で、彩度が高く明るすぎず暗すぎない色を選び、
 * 昼・夜どちらの背景でも見えるよう明るさをそろえる。
 */
async function accentColor(file: string) {
  try {
    const { data } = await sharp(file).rotate().resize(24, 24, { fit: 'cover' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let best: [number, number, number] | null = null;
    let bestScore = 0;
    for (let i = 0; i < data.length; i += 3) {
      const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      const score = s * (1 - Math.abs(l - 0.55) * 1.6);
      if (score > bestScore) {
        bestScore = score;
        best = [h, s, l];
      }
    }
    if (!best || best[1] < 0.18) return null;
    return `hsl(${Math.round(best[0])} ${Math.round(Math.min(0.85, best[1] * 1.15) * 100)}% 56%)`;
  } catch {
    return null;
  }
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s, l];
}

async function loadPhoto(key: string, image: ImageMetadata): Promise<Photo | null> {
  const file = path.basename(key);
  const entry = meta[file] ?? {};
  if (entry.hidden) return null;

  const abs = path.join(process.cwd(), key);
  const [raw, info, color, accent] = await Promise.all([
    exifr
      .parse(abs, { pick: EXIF_TAGS, gps: false, reviveValues: false })
      .catch(() => undefined) as Promise<Record<string, unknown> | undefined>,
    sharp(abs).metadata(),
    averageColor(abs),
    accentColor(abs),
  ]);

  const rotated = (info.orientation ?? 1) >= 5;
  const w = (rotated ? info.height : info.width) ?? image.width;
  const h = (rotated ? info.width : info.height) ?? image.height;
  const date = parseExifDate(raw?.DateTimeOriginal ?? raw?.CreateDate);
  const l10n = (v?: Title | string): Title => (typeof v === 'string' ? { ja: v, en: v } : (v ?? {}));
  const title = l10n(entry.title);
  const description = l10n(entry.description);

  return {
    slug: toSlug(file),
    file,
    image,
    ar: w / h,
    title,
    description,
    date: date?.[0] ?? null,
    sortKey: date?.[1] ?? '',
    exif: formatExif(raw),
    color,
    accent,
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

/** 写真の説明。なければタイトル（画像の代替テキストに使う） */
export function photoDescription(p: Photo, lang: Locale) {
  return p.description[lang] ?? p.description.ja ?? p.description.en ?? photoTitle(p, lang);
}

/** "Sony α7 · 50mm · f/1.8 · 1/250s · ISO 100" のような一行表記 */
export function exifLine(e: Exif) {
  return [e.camera, e.lens, e.focal, e.aperture, e.shutter, e.iso].filter(Boolean).join(' · ');
}

/** サイト全体で使う写真の色のパレット（トップに載せる写真を優先、最大 8 色） */
export async function getPalette() {
  const featured = await getFeaturedPhotos(24);
  const all = await getPhotos();
  const colors = [...featured, ...all].map((p) => p.accent).filter((c): c is string => !!c);
  const unique = [...new Set(colors)].slice(0, 8);
  return unique.length ? unique : ['hsl(5 76% 53%)'];
}

/** 写真を縦横に区切り（およそ target 個）、区画ごとの色を返す。u, v は区画の中心（0〜1）。ドットの色選びに使う */
async function getMosaic(photo: Photo, target: number) {
  const cols = Math.max(2, Math.round(Math.sqrt(target * photo.ar)));
  const rows = Math.max(2, Math.round(target / cols));
  const abs = path.join(process.cwd(), 'src/photos', photo.file);
  const { data } = await sharp(abs)
    .rotate()
    .resize(cols, rows, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const cells: { u: number; v: number; color: string }[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 3;
      cells.push({ u: (x + 0.5) / cols, v: (y + 0.5) / rows, color: `rgb(${data[i]} ${data[i + 1]} ${data[i + 2]})` });
    }
  }
  return { slug: photo.slug, ar: photo.ar, cols, rows, cells };
}

let dotColors: Promise<string> | null = null;

/**
 * ドット（読み込み中の粒・プロフィールの背景）の色。登録してあるすべての写真から選ぶ。
 * 写真ごとに、鮮やかな色から少し落ち着いた色までを同じ数ずつとり、写真ごとに順番に並べる
 * （前から何色とっても、すべての写真の色が混ざるように）。"rrggbb" をつなげた文字列で返す。
 */
export function getDotColors(count = 160) {
  dotColors ??= (async () => {
    const photos = await getPhotos();
    if (!photos.length) return '';
    const per = Math.ceil(count / photos.length);
    const lists = await Promise.all(
      photos.map(async (p) => {
        const { cells } = await getMosaic(p, 160);
        const ranked = cells
          .map((c) => (c.color.match(/\d+/g) ?? ['136', '136', '136']).slice(0, 3).map(Number))
          .map((c) => ({ c, chroma: Math.max(...c) - Math.min(...c) }))
          .sort((a, b) => b.chroma - a.chroma);
        // 鮮やかな方から 6 割の中で、等間隔に選ぶ（同じ色ばかりにならないように）
        const pool = ranked.slice(0, Math.max(per, Math.ceil(ranked.length * 0.6)));
        return Array.from({ length: per }, (_, i) => pool[Math.floor((i * pool.length) / per)].c);
      }),
    );
    const out: string[] = [];
    for (let i = 0; i < per; i++) {
      for (const list of lists) out.push(list[i].map((n) => n.toString(16).padStart(2, '0')).join(''));
    }
    return out.slice(0, count).join('');
  })();
  return dotColors;
}
