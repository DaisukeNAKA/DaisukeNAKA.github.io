/**
 * パイロットの実測から、手書き版の較正（content.js の calibration）を作り、公開の関門を確かめます。
 *
 *   node _ops/test/hw-pilot-calibrate.js <入力> [--out cal.json] [--apply]
 *
 * 入力（どちらか）
 *   ・ディレクトリ：協力者が ?collect=1 の画面でコピーした数字を、1回分ずつ
 *       <協力者ID>-<回>.json（例：P01-1.json、P01-2.json）として保存したもの。
 *       回は 1 か 2（別の日）。属性を添えるなら、同じ名前の .meta.json に
 *       {"device":"iphone|android","age":"20s|30s|40s|…","sex":"f|m|…"} を置きます。
 *   ・1つの .json ファイル：[{ "pid":"P01", "session":1, "device":"iphone", "age":"30s", "sex":"f", "data":{…コピーした数字…} }, …]
 *
 * 協力者ID は運用者がつける記号です。氏名や連絡先は入れないでください。
 * 入力は _ops/pilot/ に置いてください（.gitignore 済み。公開リポジトリにコミットしないため）。
 *
 * やること
 *   1. 各協力者の1回目（無ければ2回目）で、特徴ごとの中央値と尺度（IQR/1.349、下限つき）と、軸の中心・尺度を作る
 *      （_ops/test/hw-calibration.js の fitCal と同じ作り方。重みと向きは content.js の値を引き継ぎます）
 *   2. 関門（仕様書 brief の「公開の関門」）
 *      (a) 各タイプが 15〜35%   … 2つに分けた協力者の片方で作った較正を、もう片方に当てて確かめます（交差検証）
 *      (b) |Spearman ρ(x, y)| < 0.3
 *      (c) 別の日の2回で、タイプが一致するのが 70% 以上（目標）
 *      (e) 端末・年代・性別のあいだで、タイプの割合の差が 15 ポイント以内（属性がある人だけ）
 *      ・いちばん特徴が出た測定値が、1つに 40% を超えて偏らない
 *      (d) 2台の端末での一致は、この入力からは確かめられません（手で確かめてください）
 *   3. --out で較正を JSON に書き出し、--apply で yui/content.js の calibration を置き換えます
 *      （version は "pilot-YYYYMMDD"。画面の calibrationNote が medianSourceTemplate「協力者{n}人・{date}」に切り替わります）
 *
 * 置き換えたら、hw-engine.js の STOP_MS を新しい f5 の中央値に合わせ（下に表示します）、
 * build-pages.js → check.js → browser.js の順に通してください。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const HW = require(path.join(ROOT, 'yui', 'hw-engine.js'));
global.window = global.window || {};
require(path.join(ROOT, 'yui', 'content.js'));
const C = global.window.YUI_CONTENT;

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith('--'));
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 ? args[outIdx + 1] : null;
const APPLY = args.includes('--apply');
if (!input) {
  console.error('使い方: node _ops/test/hw-pilot-calibrate.js <ディレクトリ | 入力.json> [--out cal.json] [--apply]');
  process.exit(2);
}

/* ---------------------------------------------------------------- 読み込み */
function readInput(p) {
  const st = fs.statSync(p);
  const rows = [];
  if (st.isDirectory()) {
    fs.readdirSync(p).filter((f) => /\.json$/.test(f) && !/\.meta\.json$/.test(f)).sort().forEach((f) => {
      const m = f.match(/^(.+)-([12])\.json$/);
      if (!m) { console.warn('  ! ファイル名が <ID>-<1|2>.json ではないので飛ばします: ' + f); return; }
      let data;
      try { data = JSON.parse(fs.readFileSync(path.join(p, f), 'utf8')); } catch (e) { console.warn('  ! 読めません: ' + f); return; }
      let meta = {};
      const mf = path.join(p, m[1] + '.meta.json');
      if (fs.existsSync(mf)) { try { meta = JSON.parse(fs.readFileSync(mf, 'utf8')); } catch (e) { meta = {}; } }
      rows.push(Object.assign({ pid: m[1], session: +m[2], data }, meta));
    });
  } else {
    JSON.parse(fs.readFileSync(p, 'utf8')).forEach((r) => rows.push(r));
  }
  return rows;
}
const rows = readInput(path.resolve(input));

