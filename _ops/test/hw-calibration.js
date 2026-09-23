/**
 * 手書き版の較正（合成データでの仮の値）
 *
 *   node _ops/test/hw-calibration.js            # N=3000
 *   node _ops/test/hw-calibration.js 500        # 人数を変える
 *   node _ops/test/hw-calibration.js --content path/to/content.js   # 同梱の較正を別のファイルで確かめる（貼り替える前の確認用）
 *
 * 目的：yui/hw-engine.js の score() に渡す cal（各特徴の中央値と尺度、軸の中心）を、
 * 「実データが入るまでの仮の値」として作り、公開の関門を合成データで先に確かめること。
 *
 * ここで作る値は、人の指で書いた字から測ったものではありません。
 * 下の person() の分布は、すべて【仮定】です（事実ではない）。
 * パイロット（40人以上 × 2回、別の日）の実測が入ったら、この値は捨てて作り直します。
 *
 * 関門（仕様書 scoring_approach）
 *   (a) 各タイプが 15〜35%
 *   (b) |Spearman ρ(x, y)| < 0.3
 *   ・いちばん特徴が出た測定値が、1つに 40% を超えて偏らない（全体・点の間隔 240Hz の端末・ふるえのある人のそれぞれで。
 *     端末とふるえは、2回平均と1回書き（画面では2回目は任意）の両方で）
 *   ・同梱の較正（yui/content.js の calibration。画面が実際に使う値）で、検証用の人たちを採点しても各タイプが 15〜35% で、
 *     その f5 の中央値が、この実行で作った較正の f5 の中央値と同じ。
 *     エンジンの測り方を変えたのに content.js の較正を貼り替え忘れると、画面では型の割合が偏ります
 *     （f5・f6 の測り方を変えたあと古い較正のままだと、共鳴型が 10〜14%、直感型が 42% まで偏った）。
 *     check.js はこれを見ないので、ここで止めます。
 *     なお、とめの印としきい値と「いちばん特徴」の f5 の向きは、画面側（yui/hw.js）が analyze() に同じ較正を渡すので、
 *     較正が古くても食い違いません（食い違わないことは単体テストで確かめています）。問題は型の割合のほうです。
 *   ・エンジンのとめのしきい値の既定値 HW.STOP_MS（analyze() に較正を渡さなかったときだけ使う）が、この較正の f5 の中央値と同じ
 *   関門が1つでも未達なら、終了コードは 1 です。content.js の較正が古いだけなら、出力の末尾の CALIBRATION を
 *   yui/content.js の calibration に貼り替えてから、もう一度実行してください。
 *   (a)(b) と偏りは、中央値・軸の中心を決めた人たちとは別の人たち（検証用の別の種）で確かめます。
 *   同じ人たちで確かめると、中心を中央値に置いた時点で (a) がほぼ自動的に満たされるためです。
 *   (e) の代わり：ふるえのある人（2px・8Hz）だけを取り出しても、型の割合が 15 ポイント以上ずれないか
 *       （本物の (e) は iPhone/Android・年代・性別で、実データでしか確かめられません）
 *   参考：同じ人の同じ字を、キャンバス 300/400px、点の間隔 60/240Hz で書いたときに型が一致するか
 *   参考：別の日にもう一度書いたとき（関門 (c) の見込み）。日ごとのずれの大きさは仮定なので、
 *         ずれの大きさを数段階に変え、軸の再現性 r ≈ .8 と .7 のときの一致率を示します（上限の目安）。
 *         画面では2回目が任意なので、2回平均どうしに加えて、1回書きどうし（それぞれの日の1回目だけ）の一致も並べます。
 *         「いちばん特徴が出ていたところ」が同じになる割合（特徴と向き）も、2回平均・1回書きの両方で示します。
 * 関門を満たさなくても、分布の仮定を合わせにいくことはしません。未達はそのまま報告します。
 */
'use strict';

const HW = require('../../yui/hw-engine.js');
const SY = require('./synth.js');
const { mulberry32, gauss } = SY;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const logistic = (z) => 1 / (1 + Math.exp(-z));

