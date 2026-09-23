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
/* 迷い線 sp と字のインク st の、線分どうしの正確な距離（キャンバス一辺=1）。迷い線を 1/20 ずつ刻んで、インクの各線分への距離を測る */
function segDist(p, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy;
  const r = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L2)) : 0;
  return Math.hypot(p[0] - a[0] - vx * r, p[1] - a[1] - vy * r);
}
function inkDist(sp, st, side) {
  const S = sp.points.map((p) => [p.x / side, p.y / side]);
  let m = Infinity;
  st.forEach((s) => {
    const B = s.points.map((p) => [p.x / side, p.y / side]);
    for (let i = 1; i < S.length; i++) for (let k = 0; k <= 20; k++) {
      const p = [S[i - 1][0] + (S[i][0] - S[i - 1][0]) * k / 20, S[i - 1][1] + (S[i][1] - S[i - 1][1]) * k / 20];
      if (B.length === 1) m = Math.min(m, Math.hypot(p[0] - B[0][0], p[1] - B[0][1]));
      for (let j = 1; j < B.length; j++) m = Math.min(m, segDist(p, B[j - 1], B[j]));
    }
  });
  return m;
}
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
    m.stops.every((s) => typeof s.stop === 'boolean' && s.x >= 0 && s.x <= 1) && m.stopMs === HW.STOP_MS,
    '結果パネル用の印（口の3点・すき間の帯・横画の線・とめ5画）がキャンバス座標で返ります（cal が無ければ、とめのしきい値は STOP_MS）', J(m));
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
  check(!tiny.ok && J(tiny.problems) === J(['tooSmall']), '極小の「結」は 大きさ不足 だけで弾く', J(tiny.problems));
  const scr = HW.analyze(SY.makeOther('scribble', { seed: 5 }), { side: 320 });
  check(!scr.ok && has(scr, ['tooFewStrokes']), '3画の落書きは 画数不足 で弾く', J(scr.problems));
  const fast = run({ seed: 2, speed: 10, pauseRatio: 0.15, stopMs: 10 });
  check(!fast.ok && has(fast, ['tooFast']), `1.2秒未満で書き終えたら 速すぎ で弾く（${fast.totalMs}ms）`, J(fast.problems));
  // どの画も途中で指を上げて 0.15 秒あけてから続けた（接触の途切れ JOIN_MS=0.1 秒より長いので、1本につながない）
  let chopped = SY.synth({ seed: 2 });
  for (let k = chopped.length - 1; k >= 0; k--) chopped = SY.split(chopped, k, 2, 150);
  const mr = HW.analyze(chopped, { side: 320 });
  check(!mr.ok && has(mr, ['tooManyStrokes']), `画が ${chopped.length} 本（17本以上）なら 画数過多 で弾く`, J(mr.problems));
  // 同じ切り方でも、切れ目が接触の途切れ（指は動いたまま 20〜40ms）なら1本につなぐので、画数は変わらない
  let flick = SY.synth({ seed: 2 });
  for (let k = flick.length - 1; k >= 0; k--) flick = SY.split(flick, k, 2, 20 + 10 * (k % 3), 'dropout');
  const fl = HW.analyze(flick, { side: 320 });
  check(fl.ok && fl.nStrokes === 12, `どの画も途中で接触が 20〜40ms 途切れても（${flick.length} 本の線）、1本につないで 12 画として数える（${fl.nStrokes} 画 ${J(fl.problems)}）`);
  const noKou = SY.synth({ seed: 3 }).filter((s, i) => i < 9);
  const nk = HW.analyze(noKou, { side: 320 });
  check(!nk.ok && has(nk, ['noKou']), '口（10〜12画）がなければ 口がない で弾く', J(nk.problems));
  // 吉を2つ（時刻をずらして）：糸へんがない。回した位置合わせまで試すので、理由は「左右に分かれない」か
  // 「お手本に当てはまらない」のどちらか（どちらでも画面の案内は同じ「もう一度」）
  const ki = SY.synth({ seed: 3 }).slice(6);
  const ki2 = SY.synth({ seed: 4 }).slice(6).map((x) => ({ points: x.points.map((p) => ({ x: p.x, y: p.y, t: p.t + 30000 })) }));
  const kiOnly = HW.analyze(ki.concat(ki2), { side: 320 });
  check(!kiOnly.ok && (has(kiOnly, ['noSplit']) || has(kiOnly, ['noMatch'])), '吉だけ（糸へんがない）は 左右に分かれない／お手本に当てはまらない で弾く', J(kiOnly.problems));
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

  // 妥当でない字の測定値はすべて null（画面側が ok を見落としても、型や表示に使われない）。score() も null
  const ticks = HW.analyze(Array.from({ length: 12 }, (_, i) => ({ points: [{ x: 50 + i * 20, y: 50 + i * 15, t: i * 300 }, { x: 52 + i * 20, y: 50 + i * 15, t: i * 300 + 80 }] })), { side: 320 });
  const invalid = { ichi, tiny, scr, fast, mr, nk, kiOnly, rv, sh, ovl, zero, ticks,
    segments: HW.analyze(SY.makeOther('segments', { seed: 3 }), { side: 320 }),
    rot90: HW.analyze(SY.transform(SY.synth({ seed: 1 }), 320, tf.rot90), { side: 320 }) };
  const leak = Object.keys(invalid).filter((k) => invalid[k].ok || Object.values(invalid[k].feats).some((v) => v !== null) ||
    HW.score(invalid[k].feats, CAL) !== null || HW.score(invalid[k], CAL) !== null);
  check(!leak.length, `妥当でない字（${Object.keys(invalid).length} 種。どの画にも対応しない短い線12本を含む）は、測定値がすべて null で、score() も null`, J(leak));
  const markLeak = Object.keys(invalid).filter((k) => {
    const m = invalid[k].marks;
    return !m || m.kouUL !== null || m.kouLL !== null || m.kouLR !== null || m.gap !== null || m.slant !== null || m.stops.length !== 0 || typeof m.stopMs !== 'number';
  });
  check(!markLeak.length, '妥当でない字は、結果パネル用の印も空（口の3点・すき間・横画の線は null、とめの印は 0 個）', J(markLeak));
  const good0 = run({ seed: 1 });
  check(J(HW.score(good0, CAL)) === J(HW.score(good0.feats, CAL)), 'score() には analyze() の結果をそのまま渡してもよい（ok なら feats と同じ採点）');

  // 字全体を傾けて書いても（スマホを斜めに持つ）弾かない。回した位置合わせを試すため
  const tilt = [];
  [-20, -15, 15, 20].forEach((deg) => SEEDS.forEach((seed) => {
    const r = run({ seed, rotDeg: deg });
    if (!r.ok) tilt.push(`${deg}° seed ${seed}: ${J(r.problems)}`);
  }));
  check(!tilt.length, '字全体を ±15°・±20° 傾けて書いても妥当として受け付ける', tilt.slice(0, 4).join(' / '));
  const bad20 = [];
  SEEDS.forEach((seed) => {
    const a = run({ seed, hJitterDeg: 0.3, rotNoiseDeg: 0.3 }), b = run({ seed, rotDeg: 20, hJitterDeg: 0.3, rotNoiseDeg: 0.3 });
    ['f1', 'f9', 'f10'].forEach((k) => { if (state(a.feats, k) !== state(b.feats, k)) bad20.push(`seed ${seed} ${k}`); });
    if (Math.abs(a.feats.f12 - b.feats.f12) > 1.5) bad20.push(`seed ${seed} f12 ${a.feats.f12}→${b.feats.f12}`);
  });
  check(!bad20.length, '20° 傾けても、口の開閉は同じで、右上がり（字全体の回転は差し引く）は ±1.5° 以内', bad20.join(' / '));
  // 字全体を傾けても（スマホを斜めに持つ）、縦横比 f7・すき間 f2・大きさ f14・速さ f6 と型は変わらない。
  // 外接枠を字の回転の分だけ回し戻してから測るため（以前は 10° で 4 人に 1 人の型が変わった）
  // 型が変わってよいのは、もともと境界の上（「○○型寄り」と出る人）で、その軸が入れ替わったときだけ
  const tiltBad = [];
  let tiltN = 0, tiltSame = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const a = run({ seed }), sa = HW.score(a, CAL);
    [-20, -10, -5, 5, 10, 20].forEach((deg) => {
      const b = run({ seed, rotDeg: deg });
      tiltN++;
      if (!b.ok) { tiltBad.push(`seed ${seed} ${deg}°: ${J(b.problems)}`); return; }
      const d = ['f2', 'f7', 'f14'].filter((k) => !(Math.abs(a.feats[k] - b.feats[k]) <= 0.02 + 1e-9)).concat(Math.abs(a.feats.f6 - b.feats.f6) <= 0.03 + 1e-9 ? [] : ['f6']);
      if (d.length) tiltBad.push(`seed ${seed} ${deg}°: ${d.map((k) => `${k} ${a.feats[k]}→${b.feats[k]}`).join(', ')}`);
      const sb = HW.score(b, CAL);
      const fx = (sa.x > CAL.center.x) !== (sb.x > CAL.center.x), fy = (sa.y > CAL.center.y) !== (sb.y > CAL.center.y);
      if ((fx && !sa.lean.x) || (fy && !sa.lean.y)) tiltBad.push(`seed ${seed} ${deg}°: ${sa.key}→${sb.key}（境界から遠いのに型が変わる）`);
      if (sb.key === sa.key) tiltSame++;
    });
  }
  check(!tiltBad.length && tiltSame >= 0.9 * tiltN, `字全体を ±5・10・20° 傾けても、f2・f7・f14 は ±0.02、f6 は ±0.03 以内で、型は ${tiltSame}/${tiltN} で同じ（変わるのは境界の上の人だけ）`, tiltBad.slice(0, 4).join(' / '));
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

  // 触れただけの点（キャンバス一辺の 1% 未満）は画数に数えない
  const dots = [];
  for (let seed = 1; seed <= 6; seed++) {
    const st = SY.synth({ seed }), a = HW.analyze(st, { side: 320 });
    const d = [];
    for (let k = 0; k < 6; k++) d.push({ points: [{ x: 10 + 40 * k, y: 12, t: lastT(st) + 300 + k * 200 }, { x: 11 + 40 * k, y: 12, t: lastT(st) + 360 + k * 200 }] });
    const b = HW.analyze(st.concat(d), { side: 320 });
    if (!b.ok || b.nStrokes !== a.nStrokes || J(a.feats) !== J(b.feats)) dots.push(`seed ${seed}: ${b.nStrokes} 画 ${J(b.problems)}`);
  }
  const many = HW.analyze(SY.synth({ seed: 2 }).concat(Array.from({ length: 30 }, (_, k) => ({ points: [{ x: 300, y: 300, t: 1e6 + k * 100 }, { x: 300.5, y: 300, t: 1e6 + k * 100 + 40 }] }))), { side: 320 });
  check(!dots.length && many.ok && many.nStrokes === 12, '触れただけの点（一辺の 1% 未満）は、6個でも30個でも画数に数えず、画数過多にもしない', dots.join(' / ') + ` 30個: ${many.nStrokes} ${J(many.problems)}`);

  // 字の外（角・辺・字のすぐ上下）に落ちた 2〜20% の迷い線：書く前・途中（いちばん長い間の中）・書いたあと。
  // 10% 以下なら妥当性も特徴量も書いた時間も変わらない。20%（書いた線の長さの 5% を超える）は extraInk だけで弾く。
  // 迷い線を画の一部として足したり、外接枠に入れたりすると、縦横比 f7・大きさ f14・すき間 f2・時間が変わるため。
  const POS = { 左上: [0.05, 0.05, 1, 1], 右上: [0.95, 0.05, -1, 1], 左下: [0.05, 0.95, 1, -1], 右下: [0.95, 0.95, -1, -1],
    上: [0.5, 0.04, 1, 0], 下: [0.5, 0.96, 1, 0], 左: [0.04, 0.5, 0, 1], 右: [0.96, 0.5, 0, 1], 口の下: [0.6, 0.92, 1, 1], 士の上: [0.6, 0.08, 1, 1] };
  const CALS0 = require('./hw-calibration.js');
  const rs = SY.mulberry32(4243), writers = [];
  for (let i = 0; i < 4; i++) writers.push({ seed: i + 1, side: 320 });
  for (let i = 0; i < 4; i++) { const p = CALS0.person(rs); writers.push(CALS0.writing(p, SY.mulberry32(i + 1), 23000 + i)); }
  const strayBad = [];
  let strayN = 0;
  writers.forEach((w) => {
    const st = SY.synth(w), a = HW.analyze(st, { side: w.side });
    if (!a.ok) return;
    let gi = 1;
    for (let i = 2; i < st.length; i++) if (st[i].points[0].t - st[i - 1].points.slice(-1)[0].t > st[gi].points[0].t - st[gi - 1].points.slice(-1)[0].t) gi = i;
    const g0 = st[gi - 1].points.slice(-1)[0].t, g1 = st[gi].points[0].t, dur = Math.min(120, (g1 - g0) / 2);
    Object.keys(POS).forEach((pk) => [0.02, 0.05, 0.1, 0.2].forEach((len) => ['前', '途中', 'あと'].forEach((when) => {
      const [x, y, dx, dy] = POS[pk];
      const t0 = when === '前' ? st[0].points[0].t - 500 - dur : (when === '途中' ? (g0 + g1 - dur) / 2 : lastT(st) + 400);
      const sp = SY.stray(w.side, x, y, dx, dy, len, t0, dur);
      const b = HW.analyze(st.concat([sp]), { side: w.side });
      strayN++;
      const same = b.ok && J(b.feats) === J(a.feats) && b.totalMs === a.totalMs;
      const rejected = !b.ok && J(b.problems) === J(['extraInk']);
      // 大きく書く人では「士の上」なども字のすぐそば（インクから 0.06 未満）になる。そこでは、取り合いの確かめで弾いてもよい
      const far = inkDist(sp, st, w.side) >= 0.06;
      if (len <= 0.1 && far ? !same : !(same || rejected)) strayBad.push(`seed ${w.seed} ${pk} ${len * 100}% ${when}: ${b.ok ? '特徴が変わる' : J(b.problems)}`);
    })));
  });
  check(!strayBad.length, `字の外の 2〜20% の迷い線（${strayN} 通り：角・辺・字のすぐ上下 × 長さ × 書く前・途中・あと）で、測定値が黙って変わらない` +
    '（インクから 0.06 以上離れた 10% 以下は測定値も同じ、それ以外は同じか extraInk）', strayBad.slice(0, 4).join('\n         '));

  // 字のすぐ外の 20% の迷い線が、本物の画をお手本の画から押しのけない（以前の例）
  const repro = SY.synth({ seed: 1 }), r0 = HW.analyze(repro, { side: 320 });
  const r1 = HW.analyze(repro.concat([SY.stray(320, 0.25, 0.25, 1, -1, 0.2, lastT(repro) + 400, 240)]), { side: 320 });
  check(r0.ok && (J(r1.problems) === J(['extraInk']) || J(r1.feats) === J(r0.feats)),
    `字の左上、インクから 0.06 の 20% の迷い線（以前は画 1 を取って推進型→設計型）: ${r1.ok ? '測定値は同じ' : J(r1.problems)}`);
  // 字のそば（インクから 0.03〜0.08。線分どうしの正確な距離）の迷い線：長さ 2〜20%、向きはでたらめ、書く前・途中（画と画の間）・あと。
  // 字の内側（糸と吉の間・口のそば）も含みます。本物の画をお手本の画から押しのける・画の一部として足される・画と平行に並んで
  // 画を取り合う、のどれでも、測定値が黙って変わらない（どれも「測定値がまったく同じ」か、弾く）。
  // 以前は、画と平行に 0.03〜0.05 離れた迷い線が画を取り、口の開閉・連綿・すき間が黙って変わっていた（型が変わる例もあった）
  const nbW = [], rn = SY.mulberry32(5150), rr = SY.mulberry32(6160);
  for (let i = 0; i < 8; i++) nbW.push(CALS0.writing(CALS0.person(rn), SY.mulberry32(700 + i), 32000 + i));
  const nbBad = [], nbCodes = {};
  let nbN = 0, nbRej = 0;
  nbW.forEach((w) => {
    const st = SY.synth(w), side = w.side, a = HW.analyze(st, { side });
    if (!a.ok) return;
    const inkPts = [].concat(...st.map((x) => x.points.map((p) => [p.x / side, p.y / side])));
    let got = 0, tries = 0;
    while (got < 45 && tries < 3000) {
      tries++;
      const base = inkPts[Math.floor(rr() * inkPts.length)], off = 0.03 + 0.05 * rr(), oa = rr() * 2 * Math.PI;
      const len = 0.02 + 0.18 * rr(), ang = rr() * 2 * Math.PI, dx = Math.cos(ang), dy = Math.sin(ang);
      const x0 = base[0] + Math.cos(oa) * off, y0 = base[1] + Math.sin(oa) * off;
      if ([x0, y0, x0 + dx * len, y0 + dy * len].some((v) => v < 0.01 || v > 0.99)) continue;
      const when = Math.floor(rr() * 3);
      let t0, dur = 80 + 300 * rr();
      if (when === 0) t0 = st[0].points[0].t - 2000;
      else if (when === 2) t0 = lastT(st) + 500;
      else {
        const gi = 1 + Math.floor(rr() * (st.length - 1)), tA = st[gi - 1].points.slice(-1)[0].t, tB = st[gi].points[0].t;
        dur = Math.min(dur, (tB - tA) * 0.6); t0 = tA + (tB - tA) * 0.2;
      }
      const sp = SY.stray(side, x0, y0, dx, dy, len, t0, dur), md = inkDist(sp, st, side);
      if (md < 0.03 || md > 0.08) continue;
      got++; nbN++;
      const b = HW.analyze(st.concat([sp]), { side });
      if (!b.ok) { nbRej++; b.problems.forEach((c) => { nbCodes[c] = (nbCodes[c] || 0) + 1; }); continue; }
      if (J(b.feats) !== J(a.feats)) {
        nbBad.push(`seed ${w.seed} (${x0.toFixed(3)},${y0.toFixed(3)}) 向き ${(ang * 180 / Math.PI).toFixed(0)}° ${(len * 100).toFixed(1)}% 距離 ${md.toFixed(3)} ` +
          `${['前', '途中', 'あと'][when]}: ${HW.FEATURES.filter((k) => J(a.feats[k]) !== J(b.feats[k])).join(',')}`);
      }
    }
  });
  check(nbN >= 300 && !nbBad.length, `字のそば（インクから 0.03〜0.08）の 2〜20% の迷い線 ${nbN} 通り（向き・時刻はでたらめ）で、測定値が黙って変わらない` +
    `（同じ ${nbN - nbRej}・弾く ${nbRej} ${J(nbCodes)}）`, nbBad.slice(0, 4).join('\n         '));

  // 書き終えてから、底の横画(12)の終わりの方（画の 50%・70% から先）をなぞり直した（ずれ 0 と線の太さ 1 本分）：なぞり書きとして
  // 字のインクに数え、測定値は変わらない（弾かない）。なぞり書きかどうかは、いちばん近いお手本の画の線だけでなく、字のインク全体と比べる。
  // 以前は、口の右下の角のそばで、角で接する横折(11)の線と比べて「なぞり書きでない」とし、extraInk で弾くことがあった
  const rtBad = [], rtRej = [];
  let rtN = 0;
  const rtW = [];
  for (let seed = 1; seed <= 12; seed++) rtW.push({ seed, side: 320 });
  const rrt = SY.mulberry32(9300);
  for (let i = 0; i < 30; i++) rtW.push(Object.assign(CALS0.writing(CALS0.person(rrt), SY.mulberry32(93000 + i), 93000 + i), { renmen: [], split11: false, order: 'standard' }));
  rtW.forEach((w) => {
    const st = SY.synth(w), side = w.side, a = HW.analyze(st, { side });
    if (!a.ok) return;
    const P = st[11].points, mv = P.slice(0, P.length - 1);
    [0.5, 0.7].forEach((fr) => [0, 0.5, 1].forEach((off) => {
      const seg = mv.slice(Math.floor(fr * mv.length)), tEnd = lastT(st) + 500, t0 = seg[0].t;
      const pts = seg.map((q) => ({ x: q.x, y: q.y + off * 0.022 * side, t: q.t - t0 + tEnd }));
      pts.push(Object.assign({}, pts[pts.length - 1], { t: pts[pts.length - 1].t + 60 }));
      const b = HW.analyze(st.concat([{ points: pts }]), { side });
      rtN++;
      const tag = `seed ${w.seed} ${fr * 100}% から ずれ ${off}`;
      /* ずれが線の太さ1本分ちょうどのなぞり直しは、弾いてもよい（書き直してもらう）。ただし黙って測定値を変えないこと。
         なぞり書きの許しを線の太さの 1.25 倍まで広げると、1.0〜1.25 倍ずれたなぞり直しが本物の画の受け持ちを奪い、
         型が黙って変わった（最終確認 R1）ため、許しは線の太さ 1 本分のままにしています */
      if (!b.ok) { if (off < 1) rtRej.push(`${tag}: ${J(b.problems)}`); }
      else if (J(b.feats) !== J(a.feats)) rtBad.push(`${tag}: ${HW.FEATURES.filter((k) => J(a.feats[k]) !== J(b.feats[k])).join(',')}`);
    }));
  });
  check(rtN >= 240 && !rtBad.length && !rtRej.length, `書き終えてから底の横画の終わりの方をなぞり直しても（ずれ 0・線の太さ半分は弾かず、1 本分は弾くことがあるが、${rtN} 通りのどれも測定値を黙って変えない）`,
    rtBad.concat(rtRej).slice(0, 4).join('\n         '));

  // 動かさずに触れて離しただけのタップ（静止中の pointermove の 0.2〜0.3px の揺れつき）は、道のりが一辺の 1% を超えても
  // 画数に数えない（広がりで測る）
  const rj = SY.mulberry32(7), jBad = [];
  const jitterTap = (x, y, t, ms, hz, sd) => {
    const pts = [];
    for (let tt = 0; tt <= ms; tt += 1000 / hz) pts.push({ x: x + SY.gauss(rj) * sd, y: y + SY.gauss(rj) * sd, t: t + tt });
    pts.push({ x, y, t: t + ms + 1 });
    return { points: pts };
  };
  [[150, 120, 0.2], [250, 120, 0.3], [300, 240, 0.2]].forEach(([ms, hz, sd]) => {
    for (let seed = 1; seed <= 4; seed++) {
      const st = SY.synth({ seed }), a = HW.analyze(st, { side: 320 });
      const taps = [];
      for (let k = 0; k < 5; k++) taps.push(jitterTap(20 + 60 * k, 300, lastT(st) + 500 + k * 600, ms, hz, sd));
      const b = HW.analyze(st.concat(taps), { side: 320 });
      if (!b.ok || b.nStrokes !== a.nStrokes || J(b.feats) !== J(a.feats)) jBad.push(`${ms}ms ${hz}Hz ${sd}px seed ${seed}: ${b.nStrokes} 画 ${J(b.problems)}`);
    }
  });
  check(!jBad.length, '揺れつきの静止タップ 5 個（150〜300ms、120〜240Hz）は画数に数えず、測定値も変わらない', jBad.slice(0, 3).join(' / '));

  // 字の上に落ちた 1〜2%（TAP_LEN 未満）のタップは、お手本の画そのもの（組の先頭）にも画の一部にもならない。
  // 画のどの点の上でも（続け書きの糸の 1-2 の上も）、書いたあとに置いたタップで測定値は変わらない。
  // 以前は、続け書きの組の端の画を取り返しでタップが取り、連綿の数や縦横比が黙って変わっていた
  const tapsBad = [];
  let tapsN = 0;
  // 3 人（続け書きなし・糸の 1-2・糸の 1-2 と口の 11-12）の、すべての画のすべての点の上に1つずつ（大きさ 1.2%・1.9% を交互、向きも順に変える）
  [{ seed: 1 }, { seed: 3, renmen: [[1, 2]] }, { seed: 4, renmen: [[1, 2], [11, 12]] }].forEach((wp) => {
    const st = SY.synth(wp), a = HW.analyze(st, { side: 320 }), T = lastT(st);
    if (!a.ok) { tapsBad.push(`seed ${wp.seed}: 元の字が弾かれる`); return; }
    st.forEach((x, si) => x.points.forEach((p, pi) => {
      const ext = pi % 2 ? 0.019 : 0.012, ang = pi * Math.PI / 4, d = ext * 320;
      const tp = { points: [0, 1, 2, 3].map((q) => ({ x: p.x + Math.cos(ang) * d * q / 3, y: p.y + Math.sin(ang) * d * q / 3, t: T + 300 + q * 10 })) };
      tp.points.push({ x: tp.points[3].x, y: tp.points[3].y, t: T + 350 });
      const b = HW.analyze(st.concat([tp]), { side: 320 });
      tapsN++;
      if (!b.ok || J(b.feats) !== J(a.feats)) tapsBad.push(`seed ${wp.seed} ${si + 1}本目の ${pi} 点目 ${ext * 100}%: ${b.ok ? HW.FEATURES.filter((k) => J(a.feats[k]) !== J(b.feats[k])).join(',') : J(b.problems)}`);
    }));
  });
  check(!tapsBad.length, `画のすべての点の上に置いた 1〜2% のタップ（${tapsN} 通り。続け書きの 1-2・11-12 の上も）でも、測定値は変わらない`, tapsBad.slice(0, 4).join(' / '));
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
    if (Math.abs(step - 0.05) > 0.015 + 1e-9) bad.push(`seed ${seed}: 0.04 ずらしたときの増え方 ${step.toFixed(3)}（期待 0.05±0.015）`);
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
  // 字全体を ±25° 傾けても、右上がり f12 には回転が入らない（字全体の回転の推定 charTilt を引く）。
  // 以前は縦画 4・8 の傾きを引いていて、25° を超えて倒れた縦画を捨てたため、25° では 4 人に 1 人で 5° 超ずれた
  const CALT = require('./hw-calibration.js'), rt = SY.mulberry32(4141), tiltW = [];
  for (let i = 0; i < 40; i++) tiltW.push(Object.assign(CALT.writing(CALT.person(rt), SY.mulberry32(9000 + i), 9000 + i), { rotDeg: 0 }));
  const f12Bad = [], f12Far = [];
  let f12N = 0;
  tiltW.forEach((w, i) => {
    const a = HW.analyze(SY.synth(w), { side: w.side });
    if (!a.ok) return;
    [-25, 25].forEach((deg) => {
      const b = HW.analyze(SY.synth(Object.assign({}, w, { rotDeg: deg })), { side: w.side });
      if (!b.ok) return;
      f12N++;
      const d = Math.abs(b.feats.f12 - a.feats.f12);
      if (!(d <= 3)) f12Bad.push(`#${i} ${deg}°: f12 ${a.feats.f12}→${b.feats.f12}`);
      if (!(d <= 5)) f12Far.push(`#${i} ${deg}°: f12 ${a.feats.f12}→${b.feats.f12}`);
    });
  });
  check(f12N >= 70 && !f12Far.length && f12Bad.length <= 0.05 * f12N,
    `字全体を ±25° 傾けても、右上がり f12 の差はどの人も 5° 以内、3° 以内が ${f12N - f12Bad.length}/${f12N}（95% 以上）`, f12Far.concat(f12Bad).join(' / '));
  // 回転の推定が MAX_ROT（30°）を超えるときは 30° に抑えて回し戻す（以前は 0 にしたので、-30° 前後で縦横比・すき間が急にずれた）
  const clampRows = [];
  [-32, -30, 30].forEach((deg) => {
    const d7 = [], d2 = [];
    tiltW.forEach((w) => {
      const a = HW.analyze(SY.synth(w), { side: w.side }), b = HW.analyze(SY.synth(Object.assign({}, w, { rotDeg: deg })), { side: w.side });
      if (a.ok && b.ok) { d7.push(b.feats.f7 - a.feats.f7); d2.push(b.feats.f2 - a.feats.f2); }
    });
    const m = (x) => x.reduce((p, q) => p + q, 0) / Math.max(1, x.length);
    clampRows.push({ deg, n: d7.length, f7: m(d7), f2: m(d2) });
  });
  check(clampRows.every((r) => r.n >= 25 && Math.abs(r.f7) <= 0.06 && Math.abs(r.f2) <= 0.02),
    `字全体を 30〜32° 傾けても、縦横比 f7・すき間 f2 の平均のずれは小さい（${clampRows.map((r) => `${r.deg}°: ${r.n} 人 f7 ${r.f7.toFixed(3)} f2 ${r.f2.toFixed(3)}`).join('／')}）`);
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
  // 口を4画で書いて、横折の縦を角ぴったりでなく、角から線の太さの 1〜2 倍ずれた所（角の下＝すき間、上の横画を突き抜けた上）や、
  // 横に線の太さほどずれた所から書き始めても、弾かず、縦は横折(11)の一部として足す（farJoin）。形（すき間・縦横比・大きさ・
  // 口の左上と左下）はずれのないときと丸めの1目盛り以内で同じ（右下 f9 は縦の終わりの位置で決まるので、境目では変わることがある）。
  // 以前は、縦の書き出しが角の線の太さの 1.5 倍（横は 1 倍）より外だと足さず、extraInk で弾いていた（角の 1.5 倍下で 95%）
  const s11Bad = [], s11Chg = [], s11W = [];
  let s11N = 0;
  for (let seed = 1; seed <= 12; seed++) s11W.push({ seed });
  const CALS11 = require('./hw-calibration.js'), r11 = SY.mulberry32(1111);
  for (let i = 0; i < 30; i++) s11W.push(Object.assign(CALS11.writing(CALS11.person(r11), SY.mulberry32(11000 + i), 11000 + i), { renmen: [], order: 'standard' }));
  s11W.forEach((w0) => {
    const w = Object.assign({}, w0, { split11: true, split11Start: 0, split11Side: 0 }), side = w.side || 320;
    const a = HW.analyze(SY.synth(w), { side });
    if (!a.ok) { s11Bad.push(`seed ${w.seed} ずれなし: ${J(a.problems)}`); return; }
    [[1, 0], [2, 0], [-1, 0], [-2, 0], [0, 1], [0, -1]].forEach(([along, lat]) => {
      const m = SY.make(Object.assign({}, w, { split11Start: along * 0.022, split11Side: lat * 0.022 }));
      const b = HW.analyze(m.strokes, { side, debug: true });
      s11N++;
      const tag = `seed ${w.seed} ${along ? `${along > 0 ? '角の下' : '角の上'} ${Math.abs(along)}` : `横 ${lat}`} 本分`;
      // 2本とも 11 に（接触の途切れとして1本につながったなら、その1本が 11 に）対応づき、ほかの画の対応づけは同じ
      const asg = b.ok ? b.debug.assign.map(J) : [], want = m.truth.map(J);
      const sameAsg = b.ok && J(asg.filter((x) => x !== '[11]')) === J(want.filter((x) => x !== '[11]')) && asg.indexOf('[11]') >= 0 && asg.every((x) => x !== '[]');
      if (!b.ok || !sameAsg) { s11Bad.push(`${tag}: ${b.ok ? J(b.debug.assign) : J(b.problems)}`); return; }
      const dd = ['f1', 'f10'].filter((f) => state(a.feats, f) !== state(b.feats, f)).concat(['f2', 'f7', 'f14'].filter((f) => !(Math.abs(a.feats[f] - b.feats[f]) <= 0.01 + 1e-9)));
      if (dd.length) s11Chg.push(`${tag}: ${dd.map((f) => `${f} ${J(a.feats[f])}→${J(b.feats[f])}`).join(', ')}`);
    });
  });
  check(s11N >= 250 && !s11Bad.length && !s11Chg.length, `口を4画で書き、横折の縦を角から線の太さの 1〜2 本分ずらして（下・上・横）書き始めても（${s11N} 通り）、弾かず、縦は 11 の一部になり、形も変わらない`,
    s11Bad.concat(s11Chg).slice(0, 4).join('\n         '));
  // 画の途中で指を上げて、同じ所から書き足した（2〜3本に切れた）。0.08 秒（接触の途切れと同じ扱いで1本につなぐ）でも、
  // 0.15 秒（「画の一部」として同じ画に足す）でも、外接枠による特徴（大きさ f14・縦横比 f7・すき間 f2）・頭部突出 f13・
  // 口の開閉は、丸めの1目盛り以内で変わらない
  const cut = [];
  for (let seed = 1; seed <= 12; seed++) {
    const st = SY.synth({ seed }), a = HW.analyze(st, { side: 320 });
    [[4, 2, 80], [4, 3, 80], [7, 2, 150], [8, 2, 80], [12, 2, 150], [4, 2, 150]].forEach(([k, parts, gapMs]) => {
      const b = HW.analyze(SY.split(st, k - 1, parts, gapMs), { side: 320 });
      const d = ['f1', 'f9', 'f10'].filter((f) => state(a.feats, f) !== state(b.feats, f))
        .concat(['f2', 'f7', 'f13', 'f14'].filter((f) => !(Math.abs(a.feats[f] - b.feats[f]) <= 0.01 + 1e-9)));
      if (!b.ok || d.length) cut.push(`seed ${seed} ${k}画目を${parts}本に（${gapMs}ms）: ${b.ok ? d.map((f) => `${f} ${J(a.feats[f])}→${J(b.feats[f])}`).join(', ') : J(b.problems)}`);
    });
  }
  check(!cut.length, '画が途中で2〜3本に切れても（指を上げて 0.08・0.15 秒後に書き足す）、大きさ・縦横比・すき間・頭部突出・口の開閉は変わらない（72 通り、丸めの1目盛り以内）', cut.slice(0, 4).join('\n         '));
  // 時間の特徴も：タッチの取りこぼし（指は動いたまま、接触だけが 20〜60ms 途切れる）で切れた線は1本につなぎ、
  // 切れ目は「画と画の間」に数えない（画の数・間の割合 f8・速さ f6・止め f5 は変わらない）
  // 型が変わってよいのは、もともと境界の上（「○○型寄り」と出る人）で、その軸が入れ替わったときだけ
  const cutT = [];
  let cutN = 0, cutSame = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const st = SY.synth({ seed }), a = HW.analyze(st, { side: 320 }), sa = HW.score(a, CAL);
    [1, 3, 6, 8, 11].forEach((k) => [20, 40, 60].forEach((gap) => {
      const b = HW.analyze(SY.split(st, k, 2, gap, 'dropout'), { side: 320 });
      cutN++;
      const sb = b.ok ? HW.score(b, CAL) : null;
      const fx = sb && (sa.x > CAL.center.x) !== (sb.x > CAL.center.x), fy = sb && (sa.y > CAL.center.y) !== (sb.y > CAL.center.y);
      if (!b.ok || b.nStrokes !== a.nStrokes || !(Math.abs(a.feats.f8 - b.feats.f8) <= 0.01 + 1e-9) || !(Math.abs(a.feats.f6 - b.feats.f6) <= 0.02 + 1e-9) ||
          !(Math.abs(a.feats.f5 - b.feats.f5) <= 20) || (fx && !sa.lean.x) || (fy && !sa.lean.y)) {
        cutT.push(`seed ${seed} ${k + 1}画目 ${gap}ms: ${b.ok ? `f8 ${a.feats.f8}→${b.feats.f8} f6 ${a.feats.f6}→${b.feats.f6} f5 ${a.feats.f5}→${b.feats.f5} ${sa.key}→${sb.key}` : J(b.problems)}`);
      }
      if (sb && sb.key === sa.key) cutSame++;
    }));
  }
  check(!cutT.length, `画の途中で接触が 20〜60ms 途切れても、画の数は同じで、間の割合 f8 は ±0.01、速さ f6 は ±0.02、止め f5 は ±20ms 以内（1本につなぐ）。` +
    `型は ${cutSame}/${cutN} で同じ（変わるのは境界の上の人だけ）`, cutT.slice(0, 4).join('\n         '));
  // 画の終わり際（動いていた時間の 80〜90%）・止めている最中（止めの 30%）・書き出し直後（5〜15%）の接触の途切れ（20〜40ms）。
  // 切れ端がどんなに小さくても（DOT_LEN 未満でも）時間でつないで1本にするので、止め（とめの印）・画の本当の端（外接枠・口の角）は
  // 途切れなかったときと同じに測る。以前は、小さな切れ端を捨てていたので、止めが途切れた位置で測られて「とめ」の印が消え
  // （8 割前後）、縦横比 f7 や口の左上 f1 が変わっていた（型が 1〜2 割変わった）
  const CALS1 = require('./hw-calibration.js');
  const rd = SY.mulberry32(1616), dropP = [];
  for (let i = 0; i < 40; i++) dropP.push(CALS1.person(rd));
  const dropBase = dropP.map((p, i) => Object.assign(CALS1.writing(p, SY.mulberry32(16000 + i), 16000 + i), { renmen: [], split11: false, order: 'standard' }));
  const dropCal = CALS1.fitCal(dropBase.map((w) => HW.analyze(SY.synth(w), { side: w.side })).filter((r) => r.ok).map((r) => r.feats));
  const dropBad = [], dropSt = {};
  let dropN = 0, dropSame = 0, dropMarks = 0, dropMarkN = 0;
  dropBase.forEach((w) => {
    const st = SY.synth(w), a = HW.analyze(st, { side: w.side, cal: dropCal });
    if (!a.ok) return;
    const sa = HW.score(a, dropCal);
    [[3, 'end', 0.8], [3, 'end', 0.9], [3, 'stop', 0.3], [9, 'start', 0.05], [9, 'start', 0.15], [6, 'end', 0.85], [11, 'stop', 0.3]].forEach(([k, kind, fr]) => [20, 40].forEach((gap) => {
      const P = st[k].points, tM = P[P.length - 2].t, tU = P[P.length - 1].t, t0 = P[0].t;
      // 割合 fr を、線の時刻（書き始め=0、pointerup=1）に直す
      const frac = kind === 'stop' ? (tM + (tU - tM) * fr - t0) / (tU - t0) : (tM - t0) * fr / (tU - t0);
      if (kind === 'stop' && tU - tM < 3 * gap) return;
      const d = SY.dropout(st, k, frac, gap);
      if (!d) return;
      const b = HW.analyze(d, { side: w.side, cal: dropCal });
      dropN++;
      dropSt[kind] = (dropSt[kind] || 0) + 1;
      if (!b.ok || b.nStrokes !== a.nStrokes) { dropBad.push(`seed ${w.seed} ${k + 1}画目 ${kind} ${fr} ${gap}ms: ${b.ok ? b.nStrokes + ' 画' : J(b.problems)}`); return; }
      const sb = HW.score(b, dropCal);
      if (sb.key === sa.key) dropSame++;
      a.marks.stops.forEach((m) => { const q = b.marks.stops.find((x) => x.n === m.n); dropMarkN++; if (q && q.stop === m.stop) dropMarks++; });
      const dd = ['f1', 'f9', 'f10'].filter((f) => state(a.feats, f) !== state(b.feats, f))
        .concat(['f2', 'f7', 'f14'].filter((f) => !(Math.abs(a.feats[f] - b.feats[f]) <= 0.01 + 1e-9)))
        .concat(Math.abs(a.feats.f5 - b.feats.f5) <= 20 ? [] : ['f5']);
      if (dd.length) dropBad.push(`seed ${w.seed} ${k + 1}画目 ${kind} ${fr} ${gap}ms: ${dd.map((f) => `${f} ${J(a.feats[f])}→${J(b.feats[f])}`).join(', ')}`);
    }));
  });
  check(dropN >= 300 && dropBad.length <= dropN * 0.01 && dropSame >= 0.98 * dropN && dropMarks >= 0.97 * dropMarkN,
    `画の終わり際・止めの最中・書き出し直後の接触の途切れ ${dropN} 通り（${J(dropSt)}）で、画の数は同じ、口の開閉・すき間・縦横比・大きさ・止め（±20ms）が` +
    `変わったのは ${dropBad.length} 通り（1% 以下）、型は ${dropSame}/${dropN} で同じ、とめの印は ${dropMarks}/${dropMarkN} で同じ`, dropBad.slice(0, 4).join('\n         '));
  // 折れのある画（糸の 1・2 画目の「く」、口の横折 11）の、画の 20〜80% の所で接触が 40〜90ms 途切れても弾かない。形（口の開閉・
  // 転折・すき間・縦横比・大きさ・頭部突出・連綿）は変わらない。角の前後の途切れは、向きが途切れの前後で回るので、ずれの向きが
  // その間にあればつなぎ（continues）、つながらなくても離した所から続く切れ端は同じ画に足す（farJoin・attachParts の tail）。
  // 以前は角の前後の途切れをつながず、切れ端を extraInk で弾いていた（60ms で 1 画目の 3 割、90ms で 11 画目の 4 割）。
  // 弾いてよいのは 1% まで：画の書き出し直後の長い途切れで、切れ端が離した所から線の太さの PART_FAR（4）倍より離れたとき
  // （速く書く人の 90ms。どちらの画かを形から確かめられないので、黙って足さずに「もう一度」）
  const cornerBad = [], cornerChg = [];
  let cornerN = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const st = SY.synth({ seed }), a = HW.analyze(st, { side: 320 });
    [0, 1, 10].forEach((k) => [0.2, 0.4, 0.6, 0.8].forEach((frac) => [40, 60, 90].forEach((gap) => {
      const d = SY.dropout(st, k, frac, gap);
      if (!d) return;
      const b = HW.analyze(d, { side: 320 });
      cornerN++;
      if (!b.ok) { cornerBad.push(`seed ${seed} ${k + 1}画目 ${frac * 100}% ${gap}ms: ${J(b.problems)}`); return; }
      const dd = ['f1', 'f9', 'f10', 'f11'].filter((f) => state(a.feats, f) !== state(b.feats, f))
        .concat(['f2', 'f7', 'f13', 'f14'].filter((f) => !(Math.abs(a.feats[f] - b.feats[f]) <= 0.01 + 1e-9)))
        .concat(a.feats.f4 === b.feats.f4 ? [] : ['f4']);
      if (dd.length) cornerChg.push(`seed ${seed} ${k + 1}画目 ${frac * 100}% ${gap}ms: ${dd.map((f) => `${f} ${J(a.feats[f])}→${J(b.feats[f])}`).join(', ')}`);
    })));
  }
  check(cornerN >= 400 && cornerBad.length <= cornerN * 0.01 && !cornerChg.length, `折れのある画（1・2・11）の 20〜80% で接触が 40〜90ms 途切れても（${cornerN} 通り）、弾くのは ${cornerBad.length} 通り（1% 以下）で、形の測定値も変わらない`,
    cornerBad.concat(cornerChg).slice(0, 4).join('\n         '));
  // 書き終えてから画の終わりに落ちた小さなタップ（一辺の 1.2〜1.8%）は、画の続きとして数えない（なぞり書きと同じ扱い）
  const tapEnd = [], lastT = (st) => st[st.length - 1].points.slice(-1)[0].t;
  for (let seed = 1; seed <= 6; seed++) {
    const st = SY.synth({ seed }), a = HW.analyze(st, { side: 320 }), T = lastT(st);
    st.forEach((x, i) => [0.012, 0.018].forEach((len) => {
      const e = x.points[x.points.length - 1], d = len * 320 * 0.7;
      const tp = { points: [{ x: e.x, y: e.y, t: T + 300 }, { x: e.x + d, y: e.y + d, t: T + 345 }, { x: e.x + d, y: e.y + d, t: T + 390 }] };
      const b = HW.analyze(st.concat([tp]), { side: 320 });
      if (!b.ok || J(b.feats) !== J(a.feats)) tapEnd.push(`seed ${seed} ${i + 1}画目の終わり ${len * 100}%: ${b.ok ? Object.keys(a.feats).filter((q) => J(a.feats[q]) !== J(b.feats[q])).join(',') : J(b.problems)}`);
    }));
  }
  check(!tapEnd.length, '書き終えてから画の終わりに落ちた 1.2〜1.8% のタップ（6 人 × 12 画 × 2）で、測定値は変わらない', tapEnd.slice(0, 4).join(' / '));
  const kou = SY.make({ seed: 3, renmen: [[10, 12]] });
  const d = HW.analyze(kou.strokes, { side: 320, debug: true });
  check(J(d.debug.assign) === J(kou.truth), '一筆の口は 10・11・12 画をまとめて覆う1本として対応づく', J(d.debug.assign));
}