/* コピーした数字 1回分 → 特徴量（2回書いていれば平均） */
function featsOf(d) {
  if (!d || !Array.isArray(d.writings) || !d.writings.length) { return null; }
  const w = d.writings.map((x) => x && x.feats).filter(Boolean);
  if (!w.length) { return null; }
  return w.length >= 2 ? HW.average(w[0], w[1]) : w[0];
}
const people = {};
let skipped = 0, otherEngine = 0;
rows.forEach((r) => {
  const f = featsOf(r.data);
  if (!f || !r.pid || !(r.session === 1 || r.session === 2)) { skipped++; return; }
  if (r.data.engine !== HW.VERSION) { otherEngine++; }
  const p = people[r.pid] = people[r.pid] || { pid: r.pid };
  p['s' + r.session] = f;
  ['device', 'age', 'sex'].forEach((k) => { if (r[k]) { p[k] = String(r[k]); } });
});
const list = Object.keys(people).sort().map((k) => people[k]);
console.log(`\n■ 入力：${rows.length} 件（協力者 ${list.length} 人、1回目 ${list.filter((p) => p.s1).length}・2回目 ${list.filter((p) => p.s2).length}）`);
if (skipped) { console.log(`  ! 形の合わない ${skipped} 件を飛ばしました`); }
if (otherEngine) { console.log(`  ! エンジンの版（${HW.VERSION}）と違う版で測った数字が ${otherEngine} 件あります。混ぜると中央値がずれます`); }
if (list.length < 40) { console.log(`  ! 協力者が ${list.length} 人です。仕様の下限は40人、各タイプの割合を±10ポイントで読むには80人以上が目安です`); }

/* ---------------------------------------------------------------- 較正の作り方（hw-calibration.js の fitCal と同じ） */
const KEYS = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12', 'f13'];
/* 尺度の下限：測定の刻みより細かい差で z が振り切れないように（hw-calibration.js と同じ値） */
const FLOOR = { f1: 0.5, f2: 0.01, f3: 1.0, f4: 0.5, f5: 10, f6: 0.05, f7: 0.02, f8: 0.02, f9: 0.5, f10: 0.5, f11: 0.01, f12: 0.5, f13: 0.02 };
const CODE = { closed: -1, ambiguous: 0, open: 1 };
function valueOf(f, k) {
  const v = f[k];
  if (v === null || v === undefined) { return null; }
  if (k === 'f1' || k === 'f9' || k === 'f10') { return CODE[v.state]; }
  if (k === 'f11') { return v.v; }
  return v;
}
function quantile(a, q) {
  const s = a.slice().sort((x, y) => x - y);
  if (!s.length) { return NaN; }
  const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}
const BASE = C.calibration;
function fitCal(featsList, stamp) {
  const features = {};
  KEYS.forEach((k) => {
    const v = featsList.map((f) => valueOf(f, k)).filter((x) => x !== null && x !== undefined && isFinite(x));
    const med = v.length ? quantile(v, 0.5) : BASE.features[k].median;
    const iqr = v.length ? quantile(v, 0.75) - quantile(v, 0.25) : 0;
    features[k] = { median: +med.toFixed(4), scale: +Math.max(FLOOR[k], iqr / 1.349).toFixed(4) };
  });
  const cal0 = { features, weights: BASE.weights, dirs: BASE.dirs, center: { x: 0, y: 0 }, boundary: BASE.boundary };
  const s0 = featsList.map((f) => HW.score(f, cal0)).filter(Boolean);
  const xs = s0.map((s) => s.x), ys = s0.map((s) => s.y);
  return {
    version: 'pilot-' + stamp.replace(/-/g, ''), n: featsList.length, date: stamp,
    note: 'パイロットの実測（協力者の1回目。2回書いた人は2回分の平均）から作った値。',
    features, weights: BASE.weights, dirs: BASE.dirs,
    center: { x: +quantile(xs, 0.5).toFixed(4), y: +quantile(ys, 0.5).toFixed(4) },
    axisScale: {
      x: +Math.max(1e-3, (quantile(xs, 0.75) - quantile(xs, 0.25)) / 1.349).toFixed(4),
      y: +Math.max(1e-3, (quantile(ys, 0.75) - quantile(ys, 0.25)) / 1.349).toFixed(4),
    },
    boundary: BASE.boundary,
  };
}

