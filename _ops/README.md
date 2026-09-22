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

## 検証

### `test/check.js` — content.js を編集したら、まずこれ

```
node _ops/test/check.js
```

ブラウザ不要。node だけで動きます。確認するのは次の点です。

- `app.js` が参照しているキーが `content.js` に揃っているか
- 設問の配点が有効な範囲か（x/y は -2〜2、3要素は 0〜3）
- 4タイプすべてに**到達できる回答が存在するか**
- 結スコアの段階が 0〜100 を隙間なく覆っているか
- 処方箋が明快さ／接続／余白に1本ずつあるか
- 生成ページとOGP画像が `content.js` に追いついているか

最後に、全1,048,576通りを総当たりした分布（タイプ・最弱要素・判定の強度・スコア帯）を表示します。
**編集前後でこの数字を見比べてください。** 大きく動いていたら、配点の変更が意図以上に効いています。

`content.js` は「ここだけ編集すれば全部変わる」設計です。
そのぶん、一つの配点を変えただけで採点の較正が静かに壊れます。
このスクリプトは、その静かな破壊を音にするためのものです。

### `test/browser.js` — 画面として動くか

```
npx http-server -p 8899 -s .          # 別のターミナルで起動しておく
NODE_PATH=/opt/node22/lib/node_modules node _ops/test/browser.js
```

ヘッドレスChromiumで通しで操作します。4タイプの判定、属性による出し分け、共有リンク、
リロード、戻る操作と履歴の深さ、途中復帰、不正なURL、共有シートが遅いときの挙動、
静的ページ。いずれも過去に実際に出たバグの回帰を含みます。

### `build/make-redirect.js` — あとから引っ越すとき

```
node _ops/build/make-redirect.js https://新しいURL/
```

GitHub Pages はサーバー側のリダイレクト（301）を張れません。何もしないで引っ越すと、
すでにSNSへ流したリンクも、シェアされたタイプ別ページも、その瞬間から行き止まりになります。

このスクリプトは `yui/` 配下の6ページを「新しい場所へ送り出す小さなページ」に置き換えます。
canonical で検索エンジンに移転先を伝え、meta refresh と JavaScript で自動的に飛ばし、
飛ばなかった人には押せるリンクを出します。完全な301ではありませんが、人は確実に着きます。

OGP画像は消しません。SNS側にキャッシュされた画像が割れるのを避けるためです。

元に戻すには `git checkout -- yui` です。

## ディレクトリ

```
_ops/
├── README.md          このファイル
├── build/             ビルド・引っ越しスクリプト（コミットする）
├── test/              検証スクリプト（コミットする）
└── playbook/          運用資料（コミットしない。.gitignore 済み）
```

## 編集の手順

1. `yui/content.js` を編集する
2. `node _ops/test/check.js` — データとして壊れていないか
3. `node _ops/build/build-pages.js` — ページを生成しなおす
4. （画像を変えたなら）`config.ogpVersion` を上げて `render-ogp.js` を実行
5. `node _ops/test/browser.js` — 画面として動くか
6. コミット