/* ============================================================ とめ */
head('■ 収筆の止め（f5）');
{
  const nuki = SEEDS.map((seed) => run({ seed, stopMs: 0 }));
  const tome = SEEDS.map((seed) => run({ seed, stopMs: 250 }));
  check(nuki.every((r) => r.feats.f5 <= 20), `止めずに離すと f5 はほぼ 0ms（${J(nuki.map((r) => r.feats.f5))}）`);
  check(tome.every((r) => r.feats.f5 >= 170 && r.feats.f5 <= 330), 'しっかり（250ms 前後）止めると f5 もその前後（画ごとのばらつき込みで 170〜330ms）', J(tome.map((r) => r.feats.f5)));
  const cnt = (r) => r.marks.stops.filter((s) => s.stop).length;
  check(tome.every((r) => cnt(r) === 5) && nuki.every((r) => cnt(r) === 0), 'とめの印：止めれば5画とも「とめ」、止めなければ0画',
    J(tome.map(cnt)) + ' / ' + J(nuki.map(cnt)));
  const mixed = run({ seed: 1, stopMs: { 4: 300, 7: 300, 8: 300, 9: 0, 12: 0 } });
  check(cnt(mixed) === 3 && mixed.feats.f5 >= 150, `5画のうち3画で止めれば、f5 は「止めた」側になる（f5=${mixed.feats.f5}、とめ ${cnt(mixed)}画）`);

  // 止めの長さは、書く速さに引っぱられない（以前は、ゆっくり書くだけで止め 0ms の人が 5画とも「とめ」・「止めが長め」になった）。
  // ここでは analyze() に cal を渡さない呼び方（しきい値は STOP_MS）で、採点も f5 の中央値を STOP_MS にした較正で確かめる。
  // （画面側 yui/hw.js は analyze() に較正を渡すので、しきい値は較正の f5 の中央値。どちらでも印と採点の基準は同じ値）
  const CAL_SHIP = JSON.parse(J(CAL));
  CAL_SHIP.features.f5.median = HW.STOP_MS;
  const slowBad = [];
  let slowN = 0;
  [0.3, 0.5, 0.8, 1.3].forEach((speed) => [60, 120, 240].forEach((hz) => { for (let seed = 1; seed <= 8; seed++) {
    const a = HW.analyze(SY.synth({ seed, speed, stopMs: 0, hz }), { side: 320 });
    if (!a.ok) { slowBad.push(`速さ ${speed} ${hz}Hz seed ${seed}: ${J(a.problems)}`); continue; }
    slowN++;
    const h = HW.score(a, CAL_SHIP).highlight;
    if (cnt(a) > 0 || (h && h.feature === 'f5' && h.sign > 0)) slowBad.push(`速さ ${speed} ${hz}Hz seed ${seed}: f5=${a.feats.f5} とめ ${cnt(a)}画 ${J(h)}`);
  } }));
  check(!slowBad.length, `止めずに離す人は、速さ 0.3〜1.3 字高/秒のどれでも（${slowN} 通り）、とめの印が 0 画で、「止めが長め」にもならない`, slowBad.slice(0, 4).join(' / '));
  const bySpeed = [0.3, 0.5, 0.8, 1.3, 2].map((speed) => {
    const v = [];
    for (let seed = 1; seed <= 8; seed++) [60, 120, 240].forEach((hz) => v.push(HW.analyze(SY.synth({ seed, speed, stopMs: 150, hz }), { side: 320 }).feats.f5));
    v.sort((x, y) => x - y);
    return v[v.length >> 1];
  });
  check(Math.max(...bySpeed) - Math.min(...bySpeed) <= 40 && bySpeed.every((v) => v >= 100 && v <= 180),
    `同じ 150ms の止めなら、速さ 0.3〜2 字高/秒で f5 の中央値の差は 40ms 以内（${J(bySpeed)}）`);

  // 較正を渡すと、とめの印のしきい値は較正の f5 の中央値になる（「いちばん特徴」の f5 の向きと同じ基準）。
  // 渡さなければ同梱の較正の中央値（STOP_MS）
  let pick = null;
  for (let seed = 20; seed <= 60 && !pick; seed++) {
    const st = SY.synth({ seed, stopMs: 140 }), a = HW.analyze(st, { side: 320 });
    if (a.ok && a.marks.stops.length === 5 && a.marks.stops.every((q) => q.stop) && a.feats.f5 < CAL.features.f5.median) pick = st;
  }
  const noCal = pick && HW.analyze(pick, { side: 320 }), withCal = pick && HW.analyze(pick, { side: 320, cal: CAL });
  const sameXY = pick && withCal.marks.stops.length === noCal.marks.stops.length && withCal.marks.stops.every((q, i) => {
    const r = noCal.marks.stops[i];
    return r.n === q.n && r.x === q.x && r.y === q.y && (!q.stop || r.stop);
  });
  check(pick && noCal.marks.stopMs === HW.STOP_MS && withCal.marks.stopMs === CAL.features.f5.median && J(withCal.feats) === J(noCal.feats) &&
    sameXY && cnt(withCal) <= 2 && cnt(noCal) === 5,
    `analyze(…, { cal }) では、とめのしきい値が較正の中央値（${CAL.features.f5.median}ms）になり、測定値は変わらない` +
    `（f5=${pick && withCal.feats.f5}ms：しきい値 ${HW.STOP_MS}ms（同梱の較正）ならとめ ${pick && cnt(noCal)}画、${CAL.features.f5.median}ms なら ${pick && cnt(withCal)}画）`);

  // f5 の向きととめの印は、測れた画が何画でも食い違わない（f5 は下側の中央値。過半数がとめ ⇔ 長い向き）。
  // 士の 7-8・口を一筆で書くと、測れるとめの画は 4 画（以前は、とめ 2 画なのに「止めが長め」が出た）
  // （採点は、すき間などの中央値を合成の字に合わせ、f5 の中央値を STOP_MS にした較正で。f5 が「いちばん特徴」に出やすいように）
  const agree = (a, h) => { const c = cnt(a), n = a.marks.stops.length; return h.sign > 0 ? 2 * c > n : 2 * c <= n; };
  const CAL4 = JSON.parse(J(CAL_SHIP));
  CAL4.features.f2.median = 0.15; CAL4.features.f7.median = 0;
  const four = [];
  let fourHl = 0, fourSign = {};
  for (let seed = 1; seed <= 40; seed++) {
    [[[7, 8]], [[10, 12]]].forEach((ren) => [[0, 0, 300, 320], [40, 300, 300, 320], [40, 90, 260, 320], [0, 60, 150, 400]].forEach((v) => {
      const tome = ren[0][0] === 7 ? [4, 8, 9, 12] : [4, 7, 8, 9], stopMs = {};
      tome.forEach((t, q) => { stopMs[t] = v[(q + seed) % 4]; });
      const a = HW.analyze(SY.synth({ seed, renmen: ren, stopMs }), { side: 320 });
      if (!a.ok) return;
      const sc = HW.score(a, CAL4), h = sc.highlight;
      if (!h || h.feature !== 'f5') return;
      fourHl++; fourSign[h.sign] = (fourSign[h.sign] || 0) + 1;
      const dec = HW.decodeShare(HW.encodeShare(sc, a));
      if (a.marks.stops.length !== 4 || !agree(a, h) || !(dec && dec.highlight && dec.highlight.feature === 'f5' && dec.highlight.sign === h.sign)) {
        four.push(`seed ${seed} ${J(ren)}: f5=${a.feats.f5} 向き ${h.sign} とめ ${cnt(a)}/${a.marks.stops.length} → ${dec && J(dec.highlight)}`);
      }
    }));
  }
  check(fourHl >= 20 && fourSign[1] && fourSign[-1] && !four.length, `とめの画が 4 画しか測れない字（f5 が「いちばん特徴」の ${fourHl} 通り、長い向き ${fourSign[1]}・短い向き ${fourSign[-1]}）でも、` +
    'f5 の向きととめの印の過半数がそろい、シェアにも「いちばん特徴」が残る', four.slice(0, 3).join(' / '));

  // 合成の母集団（1回書き）で：f5 が「いちばん特徴」なら、向きととめの印は必ずそろい、シェアにも「いちばん特徴」がそのまま入る
  const CALS = require('./hw-calibration.js');
  const rp = SY.mulberry32(2024), clash = [];
  let f5hl = 0;
  for (let i = 0; i < 300; i++) {
    const p = CALS.writing(CALS.person(rp), SY.mulberry32(i + 11), 7000 + i);
    p.stopMs *= [0.6, 1, 1.6][i % 3];
    const a = HW.analyze(SY.synth(p), { side: p.side, cal: CAL });
    if (!a.ok) continue;
    const sc = HW.score(a, CAL), h = sc.highlight;
    if (!h || h.feature !== 'f5') continue;
    f5hl++;
    const c = cnt(a), dec = HW.decodeShare(HW.encodeShare(sc, a)), dec0 = HW.decodeShare(HW.encodeShare(sc, a.feats));
    if (!agree(a, h)) clash.push(`#${i} f5=${a.feats.f5} 向き ${h.sign} とめ ${c}/${a.marks.stops.length}画`);
    if (!(dec && J(dec.highlight) === J(h) && (dec.disp.f5 === c || dec.disp.f5 === null))) clash.push(`#${i} シェア（印あり）で f5 が落ちる ${dec && J(dec.highlight)}`);
    if (!(dec0 && J(dec0.highlight) === J(h) && dec0.disp.f5 === null)) clash.push(`#${i} シェア（印なし）で f5 が落ちる`);
  }
  check(f5hl >= 20 && !clash.length, `合成の 300 人（1回書き・cal を渡す）で、f5 が「いちばん特徴」の ${f5hl} 人すべて、向きととめの数が食い違わず、シェアにもそのまま入る（印を渡しても渡さなくても）`, clash.slice(0, 3).join(' / '));
}

