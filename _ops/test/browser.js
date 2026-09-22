/**
 * 実機（ヘッドレスChromium）での通し確認
 *
 *   npx http-server -p 8899 -s .          # 別のターミナルで
 *   NODE_PATH=/opt/node22/lib/node_modules node _ops/test/browser.js
 *
 * check.js が「データとして正しいか」を見るのに対して、
 * こちらは「画面として動くか」を見ます。過去に実際に出たバグの回帰も含みます。
 *
 * 環境変数
 *   YUI_BASE  対象URL（既定 http://127.0.0.1:8899/yui/）
 */
'use strict';

const path = require('path');
const { chromium } = require('playwright');

const BASE = process.env.YUI_BASE || 'http://127.0.0.1:8899/yui/';
const ROOT = path.resolve(__dirname, '..', '..');

global.window = {};
require(path.join(ROOT, 'yui', 'content.js'));
const C = global.window.YUI_CONTENT;
const Q = C.questions;
const NAMES = { sekkei: '設計型', kyomei: '共鳴型', suishin: '推進型', chokkan: '直感型' };

let fail = 0;
const ok = (m) => console.log('  ok   ' + m);
const ng = (m, d) => { console.log('  NG   ' + m + (d ? ' :: ' + d : '')); fail++; };
const check = (m, cond, d) => (cond ? ok(m) : ng(m, d));
const head = (m) => console.log('\n' + m);

/* 目的の象限へ最も強く倒れる選択肢を各問で選ぶ */
function pickFor(target) {
  return Q.map((q) => {
    let best = 0, bestScore = -99;
    q.options.forEach((o, i) => {
      const k = (o.x < 0) ? ((o.y < 0) ? 'sekkei' : 'suishin')
                          : ((o.y < 0) ? 'kyomei' : 'chokkan');
      if (k === target) {
        const s = Math.abs(o.x) + Math.abs(o.y);
        if (s > bestScore) { bestScore = s; best = i; }
      }
    });
    return best;
  });
}

async function answer(page, { qualify = 0, picks = null, count = Q.length } = {}) {
  await page.click('#start');
  await page.waitForSelector('#gate:not([hidden])');
  await page.click(`#g-opts .opt >> nth=${qualify}`);
  await page.waitForSelector('#quiz:not([hidden])');
  for (let i = 0; i < count; i++) {
    await page.waitForSelector('#q-opts .opt');
    await page.click(`#q-opts .opt >> nth=${picks ? picks[i] : 0}`);
    await page.waitForTimeout(330);
  }
}
const readStore = (p) =>
  p.evaluate(() => { try { return localStorage.getItem('yui.v1.progress'); } catch (e) { return null; } });