/* =================================================================== 仮定
 * 人ごとのクセの分布。数字はすべて仮定で、根拠の強さは「もっともらしい」程度です。
 *
 * T（書くテンポの潜在因子, N(0,1)）
 *   速く書く人ほど、続け書き（連綿）が増え、口の角が開きやすく、横画がそろいにくく、
 *   止めが短く、画の間の空中時間が短い、と仮定します。仕様書が注意している
 *   「速さ（F6）と連綿（F4）の連動」を、あえて入れています。これが x と y の相関の源になります。
 *
 * 書く速さ     speed      中央値 1.25 字高/秒、対数SD 0.35（0.8·T を含む）。試作の遅い 0.55／速い 1.40 の間。
 * 空中時間の比 pauseRatio 平均 0.45、SD 約0.06（速い人ほど短い）、0.15〜0.75 で打ち切り。
 * とめの停止   stopMs     中央値 110ms、対数SD 0.55（速い人ほどやや短い）。
 * 連綿         1-2: 約23%、5-6: 約9%、11-12: 約7%、10-12（口を一筆）: 約3%、7-8: 約3%（T が高いほど増える）。
 * 口の左上     約40% が「開ける人」（すき間 0.025 + |N(0,0.045)|、お手本の単位）、残りは N(−0.005, 0.012)。
 *              ※接筆は画面に描いた線の太さ（キャンバスの 2.2%）で判定するので、小さなすき間は「閉」と測られる。
 *                測った結果の 閉/あいまい/開 の割合は、この仮定の割合とは一致しない（出力に表示）。
 * 口の左下     約25% が開ける人（0.02 + |N(0,0.035)|）。口の右下 約30%（同）。3つの角は同じ傾向を共有（相関あり）。
 * 糸と吉の間   gapShift N(0, 0.03)。
 * 横画のばらつき hJitterDeg 中央値 2.0°、対数SD 0.35（速い人ほど大きい）。
 * 縦横比       aspect exp(N(0, 0.07))。
 * 右上がり     slantDeg N(4, 3)。字全体の回転 rotDeg N(0, 2)。
 * 頭部突出     head N(0, 0.03)。
 * 横折の角     約45% が丸い（cornerR 0.02〜0.06）、ほかは角ばる（0〜0.008）。
 * 字の大きさ   scale N(0.72, 0.08)、0.45〜0.92 で打ち切り（仕様書の充填率SD 0.08）。
 * 位置         cx, cy 0.5 + N(0, 0.025)。
 * センサーの揺れ jitterPx 0.2〜0.7px。
 * 書き順       3% が吉から先に書く。口を4画で書く人 6%。
 * 端末         画面幅 N(396, 20) を 320〜440 で打ち切り、左右 40px ずつの余白を引いたものをキャンバス一辺にする。
 *              点の間隔 60Hz 45%／120Hz 40%／240Hz 15%。
 * 同じ人の2回目（同じ日） 速さ ×exp(0.08N)、止め ×exp(0.15N)、口の角 +N(0,0.008) など、小さくずらす。
 * 別の日（day() の段階 L）  同じ日の2回のずれに加えて、その日ごとのずれを L 倍で足す。
 *              速さ ×exp(0.10L·N)、止め ×exp(0.25L·N)、間の割合 +0.03L·N、口の3つの角 +0.010L·N、
 *              糸と吉の間 +0.010L·N、横画のばらつき ×exp(0.2L·N)、縦横比 ×exp(0.03L·N)、
 *              右上がり・回転 +1.0L·N 度、大きさ +0.03L·N。
 *              連綿のクセは、それぞれ確率 0.2L（最大 0.5）でその日は出ず、
 *              糸の1-2 か 口の11-12 の続け書きが確率 0.1L で新しく出る。
 *              L=0 は「日ごとのずれなし」（同じ日の2セットと同じ）で、一致率の上限にあたります。
 * ======================================================================= */
