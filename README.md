# ikeshun15.github.io

Shun15 の個人サイト。[Astro](https://astro.build) で作った静的サイトを GitHub Pages に置いています。

- 日本語（`/`）と英語（`/en/`）
- 昼／夜（ライト／ダーク）。OS の設定に従い、ヘッダー左のアイコンで切り替え可能
- 写真は `src/photos/` に置くだけで並ぶ。表示は写真の右上のアイコンで切り替え
  - 横並び（`/`）：縦スクロールで横に流れる
  - 一覧（`/photos/`）：切り抜かずに行ごとに並べる
- どちらの表示も「写真 → プロフィール」の 1 ページ。右上の三本線のメニュー（全画面）から Photos / About / History / Gear の各セクションへ移動する。
  プロフィールは「About（ひとこと・重なった写真と自己紹介）→ History（経歴）→ Gear（道具）」。
  どのセクションも見出しの上に小さな手描きの線画（カメラ・旗へ続く道・レンズ）がある。並びや中身は `src/content/` で変えられる
- 写真の下へスクロールすると、写真がドットに化けて散らばり、プロフィールの背景になる（WebGL）。
  ドットは「50 mm F1.8 を開放、45 cm にピントを合わせて撮ったイルミネーションのボケ」として、
  薄肉レンズの錯乱円の式 c = f² / (N (s_f − f)) · |s − s_f| / s で大きさを計算している
  （明るさは 1/c²、収差のにじみ、口径食、球面収差、視差も入れている）。色は登録してあるすべての写真からとった色。
  レンズの値は `src/lib/field.ts` の `LENS` で変えられる（F 値を大きくするとボケが小さく、ピントを遠くにすると小さくなる）
  スクロールに合わせて奥行きをもって流れ、止まっているときもゆっくり漂う
- 直接開いたとき・リロードしたときは、写真の色をしたドットが画面のあちこちにふわっと現れ、
  読み込みが終わると、画面に見えている写真のほうへ集まって写真になる（上のスクロールの動きの逆再生）。
  時間は `src/lib/field.ts` の `INTRO`（開いてから最短 1.8 秒で集まり始め、2.6 秒かけて写真になる）
- ヘッダーのリンクや SNS アイコンにカーソルを合わせると、画面に見えている写真の色に変わる

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
| `description` | 写真の説明（書き方は `title` と同じ）。画像の代替テキストと、写真ページを共有したときの説明文になる |
| `featured` | トップページに載せる（最大 24 枚。1枚も指定がなければ先頭から） |
| `order` | 小さいほど先頭。指定がなければ撮影日の新しい順 |
| `hidden` | `true` でサイトに出さない |

- 撮影データ（カメラ・レンズ・F値・シャッター速度・ISO・撮影日）は EXIF から自動で表示します。
- **位置情報（GPS）は公開されません。** 画像は WebP に変換するときにメタデータを落とします。
  ビルドの最後に `scripts/check-exif.mjs` が出力画像を検査し、GPS が残っていたらビルドを失敗させます。
- 写真を `public/` に置くと変換されずにそのまま公開されます。写真は必ず `src/photos/` に置いてください。
- 写真は、長辺 3000px ほどに縮めてから入れるのがおすすめです（サイトで使う最大は 2560px）。
  `src/photos/` の元の写真は GitHub にそのまま公開されるので、シリアル番号などの撮影データや、ナンバープレートなどの写り込みは、入れる前に消してください。

## 中身を変える

プロフィール・経歴・道具・SNS は、すべて `src/content/` の YAML に書きます（プログラムを触らなくてよい）。
書き方がきまりに合わないと、ビルド（`pnpm dev` / `pnpm build`）のときに、どのファイルの何番目の項目のどこが違うかを教えてくれます。

| ファイル | 中身 |
| --- | --- |
| `src/content/sections.yaml` | プロフィールのセクションの並び・見出し・小さな日本語・手描きの絵・ひとこと・非表示。メニューもこれに合わせて変わる |
| `src/content/profile.yaml` | About：大きな一言、名前、自己紹介、小さな表、SNS のリンク |
| `src/content/history.yaml` | History：学校・仕事の経歴（新しい順）。`draft: true` の項目は手元（`pnpm dev`）でだけ表示 |
| `src/content/gear.yaml` | Gear：いま使っている道具。広告リンクには `sponsored: true` |
| `src/photos/` と `meta.json` | 写真（上の「写真を追加する」） |

- 中身がひとつもないセクション（公開できる経歴がない、など）は、ページからもメニューからも自動で消えます。
- 英語のページには、見出しの下の小さな日本語は出ません。

デザインや仕組みを変えるとき：

| 内容 | ファイル |
| --- | --- |
| サイト名・URL・GA4 の測定 ID | `src/data/site.ts` |
| ボタンなどの細かな文言（日英） | `src/i18n/ui.ts` |
| セクションの中身の並べ方 | `src/components/sections/` |
| 手描きの線画（カメラ・道・レンズ） | `src/components/Doodle.astro` |
| メニュー（開閉） | `src/components/Header.astro` |
| 色・余白・フォント | `src/styles/global.css` の先頭 |
| 読み込み中のドット、写真がドットに化けて背景になる演出（レンズの値は `LENS`） | `src/lib/field.ts` |
| トップの横スクロール | `src/lib/hstrip.ts`、`src/components/PhotoStrip.astro` |
| 404 のドット文字 | `src/lib/dotmatrix.ts`、`src/lib/dotfont.js` |
| イチゴのロゴ・OGP 画像 | `src/lib/strawberry.js`。変更後や写真を替えたあとに `pnpm icons [写真のパス]` で favicon と OGP 画像を再生成 |

## デプロイ

`master` に push すると GitHub Actions（`.github/workflows/deploy.yml`）がビルドして公開します。

初回だけ、GitHub のリポジトリ設定で **Settings → Pages → Build and deployment → Source** を
**GitHub Actions** に切り替えてください（ブランチからの公開のままだと、ビルド前のソースが公開されてしまいます）。

## 旧サイトからの引き継ぎ

- `/favorite_list.html` → トップのプロフィール内の道具（`/#gear`）へリダイレクト
- `/game_page.html` と `/game/` はそのまま残しています
