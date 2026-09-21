# _ops — ビルド用スクリプト

このディレクトリはアンダースコア始まりのため、GitHub Pages（Jekyll）の配信対象から除外されます。
サイトとしては公開されません。ただし**リポジトリが public であるため、GitHub上ではソースが読めます。**
営業台本・価格・KPIなどを含む運用資料は `_ops/playbook/` に置き、`.gitignore` でコミット対象から外しています。

## スクリプト

### `build/build-pages.js`

`yui/content.js` から、タイプ別ページ（`yui/t/*.html`）と制作者ページ（`yui/about.html`）を生成します。
文言を二重管理しないための仕組みです。`content.js` を編集したら実行してください。

```
node _ops/build/build-pages.js
```

### `build/render-ogp.js`

`build/cards.json` の定義から、OGP画像（`yui/ogp/*.png`）を 2400×1260 で書き出します。
ヘッドレスChromiumを使うため、playwright が必要です。

```
NODE_PATH=/opt/node22/lib/node_modules node _ops/build/render-ogp.js
```

日本語フォントは IPAPGothic / IPAGothic のみを前提にしています。
IPAフォントは実質1ウェイトで、56px未満で `font-weight:700` を指定すると漢字のふところが潰れます。
小さい文字は必ず400のままにし、格は字間と余白で出してください。
改行位置は `cards.json` の `\n` で手動制御しています（行頭に句読点が来ないように）。

**画像を差し替えるときは、ファイル名の `-v1` を上げてください。**
SNSのOGPクローラは画像を強くキャッシュし、クエリ（`?v=2`）では再取得されないことがあります。
ファイル名を変えたら、`yui/index.html` の `og:image` と `build-pages.js` の参照も更新します。

## ディレクトリ

```
_ops/
├── README.md          このファイル
├── build/             ビルドスクリプト（コミットする）
└── playbook/          運用資料（コミットしない。.gitignore 済み）
```
