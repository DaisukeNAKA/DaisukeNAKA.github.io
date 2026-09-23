/**
 * 「結」の合成手書き（テスト・較正用）
 *
 *   const SY = require('./synth.js');
 *   const strokes = SY.synth({ seed: 1, side: 320, ... });        // → [{points:[{x,y,t}]}]
 *   const { strokes, truth } = SY.make({ ... });                  // truth: 各画がお手本の何画目か
 *   SY.makeOther('ichi' | 'scribble' | 'tiny' | 'segments', { seed, side })   // 「結」でない入力
 *   SY.addTremor(strokes, px, hz)                                 // あとから一定のふるえを足す
 *   SY.transform(strokes, side, (x, y) => [x2, y2])               // 正規化座標で変形（回転・鏡像など）
 *
 * yui/hw-engine.js の TEMPLATE（自作の12画）を、人ごとのクセと指の動きで崩して、
 * PointerEvent と同じ形（CSS px と timeStamp ms、最後の点は pointerup）で出します。
 * 乱数は mulberry32 の種から作るので、同じ引数なら必ず同じ線になります（Math.random は使いません）。
 *
 * 乱数は3系統に分けています。
 *   形（画ごとの小さなゆらぎ）／時間（画ごとの速さ・止め・間）／点（センサーの揺れ）
 * 時間と点の乱数は、さらにお手本の画ごとに種を分けています。
 * 点の間隔（hz）・キャンバスの大きさ（side）・書き順だけを変えたとき、
 * 同じ人の同じ字の形と時間が保たれるようにするためです。
 *
 * ふるえ（tremorPx / tremorHz）は、時刻の関数の正弦波を全部の点に足します。ふるえている指は
 * 止めている間も 1px 以上動くので、そのときは止めの間の pointermove も出します（実機と同じ）。
 * addTremor() は、できあがった線にあとから足す版で、止めの間の pointermove は出しません
 * （pointerup の点だけが別の位置に跳ぶ、実機より厳しい条件）。
 *
 * これは人の指の実データではありません。特徴量の計算が壊れていないか、
 * 端末差に強いかを確かめるための道具です。
 */
'use strict';

const HW = require('../../yui/hw-engine.js');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r) {
  let u = 0, v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const minJerk = (u) => 10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5;
const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const plen = (p) => { let L = 0; for (let i = 1; i < p.length; i++) L += d2(p[i - 1], p[i]); return L; };
function along(p, s) {
  let acc = 0;
  for (let i = 1; i < p.length; i++) {
    const L = d2(p[i - 1], p[i]);
    if (acc + L >= s || i === p.length - 1) {
      const r = L ? Math.min(1, Math.max(0, (s - acc) / L)) : 0;
      return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * r, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * r];
    }
    acc += L;
  }
  return p[p.length - 1].slice();
}
function rotateAbout(pts, c, deg) {
  const a = deg * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
  // 画面座標（y 下向き）で、見た目の反時計回り（右側が上がる向き）を正にする
  return pts.map(([x, y]) => {
    const dx = x - c[0], dy = y - c[1];
    return [c[0] + dx * co + dy * si, c[1] - dx * si + dy * co];
  });
}
function roundCorner(pts, idx, r) {
  const P0 = pts[idx - 1], C = pts[idx], P2 = pts[idx + 1];
  const a = [C[0] + (P0[0] - C[0]) * Math.min(1, r / d2(P0, C)), C[1] + (P0[1] - C[1]) * Math.min(1, r / d2(P0, C))];
  const b = [C[0] + (P2[0] - C[0]) * Math.min(1, r / d2(P2, C)), C[1] + (P2[1] - C[1]) * Math.min(1, r / d2(P2, C))];
  const arc = [];
  for (let k = 0; k <= 8; k++) {
    const t = k / 8, u = 1 - t;
    arc.push([u * u * a[0] + 2 * u * t * C[0] + t * t * b[0], u * u * a[1] + 2 * u * t * C[1] + t * t * b[1]]);
  }
  return pts.slice(0, idx).concat(arc, pts.slice(idx + 1));
}

