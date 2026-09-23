/**
 * 手書きエンジン（yui/hw-engine.js）のテスト
 *
 *   node _ops/test/hw-engine.test.js
 *
 * ブラウザは不要です。node だけで動きます。
 * 合成の「結」（_ops/test/synth.js）を書かせて、特徴量・妥当性チェック・採点・シェア文字列が
 * 仕様どおりに動くか、端末差（キャンバスの大きさ・点の間隔）や書き順で結果がぶれないかを確かめます。
 * あわせて、結果に使わないと約束したもの（ふるえ・途中の長い間・迷いタップ）が型に漏れないか、
 * 「結」でない入力や壊れた入力で落ちたり止まったりしないかも確かめます。
 * 合成データは人の指の実データではありません。ここで通っても、実機の確認は別に必要です。
 *
 * 落ちたら（NG）公開しないでください。終了コードは NG があれば 1 です。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const HW = require('../../yui/hw-engine.js');
const SY = require('./synth.js');

let fail = 0;
let pass = 0;
const ok = (m) => { console.log('  ok   ' + m); pass++; };
const ng = (m, d) => { console.log('  NG   ' + m + (d ? '\n         ' + d : '')); fail++; };
const head = (m) => console.log('\n' + m);
const check = (cond, m, d) => (cond ? ok(m) : ng(m, d));
const J = (o) => JSON.stringify(o);
const CORNER_KEYS = ['f9', 'f10'];

const run = (p) => HW.analyze(SY.synth(p), { side: (p && p.side) || SY.DEFAULTS.side });
const num = (f, k) => {
  const v = f[k];
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') return v.ratio !== undefined ? v.ratio : v.v;
  return v;
};
const state = (f, k) => (f[k] ? f[k].state : null);
const SEEDS = [1, 2, 3, 4, 5, 6];

/* 形の特徴（大きさ・点の間隔・書き順に依らないはずのもの）と、許す差 */
const SHAPE_TOL = { f2: 0.02, f3: 1, f7: 0.02, f12: 1, f13: 0.05 };
function sameShape(a, b, tol) {
  const diffs = [];
  ['f1', 'f9', 'f10', 'f11'].forEach((k) => { if (state(a, k) !== state(b, k)) diffs.push(`${k}: ${state(a, k)} ≠ ${state(b, k)}`); });
  if (a.f4 !== b.f4) diffs.push(`f4: ${a.f4} ≠ ${b.f4}`);
  Object.keys(tol).forEach((k) => {
    const x = num(a, k), y = num(b, k);
    if (x === null || y === null) { if (x !== y) diffs.push(`${k}: ${x} ≠ ${y}`); return; }
    if (Math.abs(x - y) > tol[k] + 1e-9) diffs.push(`${k}: ${x} と ${y}（許容 ±${tol[k]}）`);
  });
  return diffs;
}

/* 採点のテスト用の較正（手で決めた値。合成の較正とは別） */
const CAL = {
  features: {
    f1: { median: -1, scale: 0.74 }, f2: { median: 0.08, scale: 0.04 }, f3: { median: 1.5, scale: 0.74 },
    f4: { median: 0, scale: 0.74 }, f5: { median: 140, scale: 75 }, f6: { median: 1.0, scale: 0.3 },
    f7: { median: 0.05, scale: 0.1 }, f8: { median: 0.45, scale: 0.07 }, f9: { median: -1, scale: 0.5 },
    f10: { median: -1, scale: 0.5 }, f11: { median: 0.03, scale: 0.02 }, f12: { median: 4, scale: 3 },
    f13: { median: 0, scale: 0.2 }
  },
  weights: { x: { f1: 0.40, f2: 0.30, f3: 0.15, f4: 0.15 }, y: { f5: 0.35, f6: 0.30, f7: 0.20, f8: 0.15 } },
  dirs: { f1: +1, f2: +1, f3: +1, f4: +1, f5: -1, f6: +1, f7: -1, f8: -1 },
  center: { x: -0.1, y: 0 },
  boundary: 0.25
};
const MID = { f1: { state: 'ambiguous', ratio: 1.5 }, f2: 0.08, f3: 1.5, f4: 0, f5: 140, f6: 1.0, f7: 0.05, f8: 0.45,
  f9: { state: 'closed', ratio: 0.2 }, f10: { state: 'closed', ratio: 0.1 }, f11: { state: 'kaku', v: 0.02 }, f12: 4, f13: 0, f14: 0.55 };
const w = (o) => Object.assign({}, MID, o);

