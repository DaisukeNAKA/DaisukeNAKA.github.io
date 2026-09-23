/**
 * 引っ越し用のリダイレクト置き換え
 *
 *   node _ops/build/make-redirect.js https://yui-shindan.pages.dev/
 *
 * いったん daisukenaka.github.io/yui/ で公開したあと、別の場所へ移したくなったときに使います。
 *
 * GitHub Pages はサーバー側のリダイレクト（301）を設定できません。
 * そのままだと、すでにSNSに流したリンクも、シェアされたタイプ別ページも、
 * 引っ越した瞬間にすべて行き止まりになります。
 *
 * このスクリプトは yui/ 配下の各ページを「新しい場所へ送り出す小さなページ」に置き換えます。
 *   - <link rel="canonical"> で検索エンジンに新しい場所を伝える
 *   - <meta http-equiv="refresh"> で自動的に飛ばす
 *   - 飛ばなかった人のために、押せるリンクも置く
 * 完全な301ではありませんが、人は確実に着きますし、検索評価もおおむね引き継がれます。
 *
 * 実行前に、新しい場所での公開が終わっていることを確認してください。
 * 元に戻したいときは  git checkout -- yui  で戻ります。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const YUI = path.join(ROOT, 'yui');

const target = process.argv[2];
if (!target || !/^https?:\/\//.test(target)) {
  console.error('\n  引っ越し先のURLを渡してください。');
  console.error('  例: node _ops/build/make-redirect.js https://yui-shindan.pages.dev/\n');
  process.exit(1);
}
const base = target.replace(/\/$/, '');

global.window = {};
require(path.join(YUI, 'content.js'));
const C = global.window.YUI_CONTENT;

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function stub(to, title) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="canonical" href="${esc(to)}">
<meta name="robots" content="noindex,follow">
<meta http-equiv="refresh" content="0; url=${esc(to)}">
<style>
  body{margin:0;min-height:100svh;display:flex;align-items:center;justify-content:center;
    background:#f7f4ee;color:#171b21;
    font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP",sans-serif;
    line-height:1.9;padding:24px;text-align:center;}
  @media (prefers-color-scheme: dark){ body{background:#0f1319;color:#ece7dd;} }
  a{color:#c8453c;font-weight:700;}
  @media (prefers-color-scheme: dark){ a{color:#e2695f;} }
  p{max-width:30em;}
</style>
</head>
<body>
<p>「結」の書き方診断は、新しい場所へ移りました。<br>
自動で移動します。切り替わらない場合は<br>
<a href="${esc(to)}">${esc(to)}</a><br>を開いてください。</p>
<script>location.replace(${JSON.stringify(to)} + location.search + location.hash);</script>
</body>
</html>
`;
}

const written = [];
fs.writeFileSync(path.join(YUI, 'index.html'), stub(base + '/', '移転のお知らせ ｜「結」の書き方診断'), 'utf8');
written.push('index.html');

/* 結果のアドレス（#/r/…）と投稿ごとの ?s= を落とさないよう、スクリプトでは search と hash を引き継ぎます。 */
fs.writeFileSync(path.join(YUI, 'q.html'), stub(base + '/q.html', '移転のお知らせ ｜「結」の書き方診断（10問版）'), 'utf8');
written.push('q.html');

fs.writeFileSync(path.join(YUI, 'about.html'), stub(base + '/about.html', '移転のお知らせ ｜ この診断について'), 'utf8');
written.push('about.html');

C.types.forEach((t) => {
  const key = String(t.key).replace(/[^A-Za-z0-9_-]/g, '');
  fs.writeFileSync(
    path.join(YUI, 't', `${key}.html`),
    stub(`${base}/t/${key}.html`, `移転のお知らせ ｜ ${t.name}`),
    'utf8'
  );
  written.push(`t/${key}.html`);
});

console.log('\n  次のページを転送用に置き換えました:');
written.forEach((f) => console.log('    yui/' + f));
console.log(`\n  転送先: ${base}`);
console.log('\n  OGP画像（yui/ogp/）はそのまま残してあります。');
console.log('  SNS側にキャッシュされた画像が割れないようにするためです。');
console.log('\n  元に戻す場合: git checkout -- yui\n');