/* ============================================================ ふるえ・途中の間 */
head('■ 結果に使わない約束：ふるえ・途中の長い間');
{
  const CALS = require('./hw-calibration.js');
  // 同じ人たちを、ふるえなし／ふるえ 2px・8Hz で2回ずつ書かせ、型の割合がどれだけ動くかを見る。
  // 較正はふるえなしの人たちから作る（本番と同じ作り方）。
  // 人数は 600 人。300 人では、型の割合の差そのものの抽出のぶれが ±1.5 ポイントほどあり（種を変えると 3.0〜5.7）、
  // 5 ポイントの関門が偶然で通ったり落ちたりしていたためです（関門の値は変えていません）。
  const rp = SY.mulberry32(31337), N = 600;
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

  // 速さ f6 は「指が動いていた時間」で割る：止め（とめ）の長さは f5 だけに入り、f6 には入らない（以前は止め 200ms で f6 が 2 割下がり、
  // 止めが f5 と f6 の両方から y 軸に入っていた）。動く速さが同じなら、止め 0ms と 200ms・400ms で f6 はまったく同じ
  // （止めている間に位置の同じ pointermove が来る端末でも ±0.01）
  const stopBad = [];
  for (let i = 0; i < 30; i++) {
    const w = CALS.writing(people[i], SY.mulberry32(24000 + i), 24000 + i);
    [false, true].forEach((holdEvents) => {
      const f6 = [0, 200, 400].map((stopMs) => HW.analyze(SY.synth(Object.assign({}, w, { stopMs, holdEvents })), { side: w.side }).feats.f6);
      if (f6.some((v) => v === null) || (holdEvents ? f6.some((v) => Math.abs(v - f6[0]) > 0.01 + 1e-9) : f6.some((v) => v !== f6[0]))) stopBad.push(`#${i}${holdEvents ? ' 止めの間も pointermove' : ''}: ${J(f6)}`);
    });
  }
  check(!stopBad.length, '動く速さが同じなら、止め 0・200・400ms で速さ f6 は同じ（30 人。止めの間の pointermove ありでも ±0.01）', stopBad.slice(0, 4).join(' / '));

  // 同じ止めのあとに「とめ」で離しても「はね」ても（止めた位置から字の大きさの 1 割ほど、左上へ 60ms ではねる）、速さ f6 は ±3%、
  // 間の割合 f8 は ±0.01 で同じ。はねの折り返した点を画の終わりとみなす（hookRefs）。以前は、はねが EDGE_Q より長いと
  // 止めが動いていた区間に入り、0.2 秒未満の止めは一部しか除かないので、f6 が最大 15% 下がっていた（止め 60〜100ms で 4〜5 割の人が 5% 超）
  const withHane = (st, idx, side) => {
    const out = st.map((s) => ({ points: s.points.map((p) => ({ x: p.x, y: p.y, t: p.t })) }));
    const P = out[idx].points, up = P.pop(), e0 = P[P.length - 1], n = 4, dx = -0.05 * side / Math.hypot(1, 0.8), dy = 0.8 * dx;
    for (let k = 1; k <= n; k++) P.push({ x: e0.x + dx * k / n, y: e0.y + dy * k / n, t: up.t + 60 * k / n });
    P.push({ x: P[P.length - 1].x, y: P[P.length - 1].y, t: up.t + 61 });
    for (let k = idx + 1; k < out.length; k++) out[k].points.forEach((p) => { p.t += 61; });
    return out;
  };
  const haneBad = [];
  let haneN = 0, haneMax = 0;
  const rh = SY.mulberry32(3030);
  for (let i = 0; i < 40; i++) {
    const w0 = Object.assign(CALS.writing(CALS.person(rh), SY.mulberry32(30000 + i), 30000 + i), { renmen: [], split11: false, order: 'standard' });
    [3, 7].forEach((idx) => [60, 100, 150, 250].forEach((stop) => {
      const st = SY.synth(Object.assign({}, w0, { stopMs: stop }));
      // この画の止めをちょうど stop ms にそろえる（あとの画はずらす）
      const P = st[idx].points, lm = P[P.length - 2], up = P[P.length - 1], dt = lm.t + stop - up.t;
      up.t = lm.t + stop;
      for (let k = idx + 1; k < st.length; k++) st[k].points.forEach((p) => { p.t += dt; });
      const a = HW.analyze(st, { side: w0.side }), b = HW.analyze(withHane(st, idx, w0.side), { side: w0.side });
      if (!a.ok || !b.ok) { haneBad.push(`#${i} ${idx + 1}画目 止め ${stop}ms: ${J(a.problems)} ${J(b.problems)}`); return; }
      haneN++;
      haneMax = Math.max(haneMax, Math.abs(b.feats.f6 / a.feats.f6 - 1));
      if (Math.abs(b.feats.f6 / a.feats.f6 - 1) > 0.03 || Math.abs(b.feats.f8 - a.feats.f8) > 0.01 + 1e-9) haneBad.push(`#${i} ${idx + 1}画目 止め ${stop}ms: f6 ${a.feats.f6}→${b.feats.f6} f8 ${a.feats.f8}→${b.feats.f8}`);
    }));
  }
  check(haneN >= 300 && !haneBad.length, `同じ止め（60〜250ms）のあとに「とめ」で離しても「はね」ても、速さ f6 は ±3%（最大 ${(100 * haneMax).toFixed(1)}%）・f8 は ±0.01 で同じ（${haneN} 通り。糸の縦 4・士の縦 8）`, haneBad.slice(0, 4).join(' / '));

  // 画の途中で指を離して、0.3 秒後に同じ所から続けて書いた（画の一部）：速さ f6 は ±2%、間の割合 f8 は ±0.01 で同じ。
  // 画の一部をつないだ1本の線（unitRaw）で、書き出しと終わりの EDGE_Q を除くのは画の本当の両端だけ。以前は切れ端ごとに両端を除いたので、
  // f8 が最大 0.07 変わり、型の変わる人が 0.8% → 2.2% に増えていた
  const liftBad = [];
  let liftN = 0, liftMax6 = 0, liftMax8 = 0;
  const rl = SY.mulberry32(2020);
  for (let i = 0; i < 90; i++) {
    const w = Object.assign(CALS.writing(CALS.person(rl), SY.mulberry32(20000 + i), 20000 + i), { renmen: [], split11: false, order: 'standard' });
    const idx = [0, 1, 3, 6, 7, 8, 9, 10, 11][i % 9], st = SY.synth(w), a = HW.analyze(st, { side: w.side });
    if (!a.ok) continue;
    const b = HW.analyze(SY.split(st, idx, 2, 300, 'lift'), { side: w.side });
    liftN++;
    if (!b.ok) { liftBad.push(`#${i} ${idx + 1}画目: ${J(b.problems)}`); continue; }
    liftMax6 = Math.max(liftMax6, Math.abs(b.feats.f6 / a.feats.f6 - 1)); liftMax8 = Math.max(liftMax8, Math.abs(b.feats.f8 - a.feats.f8));
    if (Math.abs(b.feats.f6 / a.feats.f6 - 1) > 0.02 || Math.abs(b.feats.f8 - a.feats.f8) > 0.01 + 1e-9) liftBad.push(`#${i} ${idx + 1}画目: f6 ${a.feats.f6}→${b.feats.f6} f8 ${a.feats.f8}→${b.feats.f8}`);
  }
  check(liftN >= 80 && !liftBad.length, `画の途中で指を離して同じ所から続けて書いても（${liftN} 人・9 種の画）、弾かれず、速さ f6 は ±2%（最大 ${(100 * liftMax6).toFixed(1)}%）・f8 は ±0.01（最大 ${liftMax8.toFixed(2)}）で同じ`, liftBad.slice(0, 4).join(' / '));

  // 指を画面に置いたまま考えた 1〜3 秒（動き出す前・画の途中・離す前）では、型はほとんど変わらない（98% 以上で同じ）。
  // 以前は、指を置いたままの時間が速さ f6 の分母と 1画の長さ（f8）に入り、3 秒で 3 割近くの人の型が変わっていた。
  // 離す前の間は、とめの画（4・7・8・9・12）では「長い止め」そのものなので f5 が変わりうる。ここではとめでない画で確かめ、
  // とめの画でも f6 と f8 は変わらないことを確かめる
  const TOME_N = [4, 7, 8, 9, 12];
  const pauseRows = {}, pauseBad = [];
  const pc = cal;
  for (let i = 0; i < 150; i++) {
    const w = CALS.writing(people[i], SY.mulberry32(22000 + i), 22000 + i), m = SY.make(w), st = m.strokes, a = HW.analyze(st, { side: w.side });
    if (!a.ok) continue;
    const ka = HW.score(a.feats, pc).key;
    const k = i % st.length, isTome = m.truth[k].some((t) => TOME_N.indexOf(t) >= 0) && TOME_N.indexOf(m.truth[k][m.truth[k].length - 1]) >= 0;
    [[0, '動き出す前'], [0.5, '画の途中'], [1, '離す前']].forEach(([fr, nm]) => [1000, 3000].forEach((ms) => {
      const b = HW.analyze(SY.pause(st, k, fr, ms, i % 2 === 0, w.hz), { side: w.side });
      if (!b.ok) { pauseBad.push(`#${i} ${nm} ${ms}ms: ${J(b.problems)}`); return; }
      if (fr === 1 && isTome) {
        if (Math.abs(b.feats.f6 - a.feats.f6) > 0.01 + 1e-9 || Math.abs(b.feats.f8 - a.feats.f8) > 0.01 + 1e-9) pauseBad.push(`#${i} とめの画の${nm} ${ms}ms: f6 ${a.feats.f6}→${b.feats.f6} f8 ${a.feats.f8}→${b.feats.f8}`);
        return;
      }
      const key = `${nm} ${ms / 1000}秒`, r = pauseRows[key] = pauseRows[key] || { n: 0, same: 0, f6: [] };
      r.n++; if (HW.score(b.feats, pc).key === ka) r.same++;
      r.f6.push(b.feats.f6 / a.feats.f6);
    }));
  }
  const pauseTxt = Object.keys(pauseRows).map((k) => {
    const r = pauseRows[k], f = r.f6.slice().sort((x, y) => x - y);
    return `${k} 同じ型 ${(100 * r.same / r.n).toFixed(1)}%（f6 の比の中央値 ${f[f.length >> 1].toFixed(3)}）`;
  });
  const pauseFail = Object.keys(pauseRows).filter((k) => { const r = pauseRows[k], f = r.f6.slice().sort((x, y) => x - y); return r.same < 0.98 * r.n || Math.abs(f[f.length >> 1] - 1) > 0.01; });
  check(!pauseFail.length && !pauseBad.length, `指を置いたまま 1〜3 秒止まっても型は 98% 以上で同じ（${pauseTxt.join('／')}）`, pauseFail.concat(pauseBad).slice(0, 4).join(' / '));
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
  // 中央値との差が丸めの1目盛り以下なら候補にしない（横画のばらつき f3 は 0.5° 刻みなので、1目盛りだけで |z| が大きく出て
  // ほかの特徴を押しのけていた：合成の較正で「いちばん特徴」の 38.7% が f3）
  const oneStep = [hl({ f3: 2.0 }), hl({ f3: 1.0 }), hl({ f2: 0.09 }), hl({ f5: 150 }), hl({ f13: 0.01 })];
  check(oneStep.every((h) => h === null) && hl({ f3: 2.5 }).feature === 'f3' && hl({ f2: 0.1 }).feature === 'f2' && hl({ f5: 160 }).feature === 'f5',
    '中央値との差が丸めの1目盛り以下なら「いちばん特徴」にしない（2目盛りからは候補）', J(oneStep));
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
  check(keys === 'disp,highlight,items,key,lean,v' && Object.keys(one.disp).sort().join(',') === 'f1,f2,f5',
    '入るのは 版・型・境界・特徴の種類と向き・表示用の値3つ だけ（線は入らない。items は disp と同じ値の一覧）', keys);
  // items：disp と同じ値を {feature, state|value} の一覧にしたもの（「いちばん特徴」（f2・f5）を先頭に）。
  // いまの画面側（yui/hw.js の rowLink）は disp を読み、items は読みません。形式を変えないよう、同じ内容を保っています
  const itemBad = [];
  ['1u2sdmo405', '1s0n2pc455', '1s0n5pa15n', '1k0n5mo452', '1c0nnnnnnn', '1s0n3pnnn2'].forEach((code) => {
    const d = HW.decodeShare(code);
    if (!d) { itemBad.push(code + ' 読めない'); return; }
    const want = [];
    const add = (f) => {
      if (f === 'f1' && d.disp.f1 !== null) want.push({ feature: 'f1', state: d.disp.f1 });
      if (f === 'f2' && d.disp.f2 !== null) want.push({ feature: 'f2', value: d.disp.f2 / 100 });
      if (f === 'f5' && d.disp.f5 !== null) want.push({ feature: 'f5', value: d.disp.f5 });
    };
    const hf = d.highlight && (d.highlight.feature === 'f2' || d.highlight.feature === 'f5') ? d.highlight.feature : null;
    if (hf) add(hf);
    ['f1', 'f2', 'f5'].filter((f) => f !== hf).forEach(add);
    if (J(d.items) !== J(want)) itemBad.push(`${code}: ${J(d.items)}`);
  });
  check(!itemBad.length, 'decodeShare().items は disp と同じ値を {feature, state|value} で並べる（f2 は比、f5 は止めた画の数。「いちばん特徴」が先頭）', itemBad.join(' / '));
  const res0 = run({ seed: 2 }), sc0 = HW.score(res0.feats, CAL);
  check(HW.encodeShare(sc0, res0) === HW.encodeShare(sc0, res0.feats, res0.marks) && HW.decodeShare(HW.encodeShare(sc0, res0)).disp.f5 !== null,
    'analyze() の結果をそのまま渡しても、feats と marks を別に渡しても同じ文字列');
  check(HW.encodeShare(null, {}) === null && HW.encodeShare(undefined) === null && HW.shareData(null) === null && HW.encodeShare({ key: 'bogus' }) === null,
    '採点がない・壊れていれば encodeShare は null（例外を投げない）');
  const big = HW.shareData({ key: 'sekkei', lean: { x: false, y: false, toward: null }, highlight: null }, { f2: 3 }, null);
  check(big.disp.f2 === 69 && HW.shareData({ key: 'sekkei', lean: { x: false, y: false, toward: null }, highlight: null }, { f2: -2 }, null).disp.f2 === -15,
    'すき間の % は -15〜69 に収める（-0.15 未満の字は noSplit で弾くので、診断に進んだ字では出ない）');
  const malformed = [
    null, undefined, 123, {}, [], '', '1', '1s0nnnnnnn ', ' 1s0nnnnnnn', '2s0nnnnnnn',
    '1x0nnnnnnn', '1S0nnnnnnn', '1s4nnnnnnn', '1s1nnnnnnn', '1s0unnnnnn', '1s1snnnnnn', '1s3cnnnnnn', '1s2knnnnnn',
    '1s0n2nnnnn', '1s0nnpnnnn', '1s0nxpnnnn', '1s0nnnxnnn', '1s0nnnn5nn', '1s0nnnnnn6', '1s0nnnnnnn0', '1s0nnnnnn',
    '1s0nnnc1a5', '1ｓ0nnnnnnn', '1s0nnnnnn\n', '1s0n%20nnnn', '<script>',
    // score() が出さない組み合わせ：口の角が「閉」の向き（9m・am）、向きが 0（z）
    '1s0n9mnnnn', '1s0namnnnn', '1s0n9moa5n'.slice(0, 10), '1s0n2znnnn', '1s0n9znnnn', '1s0nazcnn3',
    // encodeShare が出さない組み合わせ：すき間が「いちばん特徴」なのに値が無い、とめの数が向きと食い違う、すき間が -15% 未満
    // （とめが「いちばん特徴」で数が「なし」は出る：marks を渡さない呼び方のとき・2回書きで数が平均の向きと食い違うとき）
    '1s0n2pcnn5', '1s0n2mcnnn', '1s0n5pc450', '1s0n5pc452', '1s0n5mc453', '1s0n5mc455', '1s0n5pc451', '1s0n5mc454',
    '1s0nnnc005', '1s0nnnc145', '1s0n2pc005', '1s0n3pc005'
  ];
  const leaked = malformed.filter((s) => HW.decodeShare(s) !== null);
  check(malformed.length >= 20 && !leaked.length, `壊れた・細工された文字列 ${malformed.length} 種をすべて拒否（null）`, J(leaked));
  // 文字列の全体（すき間の値は代表の 8 通り）で、decodeShare が受け付ける ⇔ 下の規則を満たす、を確かめ、
  // 受け付けた文字列は、その内容から作った入力で encodeShare がちょうど同じ文字列を出せること（出せない組み合わせは受け付けない）
  const AXQ = { s: [-1, -1], u: [-1, 1], k: [1, -1], c: [1, 1] };
  const spec = (k, fl, tw, hf, hs, f2s, f5c) => {
    if ((fl === 0) !== (tw === 'n')) return false;
    if (tw !== 'n') {
      const fx = AXQ[k][0] !== AXQ[tw][0], fy = AXQ[k][1] !== AXQ[tw][1];
      if (fx === fy || (fx && !(fl & 1)) || (fy && !(fl & 2))) return false;
    }
    if ((hf === 'n') !== (hs === 'n')) return false;
    if ((hf === '9' || hf === 'a') && hs === 'm') return false;
    const f2 = f2s === 'nn' ? null : +f2s - 30, f5 = f5c === 'n' ? null : +f5c;
    if (f2 !== null && (f2 < -15 || f2 > 69)) return false;
    if (hf === '2' && f2 === null) return false;
    if (hf === '5' && f5 !== null && (hs === 'p' ? f5 < 3 : f5 > 2)) return false;
    return true;
  };
  const specBad = [];
  let specN = 0, specOk = 0;
  for (const k of 'sukc') for (let fl = 0; fl < 4; fl++) for (const tw of 'sukcn') for (const hf of '2359adn') for (const hs of 'pmn') for (const f1 of 'caon') {
    for (const f2s of ['nn', '00', '14', '15', '16', '45', '98', '99']) for (const f5c of '012345n') {
      const str = '1' + k + fl + tw + hf + hs + f1 + f2s + f5c, d = HW.decodeShare(str);
      specN++;
      if (!!d !== spec(k, fl, tw, hf, hs, f2s, f5c)) { specBad.push(str); continue; }
      if (!d) continue;
      specOk++;
      const back = HW.encodeShare({ key: d.key, lean: d.lean, highlight: d.highlight },
        { f1: d.disp.f1 ? { state: d.disp.f1, ratio: 1 } : null, f2: d.disp.f2 === null ? null : d.disp.f2 / 100 },
        d.disp.f5 === null ? null : { stops: [0, 1, 2, 3, 4].map((q) => ({ stop: q < d.disp.f5 })) });
      if (back !== str) specBad.push(`${str}→${back}`);
    }
  }
  check(!specBad.length, `正しい形の文字列 ${specN} 通りで、decodeShare が受け付けるのは規則どおりの ${specOk} 通りだけ、そのどれも encodeShare から出せる`, specBad.slice(0, 5).join(' '));
  // 較正に照らして拒まない：較正を実測に差し替えても版と形式は同じなので、差し替える前に共有されたリンクが読めなくならないように
  const calA = JSON.parse(J(CAL)), calB = JSON.parse(J(CAL));
  calA.features.f2.median = 0.02; calB.features.f2.median = 0.3;
  const calCodes = ['1s0n2pc405', '1s0n2mc345', '1s0n2pc995', '1s0n2mc995', '1s0n2pc305', '1s0n5pc453', '1s0n9po405'];
  const calLost = calCodes.filter((q) => !HW.decodeShare(q) || J(HW.decodeShare(q, calA)) !== J(HW.decodeShare(q)) || J(HW.decodeShare(q, calB)) !== J(HW.decodeShare(q)));
  check(!calLost.length, 'decodeShare は較正を見ない（2つ目の引数に cal を渡しても同じ結果。較正を差し替えても共有リンクが切れない）', J(calLost));
  const realBad = [], CALS = require('./hw-calibration.js');
  const rq = SY.mulberry32(77);
  for (let i = 0; i < 60; i++) {
    const p = CALS.writing(CALS.person(rq), SY.mulberry32(i + 5), 6100 + i), a = HW.analyze(SY.synth(p), { side: p.side, cal: CAL });
    if (!a.ok) continue;
    const code = HW.encodeShare(HW.score(a, CAL), a);
    if (!code || !HW.decodeShare(code)) realBad.push(`#${i} ${code}`);
  }
  check(!realBad.length, '本物の字から作った文字列は、decodeShare で読める', realBad.join(' '));
  // yui/hw.js の呼び方のまま：線をキャンバス一辺=1 から 1000 倍して analyze(scaled, { side: 1000, cal: CAL })（hw.js の analyzeCurrent）、
  // 2回書いたら average(1回目.feats, 2回目.feats)、score(feats, CAL)、encodeShare(scored, feats, drawnMarks())（drawnMarks は
  // 最後に書いた回の marks）、decodeShare(code)（較正は渡さない）。1回書きと2回書きの両方で、自分の画面の「いちばん特徴」が
  // リンク・再読み込みの画面でも同じになり、リンクに入るとめの数は f5 の向きと食い違わない（食い違うときは数を「なし」にする）。
  // 1回書きでは、f5 が「いちばん特徴」なら、画面のとめの印（過半数）とも必ずそろう
  const flowBad = [], rf = SY.mulberry32(1212);
  let flowN = 0, flowF5 = 0, flowTwo = 0;
  const toApp = (st, side) => st.map((x) => ({ points: x.points.map((q) => ({ x: q.x / side * 1000, y: q.y / side * 1000, t: q.t })) }));
  const analyzeCurrent = (st, side) => HW.analyze(toApp(st, side), { side: 1000, cal: CAL });
  for (let i = 0; i < 150; i++) {
    const person = CALS.person(rf);
    const p1 = CALS.writing(person, SY.mulberry32(6000 + i), 12000 + i), p2 = CALS.writing(person, SY.mulberry32(8000 + i), 14000 + i);
    const a1 = analyzeCurrent(SY.synth(p1), p1.side), a2 = i % 2 ? analyzeCurrent(SY.synth(p2), p2.side) : null;
    if (!a1.ok || (a2 && !a2.ok)) continue;
    flowN++;
    if (a2) flowTwo++;
    const feats = a2 ? HW.average(a1.feats, a2.feats) : a1.feats, drawn = (a2 || a1).marks;
    const sc = HW.score(feats, CAL), code = HW.encodeShare(sc, feats, drawn), d = HW.decodeShare(code);
    if (!d || J(d.highlight) !== J(sc.highlight)) { flowBad.push(`#${i}${a2 ? ' 2回' : ''}: ${code} ${J(sc.highlight)} → ${d && J(d.highlight)}`); continue; }
    const h = sc.highlight;
    if (h && h.feature === 'f5') {
      flowF5++;
      const c = drawn.stops.filter((q) => q.stop).length, n = drawn.stops.length;
      const agreeMarks = h.sign > 0 ? 2 * c > n : 2 * c <= n;
      if (!a2 && !agreeMarks) flowBad.push(`#${i}: f5=${feats.f5} 向き ${h.sign} とめ ${c}/${n}`);
      if (d.disp.f5 !== null && (h.sign > 0 ? d.disp.f5 < 3 : d.disp.f5 > 2)) flowBad.push(`#${i}${a2 ? ' 2回' : ''}: リンクのとめの数 ${d.disp.f5} が向き ${h.sign} と食い違う`);
    }
  }
  check(flowN >= 140 && !flowBad.length, `画面側（yui/hw.js）と同じ呼び方（cal ありの analyze・drawnMarks() を渡す encodeShare・1回書き／2回書き ${flowTwo} 人）で、` +
    `${flowN} 人とも「いちばん特徴」がリンクでも同じ（f5 は ${flowF5} 人、とめの印・リンクのとめの数とも食い違わない）`, flowBad.slice(0, 3).join(' / '));
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
    // 1本の画が 0.0000001ms で書かれた（時刻の刻みより短い）：以前は窓の幅が桁外れになり、配列を確保できずに落ちた
    tinyDur: (() => { const s = SY.synth({ seed: 7 }); const q = s[3].points; s[3] = { points: q.map((p, k) => ({ x: p.x, y: p.y, t: q[0].t + k * 1e-7 / (q.length - 1) })) }; return s; })(),
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
  const td = HW.analyze(weird.tinyDur, { side: 320 });
  check(td.ok && td.nStrokes === 12, `1本の画だけ時刻の刻みより短い時間で書かれても、落ちずに解析する（ok=${td.ok} ${J(td.problems)}）`);
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