(async () => {
  const browser = await chromium.launch();
  const errors = [];

  /* ---------------- 4タイプの判定 ---------------- */
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
      '(KHTML, like Gecko) Mobile/15E148 Instagram 300.0',
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') { errors.push('console: ' + m.text()); } });

  for (const target of Object.keys(NAMES)) {
    head(`■ ${NAMES[target]} の判定`);
    await page.goto('about:blank');
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await answer(page, { picks: pickFor(target) });
    await page.waitForSelector('#result:not([hidden])', { timeout: 8000 });

    check('判定が ' + NAMES[target], (await page.textContent('#r-name')).trim() === NAMES[target]);
    check('結スコアが数値', /^\d+$/.test((await page.textContent('.score-num')).trim()));
    check('2軸マップが描画される', await page.isVisible('.map'));
    check('処方箋が出る', await page.isVisible('.rx'));
    check('コメントCTAが出る', (await page.locator('#cp-type').count()) === 1);
    check('無料相談CTAが出る（活動中の層）', (await page.locator('#dm-copy').count()) === 1);
    check('アプリ内ブラウザ向けの案内が出る', (await page.textContent('#result')).includes('左上の'));
    check('結果ハッシュが5文字', /^#\/r\/[a-z2-7]{5}$/.test(new URL(page.url()).hash));
    const shareHref = await page.getAttribute('#sh-x', 'href');
    check('シェア先が今のドメインを指す（移設しても壊れない）',
      decodeURIComponent(shareHref).includes(new URL(BASE).origin));
    const body = await page.textContent('body');
    check('投稿側キーワードが露出しない', !body.includes(C.config.postKeyword));
    check('未定義値が描画されない', !/undefined|NaN|\[object/.test(body));
  }

  /* ---------------- 属性による出し分け ---------------- */
  head('■ 属性による出し分け');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await answer(page, { qualify: 3, picks: pickFor('suishin') });   // いまは活動していない
  await page.waitForSelector('#result:not([hidden])');
  check('活動していない層に無料相談CTAを出さない', (await page.locator('#dm-copy').count()) === 0);
  check('コメントCTAは出す', (await page.locator('#cp-type').count()) === 1);
  const sharedUrl = page.url();

  /* ---------------- 共有リンク ---------------- */
  head('■ 共有リンク');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto('about:blank');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await answer(page, { qualify: 2, picks: pickFor('kyomei'), count: 3 });   // 3問で中断
  const before = await readStore(page);
  check('途中回答が保存される', !!before && JSON.parse(before).a.indexOf(-1) > 0);
  await page.goto('about:blank');
  await page.goto(sharedUrl, { waitUntil: 'networkidle' });
  check('共有バナーが出る', (await page.textContent('#result')).includes('共有された診断結果'));
  check('閲覧者の途中回答を壊さない', (await readStore(page)) === before);

  /* ---------------- 自分の結果のリロード ---------------- */
  head('■ 自分の結果のリロード');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await answer(page, { picks: pickFor('chokkan') });
  await page.waitForSelector('#result:not([hidden])');
  check('自分の結果に共有バナーは出ない', !(await page.textContent('#result')).includes('共有された診断結果'));
  await page.reload({ waitUntil: 'networkidle' });
  check('リロード後も自分の結果扱い', !(await page.textContent('#result')).includes('共有された診断結果'));
  check('ボタンは「もう一度受ける」', (await page.textContent('#retake')).includes('もう一度受ける'));

  /* ---------------- 完走後の再訪 ---------------- */
  head('■ 完走後の再訪');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  check('再開バーは出ない', (await page.locator('#resume').count()) === 0);
  await page.click('#start');
  await page.waitForTimeout(400);
  check('最終問ではなく最初から始まる', await page.isVisible('#gate'));

  /* ---------------- 戻る操作と履歴 ---------------- */
  head('■ 戻る操作と履歴');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await answer(page, { count: 2 });
  check('3問目にいる', (await page.textContent('#q-now')) === '3');
  await page.click('#q-back'); await page.waitForTimeout(300);
  check('戻るで2問目', (await page.textContent('#q-now')) === '2');
  await page.click('#q-back'); await page.waitForTimeout(300);
  await page.click('#q-back'); await page.waitForTimeout(300);
  check('1問目から戻ると属性設問', await page.isVisible('#gate'));
  const h0 = await page.evaluate(() => history.length);
  await page.click('#g-opts .opt >> nth=0');
  await page.waitForSelector('#quiz:not([hidden])');
  for (let i = 0; i < Q.length; i++) {
    await page.waitForSelector('#q-opts .opt');
    await page.click('#q-opts .opt >> nth=0');
    await page.waitForTimeout(330);
  }
  await page.waitForSelector('#result:not([hidden])');
  const h1 = await page.evaluate(() => history.length);
  check(`設問を進めても履歴が増えない（差 ${h1 - h0}）`, (h1 - h0) <= 1);
  await page.goBack(); await page.waitForTimeout(400);
  check('結果からバック1回で導入へ', await page.isVisible('#intro'));

  /* ---------------- 途中復帰 ---------------- */
  head('■ 途中復帰');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await answer(page, { count: 4 });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  check('再開バーが出る', (await page.locator('#resume').count()) === 1);
  await page.click('#resume'); await page.waitForTimeout(400);
  check('続きの設問から再開する', (await page.textContent('#q-now')) === '5');

  /* ---------------- 不正な入力 ---------------- */
  head('■ 不正な入力');
  for (const [hash, label] of [['#/r/zzzzz', '範囲外のコード'], ['#/r/aa11a', '不正な文字'],
                               ['#/r/aaa', '短いコード'], ['#/q/99', '範囲外の設問番号']]) {
    await page.goto('about:blank');
    await page.goto(BASE + hash, { waitUntil: 'networkidle' });
    const safe = (await page.isVisible('#intro')) || (await page.isVisible('#gate'));
    check(label + ' で壊れない', safe);
  }
  for (const bad of ['constructor', 'toString', 'valueOf', 'hasOwnProperty']) {
    await page.goto(BASE + '?s=' + bad, { waitUntil: 'networkidle' });
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await page.goto(BASE + '?s=' + bad, { waitUntil: 'networkidle' });
    await answer(page, {});
    await page.waitForSelector('#result:not([hidden])');
    const href = await page.evaluate(() => {
      const e = document.getElementById('back-post');
      return e ? e.getAttribute('href') : null;
    });
    check(`?s=${bad} で壊れたリンクが出ない`, href === null || /^https?:\/\//.test(href));
  }

  /* ---------------- 共有シートが遅いとき ---------------- */
  head('■ 共有シートが遅いとき（勝手にコピーへ落ちない）');
  const slow = await browser.newContext();
  const sp = await slow.newPage();
  await sp.addInitScript(() => { navigator.share = () => new Promise((r) => setTimeout(r, 3000)); });
  await sp.goto(BASE, { waitUntil: 'networkidle' });
  await answer(sp, {});
  await sp.waitForSelector('#result:not([hidden])');
  await sp.click('#sh-native');
  await sp.waitForTimeout(2000);   // ウォッチドッグ1400msを超えて待つ
  check('共有中にクリップボードを上書きしない',
    !(await sp.evaluate(() => document.getElementById('toast').classList.contains('on'))));
  await slow.close();

  /* ---------------- 静的ページ ---------------- */
  head('■ 静的ページ');
  for (const t of C.types) {
    const key = String(t.key).replace(/[^A-Za-z0-9_-]/g, '');
    const res = await page.goto(BASE + 't/' + key + '.html', { waitUntil: 'networkidle' });
    check(`t/${key}.html が開ける`, res.status() === 200);
    check(`  フッターが描画される`, (await page.textContent('#site-footer')).includes('制作・運営'));
  }
  const abt = await page.goto(BASE + 'about.html', { waitUntil: 'networkidle' });
  check('about.html が開ける', abt.status() === 200);

  head('■ JSエラー');
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
