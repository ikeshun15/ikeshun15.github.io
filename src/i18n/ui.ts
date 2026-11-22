export const locales = ['ja', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'ja';

export const ui = {
  ja: {
    'meta.description': 'Shun15 の個人サイト。エンジニア。写真を撮っています。',
    'hero.role': 'エンジニア。',
    'hero.lead': '光を一枚ずつ、集めています。',
    'hero.scroll': 'Scroll',
    'nav.label': 'メインナビゲーション',
    'nav.photos': '写真',
    'nav.gear': '機材',
    'lang.label': 'English',
    'theme.toggle': 'ライト／ダークを切り替え',
    'skip': '本文へスキップ',
    'section.photos': '写真',
    'section.links': 'リンク',
    'photos.title': '写真',
    'photos.all': 'すべての写真',
    'photos.count': '{n} 枚',
    'photos.empty': 'まだ写真がありません。',
    'photo.prev': '前の写真',
    'photo.next': '次の写真',
    'photo.close': '一覧へ戻る',
    'photo.untitled': '無題',
    'gear.title': '機材',
    'gear.lead': '使っている道具と、最近気になっているもの。',
    'gear.disclosure': '※ このページには広告（楽天アフィリエイトリンク）が含まれます。',
    'footer.top': 'ページの先頭へ',
    'notfound.title': 'ページが見つかりません',
  },
  en: {
    'meta.description': 'Personal website of Shun15 — engineer and photographer.',
    'hero.role': 'Engineer.',
    'hero.lead': 'Collecting light, one frame at a time.',
    'hero.scroll': 'Scroll',
    'nav.label': 'Main navigation',
    'nav.photos': 'Photos',
    'nav.gear': 'Gear',
    'lang.label': '日本語',
    'theme.toggle': 'Toggle light / dark theme',
    'skip': 'Skip to content',
    'section.photos': 'Photos',
    'section.links': 'Elsewhere',
    'photos.title': 'Photos',
    'photos.all': 'All photos',
    'photos.count': '{n} frames',
    'photos.empty': 'No photos yet.',
    'photo.prev': 'Previous photo',
    'photo.next': 'Next photo',
    'photo.close': 'Back to photos',
    'photo.untitled': 'Untitled',
    'gear.title': 'Gear',
    'gear.lead': 'Things I use, and things on my radar.',
    'gear.disclosure': 'This page contains affiliate links (Rakuten).',
    'footer.top': 'Back to top',
    'notfound.title': 'Page not found',
  },
} as const;

export type UIKey = keyof (typeof ui)['ja'];

export function useTranslations(lang: Locale) {
  return (key: UIKey, vars: Record<string, string | number> = {}) =>
    (ui[lang][key] as string).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
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