function person(r) {
  const T = gauss(r);
  const e = () => gauss(r);
  const O = 0.3 * T + 0.95 * e();                      // 口の角を開ける傾向（テンポと弱く連動）
  const opener = (thr, w) => (w * O + Math.sqrt(1 - w * w) * e()) > thr;
  const openUL = O > 0.25;
  const openLL = opener(0.67, 0.5);
  const openLR = opener(0.52, 0.5);
  const gapOpen = (base, sd) => base + Math.abs(e() * sd);
  const closedGap = () => -0.005 + 0.012 * e();
  const renmen = [];
  if (r() < logistic(-1.2 + 0.8 * T)) renmen.push([1, 2]);
  if (r() < logistic(-2.3 + 0.8 * T)) renmen.push([5, 6]);
  const u10 = r(), u11 = r();
  if (u10 < logistic(-3.5 + 0.8 * T)) renmen.push([10, 12]);
  else if (u11 < logistic(-2.6 + 0.8 * T)) renmen.push([11, 12]);
  if (r() < logistic(-3.5 + 0.8 * T)) renmen.push([7, 8]);
  const W = clamp(396 + 20 * e(), 320, 440);
  const u = r();
  return {
    speed: 1.25 * Math.exp(0.35 * (0.8 * T + 0.6 * e())),
    pauseRatio: clamp(0.45 - 0.06 * (0.5 * T + 0.87 * e()), 0.15, 0.75),
    stopMs: 110 * Math.exp(0.55 * (-0.3 * T + 0.95 * e())),
    renmen,
    kouUL: openUL ? gapOpen(0.025, 0.045) : closedGap(),
    kouLL: openLL ? gapOpen(0.02, 0.035) : closedGap(),
    kouLR: openLR ? gapOpen(0.02, 0.035) : closedGap(),
    gapShift: 0.03 * e(),
    hJitterDeg: 2.0 * Math.exp(0.35 * (0.4 * T + 0.92 * e())),
    aspect: Math.exp(0.07 * e()),
    slantDeg: 4 + 3 * e(),
    rotDeg: 2 * e(),
    head: 0.03 * e(),
    cornerR: r() < logistic(-0.2 + 0.3 * T) ? 0.02 + 0.04 * r() : 0.008 * r(),
    scale: clamp(0.72 + 0.08 * e(), 0.45, 0.92),
    cx: 0.5 + 0.025 * e(),
    cy: 0.5 + 0.025 * e(),
    jitterPx: 0.2 + 0.5 * r(),
    order: r() < 0.03 ? 'kiFirst' : 'standard',
    split11: r() < 0.06,
    side: Math.round(W - 80),
    hz: u < 0.45 ? 60 : (u < 0.85 ? 120 : 240)
  };
}
/* 同じ人の別の1回。形・時間・点の乱数の種も変える */
function writing(p, r, seed) {
  const e = () => gauss(r);
  return Object.assign({}, p, {
    seed,
    speed: p.speed * Math.exp(0.08 * e()),
    stopMs: p.stopMs * Math.exp(0.15 * e()),
    pauseRatio: clamp(p.pauseRatio + 0.03 * e(), 0.15, 0.75),
    kouUL: p.kouUL + 0.008 * e(),
    kouLL: p.kouLL + 0.008 * e(),
    kouLR: p.kouLR + 0.008 * e(),
    gapShift: p.gapShift + 0.01 * e(),
    slantDeg: p.slantDeg + 1.0 * e(),
    rotDeg: p.rotDeg + 1.0 * e(),
    aspect: p.aspect * Math.exp(0.02 * e()),
    scale: clamp(p.scale + 0.03 * e(), 0.4, 0.95),
    head: p.head + 0.01 * e(),
    cornerR: Math.max(0, p.cornerR + 0.005 * e())
  });
}

/* 別の日の、その人のクセ（段階 L で日ごとのずれを足す）。上の【仮定】を参照 */
function day(p, r, L) {
  const e = () => gauss(r);
  const q = Object.assign({}, p);
  if (!(L > 0)) return q;
  q.speed = p.speed * Math.exp(0.10 * L * e());
  q.stopMs = p.stopMs * Math.exp(0.25 * L * e());
  q.pauseRatio = clamp(p.pauseRatio + 0.03 * L * e(), 0.15, 0.75);
  q.kouUL = p.kouUL + 0.010 * L * e();
  q.kouLL = p.kouLL + 0.010 * L * e();
  q.kouLR = p.kouLR + 0.010 * L * e();
  q.gapShift = p.gapShift + 0.010 * L * e();
  q.hJitterDeg = p.hJitterDeg * Math.exp(0.2 * L * e());
  q.aspect = p.aspect * Math.exp(0.03 * L * e());
  q.slantDeg = p.slantDeg + 1.0 * L * e();
  q.rotDeg = p.rotDeg + 1.0 * L * e();
  q.scale = clamp(p.scale + 0.03 * L * e(), 0.4, 0.95);
  const drop = Math.min(0.5, 0.2 * L);
  q.renmen = (p.renmen || []).filter(() => r() >= drop);
  if (r() < 0.1 * L) {
    const cand = r() < 0.5 ? [1, 2] : [11, 12];
    if (!q.renmen.some(([a, b]) => !(b < cand[0] || a > cand[1]))) q.renmen = q.renmen.concat([cand]);
  }
  return q;
}

/* ================================================================ 集計の道具 */
function quantile(a, q) {
  const b = a.slice().sort((x, y) => x - y);
  const pos = (b.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return b[lo] + (b[hi] - b[lo]) * (pos - lo);
}
function ranks(a) {
  const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
  const rk = new Array(a.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) rk[idx[k][1]] = avg;
    i = j + 1;
  }
  return rk;
}
function pearson(x, y) {
  const n = x.length, mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
}
const spearman = (x, y) => pearson(ranks(x), ranks(y));
const pct = (v) => (100 * v).toFixed(1) + '%';

/* 尺度の下限：測定の刻み（丸め）より細かい差で z が振り切れないように。
 * 横画のばらつき f3 は 0.5° 刻みで、中央値のまわりの散らばりが刻み1つ分ほどしかないので、IQR から出した尺度が
 * 刻みと同じ 0.5 に張りつき、1目盛りずれただけで |z|=1 になっていました（「いちばん特徴」の 38.7% を f3 が占めた原因）。
 * 刻み2つ分（1.0°）を下限にします。 */