const DEFAULTS = {
  seed: 1,
  side: 320,          // キャンバス一辺（CSS px）
  scale: 0.72,        // お手本（一辺=1）に対する字の大きさ
  cx: 0.5, cy: 0.5,   // 字の中心（キャンバス一辺=1）
  rotDeg: 0,          // 字全体の回転（右側が上がる向きを正）
  slantDeg: 0,        // 横画の右上がり（縦画は動かさないせん断）
  aspect: 1,          // 縦横比の倍率（>1 で縦長）
  gapShift: 0,        // 吉を右へずらす量（お手本の単位。糸と吉のすき間が広がる）
  kouUL: 0,           // 口の左上：11画目の書き出しを右へ（負なら 10 を越えて左へ出る）
  kouLL: 0,           // 口の左下：12画目の書き出しを右へ
  kouLR: 0,           // 口の右下：12画目の終わりを手前で止める
  head: 0,            // 士の縦画(8)の上端を上へ伸ばす量
  cornerR: 0,         // 横折(11)の角の丸み（お手本の単位）
  hJitterDeg: 1.5,    // 横画ごとの角度のばらつき（SD、度）
  rotNoiseDeg: 0.8,   // そのほかの画の角度のばらつき（SD、度）
  posNoise: 0.004,    // 画ごとの位置のばらつき（SD、お手本の単位）
  renmen: [],         // 続けて書く画の組 [[a,b], ...]（お手本の画番号）
  split11: false,     // 横折(11)を2画に分けて書く（口を4画で書く人）
  stopMs: 150,        // とめの画で止まる時間の傾向（数値、または {4:..,7:..} で画ごと）
  speed: 1.3,         // 書く速さ（字の高さ/秒、指が動いている間。止めている時間は含まない）
  pauseRatio: 0.45,   // 画と画の間（空中）の時間 / 全体の時間
  hz: 60,             // 点の間隔（60 / 120 / 240）
  jitterPx: 0.4,      // 点ごとのセンサーの揺れ（SD、CSS px）
  tremorPx: 0,        // ふるえの振幅（CSS px。0 ならなし）
  tremorHz: 8,        // ふるえの周波数（Hz）
  holdEvents: false,  // 止まっている間も位置の同じ pointermove が来る端末（ふるえがあれば自動で出す）
  order: 'standard'   // 'standard' | 'reverse' | 'kiFirst'
};

/* 形：お手本 → 人のクセ → 画ごとのゆらぎ → 字全体の変形 → キャンバス座標（一辺=1） */
function buildShape(p, rS) {
  const st = HW.TEMPLATE.map((s) => s.pts.map((q) => [q[0], q[1]]));
  st[7][0][1] -= p.head;
  st[10][0][0] += p.kouUL;
  st[11][0][0] += p.kouLL;
  st[11][st[11].length - 1][0] -= p.kouLR;
  for (let k = 6; k < 12; k++) st[k] = st[k].map(([x, y]) => [x + p.gapShift, y]);
  let corner11 = 1;
  if (p.cornerR > 0) { st[10] = roundCorner(st[10], 1, p.cornerR); corner11 = 5; }
  for (let k = 0; k < 12; k++) {
    const n = k + 1;
    const isH = n === 7 || n === 9 || n === 11 || n === 12;
    const deg = gauss(rS) * (isH ? p.hJitterDeg : p.rotNoiseDeg);
    const ox = gauss(rS) * p.posNoise, oy = gauss(rS) * p.posNoise;
    const s = st[k];
    let c;
    if (n === 11) c = s[0];                                   // 横折は書き出しを軸に回す（左上の接筆を保つ）
    else if (isH) c = [(s[0][0] + s[s.length - 1][0]) / 2, (s[0][1] + s[s.length - 1][1]) / 2];
    else c = [s.reduce((a, q) => a + q[0], 0) / s.length, s.reduce((a, q) => a + q[1], 0) / s.length];
    st[k] = rotateAbout(s, c, deg).map(([x, y]) => [x + ox, y + oy]);
  }
  const tanS = Math.tan(p.slantDeg * Math.PI / 180);
  const out = st.map((s) => {
    let q = s.map(([x, y]) => [x, 0.5 + (y - 0.5) * p.aspect]);
    q = q.map(([x, y]) => [x, y - tanS * (x - 0.5)]);
    q = rotateAbout(q, [0.5, 0.5], p.rotDeg);
    return q.map(([x, y]) => [p.cx + (x - 0.5) * p.scale, p.cy + (y - 0.5) * p.scale]);
  });
  return { st: out, corner11 };
}

