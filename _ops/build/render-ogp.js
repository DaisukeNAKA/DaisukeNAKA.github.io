/**
 * OGP画像ジェネレータ
 *
 * cards.json の定義をHTMLテンプレートへ流し込み、
 * ヘッドレスChromiumで 1200x630 のPNGとして書き出します。
 *
 * 実行:
 *   NODE_PATH=/opt/node22/lib/node_modules node _ops/build/render-ogp.js
 *
 * 前提:
 *   - playwright がグローバルに入っていること
 *   - 日本語フォントは IPAPGothic / IPAGothic のみ利用可能
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'yui', 'ogp');
const CARDS = JSON.parse(fs.readFileSync(path.join(__dirname, 'cards.json'), 'utf8'));

/* 画像バージョンは content.js の config.ogpVersion を単一の真実にします。 */
global.window = {};
require(path.join(ROOT, 'yui', 'content.js'));
const OGPV = (global.window.YUI_CONTENT.config.ogpVersion) || 'v1';

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function template(card) {
  const accent = card.accent || '#c8453c';
  /* 近黒の背景で読める明度の色。落款・罫・アクセントに使います。 */
  const mark = card.accentDark || accent;
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    width:1200px; height:630px; overflow:hidden;
    background:#0f1319;
    color:#f4f1ea;
    font-family:"IPAPGothic","IPAGothic",sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  .frame {
    position:absolute; inset:28px;
    border:1px solid rgba(244,241,234,.16);
  }
  .glow {
    position:absolute; right:-160px; top:-200px;
    width:760px; height:760px; border-radius:50%;
    background:radial-gradient(circle, ${accent}3d 0%, ${accent}00 62%);
  }
  .seal {
    position:absolute; right:92px; top:50%; transform:translateY(-50%);
    width:250px; height:250px; border-radius:50%;
    border:2px solid ${mark};
    display:flex; align-items:center; justify-content:center;
    background:${mark}14;
  }
  .seal span { font-size:116px; font-weight:700; color:${mark}; letter-spacing:0; line-height:1; }
  .body { position:absolute; left:96px; top:0; bottom:0; width:660px; display:flex; flex-direction:column; justify-content:center; }
  /* IPAGothicは実質1ウェイトで、合成ボールドは56px未満だと漢字のふところが潰れます。
     小さい文字は必ず400にし、格は字間と余白で出します。 */
  /* キッカーは「これが何か」を伝える唯一の行です。タイムラインでは約360px幅まで縮むため、
     アクセント色（近黒背景でコントラスト比2:1を割る型がある）ではなく、明るい固定色で出します。 */
  .kicker {
    font-size:29px; letter-spacing:.18em; color:rgba(244,241,234,.82);
    font-weight:400; margin-bottom:26px;
  }
  .headline {
    font-size:${card.headlineSize || 64}px; font-weight:700; line-height:1.34;
    letter-spacing:.02em; white-space:pre-line;
  }
  .sub {
    margin-top:24px; font-size:33px; line-height:1.66; letter-spacing:.03em;
    color:rgba(244,241,234,.86); white-space:pre-line; font-weight:400;
  }
  .rule { margin-top:30px; width:76px; height:3px; background:${mark}; }
  .foot {
    position:absolute; left:96px; bottom:62px;
    font-size:23px; letter-spacing:.12em; color:rgba(244,241,234,.62); font-weight:400;
  }
</style></head><body>
  <div class="glow"></div>
  <div class="frame"></div>
  <div class="seal"><span>結</span></div>
  <div class="body">
    <div class="kicker">${esc(card.kicker)}</div>
    <div class="headline">${esc(card.headline)}</div>
    <div class="rule"></div>
    <div class="sub">${esc(card.sub)}</div>
  </div>
  <div class="foot">${esc(card.foot)}</div>
</body></html>`;
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 2,   // Linux の Chromium では輪郭の滑らかさがこれで決まります
  });

  for (const card of CARDS) {
    await page.setContent(template(card), { waitUntil: 'load' });
    const file = path.join(OUT_DIR, `${card.slug}-${OGPV}.png`);
    await page.screenshot({ path: file });
    const kb = Math.round(fs.statSync(file).size / 1024);
    console.log(`  ${card.slug}-${OGPV}.png  ${kb}KB`);
  }

  await browser.close();
  console.log(`\n${CARDS.length} 枚を ${path.relative(ROOT, OUT_DIR)} に出力しました。`);
})().catch((err) => {
  console.error('render-ogp failed:', err);
  process.exit(1);
});
