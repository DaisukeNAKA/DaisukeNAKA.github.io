/**
 * 実機（ヘッドレスChromium）での通し確認
 *
 *   npx http-server -p 8899 -s .          # 別のターミナルで
 *   NODE_PATH=/opt/node22/lib/node_modules node _ops/test/browser.js
 *
 * 手書きの診断（index.html）は、CDP のタッチ入力で実際に「結」を書いて確かめます。
 * iOS の実機の挙動（戻るジェスチャー、pointercancel、筆圧の値など）はここでは確認できません。
 * 公開前に実機で確かめる項目は _ops/playbook/50 にあります。
 *
 * 環境変数  YUI_BASE  対象URL（既定 http://127.0.0.1:8899/yui/）
 */
'use strict';

const path = require('path');
const { chromium } = require('playwright');

const BASE = process.env.YUI_BASE || 'http://127.0.0.1:8899/yui/';
const ORIGIN = new URL(BASE).origin;
const ROOT = path.resolve(__dirname, '..', '..');

global.window = {};
require(path.join(ROOT, 'yui', 'content.js'));
const C = global.window.YUI_CONTENT;
const NAMES = C.types.map((t) => t.name);

let fail = 0;
const ok = (m) => console.log('  ok   ' + m);
const ng = (m, d) => { console.log('  NG   ' + m + (d ? ' :: ' + d : '')); fail++; };
const check = (m, cond, d) => (cond ? ok(m) : ng(m, d));
const head = (m) => console.log('\n' + m);

/* ---------- 「結」の字形（枠の一辺=1。テスト専用の手作り折れ線） ---------- */
const YUI_SHAPE = [
  [[0.30, 0.12], [0.22, 0.28], [0.30, 0.33]],
  [[0.34, 0.22], [0.18, 0.46], [0.36, 0.43]],
  [[0.33, 0.36], [0.37, 0.46]],
  [[0.27, 0.45], [0.27, 0.88]],
  [[0.20, 0.60], [0.16, 0.72]],
  [[0.31, 0.66], [0.37, 0.72]],
  [[0.48, 0.24], [0.86, 0.24]],
  [[0.67, 0.12], [0.67, 0.42]],
  [[0.54, 0.40], [0.80, 0.40]],
  [[0.53, 0.54], [0.53, 0.84]],
  [[0.53, 0.54], [0.81, 0.54], [0.81, 0.84]],
  [[0.53, 0.84], [0.81, 0.84]],
];
const ICHI = [[[0.15, 0.5], [0.85, 0.5]]];

function resample(poly, n) {
  const segs = [];
  let L = 0;
  for (let i = 1; i < poly.length; i++) {
    const d = Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]);
    segs.push(d); L += d;
  }
  const out = [];
  for (let k = 0; k < n; k++) {
    let s = (L * k) / (n - 1), i = 0;
    while (i < segs.length - 1 && s > segs[i]) { s -= segs[i]; i++; }
    const r = segs[i] ? Math.min(1, s / segs[i]) : 0;
    out.push([poly[i][0] + (poly[i + 1][0] - poly[i][0]) * r, poly[i][1] + (poly[i + 1][1] - poly[i][1]) * r]);
  }
  return out;
}

/* 枠の上に、CDP のタッチ入力で字を書きます。戻り値は書く前後の scrollY。 */
async function write(page, shape, { stepMs = 9, pauseMs = 70, holdMs = 90, shift = [0, 0] } = {}) {
  const cdp = await page.context().newCDPSession(page);
  const box = await page.locator('#cv').boundingBox();
  const y0 = await page.evaluate(() => window.scrollY);
  for (const poly of shape) {
    const pts = resample(poly, 14).map(([x, y]) => ({
      x: box.x + (x + shift[0]) * box.width, y: box.y + (y + shift[1]) * box.height,
    }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pts[0]] });
    for (let i = 1; i < pts.length; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pts[i]] });
      await page.waitForTimeout(stepMs);
    }
    await page.waitForTimeout(holdMs);   // 止めてから離す（とめ）
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(pauseMs);
  }
  const y1 = await page.evaluate(() => window.scrollY);
  await cdp.detach();
  return { y0, y1 };
}