/* 何画をどうまとめて書くか。連綿は、実際の続け書きに近い経路にします。 */
function buildGroups(p, shape) {
  const st = shape.st;
  const inGroup = new Array(13).fill(false);
  const groups = [];
  const rev = (a) => a.slice().reverse();
  for (const [a, b] of p.renmen || []) {
    if (a < 1 || b > 12 || a >= b) continue;
    let bad = false;
    for (let k = a; k <= b; k++) if (inGroup[k]) bad = true;
    if (bad) continue;
    let path, segs;
    if (a === 10 && b === 12) {
      // 口を一筆で：左上から右へ、下へ、左へ戻って、左の縦を上へ
      segs = [st[10], rev(st[11]), rev(st[9])];
    } else if (a === 11 && b === 12) {
      // 横折のあと、底の横画を右から左へ
      segs = [st[10], rev(st[11])];
    } else {
      segs = [];
      for (let k = a; k <= b; k++) segs.push(st[k - 1]);
    }
    path = [];
    segs.forEach((s) => { path = path.concat(s); });
    const nums = [];
    for (let k = a; k <= b; k++) { nums.push(k); inGroup[k] = true; }
    groups.push({ nums, path, first: a });
  }
  for (let k = 1; k <= 12; k++) {
    if (inGroup[k]) continue;
    if (k === 11 && p.split11) {
      const s = st[10], c = shape.corner11;
      groups.push({ nums: [11], path: s.slice(0, c + 1), first: 11, sub: 0 });
      groups.push({ nums: [11], path: s.slice(c), first: 11, sub: 1 });
      continue;
    }
    groups.push({ nums: [k], path: st[k - 1], first: k });
  }
  const ord = (g) => g.first + (g.sub || 0) * 0.1;
  if (p.order === 'reverse') groups.sort((x, y) => ord(y) - ord(x));
  else if (p.order === 'kiFirst') groups.sort((x, y) => ((x.first < 7) - (y.first < 7)) || (ord(x) - ord(y)));
  else groups.sort((x, y) => ord(x) - ord(y));
  return groups;
}

/* 1本の線を、角（40°以上の折れ）ごとに区切った運動に分ける。角では指が止まりかけるため。 */
function movements(path) {
  const cuts = [0];
  for (let i = 1; i < path.length - 1; i++) {
    const a1 = Math.atan2(path[i][1] - path[i - 1][1], path[i][0] - path[i - 1][0]);
    const a2 = Math.atan2(path[i + 1][1] - path[i][1], path[i + 1][0] - path[i][0]);
    let d = Math.abs(a2 - a1); if (d > Math.PI) d = 2 * Math.PI - d;
    if (d > 40 * Math.PI / 180) cuts.push(i);
  }
  cuts.push(path.length - 1);
  const mv = [];
  for (let i = 1; i < cuts.length; i++) {
    const seg = path.slice(cuts[i - 1], cuts[i] + 1);
    if (plen(seg) > 0) mv.push(seg);
  }
  return mv.length ? mv : [path];
}

function stopFor(p, n) {
  if (typeof p.stopMs === 'number') return p.stopMs;
  if (p.stopMs && typeof p.stopMs[n] === 'number') return p.stopMs[n];
  return DEFAULTS.stopMs;
}
const TOME = [4, 7, 8, 9, 12];

