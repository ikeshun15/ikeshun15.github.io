/**
 * サイト全体の設定。名前・リンク・機材はここを編集してください。
 * Site-wide settings. Edit name, links and gear here.
 */

export const site = {
  name: 'Shun15',
  url: 'https://ikeshun15.github.io',
  /** Google Analytics 4 の測定ID（例: "G-XXXXXXXXXX"）。空なら計測タグを出力しない */
  gaMeasurementId: '',
};

export const links = [
  { label: 'X', handle: '@0715milk', href: 'https://x.com/0715milk' },
  { label: 'Instagram', handle: '@shun15a0', href: 'https://www.instagram.com/shun15a0' },
  { label: 'GitHub', handle: 'ikeshun15', href: 'https://github.com/ikeshun15' },
  { label: 'Facebook', handle: 'shunichi.ikezu', href: 'https://www.facebook.com/shunichi.ikezu' },
];

type L10n = { ja: string; en: string };

export interface GearItem {
  category: L10n;
  name: string;
  model?: string;
  /** 楽天アフィリエイトなど広告リンクの場合は sponsored: true */
  href?: string;
  sponsored?: boolean;
}

export const gear: GearItem[] = [
  {
    category: { ja: 'レンズ', en: 'Lens' },
    name: 'Sony FE 50mm F1.8',
    model: 'SEL50F18F',
    href: 'https://hb.afl.rakuten.co.jp/ichiba/3627cbd1.c3acdb20.3627cbd2.0cde1802/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fmapcamera%2F4548736033078%2F&link_type=picttext&ut=eyJwYWdlIjoiaXRlbSIsInR5cGUiOiJwaWN0dGV4dCIsInNpemUiOiIxMjh4MTI4IiwibmFtIjoxLCJuYW1wIjoicmlnaHQiLCJjb20iOjEsImNvbXAiOiJkb3duIiwicHJpY2UiOjEsImJvciI6MSwiY29sIjoxLCJiYnRuIjoxLCJwcm9kIjowLCJhbXAiOmZhbHNlfQ%3D%3D',
    sponsored: true,
  },
  {
    category: { ja: 'レンズ', en: 'Lens' },
    name: 'Tamron 28-200mm F/2.8-5.6 Di III RXD',
    model: 'A071 · Sony E',
    href: 'https://hb.afl.rakuten.co.jp/ichiba/3627caaf.8fdae5ec.3627cab0.ad16990a/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Femedama%2F4960371006703%2F&link_type=picttext&ut=eyJwYWdlIjoiaXRlbSIsInR5cGUiOiJwaWN0dGV4dCIsInNpemUiOiIxMjh4MTI4IiwibmFtIjoxLCJuYW1wIjoicmlnaHQiLCJjb20iOjEsImNvbXAiOiJkb3duIiwicHJpY2UiOjEsImJvciI6MSwiY29sIjoxLCJiYnRuIjoxLCJwcm9kIjowLCJhbXAiOmZhbHNlfQ%3D%3D',
    sponsored: true,
  },
  {
    category: { ja: 'PC', en: 'PC' },
    name: 'GALAKURO GeForce RTX 3060 12GB',
    model: 'GG-RTX3060-E12GB/OC/DF',
    href: 'https://hb.afl.rakuten.co.jp/ichiba/3627ca19.b6eb194e.3627ca1a.862cd768/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fjism%2F4988755057660-44-57761-n%2F&link_type=picttext&ut=eyJwYWdlIjoiaXRlbSIsInR5cGUiOiJwaWN0dGV4dCIsInNpemUiOiIxMjh4MTI4IiwibmFtIjoxLCJuYW1wIjoicmlnaHQiLCJjb20iOjEsImNvbXAiOiJkb3duIiwicHJpY2UiOjEsImJvciI6MSwiY29sIjoxLCJiYnRuIjoxLCJwcm9kIjowLCJhbXAiOmZhbHNlfQ%3D%3D',
    sponsored: true,
  },
];
