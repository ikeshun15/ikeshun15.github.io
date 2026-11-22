# ikeshun15.github.io

Shun15 の個人サイト。[Astro](https://astro.build) で作った静的サイトを GitHub Pages に置いています。

- 日本語（`/`）と英語（`/en/`）
- ライト／ダークモード（OS の設定に従い、ヘッダーのボタンで切り替え可能）
- 写真は `src/photos/` に置くだけで一覧に追加される

## 開発

Node.js 22.12 以上と pnpm が必要です。

```sh
pnpm install
pnpm dev       # http://localhost:4321 で確認
pnpm build     # dist/ に出力（位置情報チェック込み）
pnpm preview   # ビルド結果を確認
pnpm check     # 型チェック
```

## 写真を追加する

1. JPEG などを `src/photos/` に入れる（元のサイズのままで OK）
2. 必要なら `src/photos/meta.json` にタイトルなどを書く

```json
{
  "photos": {
    "DSC01234.jpg": {
      "title": { "ja": "夕方の海", "en": "Evening sea" },
      "featured": true,
      "order": 1
    }
  }
}
```

| キー | 意味 |
| --- | --- |
| `title` | タイトル。`"文字列"` でも `{ "ja": …, "en": … }` でも可 |
| `featured` | トップページに載せる（1枚も指定がなければ先頭 8 枚） |
| `order` | 小さいほど先頭。指定がなければ撮影日の新しい順 |
| `hidden` | `true` でサイトに出さない |

- 撮影データ（カメラ・レンズ・F値・シャッター速度・ISO・撮影日）は EXIF から自動で表示します。
- **位置情報（GPS）は公開されません。** 画像は WebP に変換するときにメタデータを落とします。
  ビルドの最後に `scripts/check-exif.mjs` が出力画像を検査し、GPS が残っていたらビルドを失敗させます。
- 写真を `public/` に置くと変換されずにそのまま公開されます。写真は必ず `src/photos/` に置いてください。
- `sample-*.jpg` は仮の画像です。差し替えるときは削除し、`meta.json` の該当行も消してください。

## 文言・リンク・機材を変える

| 内容 | ファイル |
| --- | --- |
| 自己紹介の一言、ボタンなどの文言（日英） | `src/i18n/ui.ts` |
| SNS リンク、機材リスト、GA4 の測定 ID | `src/data/site.ts` |
| 色・余白・フォント | `src/styles/global.css` の先頭 |
| トップのドット文字・アニメーション | `src/lib/dotmatrix.ts`、`src/lib/dotfont.js` |
| イチゴのロゴ | `src/lib/strawberry.js`（変更後は `pnpm icons` で favicon と OGP 画像を再生成） |

## デプロイ

`master` に push すると GitHub Actions（`.github/workflows/deploy.yml`）がビルドして公開します。

初回だけ、GitHub のリポジトリ設定で **Settings → Pages → Build and deployment → Source** を
**GitHub Actions** に切り替えてください（ブランチからの公開のままだと、ビルド前のソースが公開されてしまいます）。

## 旧サイトからの引き継ぎ

- `/favorite_list.html` → `/gear/` へリダイレクト
- `/game_page.html` と `/game/` はそのまま残しています