/* 時間をつけて、点の列（CSS px, ms）にする。
 * 画ごとの所要時間・止め・センサーの揺れは、その画（お手本の番号）ごとの種から作る。
 * 書き順や点の間隔だけを変えたとき、同じ画は同じ形・同じ速さで書かれるようにするため。 */
function drawGroups(groups, p, charH, seed) {
  const dt = 1000 / p.hz;
  const gseed = (g) => (seed ^ Math.imul(g.first * 16 + (g.sub || 0) + 1, 0x9E3779B1)) >>> 0;
  const plan = groups.map((g) => {
    const rT = mulberry32((gseed(g) ^ 0x5bd1e995) >>> 0);
    const mv = movements(g.path);
    const L = mv.reduce((a, s) => a + plen(s), 0);
    const D = Math.max(50, (L / charH) / p.speed * 1000 * Math.exp(0.1 * gauss(rT)));
    const w = mv.map((s) => Math.pow(plen(s), 0.7));
    const ws = w.reduce((a, b) => a + b, 0);
    const lastNum = endNum(g);
    const base = TOME.indexOf(lastNum) >= 0 ? stopFor(p, lastNum) : 0.25 * stopFor(p, 7);
    const hold = Math.max(0, base * Math.exp(0.3 * gauss(rT)));
    const air = Math.exp(0.35 * gauss(rT));   // この画の前の空中時間の重み
    return { mv, D, Ds: w.map((x) => D * x / ws), hold, air, rN: mulberry32((gseed(g) ^ 0x2545f491) >>> 0) };
  });
  const penTotal = plan.reduce((a, q) => a + q.D + q.hold, 0);
  const airTotal = groups.length > 1 ? penTotal * p.pauseRatio / (1 - p.pauseRatio) : 0;
  const gw = plan.map((q) => q.air);
  const gws = gw.slice(1).reduce((a, b) => a + b, 0) || 1;

  let t = 1000;
  const strokes = [];
  plan.forEach((q, gi) => {
    if (gi > 0) t += airTotal * gw[gi] / gws;
    const pts = [];
    const posAt = (e) => {
      let acc = 0;
      for (let m = 0; m < q.mv.length; m++) {
        if (e <= acc + q.Ds[m] || m === q.mv.length - 1) {
          const u = Math.min(1, Math.max(0, (e - acc) / q.Ds[m]));
          return along(q.mv[m], minJerk(u) * plen(q.mv[m]));
        }
        acc += q.Ds[m];
      }
      return q.mv[q.mv.length - 1][q.mv[q.mv.length - 1].length - 1];
    };
    const nMove = Math.ceil(q.D / dt);
    const rN = q.rN;
    const noise = () => gauss(rN) * p.jitterPx;
    const trem = (tt) => (p.tremorPx > 0 ? tremorAt(p.tremorPx, p.tremorHz, tt) : [0, 0]);
    let bx = 0, by = 0;
    for (let k = 0; k <= nMove; k++) {
      const e = Math.min(q.D, k * dt);
      const [x, y] = posAt(e);
      const tt = t + k * dt, w = trem(tt);
      bx = x * p.side; by = y * p.side;
      pts.push({ x: bx + noise() + w[0], y: by + noise() + w[1], t: tt });
    }
    const lastMove = pts[pts.length - 1];
    let tUp = t + q.D + q.hold;
    if (tUp < lastMove.t) tUp = lastMove.t;
    if (p.holdEvents || p.tremorPx > 0) {
      // 止まっている間も pointermove が届く：ふるえがなければ位置はほぼ同じ（1px 未満の揺れ）、
      // ふるえがあれば、止めた位置のまわりで揺れ続ける
      for (let tt = lastMove.t + dt; tt < tUp; tt += dt) {
        const w = trem(tt);
        pts.push({ x: bx + gauss(rN) * 0.2 + w[0], y: by + gauss(rN) * 0.2 + w[1], t: tt });
      }
    }
    if (p.tremorPx > 0) {
      const w = trem(tUp);
      pts.push({ x: bx + w[0], y: by + w[1], t: tUp });   // pointerup：離した瞬間の位置
    } else {
      pts.push({ x: lastMove.x, y: lastMove.y, t: tUp });   // pointerup：最後の位置のまま離す
    }
    strokes.push({ points: pts });
    t = tUp;
  });
  return strokes;
}
/* ふるえ：x と y で少し周波数を変えた正弦波（p07 の検証と同じ形）。時刻は ms。 */
function tremorAt(A, hz, t) {
  return [A * Math.sin(2 * Math.PI * hz * t / 1000), A * Math.cos(2 * Math.PI * hz * 1.07 * t / 1000 + 1)];
}
/* できあがった線に、あとからふるえを足す（止めの間の pointermove は増やさない） */
function addTremor(strokes, A, hz) {
  return strokes.map((s) => ({ points: s.points.map((q) => {
    const w = tremorAt(A, hz, q.t);
    return { x: q.x + w[0], y: q.y + w[1], t: q.t };
  }) }));
}
/* 正規化座標（キャンバス一辺=1）での変形。f(x, y) → [x, y] */
function transform(strokes, side, f) {
  return strokes.map((s) => ({ points: s.points.map((q) => {
    const r = f(q.x / side, q.y / side);
    return { x: r[0] * side, y: r[1] * side, t: q.t };
  }) }));
}
function endNum(g) {
  // 書き終わりがお手本の何画目か（逆向きに書いた部分があっても、最後に書いた画）
  if (g.nums.length === 3 && g.nums[0] === 10) return 10;
  if (g.nums.length === 2 && g.nums[0] === 11 && g.nums[1] === 12) return 12;
  if (g.sub === 0) return 0;          // 横折の横だけで離した：とめの画ではない
  return g.nums[g.nums.length - 1];
}