const FLOOR = { f1: 0.5, f2: 0.01, f3: 1.0, f4: 0.5, f5: 10, f6: 0.05, f7: 0.02, f8: 0.02, f9: 0.5, f10: 0.5, f11: 0.01, f12: 0.5, f13: 0.02 };
const CODE = { closed: -1, ambiguous: 0, open: 1 };
function valueOf(f, k) {
  const v = f[k];
  if (v === null || v === undefined) return null;
  if (k === 'f1' || k === 'f9' || k === 'f10') return CODE[v.state];
  if (k === 'f11') return v.v;
  return v;
}
const WEIGHTS = { x: { f1: 0.40, f2: 0.30, f3: 0.15, f4: 0.15 }, y: { f5: 0.35, f6: 0.30, f7: 0.20, f8: 0.15 } };
const DIRS = { f1: +1, f2: +1, f3: +1, f4: +1, f5: -1, f6: +1, f7: -1, f8: -1 };
const TYPES = ['sekkei', 'suishin', 'kyomei', 'chokkan'];

/* 較正の値を作る：各特徴の中央値と尺度（IQR/1.349、下限つき）、軸スコアの中央値（中心）と尺度。
 * 単体テスト（ふるえの型の割合）でも同じ作り方を使うので、関数にしてあります。 */
const KEYS = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12', 'f13'];
function fitCal(featsList) {
  const features = {};
  KEYS.forEach((k) => {
    const v = featsList.map((f) => valueOf(f, k)).filter((x) => x !== null && x !== undefined);
    const med = quantile(v, 0.5), iqr = quantile(v, 0.75) - quantile(v, 0.25);
    features[k] = { median: +med.toFixed(4), scale: +Math.max(FLOOR[k], iqr / 1.349).toFixed(4) };
  });
  const cal0 = { features, weights: WEIGHTS, dirs: DIRS, center: { x: 0, y: 0 }, boundary: 0.25 };
  const s0 = featsList.map((f) => HW.score(f, cal0)).filter(Boolean);
  const xs = s0.map((s) => s.x), ys = s0.map((s) => s.y);
  return {
    version: 'synthetic-v1', n: featsList.length, features, weights: WEIGHTS, dirs: DIRS,
    center: { x: +quantile(xs, 0.5).toFixed(4), y: +quantile(ys, 0.5).toFixed(4) },
    axisScale: {
      x: +((quantile(xs, 0.75) - quantile(xs, 0.25)) / 1.349).toFixed(4),
      y: +((quantile(ys, 0.75) - quantile(ys, 0.25)) / 1.349).toFixed(4)
    },
    boundary: 0.25
  };
}

/* 1人分：2回書いて特徴量ごとに平均する（本番と同じ流れ）。
 * over は2回とも上書きする書き方（端末・ふるえなど）、tf はできあがった線への変形（あとから足すふるえ等）。
 * one は1回目だけの結果（2回目を書かなかった人と同じ扱い）。 */
function measure(p, seedBase, over, tf) {
  const r = mulberry32(seedBase);
  const w1 = Object.assign(writing(p, r, seedBase * 2 + 1), over || {});
  const w2 = Object.assign(writing(p, r, seedBase * 2 + 2), over || {});
  const s1 = SY.synth(w1), s2 = SY.synth(w2);
  const a = HW.analyze(tf ? tf(s1, w1) : s1, { side: w1.side });
  const b = HW.analyze(tf ? tf(s2, w2) : s2, { side: w2.side });
  return { ok: a.ok && b.ok, feats: HW.average(a.feats, b.feats), problems: a.problems.concat(b.problems), marks: b.marks,
    one: { ok: a.ok, feats: a.feats, marks: a.marks } };
}
/* 別の日の1人分（段階 L の日ごとのずれ）。日ごとのずれの乱数は、書く回の乱数とは別の種から */
function measureDay(p, seedBase, L) {
  return measure(day(p, mulberry32((seedBase * 7919 + 17) >>> 0), L), seedBase);
}
function shares(list) {
  const c = {}; TYPES.forEach((t) => { c[t] = 0; });
  list.forEach((s) => { c[s.key]++; });
  const o = {}; TYPES.forEach((t) => { o[t] = c[t] / list.length; });
  return o;
}
const shareTxt = (o) => TYPES.map((t) => `${t} ${pct(o[t])}`).join(' / ');
/* 「いちばん特徴が出ていたところ」の内訳と、いちばん多いものの割合 */
function hlShares(list) {
  const c = {};
  list.forEach((s) => { const k = s.highlight ? s.highlight.feature : 'none'; c[k] = (c[k] || 0) + 1; });
  const keys = Object.keys(c).filter((k) => k !== 'none');
  const max = keys.length ? Math.max(...keys.map((k) => c[k])) / list.length : 0;
  return { max, txt: Object.keys(c).sort().map((k) => `${k} ${pct(c[k] / list.length)}`).join(' / ') };
}
const hlKey = (s) => (s.highlight ? s.highlight.feature + (s.highlight.sign > 0 ? '+' : '-') : 'none');

