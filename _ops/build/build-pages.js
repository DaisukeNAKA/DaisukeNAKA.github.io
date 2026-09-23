/**
 * yui/ 配下のページを yui/content.js から生成します。文言の二重管理を避けるためのスクリプトです。
 *
 *   index.html  … 手書きの診断（原案。指で「結」を書く）
 *   q.html      … 書かずに受ける10問版（指で書くのが難しい方のための代わりの経路）
 *   about.html  … この診断の位置づけと、つくった人
 *   t/*.html    … タイプ別ページ（シェアの着地先）
 *
 * 実行:  node _ops/build/build-pages.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const YUI = path.join(ROOT, 'yui');
/* check.js は YUI_OUT に一時ディレクトリを渡して、生成物が最新かどうかを比べます。 */
const OUT = process.env.YUI_OUT ? path.resolve(process.env.YUI_OUT) : YUI;

global.window = {};
require(path.join(YUI, 'content.js'));
const C = global.window.YUI_CONTENT;
const SITE = String(C.config.siteUrl).replace(/\/$/, '');
const OGPV = C.config.ogpVersion || 'v1';
const H = C.hw;

if (!C.config.dmUrl && !C.config.profileUrl && !C.config.lineUrl) {
  console.warn('\n  ⚠ config の dmUrl / profileUrl / lineUrl がすべて空です。結果ページから連絡を取る手段がありません。\n');
}

const esc = (s) =>
  String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/* content.js は運用者が直接編集するファイルなので、色とキーは形を検証してから埋め込みます。 */