/* ---------------------------------------------------------------- 関門 */
const TYPES = ['sekkei', 'kyomei', 'suishin', 'chokkan'];
const pct = (v) => (100 * v).toFixed(1) + '%';
const shares = (scored) => {
  const c = { sekkei: 0, kyomei: 0, suishin: 0, chokkan: 0 };
  scored.forEach((s) => { c[s.key]++; });
  const o = {};
  TYPES.forEach((k) => { o[k] = scored.length ? c[k] / scored.length : 0; });
  return o;
};
const shareTxt = (o) => TYPES.map((k) => `${k} ${pct(o[k])}`).join('・');
function spearman(a, b) {
  const rank = (v) => {
    const idx = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]);
    const r = new Array(v.length);
    for (let i = 0; i < idx.length;) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) { j++; }
      for (let k = i; k <= j; k++) { r[idx[k][1]] = (i + j) / 2; }
      i = j + 1;
    }
    return r;
  };
  const ra = rank(a), rb = rank(b), n = a.length;
  const ma = ra.reduce((s, x) => s + x, 0) / n, mb = rb.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2; }
  return num / Math.sqrt(da * db || 1);
}

const TODAY = new Date().toISOString().slice(0, 10);
const base = list.map((p) => p.s1 || p.s2);
if (base.length < 8) { console.log('\n協力者が少なすぎて較正を作れません。'); process.exit(1); }
const cal = fitCal(base, TODAY);
let gatesNg = 0;
const gate = (okCond, msg) => { console.log((okCond ? '  ok   ' : '  未達 ') + msg); if (!okCond) { gatesNg++; } };

console.log('\n■ 特徴ごとの中央値と尺度');
KEYS.forEach((k) => console.log(`  ${k.padEnd(4)} 中央値 ${String(cal.features[k].median).padStart(8)}  尺度 ${String(cal.features[k].scale).padStart(8)}`));
console.log(`  軸の中心 x ${cal.center.x} / y ${cal.center.y}、軸の尺度 x ${cal.axisScale.x} / y ${cal.axisScale.y}`);