/* 同梱の較正：yui/content.js（または --content で指定したファイル）を、window だけを持つ入れ物の中で読み、calibration を取り出す */
function contentPath() {
  const i = process.argv.indexOf('--content');
  return i >= 0 && process.argv[i + 1] ? require('path').resolve(process.argv[i + 1]) : require('path').join(__dirname, '..', '..', 'yui', 'content.js');
}
function loadShipped(file) {
  try {
    const box = { window: {} };
    require('vm').runInNewContext(require('fs').readFileSync(file, 'utf8'), box, { filename: file });
    const cal = box.window.YUI_CONTENT && box.window.YUI_CONTENT.calibration;
    return { path: require('path').relative(process.cwd(), file) || file, cal: cal || null, err: cal ? null : 'calibration がありません' };
  } catch (e) {
    return { path: file, cal: null, err: e.message };
  }
}
/* 2つの較正の違い（中央値・尺度・中心・軸の尺度）を短い文にする */
function calDiff(a, b) {
  const out = [];
  KEYS.forEach((k) => {
    const x = a.features && a.features[k], y = b.features[k];
    if (!x || x.median !== y.median || x.scale !== y.scale) out.push(`${k} ${x ? x.median + '/' + x.scale : 'なし'}→${y.median}/${y.scale}`);
  });
  ['x', 'y'].forEach((ax) => {
    if (!a.center || a.center[ax] !== b.center[ax]) out.push(`center.${ax} ${a.center ? a.center[ax] : 'なし'}→${b.center[ax]}`);
    if (!a.axisScale || a.axisScale[ax] !== b.axisScale[ax]) out.push(`axisScale.${ax} ${a.axisScale ? a.axisScale[ax] : 'なし'}→${b.axisScale[ax]}`);
  });
  return out;
}