const hex = (c, fb) => (/^#[0-9a-fA-F]{3,8}$/.test(String(c)) ? String(c) : fb);
const slug = (k) => String(k).replace(/[^A-Za-z0-9_-]/g, '');
/* common.js の fill と同じく、知らない {トークン} は残します（check.js が残りを検出します）。 */
const fillT = (tpl, map) =>
  String(tpl == null ? '' : tpl).replace(/\{([a-zA-Z0-9_]+)\}/g, (m, k) => (map[k] == null ? m : String(map[k])));
const li = (src) =>
  (Array.isArray(src) ? src : String(src || '').split('\n'))
    .map((l) => String(l).replace(/^[・\-•]\s*/, '').trim())
    .filter(Boolean)
    .map((l) => `<li>${esc(l)}</li>`)
    .join('\n        ');

/* 書いた線を外へ出さないことを、宣言ではなくブラウザの仕組みで担保します。
   connect-src 'none' で fetch / XHR / WebSocket / sendBeacon がすべて止まります。
   インラインの <script> は使わないため script-src は 'self' だけです。 */
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'none'",
  "font-src 'self'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

const head = ({ title, desc, canonical, ogImage, themeColor, extraStyle, rel, ogType, robots }) => `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="${robots || 'index,follow,max-image-preview:large'}">
<meta name="theme-color" content="#f7f4ee" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0f1319" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="${ogType || 'article'}">
<meta property="og:site_name" content="${esc(C.title)}">
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
<link rel="stylesheet" href="${rel || ''}style.css">
${extraStyle || ''}
</head>
<body>`;

const foot = (depth, scripts) => `
<footer id="site-footer"></footer>
${scripts.map((s) => `<script src="${depth}${s}"></script>`).join('\n')}
</body>
</html>
`;

/* ---------------- index.html（手書き） ---------------- */
const I = H.intro, W = H.write, G = H.gate || {};
const indexHtml =
  head({
    title: C.meta.title,
    desc: C.meta.description,
    canonical: `${SITE}/`,
    ogImage: `${SITE}/ogp/yui-top-${OGPV}.png`,
    themeColor: '#c8453c',
    ogType: 'website',
  }) +
`
<main>
  <!-- ========== 導入 ========== -->
  <section id="intro" aria-labelledby="intro-title">
    <div class="seal" aria-hidden="true" style="margin:0 0 26px">結</div>
    <p class="kicker">${esc(I.kicker)}</p>
    <h1 id="intro-title">${esc(I.title)}</h1>
    <p class="r01" id="c-r01">${esc(I.r01)}</p>
    <p class="sub" id="c-catch">${esc(I.catch)}</p>
    <!-- R02 はキャッチのすぐ下。打消しを強調表示から離さないため -->
    <p class="disclaimer" id="c-r02">${esc(I.r02)}</p>
    <p class="hook" id="c-hook">${esc(I.hook)}</p>
    <p class="note" id="c-r03">${esc(I.r03)}</p>

    <div class="start-wrap">
      <button class="btn" id="start" type="button">${esc(I.startButton)}</button>
      <p class="alt-path" style="text-align:center"><a id="alt-quiz-intro" href="q.html">${esc(I.altLink)}</a></p>
    </div>

    <hr class="rule">

    <p class="block-title">この診断で分かること</p>
    <ul class="list" id="c-promise">
        ${li(I.promise)}
    </ul>

    <p class="block-title" style="margin-top:30px">こんな方へ</p>
    <ul class="list" id="c-whofor">
        ${li(I.whoFor)}
    </ul>

    <div class="start-wrap">
      <button class="btn" id="start2" type="button">${esc(I.startButton)}</button>
    </div>

    <div class="author" id="c-author">${esc(I.author)}</div>
  </section>

  <!-- ========== 書く ========== -->
  <section id="write" hidden aria-labelledby="w-heading">
    <p class="kicker">${esc(W.kicker || '「結」を書く')}</p>
    <h2 class="qtext" id="w-heading" tabindex="-1">${esc(W.heading)}</h2>
    <!-- 書かずに受ける経路は、読み上げ順でも枠より前に置きます -->
    <p class="alt-path"><a id="alt-quiz" href="q.html">${esc(I.altLink)}</a></p>
    <p class="note" id="w-nopointer" hidden>${esc(W.noPointer || I.altLink)}</p>
    <!-- R03・R04 はどちらもキャンバスの直上 -->
    <p class="note" id="w-r03">${esc(I.r03)}</p>
    <p class="w-lead" id="w-r04">${esc(W.r04)}</p>
    <p class="note" id="w-size">${esc(W.sizeHint)}</p>
    <div class="pad-wrap" id="pad-wrap">
      <div class="pad" id="pad">
        <canvas id="cv" role="application" aria-label="${esc(W.ariaCanvas)}"></canvas>
      </div>
    </div>
    <p class="note" id="w-r05" style="margin-top:10px">${esc(W.r05)}</p>
    <div class="w-problem" id="w-problem" role="status" aria-live="polite" hidden></div>
    <div class="w-btns">
      <button class="btn btn-ghost" id="w-undo" type="button" disabled>${esc(W.undo)}</button>
      <button class="btn btn-ghost" id="w-clear" type="button" disabled>${esc(W.clear)}</button>
    </div>
    <button class="btn" id="w-done" type="button" disabled>${esc(W.done)}</button>
    <p class="note" id="w-inapp" hidden>${esc(W.inappHint)} ${esc(W.lineExternal)}</p>
  </section>

  <!-- ========== 属性（書いたあとに1問。結果には影響しません） ========== -->
  <section id="gate" hidden aria-labelledby="g-text">
    <button class="qback" id="g-back" type="button">← 書き直す</button>
    <p class="kicker">あと1問だけ</p>
    <p class="scene" id="g-scene"></p>
    <h2 class="qtext" id="g-text" tabindex="-1"></h2>
    <div class="opts" id="g-opts" role="group" aria-labelledby="g-text"></div>
    <p class="note" id="g-note" style="margin-top:18px">${esc(G.note)}</p>
  </section>

  <!-- ========== 結果 ========== -->
  <section id="result" hidden aria-labelledby="r-name"></section>
</main>

<div class="toast" id="toast" role="status" aria-live="polite"></div>
` + foot('', ['content.js', 'hw-engine.js', 'common.js', 'hw.js']);

fs.writeFileSync(path.join(OUT, 'index.html'), indexHtml, 'utf8');
console.log('  index.html');

/* ---------------- q.html（書かずに受ける10問版） ---------------- */
const QC = C.quiz.copy;
const NQ = C.quiz.questions.length;
const qHtml =
  head({
    title: C.quizMeta.title,
    desc: C.quizMeta.description,
    canonical: `${SITE}/q.html`,
    ogImage: `${SITE}/ogp/yui-top-${OGPV}.png`,
    themeColor: '#c8453c',
    ogType: 'website',
  }) +
`
<main>
  <section id="intro" aria-labelledby="intro-title">
    <div id="resume-host"></div>
    <div class="seal" aria-hidden="true" style="margin:0 0 26px">結</div>
    <h1 id="intro-title">${esc(QC.title)}</h1>
    <p class="r01">${esc(I.r01)}</p>
    <p class="sub" id="c-subtitle">${esc(QC.subtitle)}</p>
    <p class="disclaimer" id="c-r02">${esc(QC.r02)}</p>
    <p class="hook" id="c-hook">${esc(QC.hook)}</p>
    <div class="start-wrap">
      <button class="btn" id="start" type="button">${esc(QC.startButton)}</button>
      <p class="note" id="c-privacy" style="margin-top:12px">${esc(QC.privacyLine)}</p>
      <p class="alt-path" style="text-align:center"><a id="to-hw-intro" href="index.html">${esc(QC.toHandwriting)}</a></p>
    </div>
    <hr class="rule">
    <p class="block-title">この診断で分かること</p>
    <ul class="list" id="c-promise">
        ${li(QC.promise)}
    </ul>
  </section>

  <section id="gate" hidden aria-labelledby="g-text">
    <button class="qback" id="g-back" type="button">← 前に戻る</button>
    <p class="kicker">はじめに</p>
    <p class="scene" id="g-scene"></p>
    <h2 class="qtext" id="g-text" tabindex="-1"></h2>
    <div class="opts" id="g-opts" role="group" aria-labelledby="g-text"></div>
    <p class="note" id="g-note" style="margin-top:18px">${esc(QC.gateNote)}このあと${NQ}問です。</p>
  </section>

  <section id="quiz" hidden>
    <div class="qbar">
      <div class="qbar-top">
        <button class="qback" id="q-back" type="button">← ひとつ戻る</button>
        <span class="qcount"><b id="q-now">1</b> <span aria-hidden="true">/</span> <span id="q-total">${NQ}</span></span>
      </div>
      <div class="segs" id="q-segs" role="progressbar" aria-valuemin="0" aria-valuemax="${NQ}" aria-valuenow="1" aria-label="回答の進捗"></div>
    </div>
    <div class="stage" id="q-stage">
      <p class="scene" id="q-scene"></p>
      <h2 class="qtext" id="q-text" tabindex="-1"></h2>
      <div class="opts" id="q-opts" role="group" aria-labelledby="q-text"></div>
    </div>
  </section>

  <section id="result" hidden aria-labelledby="r-name"></section>
</main>

<div class="toast" id="toast" role="status" aria-live="polite"></div>
` + foot('', ['content.js', 'common.js', 'quiz.js']);

fs.writeFileSync(path.join(OUT, 'q.html'), qHtml, 'utf8');
console.log('  q.html');

/* ---------------- タイプ別ページ ---------------- */
fs.mkdirSync(path.join(OUT, 't'), { recursive: true });
const R = H.result;
C.types.forEach((t) => {
  const key = slug(t.key);
  const color = hex(t.color, '#c8453c');
  /* ダークモードで型色が背景に沈むのを防ぎます。 */
  const colorDark = hex(t.colorDark, color);
  const canonical = `${SITE}/t/${key}.html`;
  const html =
    head({
      title: fillT(C.typePageMeta.titleTemplate, { type: t.name, catch: t.catch }),
      desc: fillT(C.typePageMeta.descriptionTemplate, { type: t.name, catch: t.catch }),
      canonical,
      ogImage: `${SITE}/ogp/${key}-${OGPV}.png`,
      themeColor: color,
      rel: '../',
      extraStyle:
        `<style>main{--type-light:${color};--type-dark:${colorDark};--type:var(--type-light)}` +
        `@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) main{--type:var(--type-dark)}}` +
        `:root[data-theme="dark"] main{--type:var(--type-dark)}</style>`,
    }) +
`
<main data-type="${key}">
  <section class="t-hero">
    <div class="r-head">
      <div class="seal" aria-hidden="true" style="border-color:var(--type);color:var(--type);background:transparent">結</div>
      <div>
        <p class="kicker" style="margin:0 0 6px">${esc(C.title)} ／ 4タイプ</p>
        <h1 class="r-name">${esc(t.name)}</h1>
        <p class="r-tag">${esc(t.tagline)}</p>
      </div>
    </div>
    <p class="r-catch">${esc(t.catch)}</p>
    <!-- R02 の役目の打消し。catch と basis のあいだから動かさないこと -->
    <p class="r07">${esc(C.typePageNote)}</p>

    <h2 class="sec">${esc(R.summaryHeading || 'この型の進め方')}</h2>
    ${t.basis ? `<p class="basis">${esc(t.basis)}</p>` : ''}
    <p>${esc(t.summary)}</p>
    <h2 class="sec">${esc(R.strengthHeading || '強みが出る場所')}</h2>
    <p>${esc(t.strength)}</p>
    <h2 class="sec">${esc(R.liveHeading)}</h2>
    <p>${esc(t.live)}</p>
    <h2 class="sec">${esc(R.stumbleHeading || 'つまずきやすい場面')}</h2>
    <p>${esc(t.stumble)}</p>
    <h2 class="sec">${esc(R.exampleHeading || 'プロフィールの書き換え例')}</h2>
    <div class="ex"><p class="ex-head">BEFORE ／ ありがちな書き方</p><div class="ex-body">${esc(t.badExample)}</div></div>
    <div class="ex after"><p class="ex-head">AFTER ／ 書き換えた例</p><div class="ex-body">${esc(t.goodExample)}</div></div>
    <p class="ex-note">${esc(t.exampleNote)}</p>
    <h2 class="sec">${esc(R.affinityHeading || 'この型が生きる場面・つまずく場面')}</h2>
    <p>${esc(t.affinity)}</p>

    <div class="cta t-cta">
      <h2>${esc(C.typePageCta.heading)}</h2>
      <p>${esc(C.typePageCta.body)}</p>
      <a class="btn" href="../index.html">${esc(I.startButton)}</a>
      <p class="alt-path" style="margin-top:12px;text-align:center"><a href="../q.html">${esc(I.altLink)}</a></p>
      <p class="note" style="margin-top:6px;text-align:center">${esc(I.r03)}</p>
    </div>
    <p style="margin:26px 0 0"><a class="t-back" href="../index.html">← 診断のトップへ</a></p>
  </section>
</main>
` + foot('../', ['content.js', 'common.js']);

  fs.writeFileSync(path.join(OUT, 't', `${key}.html`), html, 'utf8');
  console.log(`  t/${key}.html`);
});

/* ---------------- about.html ---------------- */
const A = C.about;
const aboutHtml =
  head({
    title: C.aboutMeta.title,
    desc: C.aboutMeta.description,
    canonical: `${SITE}/about.html`,
    ogImage: `${SITE}/ogp/yui-top-${OGPV}.png`,
    themeColor: '#c8453c',
  }) +
`
<main>
  <section class="t-hero">
    <div class="seal" aria-hidden="true" style="margin:0 0 26px">結</div>
    <p class="kicker">About</p>
    <h1>この診断について</h1>
    <p class="sub">${esc(A.lead)}</p>
    <hr class="rule">
    <h2 class="sec">この診断の位置づけ</h2>
    <p>${esc(A.position)}</p>
    ${(A.sources || []).length ? `<p class="note">参考にした研究：${(A.sources || []).map(esc).join('／')}</p>` : ''}
    <h2 class="sec">つくった人</h2>
    <p>${esc(A.profile)}</p>
    <div class="cta t-cta">
      <h2>${esc(A.closingTitle)}</h2>
      <p>${esc(A.closing)}</p>
      <a class="btn" href="index.html">${esc(A.closingButton || I.startButton)}</a>
      <p class="alt-path" style="margin-top:12px;text-align:center"><a href="q.html">${esc(I.altLink)}</a></p>
    </div>
    <p style="margin:26px 0 0"><a class="t-back" href="index.html">← 診断のトップへ</a></p>
  </section>
</main>
` + foot('', ['content.js', 'common.js']);

fs.writeFileSync(path.join(OUT, 'about.html'), aboutHtml, 'utf8');
console.log('  about.html');

console.log(`\n${C.types.length + 3} ページを生成しました。`);
