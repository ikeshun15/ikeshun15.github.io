export const locales = ['ja', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'ja';

export const ui = {
  ja: {
    'meta.description': 'Shun15 の個人サイト。エンジニア。写真を撮っています。',
    'nav.label': 'メインナビゲーション',
    'menu.open': 'メニューを開く',
    'menu.close': 'メニューを閉じる',
    'menu.label': 'メニュー',
    'lang.label': 'English',
    'skip': '本文へスキップ',
    'theme.toggle': '昼と夜を切り替え',
    'view.label': '表示の切り替え',
    'view.strip': '横に並べて見る',
    'view.grid': '一覧で見る',
    'strip.label': '写真',
    'links.label': 'SNS',
    'photos.title': '写真',
    'photos.empty': 'まだ写真がありません。',
    'photo.prev': '前の写真',
    'photo.next': '次の写真',
    'photo.close': '閉じる',
    'photo.untitled': '無題',
    'gear.disclosure': '※ このページには広告（楽天アフィリエイトリンク）が含まれます。',
    'footer.top': 'ページの先頭へ',
    'notfound.title': 'ページが見つかりません',
  },
  en: {
    'meta.description': 'Personal website of Shun15 — engineer and photographer.',
    'nav.label': 'Main navigation',
    'menu.open': 'Open menu',
    'menu.close': 'Close menu',
    'menu.label': 'Menu',
    'lang.label': '日本語',
    'skip': 'Skip to content',
    'theme.toggle': 'Switch between day and night',
    'view.label': 'View',
    'view.strip': 'View as a row',
    'view.grid': 'View as a grid',
    'strip.label': 'Photos',
    'links.label': 'Social',
    'photos.title': 'Photos',
    'photos.empty': 'No photos yet.',
    'photo.prev': 'Previous photo',
    'photo.next': 'Next photo',
    'photo.close': 'Close',
    'photo.untitled': 'Untitled',
    'gear.disclosure': 'This page contains affiliate links (Rakuten).',
    'footer.top': 'Back to top',
    'notfound.title': 'Page not found',
  },
} as const;

export type UIKey = keyof (typeof ui)['ja'];

export function useTranslations(lang: Locale) {
  return (key: UIKey): string => ui[lang][key];
}

/** 言語ごとのパスを返す。ja はルート、en は /en 配下 */
export function localePath(lang: Locale, path = '/') {
  const p = path.startsWith('/') ? path : `/${path}`;
  if (lang === defaultLocale) return p;
  return p === '/' ? `/${lang}/` : `/${lang}${p}`;
}

/** getStaticPaths 用: [...locale] の params */
export const localeStaticPaths = () => [
  { params: { locale: undefined }, props: { lang: 'ja' as Locale } },
  { params: { locale: 'en' }, props: { lang: 'en' as Locale } },
];

export function otherLocale(lang: Locale): Locale {
  return lang === 'ja' ? 'en' : 'ja';
}

/** 文ごとに分ける（「。」「.」の後ろで区切る） */
export function splitSentences(text: string) {
  return text.split(/(?<=[。.!?])\s*/).filter(Boolean);
}
