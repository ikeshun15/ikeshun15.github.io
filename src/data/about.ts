/**
 * プロフィール（About）の中身。日英それぞれ自由に書き換えてください。
 * 大きく表示される一言は src/i18n/ui.ts の 'intro' にあります。
 */

type L10n = { ja: string; en: string };

export interface HistoryItem {
  /** 期間（例: "2022.04 — " / "2018.04 — 2022.03"） */
  period: string;
  /** 所属・できごと */
  title: L10n;
  /** ひとこと（役割・専攻など） */
  note?: L10n;
  /** 小さなタグ */
  tags?: string[];
}

export const about: {
  /** 本文（段落ごと） */
  body: { ja: string[]; en: string[] };
  /** 小さな表。href があればリンクになる（サイト内のパスは言語に合わせて自動で振り分け） */
  facts: { label: L10n; value: L10n; href?: string }[];
  /** あゆみ。新しい順に並べる */
  history: HistoryItem[];
} = {
  body: {
    ja: ['Shun15 です。エンジニアとして働きながら、写真を撮っています。', 'このサイトには、撮りためた写真と、使っている道具を置いています。'],
    en: ["I'm Shun15, an engineer who takes photographs.", 'This site collects the frames I have taken and the things I use.'],
  },
  facts: [
    { label: { ja: '仕事', en: 'Work' }, value: { ja: 'エンジニア', en: 'Engineer' } },
    { label: { ja: '好きなこと', en: 'Into' }, value: { ja: '写真', en: 'Photography' } },
    // 例: { label: { ja: '拠点', en: 'Based in' }, value: { ja: '東京', en: 'Tokyo' } },
  ],
  history: [
    {
      period: '2026.11 —',
      title: { ja: 'このサイトをリニューアル', en: 'Rebuilt this site' },
      note: { ja: '写真を主役に、ゼロから作り直し', en: 'From scratch, with photographs at the center' },
      tags: ['Astro', 'WebGL', 'Photography'],
    },
    {
      period: '2019.03',
      title: { ja: '個人サイトを公開', en: 'Launched this site' },
      note: { ja: 'GitHub Pages で最初のページを公開', en: 'First page on GitHub Pages' },
      tags: ['HTML', 'GitHub Pages'],
    },
    // 経歴はここに追加（新しい順）。例:
    // {
    //   period: '2022.04 —',
    //   title: { ja: '〇〇株式会社', en: '〇〇 Inc.' },
    //   note: { ja: 'ソフトウェアエンジニア', en: 'Software Engineer' },
    //   tags: ['Python', '画像処理'],
    // },
  ],
};
