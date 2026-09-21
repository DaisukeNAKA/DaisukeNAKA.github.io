/**
 * タイプ別ページ（yui/t/*.html）と制作者ページ（yui/about.html）を
 * yui/content.js から生成します。文言の二重管理を避けるためのスクリプトです。
 *
 * 実行:  node _ops/build/build-pages.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const YUI = path.join(ROOT, 'yui');

global.window = {};
require(path.join(YUI, 'content.js'));
const C = global.window.YUI_CONTENT;
const SITE = String(C.config.siteUrl).replace(/\/$/, '');
const OGPV = C.config.ogpVersion || 'v1';

/* 出荷時の config は外部リンクが空です。そのまま公開すると、診断を終えた人が
   こちらへ到達する手段が1つも無い状態になります。ビルドのたびに気づけるようにします。 */
if (!C.config.dmUrl && !C.config.profileUrl && !C.config.lineUrl) {
  console.warn('\n  ⚠ config の dmUrl / profileUrl / lineUrl がすべて空です。');
  console.warn('    このまま公開すると、結果ページから連絡を取る手段がありません。');
  console.warn('    yui/content.js の config を埋めてから公開してください。\n');
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
           .replace(/"/g, '&quot;');

/* content.js は運用者が直接編集するファイルなので、色とキーは形を検証してから埋め込みます。
   引用符の混入で属性が割れたり、キーがパスとして解釈されたりしないようにするためです。 */
const hex = (c, fb) => (/^#[0-9a-fA-F]{3,8}$/.test(String(c)) ? String(c) : fb);
const slug = (k) => String(k).replace(/[^A-Za-z0-9_-]/g, '');

const head = ({ title, desc, canonical, ogImage, themeColor }) => `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta name="theme-color" content="#f7f4ee" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0f1319" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="article">
<meta property="og:site_name" content="「結」の書き方診断">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:image:width" content="2400">
<meta property="og:image:height" content="1260">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(ogImage)}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23${hex(themeColor, '#c8453c').slice(1)}'/%3E%3Ctext x='32' y='47' font-size='40' text-anchor='middle' fill='%23fff' font-family='serif'%3E%E7%B5%90%3C/text%3E%3C/svg%3E">
<link rel="stylesheet" href="${canonical.includes('/t/') ? '../style.css' : 'style.css'}">
</head>
<body>`;

const foot = (depth) => `
<footer id="site-footer"></footer>
<script src="${depth}content.js"></script>
<script src="${depth}app.js"></script>
</body>
</html>
`;

/* ---------------- タイプ別ページ ---------------- */
fs.mkdirSync(path.join(YUI, 't'), { recursive: true });

C.types.forEach((t) => {
  const key = slug(t.key);
  const color = hex(t.color, '#c8453c');
  const canonical = `${SITE}/t/${key}.html`;
  const desc = t.catch;
  const html =
    head({
      title: `${t.name} ｜「結」の書き方診断`,
      desc,
      canonical,
      ogImage: `${SITE}/ogp/${key}-${OGPV}.png`,
      themeColor: color,
    }) +
`
<main style="--type:${color}">
  <section class="t-hero">
    <div class="r-head">
      <div class="seal" aria-hidden="true" style="border-color:${color};color:${color};background:transparent">結</div>
      <div>
        <p class="kicker" style="margin:0 0 6px">「結」の書き方診断 ／ 4タイプ</p>
        <h1 class="r-name">${esc(t.name)}</h1>
        <p class="r-tag">${esc(t.tagline)}</p>
      </div>
    </div>
    <p class="r-catch">${esc(t.catch)}</p>

    <h2 class="sec">この型の締め方</h2>
    <p>${esc(t.summary)}</p>

    <h2 class="sec">強みが出る場所</h2>
    <p>${esc(t.strength)}</p>

    <h2 class="sec">取りこぼしているもの</h2>
    <p>${esc(t.leak)}</p>

    <h2 class="sec">書き換えの実例</h2>
    <div class="ex"><p class="ex-head">BEFORE ／ やりがちな締め</p><div class="ex-body">${esc(t.badExample)}</div></div>
    <div class="ex after"><p class="ex-head">AFTER ／ 書き換えた締め</p><div class="ex-body">${esc(t.goodExample)}</div></div>
    <p style="margin-top:16px;font-size:14.5px;color:var(--ink-2)">${esc(t.exampleNote)}</p>

    <h2 class="sec">相性のいい場面・避けたい場面</h2>
    <p>${esc(t.affinity)}</p>

    <div class="cta t-cta">
      <h2>あなたは、4つのうちどれですか</h2>
      <p>このページは4タイプのうちの1つです。あなたがどれなのか、そして
      明快さ・接続・余白のどれが薄いのかは、10問に答えると分かります。
      薄い要素に合わせた穴埋め式の締めの型が、1本出ます。</p>
      <a class="btn" href="../index.html">${esc(C.copy.startButton)}</a>
      <p class="note" style="margin-top:12px;text-align:center">${esc(C.copy.privacyLine)}</p>
    </div>

    <p style="margin:26px 0 0"><a class="t-back" href="../index.html">← 診断のトップへ</a></p>
  </section>
</main>
` + foot('../');

  fs.writeFileSync(path.join(YUI, 't', `${key}.html`), html, 'utf8');
  console.log(`  t/${key}.html`);
});

/* ---------------- 制作者ページ ---------------- */
const a = C.about;
const works = (a.works || []).length
  ? `<h2 class="sec">担当している仕事</h2>` +
    a.works.map((w) =>
      `<div class="work"><b>${esc(w.title)}</b><span>${esc(w.role)}${w.note ? ' ／ ' + esc(w.note) : ''}</span></div>`
    ).join('\n')
  : '';
const menu = (a.menu || []).length
  ? `<h2 class="sec">お引き受けしていること</h2>` +
    a.menu.map((m) =>
      `<div class="work"><b>${esc(m.name)}</b><span>${esc(m.price)}${m.note ? ' ／ ' + esc(m.note) : ''}</span></div>`
    ).join('\n')
  : '';

const aboutHtml =
  head({
    title: 'この診断を書いた人 ｜「結」の書き方診断',
    desc: a.lead,
    canonical: `${SITE}/about.html`,
    ogImage: `${SITE}/ogp/yui-top-${OGPV}.png`,
    themeColor: '#c8453c',
  }) +
`
<main>
  <section class="t-hero">
    <div class="seal" aria-hidden="true" style="margin:0 0 26px">結</div>
    <p class="kicker">About</p>
    <h1>この診断を書いた人</h1>
    <p class="sub">${esc(a.lead)}</p>
    <hr class="rule">
    <p>${esc(a.profile)}</p>
    ${works}
    ${menu}
    <div class="cta t-cta">
      <h2>${esc(a.closing)}</h2>
      <a class="btn" href="index.html">${esc(C.copy.startButton)}</a>
    </div>
    <p style="margin:26px 0 0"><a class="t-back" href="index.html">← 診断のトップへ</a></p>
  </section>
</main>
` + foot('');

fs.writeFileSync(path.join(YUI, 'about.html'), aboutHtml, 'utf8');
console.log('  about.html');
console.log(`\n${C.types.length + 1} ページを生成しました。`);