function make(params) {
  const p = Object.assign({}, DEFAULTS, params || {});
  const rS = mulberry32(p.seed >>> 0);
  const shape = buildShape(p, rS);
  const groups = buildGroups(p, shape);
  let y0 = Infinity, y1 = -Infinity;
  shape.st.forEach((s) => s.forEach(([, y]) => { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }));
  const strokes = drawGroups(groups, p, y1 - y0, p.seed >>> 0);
  return { strokes, truth: groups.map((g) => g.nums.slice()), params: p };
}
function synth(params) { return make(params).strokes; }

/* 「結」ではない入力：妥当性チェックで弾けるかを確かめる */
function makeOther(kind, params) {
  const p = Object.assign({}, DEFAULTS, params || {});
  if (kind === 'tiny') return synth(Object.assign({}, p, { scale: 0.2 }));
  const rS = mulberry32(p.seed >>> 0);
  let groups;
  if (kind === 'ichi') {
    groups = [{ nums: [0], path: [[0.2, 0.5], [0.8, 0.5]], first: 1 }];
  } else if (kind === 'scribble') {
    groups = [0, 1, 2].map((i) => {
      const path = [];
      for (let k = 0; k < 5; k++) path.push([0.2 + 0.6 * rS(), 0.2 + 0.6 * rS()]);
      return { nums: [0], path, first: i + 1 };
    });
  } else if (kind === 'segments') {
    // でたらめな向き・長さの線分を12本（画数・大きさ・時間の条件は満たす）
    groups = [];
    for (let i = 0; i < 12; i++) {
      const x = 0.15 + 0.7 * rS(), y = 0.15 + 0.7 * rS(), a = rS() * Math.PI, L = 0.08 + 0.25 * rS();
      groups.push({ nums: [0], path: [[x, y], [x + L * Math.cos(a), y + L * Math.sin(a)]], first: i + 1 });
    }
  } else {
    throw new Error('unknown kind: ' + kind);
  }
  return drawGroups(groups, p, 0.6, p.seed >>> 0);
}

module.exports = { synth, make, makeOther, addTremor, transform, mulberry32, gauss, DEFAULTS };
