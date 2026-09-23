# _ops — ビルド用スクリプト

このディレクトリはアンダースコア始まりのため、GitHub Pages（Jekyll）の配信対象から除外されます。
サイトとしては公開されません。ただし**リポジトリが public であるため、GitHub上ではソースが読めます。**
営業台本・価格・KPIなどを含む運用資料は `_ops/playbook/` に置き、`.gitignore` でコミット対象から外しています。

## スクリプト

### `build/build-pages.js`

`yui/content.js` から、次のページを生成します。文言を二重管理しないための仕組みです。
`content.js` を編集したら実行してください。

| ページ | 中身 |
|---|---|
| `yui/index.html` | 手書きの診断（原案。スマホに指で「結」を書く） |
| `yui/q.html` | 書かずに受ける10問版（指で書くのが難しい方のための代わりの経路） |
| `yui/t/*.html` | タイプ別ページ（共有リンクの着地先） |
| `yui/about.html` | この診断について（何を測り、どう当てはめているか・研究の状況・つくった人） |

```
node _ops/build/build-pages.js
```

### `build/make-cards.js` と `build/render-ogp.js`

OGPカードの文言は `content.js` の `ogp`（タイプ名は `types.<型>.name`）が元です。
`make-cards.js` が `build/cards.json` を作り、`render-ogp.js` が 2400×1260 のPNGを書き出します。
ヘッドレスChromiumを使うため、playwright が必要です。

```
node _ops/build/make-cards.js
NODE_PATH=/opt/node22/lib/node_modules node _ops/build/render-ogp.js
```

日本語フォントは IPAPGothic / IPAGothic のみを前提にしています。
IPAフォントは実質1ウェイトで、56px未満で `font-weight:700` を指定すると漢字のふところが潰れます。
小さい文字は必ず400のままにし、格は字間と余白で出してください。
改行位置は `content.js` の `ogp.types.<型>.sub` の `\n` で指定します（トップは `make-cards.js` が文節で折ります）。

**画像を差し替えるときは、`content.js` の `config.ogpVersion`（いまは `v3`）を上げてください。**
SNSのOGPクローラは画像を強くキャッシュし、クエリ（`?v=2`）では再取得されないことがあります。
ページの `og:image` は `ogpVersion` から組み立てるので、上げたら `build-pages.js` も実行します。

## 検証

### `test/check.js` — content.js を編集したら、まずこれ

```
node _ops/test/check.js            # 約10秒
node _ops/test/check.js --full     # エンジンの単体テスト（約2分）も通す
```

ブラウザ不要。node だけで動きます。確認するのは次の点です。

- `content.js` の形（文言のキー・4タイプ・特徴・テーマ・テーマの向き）と、エンジンの妥当性チェックごとの書き直しの案内
- `hw.js`・`quiz.js`・`common.js` が参照するキーが揃っているか、差し込み記号（`{type}` など）に埋める側があるか
- 較正の形（重み・中央値・尺度・向き・中心）。合成データの仮の値のあいだは警告を出します
- 合成の「結」でエンジンを通し、結果コードが往復するか（コードに線の記録が入る長さでないか）
- 10問版の配点と、全 4^10 通りの型・テーマの内訳
- 文言チェック（`test/wording/lint-wording.js`：禁止文言と必須文言）
- 生成ページ・`cards.json`・OGP画像が `content.js` に追いついているか
- 全ページの CSP・スクリプト・表示順（打消しが強調表示の隣にあるか）
- 通信するコードがないか、端末に保存するものが想定どおりか

### `test/hw-engine.test.js` と `test/hw-calibration.js` — 手書きのエンジン

```
node _ops/test/hw-engine.test.js       # 単体テスト（約2分）
node _ops/test/hw-calibration.js       # 合成データでの較正と関門（N=3000、1分強）
```

`hw-calibration.js` の値は、人の指で書いた字から測ったものではありません。
パイロット（`?collect=1` で、40人以上 × 2回・別の日）の実測が入ったら、`content.js` の `calibration` を置き換えます。

### `test/browser.js` — 画面として動くか

```
npx http-server -p 8899 -s .          # 別のターミナルで起動しておく
NODE_PATH=/opt/node22/lib/node_modules node _ops/test/browser.js
```

ヘッドレスChromiumで、CDP のタッチ入力を使って実際に「結」を書き、結果まで通します。
書き直し・読めない字・属性による出し分け・2回目の平均・画像の保存・再読み込み・共有リンク・
不正なURL・戻る操作と履歴・10問版（共有表示を含む）・静的ページ・外部への通信がないこと。
iOS の戻るジェスチャーやアプリ内ブラウザの挙動は、実機でしか確かめられません。

### `build/make-redirect.js` — あとから引っ越すとき

```
node _ops/build/make-redirect.js https://新しいURL/
```

GitHub Pages はサーバー側のリダイレクト（301）を張れません。何もしないで引っ越すと、
すでにSNSへ流したリンクも、シェアされたタイプ別ページも、その瞬間から行き止まりになります。

このスクリプトは `yui/` 配下の7ページを「新しい場所へ送り出す小さなページ」に置き換えます。
canonical で検索エンジンに移転先を伝え、meta refresh と JavaScript で自動的に飛ばし
（JavaScript では結果のアドレス `#/r/…` と `?s=` を引き継ぎます）、飛ばなかった人には押せるリンクを出します。
完全な301ではありませんが、人は確実に着きます。

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
2. `node _ops/build/build-pages.js` — ページを生成しなおす
3. （OGPの文言を変えたなら）`config.ogpVersion` を上げて `make-cards.js` → `render-ogp.js` → `build-pages.js`
4. `node _ops/test/check.js` — NG が0件か
5. `node _ops/test/browser.js` — 画面として動くか
6. コミット