console.log('\n■ 関門');
/* (a) 交差検証：協力者を交互に2つに分け、片方で作った較正をもう片方に当てる */
const half = [[], []];
base.forEach((f, i) => half[i % 2].push(f));
const cross = [];
[0, 1].forEach((h) => {
  const c2 = fitCal(half[h], TODAY);
  half[1 - h].forEach((f) => { const s = HW.score(f, c2); if (s) { cross.push(s); } });
});
const sh = shares(cross);
gate(TYPES.every((k) => sh[k] >= 0.15 && sh[k] <= 0.35), '(a) 各タイプ 15〜35%（交差検証）：' + shareTxt(sh));
const all = base.map((f) => HW.score(f, cal)).filter(Boolean);
console.log('       参考（同じ人たちで作った較正を当てたとき）：' + shareTxt(shares(all)));
const rho = spearman(all.map((s) => s.x), all.map((s) => s.y));
gate(Math.abs(rho) < 0.3, `(b) |ρ(x, y)| < 0.3：ρ = ${rho.toFixed(3)}`);
const both = list.filter((p) => p.s1 && p.s2);
if (both.length) {
  const same = both.filter((p) => { const a = HW.score(p.s1, cal), b = HW.score(p.s2, cal); return a && b && a.key === b.key; }).length;
  gate(same / both.length >= 0.7, `(c) 別の日の2回でタイプが一致：${same}/${both.length}（${pct(same / both.length)}、目標70%以上）`);
} else {
  console.log('  …    (c) 2回目の数字がある協力者がいないので、確かめられません');
}
console.log('  …    (d) 2台の端末での一致は、この入力からは確かめられません（手で確かめてください）');
['device', 'age', 'sex'].forEach((attr) => {
  const groups = {};
  list.forEach((p, i) => { if (p[attr]) { (groups[p[attr]] = groups[p[attr]] || []).push(all[i]); } });
  const keys = Object.keys(groups).filter((g) => groups[g].length >= 5);
  if (keys.length < 2) { console.log(`  …    (e) ${attr}：比べられる組（各5人以上）が2つ未満です`); return; }
  const gapOf = (gs) => {
    let mg = 0, wt = '';
    TYPES.forEach((t) => {
      const v = gs.map((g) => shares(g.filter(Boolean))[t]);
      const gap = Math.max(...v) - Math.min(...v);
      if (gap > mg) { mg = gap; wt = t; }
    });
    return [mg, wt];
  };
  const [maxGap, worst] = gapOf(keys.map((g) => groups[g]));
  /* 人数が少ないと、属性と関係なく偶然でも差が出ます。属性の札をでたらめに入れ替えたときの差（95%点）を並べて、
     差が「偶然の範囲」かどうかも読めるようにします（乱数は固定の種で、何度実行しても同じ値です）。 */
  const pool = [].concat(...keys.map((g) => groups[g]));
  const sizes = keys.map((g) => groups[g].length);
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const nullGaps = [];
  for (let it = 0; it < 400; it++) {
    const a = pool.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    let o = 0;
    nullGaps.push(gapOf(sizes.map((n) => { const g = a.slice(o, o + n); o += n; return g; }))[0]);
  }
  const noise = quantile(nullGaps, 0.95);
  gate(maxGap <= 0.15, `(e) ${attr}（${keys.map((g) => g + ' ' + groups[g].length + '人').join('・')}）：タイプの割合の差の最大 ${pct(maxGap)}（${worst}）`
    + `。偶然でも出る差の目安（95%点）${pct(noise)}`
    + (maxGap > 0.15 ? (maxGap <= noise ? '。偶然の範囲内なので、人数を増やして確かめ直してください' : '。仕様では、満たさないときは F6（書くテンポ）の重みを 0 にします') : ''));
});
const hl = {};
all.forEach((s) => { if (s.highlight) { const k = s.highlight.feature; hl[k] = (hl[k] || 0) + 1; } });
const hlMax = Math.max(0, ...Object.values(hl)) / Math.max(1, all.length);
gate(hlMax <= 0.4, 'いちばん特徴が出た測定値の偏り（最大 40%）：' + Object.keys(hl).map((k) => `${k} ${pct(hl[k] / all.length)}`).join('・'));
const lean = all.filter((s) => s.lean && (s.lean.x || s.lean.y)).length;
console.log(`  参考 境目に近い（型名に「〜寄り」が付く）人：${pct(lean / Math.max(1, all.length))}`);

console.log('\n■ STOP_MS');
if (HW.STOP_MS === cal.features.f5.median) { console.log(`  ok   STOP_MS ${HW.STOP_MS}ms = f5 の中央値`); }
else { console.log(`  !    yui/hw-engine.js の STOP_MS（${HW.STOP_MS}ms）を、新しい f5 の中央値 ${cal.features.f5.median}ms に合わせてください`); }

/* ---------------------------------------------------------------- 書き出し */
const json = JSON.stringify(cal, null, 2);
if (OUT) { fs.writeFileSync(OUT, json + '\n', 'utf8'); console.log('\n較正を ' + OUT + ' に書き出しました。'); }
if (APPLY) {
  if (gatesNg) { console.log('\n関門に未達があるので --apply はしません。オーナーと代替案（brief の「満たせないときの代替」）を決めてください。'); process.exit(1); }
  const file = path.join(ROOT, 'yui', 'content.js');
  const src = fs.readFileSync(file, 'utf8');
  const start = src.indexOf('  calibration: {');
  if (start < 0) { console.error('content.js に calibration が見つかりません'); process.exit(1); }
  let i = src.indexOf('{', start), depth = 0, end = -1;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"') { i++; while (i < src.length && src[i] !== '"') { if (src[i] === '\\') { i++; } i++; } continue; }
    if (ch === '{') { depth++; } else if (ch === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) { console.error('calibration の終わりが見つかりません'); process.exit(1); }
  const body = json.split('\n').map((l, k) => (k === 0 ? l : '  ' + l)).join('\n');
  fs.writeFileSync(file, src.slice(0, start) + '  calibration: ' + body + src.slice(end), 'utf8');
  console.log('\nyui/content.js の calibration を置き換えました（' + cal.version + '）。STOP_MS を合わせ、build-pages.js → check.js → browser.js を通してください。');
}
if (gatesNg) { console.log(`\n関門の未達 ${gatesNg} 件`); process.exit(1); }
console.log('\n関門はすべて満たしています（(d) は手で確かめてください）。');