async function writeAndFinish(page, opts = {}) {
  await page.waitForSelector('#write:not([hidden])');
  await page.waitForTimeout(150);
  const sc = await write(page, YUI_SHAPE, opts);
  await page.click('#w-done');
  return sc;
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const external = [];
  const mkCtx = () => browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0',
  });
  const watch = (p) => {
    p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') { errors.push('console: ' + m.text()); } });
    p.on('request', (r) => { if (!r.url().startsWith(ORIGIN) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) { external.push(r.url()); } });
  };

  const ctx = await mkCtx();
  const page = await ctx.newPage();
  watch(page);

  /* ---------------- 導入 ---------------- */
  head('■ 手書き版の導入');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const csp = await page.getAttribute('meta[http-equiv="Content-Security-Policy"]', 'content');
  check('CSP で外部への通信を止めている', !!csp && /connect-src 'none'/.test(csp), csp);
  const introText = await page.textContent('#intro');
  check('運営者の明示（R01）が見出しの直下にある', introText.includes(C.hw.intro.r01));
  check('遊びの診断である旨（R02）がある', introText.includes(C.hw.intro.r02));
  check('送信しない旨（R03）がある', introText.includes(C.hw.intro.r03));
  check('書かずに受ける経路（R06）がある', (await page.getAttribute('#alt-quiz-intro', 'href')) === 'q.html');

  /* ---------------- 書く → 属性 → 結果 ---------------- */
  head('■ 「結」を書いて結果まで');
  await page.click('#start');
  await page.waitForSelector('#write:not([hidden])');
  check('書かずに受ける経路が枠より前にある',
    await page.evaluate(() => !!(document.getElementById('alt-quiz').compareDocumentPosition(document.getElementById('cv')) & Node.DOCUMENT_POSITION_FOLLOWING)));
  check('書く前は「書けた」が押せない', await page.isDisabled('#w-done'));
  const sc = await writeAndFinish(page);
  check('書いている間に画面がスクロールしない', sc.y0 === sc.y1, `${sc.y0} → ${sc.y1}`);
  await page.waitForSelector('#gate:not([hidden])', { timeout: 5000 });
  check('書いたあとに属性の1問が出る', await page.isVisible('#gate'));
  await page.click('#g-opts .opt >> nth=0');
  await page.waitForSelector('#result:not([hidden])', { timeout: 5000 });
  const name = (await page.textContent('#r-name')).trim();
  check('4タイプのどれかが出る', NAMES.some((n) => name.includes(n)), name);
  const resText = await page.textContent('#result');
  check('型名の直下に R07 がある（畳まない）', await page.isVisible('.r07'));
  check('R08 がある', resText.includes(C.hw.result.r08));
  check('自分の字が描き直される', (await page.locator('.yui-ink path.ink').count()) >= 8);
  check('測定値が並ぶ', (await page.locator('.m-list .m-row').count()) >= 4);
  check('2軸マップが出る', await page.isVisible('.map'));
  check('筆圧などを使っていない旨がある', resText.includes(C.hw.result.notUsed));
  check('コメントCTAが出る', (await page.locator('#cp-type').count()) === 1);
  check('無料相談CTAが出る（活動中の層）', (await page.locator('#dm-copy').count()) === 1);
  check('LINEのCTAが設定どおりに出る', (await page.locator('#line-go').count()) === (C.config.lineUrl ? 1 : 0));
  check('2回目を書く案内が出る', (await page.locator('#write-2').count()) === 1);
  check('差し込み語が残っていない', !/\{[a-zA-Z0-9_]+\}/.test(resText), (resText.match(/\{[a-zA-Z0-9_]+\}/) || [''])[0]);
  check('未定義値が描画されない', !/undefined|NaN|\[object/.test(resText));
  check('点数を出していない', !/スコア|点／|\/ 100/.test(resText));
  check('「低い」と判定していない', !/低い|低め/.test(resText));
  const selfUrl = page.url();

  /* ---------------- 画像の保存 ---------------- */
  head('■ 画像（押したときだけ端末の中で作る）');
  check('押す前は画像が無い', (await page.locator('.save-img-out').count()) === 0);
  await page.click('#save-img');
  await page.waitForTimeout(200);
  const src = await page.getAttribute('.save-img-out', 'src');
  check('押すと画像ができる（data URL）', !!src && src.startsWith('data:image/png'));

  /* ---------------- 2回目 ---------------- */
  head('■ 2回目を書いて平均する');
  await page.click('#write-2');
  await writeAndFinish(page, { holdMs: 20 });
  await page.waitForSelector('#result:not([hidden])', { timeout: 5000 });
  const name2 = (await page.textContent('#r-name')).trim();
  check('2回目のあとも結果が出る', NAMES.some((n) => name2.includes(n)), name2);
  check('2回目のあとは案内が消える', (await page.locator('#write-2').count()) === 0);

  /* ---------------- 再読み込み・共有 ---------------- */
  head('■ 再読み込みと共有リンク');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#result:not([hidden])', { timeout: 5000 });
  const reText = await page.textContent('#result');
  check('再読み込みしても結果が出る', NAMES.some((n) => reText.includes(n)));
  check('自分の結果に共有バナーは出ない', (await page.locator('.shared-bar').count()) === 0);
  check('線は保存していないので、描き直しは出ない', (await page.locator('.yui-ink path.ink').count()) === 0);
  const ctx2 = await mkCtx();
  const p2 = await ctx2.newPage();
  watch(p2);
  await p2.goto(page.url(), { waitUntil: 'networkidle' });
  await p2.waitForSelector('#result:not([hidden])', { timeout: 5000 });
  check('他の人が開くと共有バナーが出る', (await p2.locator('.shared-bar').count()) === 1);
  check('共有では無料相談を押しつけない', (await p2.locator('#dm-copy').count()) === 0);
  for (const bad of ['#/r/zzz', '#/r/' + 'a'.repeat(64), '#/r/../../x', '#/write2', '#/gate']) {
    await p2.goto('about:blank');
    await p2.goto(BASE + bad, { waitUntil: 'networkidle' });
    const safe = (await p2.isVisible('#intro')) || (await p2.isVisible('#write'));
    check(`不正・先回りのURL（${bad.slice(0, 16)}）で壊れない`, safe);
  }
  await ctx2.close();

  /* ---------------- 書き直し・妥当性 ---------------- */
  head('■ 書き直しと、字として読めないとき');
  await page.goto(BASE + '#/write', { waitUntil: 'networkidle' });
  await page.goto('about:blank');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.click('#start');
  await page.waitForSelector('#write:not([hidden])');
  await write(page, ICHI);
  await page.click('#w-done');
  await page.waitForTimeout(200);
  check('「一」だけでは診断に進まない', await page.isVisible('#write'));
  check('書き直しを促す文が出る', await page.isVisible('#w-problem'));
  await page.click('#w-undo');
  check('一画戻すと「書けた」が押せなくなる', await page.isDisabled('#w-done'));
  await write(page, YUI_SHAPE.slice(0, 3));
  await page.click('#w-clear');
  check('全部消すと「書けた」が押せなくなる', await page.isDisabled('#w-done'));

  /* ---------------- 属性による出し分け ---------------- */
  head('■ 属性による出し分け');
  await write(page, YUI_SHAPE);
  await page.click('#w-done');
  await page.waitForSelector('#gate:not([hidden])');
  await page.click('#g-opts .opt >> nth=3');
  await page.waitForSelector('#result:not([hidden])');
  check('活動していない層に無料相談CTAを出さない', (await page.locator('#dm-copy').count()) === 0);
  check('コメントCTAは出す', (await page.locator('#cp-type').count()) === 1);

  /* ---------------- 履歴 ---------------- */
  head('■ 戻る操作と履歴');
  await page.goto('about:blank');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const h0 = await page.evaluate(() => history.length);
  await page.click('#start');
  await writeAndFinish(page);
  await page.waitForSelector('#gate:not([hidden])');
  await page.click('#g-opts .opt >> nth=0');
  await page.waitForSelector('#result:not([hidden])');
  const h1 = await page.evaluate(() => history.length);
  check(`結果まで進んでも履歴が増えすぎない（差 ${h1 - h0}）`, (h1 - h0) <= 1);
  await page.goBack(); await page.waitForTimeout(400);
  check('結果からバック1回で導入へ', await page.isVisible('#intro'));

  /* ---------------- 10問版 ---------------- */
  head('■ 書かずに受ける10問版');
  const qp = await ctx.newPage();
  watch(qp);
  await qp.goto(BASE + 'q.html', { waitUntil: 'networkidle' });
  await qp.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await qp.goto(BASE + 'q.html', { waitUntil: 'networkidle' });
  await qp.click('#start');
  await qp.waitForSelector('#gate:not([hidden])');
  await qp.click('#g-opts .opt >> nth=0');
  for (let i = 0; i < C.quiz.questions.length; i++) {
    await qp.waitForSelector('#q-opts .opt');
    await qp.click('#q-opts .opt >> nth=' + (i % 4));
    await qp.waitForTimeout(330);
  }
  await qp.waitForSelector('#result:not([hidden])', { timeout: 8000 });
  const qText = await qp.textContent('#result');
  check('10問版でも4タイプのどれかが出る', NAMES.some((n) => qText.includes(n)));
  check('10問版でも点数を出さない', (await qp.locator('.score-num').count()) === 0 && !/結スコア/.test(qText));
  check('10問版から手書きへ戻れる', (await qp.getAttribute('#to-hw', 'href')) === 'index.html');
  check('10問版の結果ハッシュが5文字', /^#\/r\/[a-z2-7]{5}$/.test(new URL(qp.url()).hash));
  check('10問版に差し込み語が残っていない', !/\{[a-zA-Z0-9_]+\}/.test(qText));

  /* ---------------- 静的ページ ---------------- */
  head('■ 静的ページ');
  for (const t of C.types) {
    const key = String(t.key).replace(/[^A-Za-z0-9_-]/g, '');
    const res = await page.goto(BASE + 't/' + key + '.html', { waitUntil: 'networkidle' });
    check(`t/${key}.html が開ける`, res.status() === 200);
    check('  フッターが描画される', (await page.textContent('#site-footer')).includes(C.footer.r09.slice(0, 12)));
  }
  const abt = await page.goto(BASE + 'about.html', { waitUntil: 'networkidle' });
  check('about.html が開ける', abt.status() === 200);

  head('■ 通信とJSエラー');
  check('外部への通信が1件も無い', external.length === 0, external.slice(0, 3).join(' | '));
  check('JSエラーなし', errors.length === 0, errors.slice(0, 5).join(' | '));

  await browser.close();
  console.log('\n' + '─'.repeat(52));
  console.log(fail ? `NG ${fail}件` : 'すべて通過');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('\n実行中に例外が発生しました:', e.message);
  console.error('サーバーが起動しているか確認してください（npx http-server -p 8899 -s .）');
  process.exit(1);
});