/* ============================================================ 作り */
head('■ ファイルの作り（プライバシー・ES5）');
{
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'yui', 'hw-engine.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const banned = [
    ['Date', /\bDate\b/], ['Math.random', /Math\.random/], ['fetch', /\bfetch\s*\(/], ['XMLHttpRequest', /XMLHttpRequest/],
    ['sendBeacon', /sendBeacon/], ['WebSocket', /WebSocket/], ['localStorage', /localStorage|sessionStorage|indexedDB/],
    ['document', /\bdocument\b/], ['window', /\bwindow\b/], ['navigator', /\bnavigator\b/], ['Math.hypot', /Math\.hypot/]
  ].filter(([, re]) => re.test(code)).map(([n]) => n);
  check(!banned.length, '時刻・乱数・通信・保存・DOM を使っていません', banned.join(', '));
  const es6 = [['=>', /=>/], ['let', /\blet\s/], ['const', /\bconst\s/], ['テンプレート文字列', /`/], ['class', /\bclass\s/]]
    .filter(([, re]) => re.test(code)).map(([n]) => n);
  check(!es6.length, 'ES5 の書き方だけです（古いアプリ内ブラウザ向け）', es6.join(', '));
  check(HW.TEMPLATE.length === 12 && HW.TEMPLATE.every((s, i) => s.n === i + 1 &&
    s.part === (i < 6 ? 'ito' : 'ki') && ['h', 'v', 'd', 'box'].indexOf(s.kind) >= 0 &&
    s.pts.every((q) => q[0] >= 0 && q[0] <= 1 && q[1] >= 0 && q[1] <= 1)),
    'お手本は自作の12画（糸へん 1〜6、吉 7〜12、座標は 0〜1）');
}

/* ============================================================ 決定性 */
head('■ 同じ線からは同じ結果');
{
  const strokes = SY.synth({ seed: 11 });
  const a = HW.analyze(strokes, { side: 320 });
  const b = HW.analyze(JSON.parse(J(strokes)), { side: 320 });
  check(J(a) === J(b), 'analyze() を2回呼んでも同じ JSON');
  check(J(SY.synth({ seed: 11 })) === J(strokes), '合成データも同じ種から同じ線');
  const keys = Object.keys(a.feats).join(',');
  check(keys === HW.FEATURES.join(','), 'feats のキーは f1〜f14 のちょうど14個', keys);
  check(a.ok && a.problems.length === 0 && a.nStrokes === 12 && a.totalMs >= 1200, `標準の「結」は妥当（12画・${a.totalMs}ms）`, J(a.problems));
  const roundOk = (v, step) => v === null || Math.abs(Math.round(v / step) * step - v) < 1e-9;
  const f = a.feats;
  check(roundOk(f.f3, 0.5) && roundOk(f.f12, 0.5) && roundOk(f.f5, 10) && roundOk(f.f2, 0.01) &&
    roundOk(f.f6, 0.01) && roundOk(f.f7, 0.01) && roundOk(f.f8, 0.01) && roundOk(f.f1.ratio, 0.01) &&
    Number.isInteger(f.f4) && roundOk(f.f13, 0.01) && roundOk(f.f14, 0.01),
    '返す前に丸めています（角度 0.5°・比 0.01・時間 10ms）', J(f));
  const m = a.marks;
  const inUnit = (p) => Array.isArray(p) && p.length === 2 && p.every((v) => v >= 0 && v <= 1);
  check(inUnit(m.kouUL) && inUnit(m.kouLL) && inUnit(m.kouLR) && m.gap && m.gap.x0 < m.gap.x1 &&
    m.slant && inUnit(m.slant[0]) && inUnit(m.slant[1]) && m.stops.length === 5 &&
    m.stops.every((s) => typeof s.stop === 'boolean' && s.x >= 0 && s.x <= 1),
    '結果パネル用の印（口の3点・すき間の帯・横画の線・とめ5画）がキャンバス座標で返ります', J(m));
  const again = HW.analyze(strokes.slice().reverse(), { side: 320 });
  check(J(again) === J(a), '画の配列の並び順が違っても同じ結果（時刻で並べ直すため）');
}

/* ============================================================ 大きさ */
head('■ キャンバスの大きさ・字の大きさに依らない');
{
  const bad = [];
  SEEDS.forEach((seed) => {
    const a = run({ seed, side: 300 }), b = run({ seed, side: 400 });
    sameShape(a.feats, b.feats, { f2: 0.01, f3: 0.5, f7: 0.01, f12: 0.5, f13: 0.02 }).forEach((d) => bad.push(`seed ${seed}: ${d}`));
    const c = run({ seed, side: 300, jitterPx: 0 }), e = run({ seed, side: 400, jitterPx: 0 });
    if (J(c.feats) !== J(e.feats)) bad.push(`seed ${seed}（揺れなし）: ${J(c.feats)} ≠ ${J(e.feats)}`);
  });
  check(!bad.length, 'キャンバス 300px と 400px で、形の特徴が丸めの1目盛り以内（揺れなしなら f5 も含めて一致）', bad.slice(0, 4).join('\n         '));

  // 画面の回転でキャンバスを作り直した場合：同じ正規化座標の線を、別の side で渡す（brief：完全一致）
  const badR = [];
  const scalePx = (st, k) => st.map((x) => ({ points: x.points.map((p) => ({ x: p.x * k, y: p.y * k, t: p.t })) }));
  for (let seed = 1; seed <= 12; seed++) {
    const st = SY.synth({ seed, stopMs: 60 + 10 * seed });
    const a = HW.analyze(st, { side: 320 });
    [2, 0.5, 0.75, 1.25].forEach((k) => {
      const b = HW.analyze(scalePx(st, k), { side: 320 * k });
      if (J(a.feats) !== J(b.feats) || J(a.marks) !== J(b.marks) || a.ok !== b.ok) badR.push(`seed ${seed} ×${k}: ${J(a.feats)} ≠ ${J(b.feats)}`);
    });
  }
  check(!badR.length, '同じ正規化座標の線なら、side を ×0.5〜×2 にしても特徴（f5 を含む）ととめの印が完全に一致', badR.slice(0, 3).join('\n         '));

  const bad2 = [];
  SEEDS.forEach((seed) => {
    // 口：左上は閉、左下は開、右下は閉（どちらの大きさでもはっきり分かるように、画ごとのゆらぎは小さく）。
    // 接筆は「画面に描いた線の太さ」で判定するので、ぎりぎりのすき間は字の大きさで判定が変わるのが仕様です。
    const p = { seed, kouUL: -0.01, kouLL: 0.12, kouLR: -0.01, hJitterDeg: 0.5, rotNoiseDeg: 0.5 };
    const a = run(Object.assign({ scale: 0.5 }, p)), b = run(Object.assign({ scale: 0.8 }, p));
    if (!a.ok || !b.ok) bad2.push(`seed ${seed}: 妥当性 ${J(a.problems)} / ${J(b.problems)}`);
    sameShape(a.feats, b.feats, SHAPE_TOL).forEach((d) => bad2.push(`seed ${seed}: ${d}`));
  });
  check(!bad2.length, '字の大きさ 0.5 と 0.8 で、口の開閉・転折・すき間・角度・縦横比が同じ', bad2.slice(0, 4).join('\n         '));

  // センサーの揺れを 0 にすると、大きさに依らない特徴は丸めたあとで完全に一致する
  // （口の角の ratio は「画面に描いた線の太さ」の何倍かなので、字の大きさに比例して変わるのが仕様）
  const bad3 = [];
  SEEDS.forEach((seed) => {
    const a = run({ seed, scale: 0.5, jitterPx: 0 }).feats, b = run({ seed, scale: 0.8, jitterPx: 0 }).feats;
    ['f2', 'f3', 'f4', 'f6', 'f7', 'f11', 'f12', 'f13'].forEach((k) => { if (J(a[k]) !== J(b[k])) bad3.push(`seed ${seed}: ${k} ${J(a[k])} ≠ ${J(b[k])}`); });
  });
  check(!bad3.length, '揺れなしなら、字の大きさ 0.5 と 0.8 で f2・f3・f4・f6・f7・f11・f12・f13 が丸めたあとで一致', bad3.slice(0, 4).join('\n         '));
}

/* ============================================================ 点の間隔 */
head('■ 点の間隔（60 / 120 / 240Hz）');
{
  const TIME_TOL = { f5: 30, f6: 0.05, f8: 0.02 };
  const bad = [];
  SEEDS.forEach((seed) => {
    const r = [60, 120, 240].map((hz) => run({ seed, hz }));
    for (let i = 1; i < 3; i++) {
      sameShape(r[0].feats, r[i].feats, SHAPE_TOL).forEach((d) => bad.push(`seed ${seed} 60↔${[60, 120, 240][i]}Hz: ${d}`));
      Object.keys(TIME_TOL).forEach((k) => {
        const d = Math.abs(r[0].feats[k] - r[i].feats[k]);
        if (!(d <= TIME_TOL[k] + 1e-9)) bad.push(`seed ${seed} 60↔${[60, 120, 240][i]}Hz: ${k} ${r[0].feats[k]} と ${r[i].feats[k]}`);
      });
      if (r[0].ok !== r[i].ok) bad.push(`seed ${seed}: 妥当性が変わる`);
    }
  });
  check(!bad.length, '開閉などの状態は変わらず、数値は許容差以内（f5 ±30ms、f6 ±0.05、f8 ±0.02 ほか）', bad.slice(0, 4).join('\n         '));
  // 時刻の付き方：getCoalescedEvents の点に親イベント（フレーム）の時刻が付く端末、時刻を 16.67ms に丸めるブラウザ
  const badT = [];
  const retime = (st, f) => st.map((x) => ({ points: x.points.map((p) => ({ x: p.x, y: p.y, t: f(p.t) })) }));
  SEEDS.forEach((seed) => {
    const st = SY.synth({ seed, hz: 240 }), a = HW.analyze(st, { side: 320 });
    [['フレーム時刻', (t) => Math.ceil(t / (1000 / 60)) * (1000 / 60)], ['16.67ms 丸め', (t) => Math.floor(t / (1000 / 60)) * (1000 / 60)]].forEach(([nm, f]) => {
      const b = HW.analyze(retime(st, f), { side: 320 });
      sameShape(a.feats, b.feats, SHAPE_TOL).forEach((d) => badT.push(`seed ${seed} ${nm}: ${d}`));
      if (!b.ok || Math.abs(a.feats.f5 - b.feats.f5) > 30 || Math.abs(a.feats.f6 - b.feats.f6) > 0.05) badT.push(`seed ${seed} ${nm}: ok=${b.ok} f5 ${a.feats.f5}→${b.feats.f5} f6 ${a.feats.f6}→${b.feats.f6}`);
    });
  });
  check(!badT.length, '240Hz の点に 60Hz のフレーム時刻が付いても・時刻が 16.67ms に丸められても、形の特徴は許容差以内、f5 ±30ms、f6 ±0.05', badT.slice(0, 4).join('\n         '));
  const hold = run({ seed: 3, holdEvents: true }), still = run({ seed: 3 });
  check(Math.abs(hold.feats.f5 - still.feats.f5) <= 20,
    `止まっている間に位置の同じ pointermove が来る端末でも、止めの時間は同じ（${hold.feats.f5} / ${still.feats.f5}ms）`);
}

/* ============================================================ 書き順 */
head('■ 書き順に依らない（位置で画を対応づける）');
{
  const bad = [];
  SEEDS.forEach((seed) => {
    const std = run({ seed });
    ['reverse', 'kiFirst'].forEach((order) => {
      const o = run({ seed, order });
      if (!o.ok) bad.push(`seed ${seed} ${order}: ${J(o.problems)}`);
      const shapeKeys = ['f1', 'f2', 'f3', 'f4', 'f7', 'f9', 'f10', 'f11', 'f12', 'f13', 'f14'];
      shapeKeys.forEach((k) => { if (J(std.feats[k]) !== J(o.feats[k])) bad.push(`seed ${seed} ${order}: ${k} ${J(std.feats[k])} ≠ ${J(o.feats[k])}`); });
    });
  });
  check(!bad.length, '書き順を逆にしても、吉から書いても、形の特徴はまったく同じ', bad.slice(0, 4).join('\n         '));
  // 線の向き（利き手で変わりうる）：各画を逆向きに書く（点の並びを逆に、時刻は増える向きのまま）
  const badD = [];
  const revDir = (st) => st.map((x) => {
    const P = x.points, n = P.length, mv = P.slice(0, n - 1).reverse();
    const pts = mv.map((p, k) => ({ x: p.x, y: p.y, t: P[k].t }));
    pts.push({ x: pts[pts.length - 1].x, y: pts[pts.length - 1].y, t: P[n - 1].t });
    return { points: pts };
  });
  SEEDS.concat([7, 8, 9, 10, 11, 12]).forEach((seed) => {
    const st = SY.synth({ seed, hz: [60, 120, 240][seed % 3], renmen: seed % 4 ? [] : [[1, 2]] });
    const a = HW.analyze(st, { side: 320 }), b = HW.analyze(revDir(st), { side: 320 });
    ['f1', 'f2', 'f3', 'f4', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12', 'f13', 'f14'].forEach((k) => {
      if (J(a.feats[k]) !== J(b.feats[k])) badD.push(`seed ${seed}: ${k} ${J(a.feats[k])} ≠ ${J(b.feats[k])}`);
    });
  });
  check(!badD.length, '各画を逆向きに書いても（利き手で変わりうる）、形の特徴と速さ f6 はまったく同じ', badD.slice(0, 4).join('\n         '));
  const r = SY.make({ seed: 4, order: 'reverse' });
  const d = HW.analyze(r.strokes, { side: 320, debug: true });
  check(J(d.debug.assign) === J(r.truth), '逆の書き順でも、各画が正しいお手本の画に対応づく', J(d.debug.assign) + ' / ' + J(r.truth));
}

/* ============================================================ 妥当性 */
head('■ 妥当性チェック（診断に進ませない入力）');
{
  const has = (res, codes) => codes.every((c) => res.problems.indexOf(c) >= 0);
  const ichi = HW.analyze(SY.makeOther('ichi'), { side: 320 });
  check(!ichi.ok && has(ichi, ['tooFewStrokes', 'noSplit', 'noKou']), '「一」は 画数不足・左右に分かれない・口がない で弾く', J(ichi.problems));
  const tiny = HW.analyze(SY.makeOther('tiny'), { side: 320 });
  check(!tiny.ok && J(tiny.problems) === J(['tooSmall']), `極小の「結」は 大きさ不足 だけで弾く（f14=${tiny.feats.f14}）`, J(tiny.problems));
  const scr = HW.analyze(SY.makeOther('scribble', { seed: 5 }), { side: 320 });
  check(!scr.ok && has(scr, ['tooFewStrokes']), '3画の落書きは 画数不足 で弾く', J(scr.problems));
  const fast = run({ seed: 2, speed: 10, pauseRatio: 0.15, stopMs: 10 });
  check(!fast.ok && has(fast, ['tooFast']), `1.2秒未満で書き終えたら 速すぎ で弾く（${fast.totalMs}ms）`, J(fast.problems));
  const many = SY.synth({ seed: 2 });
  const chopped = [];
  many.forEach((s) => {
    const h = Math.floor(s.points.length / 2);
    if (h >= 2) { chopped.push({ points: s.points.slice(0, h) }); chopped.push({ points: s.points.slice(h) }); } else chopped.push(s);
  });
  const mr = HW.analyze(chopped, { side: 320 });
  check(!mr.ok && has(mr, ['tooManyStrokes']), `画が ${chopped.length} 本（17本以上）なら 画数過多 で弾く`, J(mr.problems));
  const noKou = SY.synth({ seed: 3 }).filter((s, i) => i < 9);
  const nk = HW.analyze(noKou, { side: 320 });
  check(!nk.ok && has(nk, ['noKou']), '口（10〜12画）がなければ 口がない で弾く', J(nk.problems));
  const ki = SY.synth({ seed: 3 }).slice(6);
  const kiOnly = HW.analyze(ki.concat(SY.synth({ seed: 4 }).slice(6)), { side: 320 });
  check(!kiOnly.ok && has(kiOnly, ['noSplit']), '吉だけ（糸へんがない）は 左右に分かれない で弾く', J(kiOnly.problems));
  const empty = HW.analyze([], { side: 320 });
  check(!empty.ok && empty.nStrokes === 0 && Object.values(empty.feats).every((v) => v === null), '何も書いていなければ弾き、測定値はすべて null');
  const junk = HW.analyze([{ points: [{ x: NaN, y: 1, t: 0 }] }, null, { points: [] }], { side: 320 });
  check(!junk.ok && junk.nStrokes === 0, '壊れた点・空の画は無視して落ちない');
  const okCnt = SEEDS.filter((seed) => run({ seed }).ok).length;
  check(okCnt === SEEDS.length, `標準的な「結」は通る（${okCnt}/${SEEDS.length}）`);

  // 「結」ではない線：でたらめな線分12本・横倒し・鏡像・上下逆
  const segOk = [];
  for (let seed = 1; seed <= 40; seed++) { const r = HW.analyze(SY.makeOther('segments', { seed }), { side: 320 }); if (r.ok || !has(r, ['noMatch'])) segOk.push(seed); }
  check(!segOk.length, 'でたらめな線分12本（40通り）はすべて noMatch で弾く', J(segOk));
  const tf = { rot90: (x, y) => [1 - y, x], mirror: (x, y) => [1 - x, y], flip: (x, y) => [x, 1 - y] };
  const tfOk = [];
  Object.keys(tf).forEach((k) => SEEDS.forEach((seed) => { const r = HW.analyze(SY.transform(SY.synth({ seed }), 320, tf[k]), { side: 320 }); if (r.ok) tfOk.push(`${k} seed ${seed}`); }));
  check(!tfOk.length, '横倒し（90°）・鏡像・上下逆の「結」は弾く', J(tfOk));
  // 画の中で時刻が逆戻り → 点を捨てて、badTime で知らせる
  const rev = SY.synth({ seed: 7 }).map((st) => { const ts = st.points.map((p) => p.t).reverse(); return { points: st.points.map((p, i) => ({ x: p.x, y: p.y, t: ts[i] })) }; });
  const rv = HW.analyze(rev, { side: 320 });
  check(!rv.ok && has(rv, ['badTime']), '画の中で時刻が逆に並んだ入力は badTime で弾く', J(rv.problems));
  const shuf = SY.synth({ seed: 7 }).map((st) => { const ts = st.points.map((p) => p.t); return { points: st.points.map((p, i) => ({ x: p.x, y: p.y, t: ts[(i * 7919) % ts.length] })) }; });
  const sh = HW.analyze(shuf, { side: 320 });
  check(!sh.ok && has(sh, ['badTime']), '画の中で時刻がばらばらの入力も badTime で弾く', J(sh.problems));
  const ovl = HW.analyze(SY.synth({ seed: 7 }).map((st) => { const t0 = st.points[0].t; return { points: st.points.map((p) => ({ x: p.x, y: p.y, t: p.t - t0 + 1000 })) }; }), { side: 320 });
  check(!ovl.ok && has(ovl, ['badTime']), '画どうしの時間が重なる入力（指1本ではありえない）は badTime で弾く', J(ovl.problems));
  const zero = HW.analyze(SY.synth({ seed: 7 }).map((st) => ({ points: st.points.map((p) => ({ x: p.x, y: p.y, t: st.points[0].t })) })), { side: 320 });
  check(!zero.ok && has(zero, ['badTime']), '長さのある画のほとんどが 0ms で書かれた入力は badTime で弾く', J(zero.problems));
  check(HW.PROBLEMS.join(',') === 'tooFewStrokes,tooManyStrokes,tooSmall,tooFast,noSplit,noKou,noMatch,extraInk,badTime', '理由コードの一覧（画面側の文言と対応させる）', HW.PROBLEMS.join(','));
}

/* ============================================================ 字と関係のないインク */
head('■ 迷いタップ・なぐり書き（どの画にも対応しないインク）');
{
  const bad = [];
  const lastT = (st) => st[st.length - 1].points.slice(-1)[0].t;
  const tap = (x, y, t) => ({ points: [{ x, y, t }, { x, y, t: t + 60 }] });
  for (let seed = 1; seed <= 12; seed++) {
    const st = SY.synth({ seed });
    const a = HW.analyze(st, { side: 320 });
    const mid = (st[5].points.slice(-1)[0].t + st[6].points[0].t) / 2;
    const cases = {
      '左上の角・書いたあと': st.concat([tap(19, 19, lastT(st) + 400)]),
      '右下の角・書いている途中': st.concat([tap(300, 300, mid)]),
      '吉のすぐ右・90秒後': st.concat([tap(0.93 * 320, 160, lastT(st) + 90000)])
    };
    Object.keys(cases).forEach((k) => {
      const b = HW.analyze(cases[k], { side: 320 });
      if (!b.ok || J(a.feats) !== J(b.feats) || a.totalMs !== b.totalMs) bad.push(`seed ${seed} ${k}: ok=${b.ok} ${J(b.problems)} ${J(a.feats) === J(b.feats) ? '' : '特徴が変わる'} totalMs ${a.totalMs}→${b.totalMs}`);
    });
  }
  check(!bad.length, '字の外の小さなタップ1つ（書いたあと・途中・90秒後）では、妥当性も特徴量も書いた時間も変わらない', bad.slice(0, 4).join('\n         '));
  const scr = [];
  for (let seed = 1; seed <= 40; seed++) {
    const st = SY.synth({ seed }), r = SY.mulberry32(seed), pts = [];
    let x = 160, y = 160;
    for (let q = 0; q < 600; q++) { x = Math.max(40, Math.min(280, x + (r() - 0.5) * 14)); y = Math.max(40, Math.min(280, y + (r() - 0.5) * 14)); pts.push({ x, y, t: lastT(st) + 300 + q * 8 }); }
    const b = HW.analyze(st.concat([{ points: pts }]), { side: 320 });
    if (b.ok || b.problems.indexOf('extraInk') < 0) scr.push(`seed ${seed}: ${J(b.problems)}`);
  }
  check(!scr.length, '書いた「結」の上になぐり書きをすると extraInk で弾く（40通り。長い線を近くの画の一部として取り込まない）', scr.join(', '));
}

/* ============================================================ 口 */
head('■ 口の接筆（左上 f1・右下 f9・左下 f10）');
{
  const bad = [];
  // 画ごとの角度のゆらぎを小さくして、ねらった角だけを開ける
  const q = { hJitterDeg: 0.5, rotNoiseDeg: 0.5 };
  SEEDS.forEach((seed) => {
    const c = run(Object.assign({ seed, kouUL: -0.01 }, q)), o = run(Object.assign({ seed, kouUL: 0.1 }, q));
    if (state(c.feats, 'f1') !== 'closed') bad.push(`seed ${seed}: 閉じたのに ${J(c.feats.f1)}`);
    if (state(o.feats, 'f1') !== 'open') bad.push(`seed ${seed}: 開けたのに ${J(o.feats.f1)}`);
    const lr = run(Object.assign({ seed, kouLR: 0.1 }, q)), ll = run(Object.assign({ seed, kouLL: 0.1 }, q));
    if (state(lr.feats, 'f9') !== 'open' || state(lr.feats, 'f10') !== 'closed') bad.push(`seed ${seed}: 右下だけ開けたのに f9=${J(lr.feats.f9)} f10=${J(lr.feats.f10)}`);
    if (state(ll.feats, 'f10') !== 'open' || state(ll.feats, 'f9') !== 'closed') bad.push(`seed ${seed}: 左下だけ開けたのに f10=${J(ll.feats.f10)} f9=${J(ll.feats.f9)}`);
  });
  check(!bad.length, '閉じた口は closed、開けた角だけが open になる', bad.slice(0, 4).join('\n         '));
  // すき間が線幅の 1.5 倍前後 → あいまい（字の大きさ 0.72 で、線幅 0.022 = お手本の単位 0.0306）
  const amb = SEEDS.map((seed) => run(Object.assign({ seed, kouUL: 0.0306 * 1.5 }, q)).feats.f1);
  check(amb.filter((f) => f.state === 'ambiguous').length >= 4, 'すき間が線幅の1〜2倍なら ambiguous', J(amb));
  const r = SEEDS.map((seed) => [0, 0.03, 0.06, 0.09].map((g) => run({ seed, kouUL: g }).feats.f1.ratio));
  check(r.every((row) => row[0] < row[1] && row[1] < row[2] && row[2] < row[3]), 'すき間を広げるほど ratio が大きくなる', J(r));
  const round = run({ seed: 2, cornerR: 0.06 }), sharp = run({ seed: 2, cornerR: 0 });
  check(round.feats.f11.state === 'maru' && sharp.feats.f11.state === 'kaku',
    `横折の角：丸めると maru（v=${round.feats.f11.v}）、角ばると kaku（v=${sharp.feats.f11.v}）`);
}

/* ============================================================ すき間 */
head('■ 糸と吉のすき間（f2）');
{
  const bad = [];
  SEEDS.forEach((seed) => {
    const v = [-0.04, 0, 0.04, 0.08].map((g) => run({ seed, gapShift: g }).feats.f2);
    for (let i = 1; i < v.length; i++) if (!(v[i] > v[i - 1])) bad.push(`seed ${seed}: 単調でない ${J(v)}`);
    // お手本の字幅は 0.75。吉を 0.04 動かすと、字幅も伸びるので約 0.04/0.79 ≒ 0.05 増える
    // （端は 90%点・10%点で測るので、少し小さめ 0.04〜0.05 に出る）
    const step = (v[3] - v[1]) / 2;
    if (Math.abs(step - 0.05) > 0.015) bad.push(`seed ${seed}: 0.04 ずらしたときの増え方 ${step.toFixed(3)}（期待 0.05±0.015）`);
  });
  check(!bad.length, '吉を右へずらすと f2 が比例して増える', bad.slice(0, 4).join('\n         '));
  const neg = run({ seed: 1, gapShift: -0.15 });
  check(neg.feats.f2 < 0, `糸と吉が大きく重なると f2 は負（${neg.feats.f2}）`);
}

/* ============================================================ 右上がり */
head('■ 右上がり（f12、字全体の回転は差し引く）');
{
  // 測り方そのものを確かめるため、画ごとの角度のゆらぎは小さくする（ゆらぎがあると 4 本の平均でも ±1° 程度ぶれる）
  const q = { hJitterDeg: 0.3, rotNoiseDeg: 0.3 };
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const s8 = SEEDS.map((seed) => run(Object.assign({ seed, slantDeg: 8 }, q)).feats.f12);
  check(s8.every((v) => Math.abs(v - 8) <= 1), '横画を 8° 右上がりにすると f12 ≈ +8°（±1°）', J(s8));
  const s8n = SEEDS.map((seed) => run({ seed, slantDeg: 8 }).feats.f12);
  check(Math.abs(avg(s8n) - 8) <= 1 && s8n.every((v) => Math.abs(v - 8) <= 2.5), `画ごとのゆらぎがあっても、平均は +8°（${avg(s8n).toFixed(2)}°）`, J(s8n));
  const s0 = SEEDS.map((seed) => run(Object.assign({ seed }, q)).feats.f12);
  check(s0.every((v) => Math.abs(v) <= 1), '水平に書けば f12 ≈ 0°', J(s0));
  const r6 = SEEDS.map((seed) => run(Object.assign({ seed, rotDeg: 6 }, q)).feats.f12);
  check(r6.every((v) => Math.abs(v) <= 1), 'スマホを斜めに持って字全体が 6° 回っても、右上がりには数えない', J(r6));
  const sd = SEEDS.map((seed) => [0.5, 4].map((h) => run({ seed, hJitterDeg: h }).feats.f3));
  check(sd.filter(([a, b]) => b > a).length >= 5, '横画の角度をばらつかせると f3（標準偏差）が大きくなる', J(sd));
  const hd = SEEDS.map((seed) => [-0.04, 0, 0.06].map((h) => run({ seed, head: h }).feats.f13));
  check(hd.every(([a, b, c]) => a < b && b < c) && hd.every(([, b]) => Math.abs(b) <= 0.1), '士の縦画を上に伸ばすと f13 が増え、お手本どおりなら ≈0', J(hd));
  const asp = SEEDS.map((seed) => [0.9, 1, 1.12].map((a) => run({ seed, aspect: a }).feats.f7));
  check(asp.every(([a, b, c]) => a < b && b < c) && asp.every(([, b]) => Math.abs(b) <= 0.05), '縦長に書くと f7 が増え、お手本の比なら ≈0', J(asp));
}

/* ============================================================ 連綿 */
head('■ 連綿（続け書き、f4）');
{
  const bad = [];
  SEEDS.forEach((seed) => {
    const kou = run({ seed, renmen: [[10, 12]] });
    if (!kou.ok || !(kou.feats.f4 >= 1) || !kou.feats.f1 || !kou.feats.f9 || !kou.feats.f10) bad.push(`seed ${seed} 口を一筆: ${J(kou.problems)} f4=${kou.feats.f4}`);
    if (kou.feats.f1 && kou.feats.f1.state !== 'closed') bad.push(`seed ${seed} 口を一筆: 左上が ${kou.feats.f1.state}`);
    const two = run({ seed, renmen: [[1, 2], [5, 6]] });
    if (two.feats.f4 !== 2 || !two.ok) bad.push(`seed ${seed} 糸を2か所続け書き: f4=${two.feats.f4} ${J(two.problems)}`);
    const none = run({ seed });
    if (none.feats.f4 !== 0) bad.push(`seed ${seed} 続け書きなし: f4=${none.feats.f4}`);
    const s11 = SY.make({ seed, split11: true });
    const a11 = HW.analyze(s11.strokes, { side: 320, debug: true });
    if (!a11.ok || a11.feats.f4 !== 0 || J(a11.debug.assign) !== J(s11.truth)) bad.push(`seed ${seed} 口を4画: ${J(a11.debug.assign)} ${J(a11.problems)}`);
  });
  check(!bad.length, '口を一筆で書いても口が見つかり f4≥1、糸の2か所で f4=2、口を4画で書いても1つの画として扱う', bad.slice(0, 4).join('\n         '));
  const kou = SY.make({ seed: 3, renmen: [[10, 12]] });
  const d = HW.analyze(kou.strokes, { side: 320, debug: true });
  check(J(d.debug.assign) === J(kou.truth), '一筆の口は 10・11・12 画をまとめて覆う1本として対応づく', J(d.debug.assign));
}

/* ============================================================ とめ */
head('■ 収筆の止め（f5）');
{
  const nuki = SEEDS.map((seed) => run({ seed, stopMs: 0 }));
  const tome = SEEDS.map((seed) => run({ seed, stopMs: 250 }));
  check(nuki.every((r) => r.feats.f5 < HW.STOP_MS), '止めずに離すと f5 は 80ms 未満', J(nuki.map((r) => r.feats.f5)));
  check(tome.every((r) => r.feats.f5 >= 170 && r.feats.f5 <= 420), 'しっかり（250ms 前後）止めると f5 もその前後（画ごとのばらつき込みで 170〜420ms）', J(tome.map((r) => r.feats.f5)));
  const cnt = (r) => r.marks.stops.filter((s) => s.stop).length;
  check(tome.every((r) => cnt(r) === 5) && nuki.every((r) => cnt(r) === 0), 'とめの印：止めれば5画とも「とめ」、止めなければ0画',
    J(tome.map(cnt)) + ' / ' + J(nuki.map(cnt)));
  const mixed = run({ seed: 1, stopMs: { 4: 300, 7: 300, 8: 300, 9: 0, 12: 0 } });
  check(cnt(mixed) === 3 && mixed.feats.f5 >= 150, `5画のうち3画で止めれば、中央値は「止めた」側になる（f5=${mixed.feats.f5}、とめ ${cnt(mixed)}画）`);
}

/* ============================================================ ふるえ・途中の間 */
head('■ 結果に使わない約束：ふるえ・途中の長い間');
{
  const CALS = require('./hw-calibration.js');
  // 同じ人たちを、ふるえなし／ふるえ 2px・8Hz で2回ずつ書かせ、型の割合がどれだけ動くかを見る。
  // 較正はふるえなしの人たちから作る（本番と同じ作り方）。
  const rp = SY.mulberry32(31337), N = 300;
  const people = [];
  for (let i = 0; i < N; i++) people.push(CALS.person(rp));
  const base = people.map((p, i) => CALS.measure(p, 4000 + i));
  const cal = CALS.fitCal(base.filter((m) => m.ok).map((m) => m.feats));
  const TYPES = ['sekkei', 'suishin', 'kyomei', 'chokkan'];
  const shift = (other) => {
    const c0 = {}, c1 = {};
    let n = 0, same = 0;
    for (let i = 0; i < N; i++) {
      if (!base[i].ok || !other[i].ok) continue;
      const a = HW.score(base[i].feats, cal).key, b = HW.score(other[i].feats, cal).key;
      c0[a] = (c0[a] || 0) + 1; c1[b] = (c1[b] || 0) + 1; n++; if (a === b) same++;
    }
    return { d: Math.max(...TYPES.map((t) => Math.abs((c1[t] || 0) - (c0[t] || 0)))) / n * 100, same: same / n, n };
  };
  const t1 = shift(people.map((p, i) => CALS.measure(p, 4000 + i, { tremorPx: 2, tremorHz: 8 })));
  check(t1.d <= 5, `ふるえ 2px・8Hz（止めている間も揺れる）：型の割合の差 最大 ${t1.d.toFixed(1)} ポイント（5 以下）、同じ型 ${(100 * t1.same).toFixed(1)}%（${t1.n} 人）`);
  const t2 = shift(people.map((p, i) => CALS.measure(p, 4000 + i, null, (st) => SY.addTremor(st, 2, 8))));
  check(t2.d <= 5, `ふるえ 2px・8Hz（あとから足す・離す点だけ跳ぶ）：型の割合の差 最大 ${t2.d.toFixed(1)} ポイント（5 以下）、同じ型 ${(100 * t2.same).toFixed(1)}%`);
  // 1字ごと：止め（f5）は、ふるえがあってもほぼ同じ
  const d5 = SEEDS.map((seed) => { const st = SY.synth({ seed, stopMs: 200 }); return HW.analyze(SY.addTremor(st, 2, 8), { side: 320 }).feats.f5 - HW.analyze(st, { side: 320 }).feats.f5; });
  check(d5.every((d) => Math.abs(d) <= 20), `ふるえ 2px・8Hz でも止めの時間はほぼ同じ（差 ${J(d5)}ms、±20ms 以内）`);

  // 途中で 5 秒止まる（一画戻して考え直す、通知を見る等）。長い間は f8 から外すので、
  // 変わるのは「外した1か所ぶん、平均に入る間が1つ減る」ことだけ（丸めの1目盛り以内）。
  // 型が変わってよいのは、y がもともと境界の上（「○○型寄り」と出る人）で、y の差が 0.02 以内（f8 の1目盛りぶん）のときだけ。
  const bad = [], edge = [];
  SEEDS.concat([7, 8, 9, 10, 11, 12]).forEach((seed) => {
    const st = SY.synth({ seed });
    const a = HW.analyze(st, { side: 320 });
    const b = HW.analyze(st.map((x, i) => (i < 6 ? x : { points: x.points.map((p) => ({ x: p.x, y: p.y, t: p.t + 5000 })) })), { side: 320 });
    const fa = Object.assign({}, a.feats), fb = Object.assign({}, b.feats);
    delete fa.f8; delete fb.f8;
    const sa = HW.score(a.feats, CAL), sb = HW.score(b.feats, CAL);
    const flip = sa.key !== sb.key;
    if (flip) edge.push(`seed ${seed} ${sa.key}→${sb.key}（y ${sa.y}→${sb.y}）`);
    if (!b.ok || J(fa) !== J(fb) || Math.abs(a.feats.f8 - b.feats.f8) > 0.01 + 1e-9 ||
        (flip && !(sa.lean.y && Math.abs(sa.y - sb.y) <= 0.02))) {
      bad.push(`seed ${seed}: f8 ${a.feats.f8}→${b.feats.f8} ${sa.key}→${sb.key}`);
    }
  });
  check(!bad.length, `糸へんのあとで 5 秒止まっても、f8 の差は丸めの1目盛り（0.01）以内・ほかの特徴は完全に同じ・型は同じ` +
    `（境界の上の人だけ例外: ${edge.length ? edge.join(' / ') : 'なし'}）`, bad.slice(0, 4).join('\n         '));
  const longPause = HW.analyze(SY.synth({ seed: 1 }).map((x, i) => (i < 6 ? x : { points: x.points.map((p) => ({ x: p.x, y: p.y, t: p.t + 60000 })) })), { side: 320 });
  check(longPause.ok && longPause.totalMs < HW.analyze(SY.synth({ seed: 1 }), { side: 320 }).totalMs + 1600,
    `1 分止まっても、書いた時間（totalMs）は間を 1.5 秒で打ち切って数える（${longPause.totalMs}ms）`);
}

/* ============================================================ 2回の平均 */
head('■ 2回の平均（average）');
{
  const A = { f1: { state: 'closed', ratio: 0.8 }, f2: 0.07, f3: 1.5, f4: 1, f5: 150, f6: 1.2, f7: 0.03, f8: 0.4,
    f9: { state: 'closed', ratio: 0 }, f10: null, f11: { state: 'kaku', v: 0.02 }, f12: 3.5, f13: 0.1, f14: 0.55 };
  const B = { f1: { state: 'open', ratio: 3.0 }, f2: 0.10, f3: 2, f4: 2, f5: 175, f6: 1.25, f7: 0.04, f8: 0.43,
    f9: { state: 'closed', ratio: 0.5 }, f10: { state: 'open', ratio: 2.5 }, f11: { state: 'maru', v: 0.06 }, f12: 4, f13: 0.13, f14: 0.6 };
  const m = HW.average(A, B);
  check(m.f1.ratio === 1.9 && m.f1.state === 'ambiguous', 'f1：ratio を平均してから状態を決め直す（0.8 と 3.0 → 1.9 あいまい）', J(m.f1));
  check(m.f2 === 0.09 && m.f3 === 2 && m.f5 === 160 && m.f6 === 1.23 && m.f8 === 0.42 && m.f12 === 4 && m.f13 === 0.12,
    '数値は平均してから丸め直す（角度 0.5°・比 0.01・時間 10ms）', J(m));
  check(m.f4 === 2 && HW.average({ f4: 0 }, { f4: 1 }).f4 === 1 && HW.average({ f4: 2 }, { f4: 2 }).f4 === 2, 'f4 は四捨五入（1.5→2、0.5→1）');
  check(m.f11.v === 0.04 && m.f11.state === null, 'f11：v を平均して決め直す（あいまいな帯なら判定なし）', J(m.f11));
  check(J(m.f10) === J({ state: 'open', ratio: 2.5 }), '片方が測れなければ、もう片方をそのまま使う', J(m.f10));
  check(HW.average({ f10: null }, { f10: null }).f10 === null, '両方測れなければ null');
  const r1 = run({ seed: 1 }).feats, r2 = run({ seed: 2 }).feats;
  check(J(HW.average(r1, r2)) === J(HW.average(r2, r1)), '順番を入れ替えても同じ');
  check(HW.average({ f11: { state: null, v: null } }, null).f11 === null && HW.average({ f11: { v: NaN } }, { f11: null }).f11 === null,
    'f11 の v が測れていなければ null（「角ばる」にしない）');
  check(J(HW.average({ f1: { state: 'open' } }, { f1: { state: 'closed', ratio: 0.2 } }).f1) === J({ state: 'closed', ratio: 0.2 }),
    'ratio の欠けた値は「測れなかった」として、もう片方を使う');
  check(J(HW.average(null, null)) === J(HW.average({}, {})) && Object.values(HW.average(null, null)).every((v) => v === null), '両方なければ全部 null');
}

/* ============================================================ 採点 */
head('■ 採点（score）');

{
  const base = HW.score(MID, CAL);
  const open = HW.score(w({ f1: { state: 'open', ratio: 3 } }), CAL), closed = HW.score(w({ f1: { state: 'closed', ratio: 0.2 } }), CAL);
  check(open.x > base.x && base.x > closed.x && open.y === base.y, `口の左上を開けると x（感覚で選ぶ）が上がる（${closed.x} < ${base.x} < ${open.x}）`);
  const longStop = HW.score(w({ f5: 300 }), CAL), shortStop = HW.score(w({ f5: 40 }), CAL);
  check(longStop.y < base.y && base.y < shortStop.y && longStop.x === base.x, `止めが長いと y（見極めてから動く）が下がる（${longStop.y} < ${base.y} < ${shortStop.y}）`);
  const fast = HW.score(w({ f6: 1.6 }), CAL), tall = HW.score(w({ f7: 0.25 }), CAL), pause = HW.score(w({ f8: 0.6 }), CAL);
  check(fast.y > base.y && tall.y < base.y && pause.y < base.y, '速いと y が上がり、縦長・間が長いと y が下がる');
  const gap = HW.score(w({ f2: 0.2 }), CAL), ren = HW.score(w({ f4: 2 }), CAL), var3 = HW.score(w({ f3: 4 }), CAL);
  check(gap.x > base.x && ren.x > base.x && var3.x > base.x, 'すき間が広い・続け書き・横画のばらつきで x が上がる');
  const clip = HW.score(w({ f2: 9 }), CAL);
  check(Math.abs(clip.z.f2 - 1) < 1e-9 && clip.x <= 1, 'z は ±2 で打ち切って 2 で割る（極端な値でも ±1 まで）', J(clip.z));
  check(J(base.used) === J(['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8']), '使った特徴の一覧', J(base.used));
  const miss = HW.score(w({ f1: null, f5: null }), CAL);
  check(J(miss.used) === J(['f2', 'f3', 'f4', 'f6', 'f7', 'f8']), '測れなかった特徴は外し、残りの重みで割り直す', J(miss.used));
  const onlyF2 = HW.score({ f2: 0.12, f6: 1.0 }, CAL);
  check(Math.abs(onlyF2.x - 0.5) < 1e-4, `残りが1つなら、その z がそのまま軸になる（${onlyF2.x}）`);
  check(HW.score({ f2: 0.12 }, CAL) === null && HW.score({}, CAL) === null && HW.score(null, CAL) === null,
    'x・y のどちらかの軸に使える測定値が1つもなければ null（何も測れていないのに型を出さない）');
  check(HW.score(MID, undefined) === null && HW.score(MID, {}) === null && HW.score(MID, { weights: CAL.weights }) === null,
    '較正（cal）が無い・欠けていれば null（例外を投げない）');
  const nan = HW.score(w({ f2: NaN, f5: Infinity, f1: { state: 'bogus' } }), CAL);
  check(nan && J(nan.used) === J(['f3', 'f4', 'f6', 'f7', 'f8']) && isFinite(nan.x) && isFinite(nan.y), '数でない値・知らない状態は外して採点する', J(nan && nan.used));
  const quad = [
    [{ f1: { state: 'closed', ratio: 0 }, f5: 400 }, 'sekkei'], [{ f1: { state: 'closed', ratio: 0 }, f5: 0, f6: 2 }, 'suishin'],
    [{ f1: { state: 'open', ratio: 5 }, f5: 400 }, 'kyomei'], [{ f1: { state: 'open', ratio: 5 }, f5: 0, f6: 2 }, 'chokkan']
  ].map(([o, k]) => [HW.score(w(o), CAL).key, k]);
  check(quad.every(([a, b]) => a === b), '4つの象限が 設計・推進・共鳴・直感 に対応', J(quad));
  const zero = HW.score({ f2: 0.08, f6: 1.0 }, Object.assign({}, CAL, { center: { x: 0, y: 0 } }));
  check(zero.x === 0 && zero.y === 0 && zero.key === 'sekkei', 'ちょうど中心（0,0）は負の側として扱う（設計型）', J(zero));
  const lean = HW.score({ f2: 0.084, f6: 1.9 }, Object.assign({}, CAL, { center: { x: 0, y: 0 } }));
  check(lean.key === 'chokkan' && lean.lean.x && !lean.lean.y && lean.lean.toward === 'suishin', `境界の近く：x が中心に近ければ「推進型寄りの直感型」（x=${lean.x}）`, J(lean.lean));
  const far = HW.score(w({ f1: { state: 'open', ratio: 5 }, f5: 0, f6: 2 }), CAL);
  check(!far.lean.x && !far.lean.y && far.lean.toward === null, '境界から遠ければ「寄り」は出さない', J(far.lean));
  const scaled = HW.score({ f2: 0.09, f6: 1.9 }, Object.assign({}, CAL, { center: { x: 0, y: 0 }, axisScale: { x: 1, y: 1 } }));
  const scaled2 = HW.score({ f2: 0.09, f6: 1.9 }, Object.assign({}, CAL, { center: { x: 0, y: 0 }, axisScale: { x: 0.2, y: 1 } }));
  check(scaled.lean.x && !scaled2.lean.x, 'axisScale があれば、境界は「軸の尺度 × boundary」で測る（仕様書の ±0.25SD）');
  check(J(HW.score(MID, CAL)) === J(base), '同じ入力なら同じ採点');
}

/* ============================================================ いちばん特徴が出た測定値 */
head('■ いちばん特徴が出た測定値 → 要素（基準・伝達・決断）');
{
  const hl = (o) => HW.score(w(o), CAL).highlight;
  const cases = [
    [{ f13: 0.5 }, 'f13', 'dentatsu', 1], [{ f2: 0.0 }, 'f2', 'dentatsu', -1],
    [{ f5: 400 }, 'f5', 'ketsudan', 1], [{ f9: { state: 'open', ratio: 4 } }, 'f9', 'ketsudan', 1],
    [{ f10: { state: 'open', ratio: 4 } }, 'f10', 'kijun', 1], [{ f3: 4 }, 'f3', 'kijun', 1]
  ];
  const bad = cases.map(([o, f, e, s]) => [hl(o), f, e, s]).filter(([h, f, e, s]) => !h || h.feature !== f || h.element !== e || h.sign !== s);
  check(!bad.length, '最も中央値から離れた測定値を選び、決まった要素に結びつける（f10,f3→基準／f2,f13→伝達／f9,f5→決断）', J(bad));
  // 打ち切らない |z| で比べる：f2 z=5.5、f5 z=4.8、f13 z=10 → f13（打ち切ると3つとも1で並んでしまう）
  const far = hl({ f2: 0.3, f5: 500, f13: 2 });
  check(far.feature === 'f13', '±2 で打ち切らない |z| で比べる（f13 z=10 が f2 z=5.5 より上）', J(far));
  const tie = hl({ f2: 0.16, f5: 290 });
  check(tie.feature === 'f2', 'z がちょうど同じ（f2 と f5 がともに z=2）なら f2, f5, f9, f3, f10, f13 の順で決める', J(tie));
  const tie2 = hl({ f5: 290, f13: 0.4 });
  check(tie2.feature === 'f5', '同点（f5 と f13 がともに z=2）なら f5', J(tie2));
  const corners = hl({ f9: { state: 'open', ratio: 3 }, f10: { state: 'open', ratio: 5 } });
  check(corners.feature === 'f10', '口の角どうしが同点なら、線幅比の大きい（より開いた）方', J(corners));
  const catLow = hl({ f9: { state: 'open', ratio: 4 }, f3: 1.5 + 0.74 * 1.2 });
  const catHigh = hl({ f9: { state: 'open', ratio: 4 }, f3: 1.5 + 0.74 * 2 });
  check(catLow.feature === 'f9' && catHigh.feature === 'f3', '開いた口の角は z=1.5 と同じ強さ（z=1.2 には勝ち、z=2 には負ける）', J([catLow, catHigh]));
  const ambs = [];
  [1.1, 1.5, 1.99].forEach((r) => ['f9', 'f10'].forEach((k) => {
    const o = {}; o[k] = { state: 'ambiguous', ratio: r };
    const h1 = hl(o), h2 = hl(Object.assign({ f2: 0.081 }, o));
    if ((h1 && CORNER_KEYS.indexOf(h1.feature) >= 0) || (h2 && CORNER_KEYS.indexOf(h2.feature) >= 0)) ambs.push(`${k} ${r}`);
  }));
  check(!ambs.length, '「あいまい」な口の角（線幅の1〜2倍）は、ほかがすべて中央値でも「いちばん特徴」にしない', J(ambs));
  check(hl({}) === null, 'どの候補も中央値ちょうどなら、取り上げるところは無し（null）');
  check(HW.score(w({ f1: { state: 'open', ratio: 5 } }), CAL).highlight === null, '口の左上（f1）は「いちばん特徴」の候補に入れない');
  const none = HW.score({ f1: { state: 'open', ratio: 3 }, f6: 1.2 }, CAL);
  check(none.highlight === null, '候補がすべて測れなければ highlight は null');
  // 合成の母集団で：あいまいな角は一度も選ばれない
  const CALS = require('./hw-calibration.js');
  const rp = SY.mulberry32(99), picked = [];
  for (let i = 0; i < 150; i++) {
    const m = CALS.measure(CALS.person(rp), 90000 + i);
    const h = m.ok ? HW.score(m.feats, CAL).highlight : null;
    if (h && CORNER_KEYS.indexOf(h.feature) >= 0 && m.feats[h.feature].state !== 'open') picked.push(J(m.feats[h.feature]));
  }
  check(!picked.length, '合成の 150 人で、「開」でない口の角が「いちばん特徴」に選ばれない', picked.slice(0, 3).join(' '));
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'yui', 'hw-engine.js'), 'utf8');
  check(!/低い|weak|lowest|欠点|弱点/.test(src), 'エンジンの中に「低い」「弱点」などの言葉や変数名を使っていません');
}

/* ============================================================ シェア */
head('■ シェア用の文字列（encodeShare / decodeShare）');
{
  const bad = [];
  const samples = [];
  SEEDS.forEach((seed) => {
    const r = run({ seed, kouUL: seed % 2 ? 0.1 : 0, stopMs: seed * 40 });
    samples.push([HW.score(r.feats, CAL), r.feats, r.marks]);
  });
  samples.push([HW.score({ f2: 0.084, f6: 1.9 }, Object.assign({}, CAL, { center: { x: 0, y: 0 } })), { f2: 0.084 }, null]);
  samples.push([HW.score(w({ f9: { state: 'open', ratio: 4 } }), CAL), MID, null]);
  samples.forEach(([s, f, m]) => {
    const str = HW.encodeShare(s, f, m);
    const back = HW.decodeShare(str);
    const want = HW.shareData(s, f, m);
    if (typeof str !== 'string' || str.length !== 10 || !/^[0-9a-z]+$/.test(str)) bad.push('形式: ' + str);
    if (J(back) !== J(want)) bad.push(`${str}: ${J(back)} ≠ ${J(want)}`);
  });
  check(!bad.length, '書き出して読み戻すと同じ内容（10文字、英小文字と数字だけ）', bad.slice(0, 3).join('\n         '));
  const one = HW.decodeShare(HW.encodeShare(samples[0][0], samples[0][1], samples[0][2]));
  const keys = Object.keys(one).sort().join(',');
  check(keys === 'disp,highlight,key,lean,v' && Object.keys(one.disp).sort().join(',') === 'f1,f2,f5',
    '入るのは 版・型・境界・特徴の種類と向き・表示用の値3つ だけ（線は入らない）', keys);
  const res0 = run({ seed: 2 }), sc0 = HW.score(res0.feats, CAL);
  check(HW.encodeShare(sc0, res0) === HW.encodeShare(sc0, res0.feats, res0.marks) && HW.decodeShare(HW.encodeShare(sc0, res0)).disp.f5 !== null,
    'analyze() の結果をそのまま渡しても、feats と marks を別に渡しても同じ文字列');
  check(HW.encodeShare(null, {}) === null && HW.encodeShare(undefined) === null && HW.shareData(null) === null && HW.encodeShare({ key: 'bogus' }) === null,
    '採点がない・壊れていれば encodeShare は null（例外を投げない）');
  const big = HW.shareData({ key: 'sekkei', lean: { x: false, y: false, toward: null }, highlight: null }, { f2: 3 }, null);
  check(big.disp.f2 === 69 && HW.shareData({ key: 'sekkei', lean: { x: false, y: false, toward: null }, highlight: null }, { f2: -2 }, null).disp.f2 === -30,
    'すき間の % は -30〜69 に収める');
  const malformed = [
    null, undefined, 123, {}, [], '', '1', '1s0nnnnnnn ', ' 1s0nnnnnnn', '2s0nnnnnnn',
    '1x0nnnnnnn', '1S0nnnnnnn', '1s4nnnnnnn', '1s1nnnnnnn', '1s0unnnnnn', '1s1snnnnnn', '1s3cnnnnnn', '1s2knnnnnn',
    '1s0n2nnnnn', '1s0nnpnnnn', '1s0nxpnnnn', '1s0nnnxnnn', '1s0nnnn5nn', '1s0nnnnnn6', '1s0nnnnnnn0', '1s0nnnnnn',
    '1s0nnnc1a5', '1ｓ0nnnnnnn', '1s0nnnnnn\n', '1s0n%20nnnn', '<script>',
    // score() が出さない組み合わせ：口の角が「閉」の向き（9m・am）、向きが 0（z）
    '1s0n9mnnnn', '1s0namnnnn', '1s0n9moa5n'.slice(0, 10), '1s0n2znnnn', '1s0n9znnnn', '1s0nazcnn3'
  ];
  const leaked = malformed.filter((s) => HW.decodeShare(s) !== null);
  check(malformed.length >= 20 && !leaked.length, `壊れた・細工された文字列 ${malformed.length} 種をすべて拒否（null）`, J(leaked));
  const good = HW.decodeShare('1u2sdmo405');
  check(good && good.key === 'suishin' && good.lean.toward === 'sekkei' && good.highlight.feature === 'f13' &&
    good.highlight.element === 'dentatsu' && good.highlight.sign === -1 && good.disp.f1 === 'open' && good.disp.f2 === 10 && good.disp.f5 === 5,
    '正しい文字列は読める（例: 1u2sdmo405 = 推進型・設計型寄り・頭部突出が小さい・左上が開・すき間10%・とめ5画）', J(good));
}

/* ============================================================ 壊れた入力・重い入力 */
head('■ 壊れた入力・重い入力（落ちない・止まらない）');
{
  const { spawnSync } = require('child_process');
  const eng = path.join(__dirname, '..', '..', 'yui', 'hw-engine.js'), syn = path.join(__dirname, 'synth.js');
  // 別のプロセスで、5 秒以内に返るかを見る（止まらないことの確認）
  const within = (body) => {
    const code = `const HW=require(${J(eng)}),SY=require(${J(syn)});const t=process.hrtime.bigint();const r=(${body});` +
      'console.log(JSON.stringify({ms:Number(process.hrtime.bigint()-t)/1e6,ok:r.ok,problems:r.problems}));';
    const res = spawnSync(process.execPath, ['--max-old-space-size=512', '-e', code], { timeout: 5000, encoding: 'utf8' });
    try { return JSON.parse(res.stdout.trim()); } catch (e) { return { ms: Infinity, err: res.error ? res.error.code : (res.stderr || '').split('\n')[0] }; }
  };
  const huge = within("HW.analyze(SY.synth({seed:7}).map(s=>({points:s.points.map(p=>({x:p.x*1e160,y:p.y*1e160,t:p.t}))})),{side:320})");
  check(huge.ms < 1000 && huge.ok === false, `桁外れに大きい座標（×1e160）でも止まらずに弾く（${J(huge)}）`);
  const huge2 = within("HW.analyze(SY.synth({seed:7}).map(s=>({points:s.points.map(p=>({x:p.x*1e300,y:p.y,t:p.t}))})),{side:1e-300})");
  check(huge2.ms < 1000, `side が極端に小さくても止まらない（${J(huge2)}）`);
  const r = SY.mulberry32(5);
  const tele = (n, m) => Array.from({ length: n }, (_, i) => ({ points: Array.from({ length: m }, (_, k) => ({ x: 10 + 300 * r(), y: 10 + 300 * r(), t: i * 10000 + k * 4 })) }));
  const t0 = process.hrtime.bigint();
  const a = HW.analyze(tele(60, 200), { side: 320 });
  const t1 = process.hrtime.bigint();
  const b = HW.analyze(tele(16, 2000), { side: 320 });
  const t2 = process.hrtime.bigint();
  const ms1 = Number(t1 - t0) / 1e6, ms2 = Number(t2 - t1) / 1e6;
  check(!a.ok && a.problems.indexOf('tooManyStrokes') >= 0 && ms1 < 200, `画が 60 本（各 200 点）は重い照合をせずに弾く（${ms1.toFixed(0)}ms）`);
  check(!b.ok && ms2 < 1500, `16 画 × 2,000 点のでたらめな点でも 1.5 秒以内に返す（${ms2.toFixed(0)}ms、以前は 7 秒）`, J(b.problems));
  const scan = (o, p, bad) => { if (typeof o === 'number') { if (!isFinite(o)) bad.push(p); } else if (o && typeof o === 'object') Object.keys(o).forEach((k) => scan(o[k], p + '.' + k, bad)); };
  const weird = {
    zeroLen: SY.synth({ seed: 7 }).concat([{ points: [{ x: 100, y: 100, t: 99999 }, { x: 100, y: 100, t: 100100 }] }]),
    sameT: SY.synth({ seed: 7 }).map((st) => ({ points: st.points.map((p) => ({ x: p.x, y: p.y, t: 5000 })) })),
    twoPoint: SY.synth({ seed: 7 }).map((st) => ({ points: [st.points[0], st.points[st.points.length - 1]] })),
    strings: SY.synth({ seed: 7 }).map((st) => ({ points: st.points.map((p) => ({ x: String(p.x), y: String(p.y), t: String(p.t) })) })),
    hugeT: (() => { const s = SY.synth({ seed: 7 }); s[0].points[0].t = -1.7e308; s[s.length - 1].points.slice(-1)[0].t = 1.7e308; return s; })(),
    notArray: [{ points: 'abc' }, { points: { length: 3 } }, { points: [1, 2, 3] }],
    str: 'hello', nul: null
  };
  const bad = [];
  Object.keys(weird).forEach((k) => {
    try {
      const res = HW.analyze(weird[k], { side: 320 });
      const nb = []; scan(res, 'res', nb);
      const sc = HW.score(res.feats, CAL); scan(sc, 'score', nb);
      HW.encodeShare(sc, res);
      if (nb.length) bad.push(`${k}: ${nb.slice(0, 3).join(',')}`);
    } catch (e) { bad.push(`${k}: ${e.message}`); }
  });
  check(!bad.length, '長さ0の画・同時刻・2点だけの画・文字列の数・桁外れの時刻・配列でない入力でも、例外なく有限の値を返す', bad.join(' / '));
  const strOk = HW.analyze(weird.strings, { side: 320 });
  check(strOk.ok, '数が文字列で来ても（"123.4"）、数として読む');
}

/* ============================================================ 対応づけの精度（合成） */
head('■ 画の対応づけ（合成の母集団で正解と照合）');
{
  const CALS = require('./hw-calibration.js');
  const r = SY.mulberry32(4242);
  let same = 0, n = 0, valid = 0;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 300; i++) {
    const p = CALS.writing(CALS.person(r), r, 9000 + i);
    const m = SY.make(p);
    const res = HW.analyze(m.strokes, { side: p.side, debug: true });
    n++;
    if (res.ok) valid++;
    if (J(res.debug.assign) === J(m.truth)) same++;
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / n;
  check(same / n >= 0.98, `書いた画がお手本の正しい画に対応づく: ${same}/${n}`);
  check(valid / n >= 0.97, `妥当性チェックを通る: ${valid}/${n}`);
  check(ms < 60, `1字の解析 平均 ${ms.toFixed(1)}ms（node）`);
}

/* ---------------------------------------------------------------- まとめ */
console.log('\n' + '─'.repeat(52));
if (fail) {
  console.log(`NG ${fail}件 / ok ${pass}件 — 直してから公開してください。`);
  process.exit(1);
}
console.log(`すべて通過（${pass}件）`);