function main() {
  const N = (+process.argv[2] > 0 ? +process.argv[2] : 0) || 3000;
  const NH = Math.max(300, Math.round(N / 3));        // 検証用（中心を決めた人とは別の人たち）
  const M = Math.min(400, N);                          // 端末差・別の日・ふるえの比較に使う人数
  const t0 = Date.now();
  const rp = mulberry32(20260923);
  const people = [];
  for (let i = 0; i < N; i++) people.push(person(rp));

  console.log('■ 合成母集団 N=' + N + '（分布はすべて仮定。実データではありません）');
  const res = people.map((p, i) => measure(p, 1000 + i));
  const valid = res.filter((m) => m.ok);
  const probCount = {};
  res.forEach((m) => m.problems.forEach((c) => { probCount[c] = (probCount[c] || 0) + 1; }));
  console.log('  妥当性チェックを通った人: ' + valid.length + ' / ' + N + '（' + pct(valid.length / N) + '）');
  if (Object.keys(probCount).length) console.log('  引っかかった理由（2回分の延べ）: ' + JSON.stringify(probCount));

  /* ---- 特徴ごとの中央値と尺度・軸の中心 ---- */
  const cal = fitCal(valid.map((m) => m.feats));
  const { features, center, axisScale } = cal;
  console.log('\n■ 特徴ごとの中央値と尺度（f1/f9/f10 は 閉=-1・あいまい=0・開=+1、f11 は v）');
  KEYS.forEach((k) => {
    const v = valid.map((m) => valueOf(m.feats, k)).filter((x) => x !== null && x !== undefined);
    let extra = '';
    if (k === 'f1' || k === 'f9' || k === 'f10') {
      const c = { '-1': 0, '0': 0, '1': 0 };
      v.forEach((x) => { c[x]++; });
      extra = `  閉 ${pct(c['-1'] / v.length)} / あいまい ${pct(c['0'] / v.length)} / 開 ${pct(c['1'] / v.length)}`;
    }
    console.log(`  ${k.padEnd(4)} n=${String(v.length).padStart(4)}  中央値 ${String(features[k].median).padStart(7)}  尺度 ${String(features[k].scale).padStart(7)}${extra}`);
  });
  const scFit = valid.map((m) => HW.score(m.feats, cal));
  /* とめの印のしきい値の既定値：画面側（yui/hw.js）は analyze() に較正を渡すので、画面のしきい値は較正の f5 の中央値。
   * STOP_MS は較正を渡さない呼び方（単体テスト・ほかの道具）のための既定値で、同梱の較正と同じ値にそろえておく */
  console.log(`\n■ 関門：エンジンのとめのしきい値の既定値（HW.STOP_MS）と、この較正の f5 の中央値`);
  let gatesPre = 0;
  if (HW.STOP_MS === features.f5.median) console.log(`  ok   STOP_MS ${HW.STOP_MS}ms = 中央値 ${features.f5.median}ms`);
  else { console.log(`  未達 STOP_MS ${HW.STOP_MS}ms ≠ 中央値 ${features.f5.median}ms（yui/hw-engine.js の STOP_MS を ${features.f5.median} に）`); gatesPre++; }

  /* ---- 検証用の別の人たち ---- */
  const rh = mulberry32(20260924);
  const hold = [];
  for (let i = 0; i < NH; i++) hold.push(person(rh));
  const hv = hold.map((p, i) => measure(p, 700000 + i)).filter((m) => m.ok);
  const sc = hv.map((m) => HW.score(m.feats, cal));
  const share = shares(sc);
  const rho = spearman(sc.map((s) => s.x), sc.map((s) => s.y));
  let gates = gatesPre;
  const gate = (okk, msg) => { console.log((okk ? '  ok   ' : '  未達 ') + msg); if (!okk) gates++; };

  console.log(`\n■ 関門（検証用の別の ${sc.length} 人。中心を決めた ${scFit.length} 人とは別）`);
  TYPES.forEach((t) => gate(share[t] >= 0.15 && share[t] <= 0.35, `${t.padEnd(8)} ${pct(share[t])}（15〜35%）`));
  gate(Math.abs(rho) < 0.3, `Spearman ρ(x, y) = ${rho.toFixed(3)}（|ρ| < 0.3）`);
  const hl = hlShares(sc);
  gate(hl.max <= 0.40, 'いちばん特徴が出た測定値の偏り 最大 ' + pct(hl.max) + '（40% 以下） ' + hl.txt);
  const amb = sc.filter((s, i) => s.highlight && (s.highlight.feature === 'f9' || s.highlight.feature === 'f10') &&
    hv[i].feats[s.highlight.feature].state === 'ambiguous').length;
  gate(amb === 0, `口の角が「あいまい」のまま「いちばん特徴」に選ばれた人: ${amb}`);
  console.log('  参考：中心を決めた人たち自身での割合 ' + shareTxt(shares(scFit)) +
    `、ρ=${spearman(scFit.map((s) => s.x), scFit.map((s) => s.y)).toFixed(3)}`);
  /* 参考：2回目を書かなかった人（1回目だけで採点。較正は2回平均から作ったものをそのまま使う） */
  const sc1 = hv.filter((m) => m.one.ok).map((m) => HW.score(m.one.feats, cal));
  const hl1 = hlShares(sc1);
  console.log(`  参考：1回書きだけで採点したとき（${sc1.length} 人）: ${shareTxt(shares(sc1))}、` +
    `ρ=${spearman(sc1.map((s) => s.x), sc1.map((s) => s.y)).toFixed(3)}、いちばん特徴 最大 ${pct(hl1.max)}（${hl1.txt}）`);

  /* ---- 同梱の較正（yui/content.js）で採点したとき ---- */
  const shipped = loadShipped(contentPath());
  console.log(`\n■ 関門：同梱の較正（${shipped.path}）で、検証用の同じ ${hv.length} 人を採点したとき（画面が実際に使う値）`);
  if (!shipped.cal) {
    gate(false, `content.js の calibration を読めません（${shipped.err}）`);
  } else {
    const scS = hv.map((m) => HW.score(m.feats, shipped.cal)).filter(Boolean), shS = shares(scS);
    TYPES.forEach((t) => gate(shS[t] >= 0.15 && shS[t] <= 0.35, `同梱の較正で ${t.padEnd(8)} ${pct(shS[t])}（15〜35%）`));
    const f5s = shipped.cal.features && shipped.cal.features.f5 ? shipped.cal.features.f5.median : null;
    gate(f5s === features.f5.median, `同梱の較正の f5 の中央値 ${f5s}ms ＝ この実行の f5 の中央値 ${features.f5.median}ms`);
    const diff = calDiff(shipped.cal, cal);
    console.log('  参考：同梱の較正とこの実行の較正の違い ' + (diff.length ? diff.join(' / ') : 'なし（同じ）'));
    if (diff.length) console.log('  → 末尾の CALIBRATION を yui/content.js の calibration に貼り替えてください（型の割合・中央値の表示が、この実行の測り方にそろいます）');
  }

  console.log('\n■ 境界付近（「○○型寄り」と出る人、検証用の人たち）');
  const leanShare = sc.filter((s) => s.lean.x || s.lean.y).length / sc.length;
  console.log(`  軸の尺度（IQR/1.349）: x ${axisScale.x} / y ${axisScale.y}`);
  console.log(`  境界 ±0.25×軸の尺度（仕様書の ±0.25SD。cal.axisScale を使う）: ${pct(leanShare)}（仕様書の見込み 約36%）`);

  /* ---- (e) の代わり：ふるえのある人 ---- */
  console.log(`\n■ 関門 (e) の代わり：同じ ${M} 人が、ふるえ 2px・8Hz で書いたとき（ふるえは採点に使わない約束）`);
  const base = [];
  for (let i = 0; i < M; i++) base.push(measure(people[i], 1000 + i));
  const cmp = (label, other, lim) => {
    const A = [], B = [];
    for (let i = 0; i < M; i++) {
      if (!base[i].ok || !other[i].ok) continue;
      A.push(HW.score(base[i].feats, cal)); B.push(HW.score(other[i].feats, cal));
    }
    const sa = shares(A), sb = shares(B);
    const dmax = Math.max(...TYPES.map((t) => Math.abs(sa[t] - sb[t]))) * 100;
    const same = A.filter((s, i) => s.key === B[i].key).length / A.length;
    const lost = other.filter((m, i) => base[i].ok && !m.ok).length;
    gate(dmax <= lim, `${label}: ${shareTxt(sb)}（ふるえなし ${shareTxt(sa)}）` +
      `  割合の差 最大 ${dmax.toFixed(1)} ポイント（${lim} 以下）・同じ型 ${pct(same)}・弾かれた ${lost} 人`);
  };
  const trem = [];
  for (let i = 0; i < M; i++) trem.push(measure(people[i], 1000 + i, { tremorPx: 2, tremorHz: 8 }));
  cmp('止めている間も揺れ続ける（実機に近い）', trem, 15);
  const tremPost = [];
  for (let i = 0; i < M; i++) tremPost.push(measure(people[i], 1000 + i, null, (st) => SY.addTremor(st, 2, 8)));
  cmp('あとから足したふるえ（離す点だけ跳ぶ、厳しい条件）', tremPost, 15);
  console.log('  ※ 単体テストでは、さらに厳しく 5 ポイント以内を確かめています（_ops/test/hw-engine.test.js）');

  /* ---- 「いちばん特徴」の偏り：端末（240Hz）・ふるえのある人でも 40% 以下か ---- */
  console.log(`\n■ 関門：いちばん特徴が出た測定値の偏り（同じ ${M} 人を、条件を変えて）`);
  // 2回平均に加えて、1回書き（2回目を書かなかった人。画面では2回目は任意）でも確かめる
  const hlGate = (label, list) => {
    const s = list.filter((m) => m.ok).map((m) => HW.score(m.feats, cal));
    const s1 = list.filter((m) => m.one.ok).map((m) => HW.score(m.one.feats, cal));
    const h = hlShares(s), h1 = hlShares(s1);
    gate(h.max <= 0.40, `${label}・2回平均（${s.length} 人）: 最大 ${pct(h.max)}（40% 以下） ${h.txt}`);
    gate(h1.max <= 0.40, `${label}・1回書き（${s1.length} 人）: 最大 ${pct(h1.max)}（40% 以下） ${h1.txt}`);
  };
  const hz240 = [];
  for (let i = 0; i < M; i++) hz240.push(measure(people[i], 1000 + i, { hz: 240 }));
  hlGate('点の間隔 240Hz の端末', hz240);
  hlGate('ふるえ 2px・8Hz（止めている間も揺れ続ける）', trem);
  hlGate('ふるえ 2px・8Hz（あとから足す）', tremPost);

  /* ---- 端末を変えても型が変わらないか（同じ人・同じ種） ---- */
  console.log('\n■ 参考：同じ人・同じ字で、端末だけを変えたときの型の一致');
  const agree = (a, b) => {
    let same = 0, n = 0;
    for (let i = 0; i < M; i++) {
      const A = measure(people[i], 1000 + i, a), B = measure(people[i], 1000 + i, b);
      if (!A.ok || !B.ok) continue;
      n++;
      if (HW.score(A.feats, cal).key === HW.score(B.feats, cal).key) same++;
    }
    return { same, n };
  };
  const sd = agree({ side: 300 }, { side: 400 });
  console.log(`  キャンバス 300px ↔ 400px: ${pct(sd.same / sd.n)}（${sd.same}/${sd.n}）`);
  const hzA = agree({ hz: 60 }, { hz: 240 });
  console.log(`  点の間隔 60Hz ↔ 240Hz: ${pct(hzA.same / hzA.n)}（${hzA.same}/${hzA.n}）`);

  /* ---- 参考：別の日（日ごとのずれの大きさを変えて） ---- */
  console.log(`\n■ 参考：別の日にもう一度（${M} 人）。日ごとのずれは仮定なので、段階を変えて示します`);
  console.log('  2回平均＝その日に2回書いて平均したものどうし／1回書き＝それぞれの日の1回目だけどうし（画面では2回目は任意）');
  const rows = [], rows1 = [];
  const code = { closed: -1, ambiguous: 0, open: 1 };
  const fv = (f, k) => { const x = f[k]; return x && typeof x === 'object' ? code[x.state] : x; };
  const agreeOf = (A, B) => ({
    rx: pearson(A.map((s) => s.x), B.map((s) => s.x)), ry: pearson(A.map((s) => s.y), B.map((s) => s.y)),
    same: A.filter((s, i) => s.key === B[i].key).length / A.length,
    hl: A.filter((s, i) => hlKey(s) === hlKey(B[i])).length / A.length,
    n: A.length
  });
  [0, 1, 2, 3].forEach((L) => {
    const A = [], B = [], FA = [], FB = [], A1 = [], B1 = [];
    for (let i = 0; i < M; i++) {
      const b = measureDay(people[i], 500000 + i, L);
      if (base[i].ok && b.ok) {
        FA.push(base[i].feats); FB.push(b.feats);
        A.push(HW.score(base[i].feats, cal)); B.push(HW.score(b.feats, cal));
      }
      if (base[i].one.ok && b.one.ok) { A1.push(HW.score(base[i].one.feats, cal)); B1.push(HW.score(b.one.feats, cal)); }
    }
    const g2 = agreeOf(A, B), g1 = agreeOf(A1, B1);
    const fr = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8'].map((k) => {
      const idx = FA.map((_, i) => i).filter((i) => fv(FA[i], k) !== null && fv(FB[i], k) !== null);
      return `${k} ${pearson(idx.map((i) => fv(FA[i], k)), idx.map((i) => fv(FB[i], k))).toFixed(2)}`;
    }).join(' ');
    rows.push({ L, r: (g2.rx + g2.ry) / 2, same: g2.same });
    rows1.push({ L, r: (g1.rx + g1.ry) / 2, same: g1.same });
    console.log(`  段階 L=${L}: 同じ型 2回平均 ${pct(g2.same)}（${g2.n} 人）／1回書き ${pct(g1.same)}（${g1.n} 人）` +
      `  軸の再現性 2回平均 x ${g2.rx.toFixed(2)} y ${g2.ry.toFixed(2)}／1回書き x ${g1.rx.toFixed(2)} y ${g1.ry.toFixed(2)}`);
    console.log(`           いちばん特徴（特徴と向き）が同じ 2回平均 ${pct(g2.hl)}／1回書き ${pct(g1.hl)}  特徴の再現性（2回平均） ${fr}`);
  });
  /* 2回平均の軸の再現性が r になる段階（L の間を直線で補う）で、2回平均と1回書きの一致率を読む。
   * 1回書きも同じ段階（同じ日ごとのずれ）で読むので、2つの値は同じ人・同じずれでの比較になります。 */
  const at = (r) => {
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1], b = rows[i];
      if ((a.r - r) * (b.r - r) <= 0 && a.r !== b.r) {
        const u = (r - a.r) / (b.r - a.r);
        return { two: a.same + (b.same - a.same) * u, one: rows1[i - 1].same + (rows1[i].same - rows1[i - 1].same) * u };
      }
    }
    return null;
  };
  [0.8, 0.7].forEach((r) => {
    const v = at(r);
    console.log(`  2回平均の軸の再現性 r ≈ ${r} の段階で: 同じ型 2回平均 ${v ? pct(v.two) : '（段階の範囲外）'}／1回書き ${v ? pct(v.one) : '（段階の範囲外）'}（段階の間を直線で補った値）`);
  });
  console.log('  ※ L=0 は日ごとのずれを入れない上限です。どの段階の値も仮定から出した上限の目安で、関門(c) 70% の判断は実データで行います。');

  /* ---- 参考：字の大きさで型が変わるか（オーナーの判断事項） ---- */
  console.log('\n■ 参考：字の大きさだけを変えたとき（口の開閉は画面の線の太さで判定するため、大きさが少し効く）');
  const bySize = {};
  [0.5, 0.9].forEach((scale) => {
    bySize[scale] = [];
    for (let i = 0; i < Math.min(300, M); i++) {
      const m = measure(people[i], 1000 + i, { scale });
      bySize[scale].push(m.ok ? HW.score(m.feats, cal) : null);
    }
    const ok = bySize[scale].filter(Boolean);
    console.log(`  字の大きさ ${scale}: ${shareTxt(shares(ok))}`);
  });
  const both = bySize[0.5].map((s, i) => [s, bySize[0.9][i]]).filter(([a, b]) => a && b);
  console.log(`  同じ人で 0.5 ↔ 0.9: 同じ型 ${pct(both.filter(([a, b]) => a.key === b.key).length / both.length)}`);

  console.log('\nCALIBRATION');
  console.log(JSON.stringify({
    version: cal.version,
    n: cal.n,
    note: '合成データ（_ops/test/hw-calibration.js の person() の仮定）から作った仮の値。人の実測ではない。パイロットの実測で置き換えること。',
    features, weights: WEIGHTS, dirs: DIRS, center, axisScale, boundary: 0.25
  }, null, 2));
  console.log(`\n（${((Date.now() - t0) / 1000).toFixed(1)} 秒）` + (gates ? `  関門の未達 ${gates} 件` : '  関門はすべて通過'));
  process.exitCode = gates ? 1 : 0;
}

module.exports = { person, writing, day, measure, measureDay, fitCal, WEIGHTS, DIRS, FLOOR };
if (require.main === module) main();
