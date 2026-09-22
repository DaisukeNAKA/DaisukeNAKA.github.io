/**
 * content.js を編集したあとの健全性チェック
 *
 *   node _ops/test/check.js
 *
 * ブラウザは不要です。node だけで動きます。
 * content.js は「ここだけ編集すれば全部変わる」設計なので、
 * 編集で採点の較正や画面の対応づけが静かに壊れていないかを、ここで確かめます。
 *
 * 落ちたら公開しないでください。警告（!）は、確認したうえで進めて構いません。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const YUI = path.join(ROOT, 'yui');

let fail = 0;
let warn = 0;
const ok = (m) => console.log('  ok   ' + m);
const ng = (m, d) => { console.log('  NG   ' + m + (d ? '\n         ' + d : '')); fail++; };
const wn = (m, d) => { console.log('  !    ' + m + (d ? '\n         ' + d : '')); warn++; };
const head = (m) => console.log('\n' + m);

/* ---------------------------------------------------------------- 読み込み */
head('■ 読み込み');
global.window = {};
let C;
try {
  require(path.join(YUI, 'content.js'));
  C = global.window.YUI_CONTENT;
  ok('content.js を読み込めました');
} catch (e) {
  ng('content.js が読み込めません', e.message);
  process.exit(1);
}
const appSrc = fs.readFileSync(path.join(YUI, 'app.js'), 'utf8');

/* ------------------------------------------------------- app.js が使うキー */
head('■ app.js が参照しているキーが content.js にあるか');
[
  ['copy', C.copy, /C\.copy\.([A-Za-z0-9_]+)/g],
  ['config', C.config, /CFG\.([A-Za-z0-9_]+)/g],
  ['intensity', C.intensity, /C\.intensity\.([A-Za-z0-9_]+)/g],
  ['operator', C.operator || {}, /op\.([A-Za-z0-9_]+)/g],
  ['qualify', C.qualify || {}, /C\.qualify\.([A-Za-z0-9_]+)/g],
].forEach(([name, obj, re]) => {
  const missing = [];
  let m;
  while ((m = re.exec(appSrc)) !== null) {
    if (!(m[1] in obj)) { missing.push(m[1]); }
  }
  if (missing.length) { ng(name + ' に不足', [...new Set(missing)].join(', ')); }
  else { ok(name + ' は揃っています'); }
});

/* ------------------------------------------------------------------ 設問 */
head('■ 設問');
const Q = C.questions;
if (!Array.isArray(Q) || !Q.length) { ng('questions がありません'); process.exit(1); }
ok(`設問 ${Q.length} 問`);

let qBad = 0;
Q.forEach((q, i) => {
  const at = `q${i + 1}（${q.id || '?'}）`;
  if (!q.scene || !q.text) { ng(at + ' に scene か text がありません'); qBad++; }
  if (!Array.isArray(q.options) || q.options.length !== 4) {
    ng(at + ' の選択肢が4つではありません', '実際: ' + (q.options ? q.options.length : 0));
    qBad++;
    return;
  }
  q.options.forEach((o, j) => {
    const where = `${at} の選択肢${j + 1}`;
    const num = (v) => typeof v === 'number' && isFinite(v);
    if (!o.label) { ng(where + ' に label がありません'); qBad++; }
    if (!num(o.x) || Math.abs(o.x) > 2) { ng(where + ' の x が -2〜2 の数値ではありません', String(o.x)); qBad++; }
    if (!num(o.y) || Math.abs(o.y) > 2) { ng(where + ' の y が -2〜2 の数値ではありません', String(o.y)); qBad++; }
    ['clarity', 'bridge', 'space'].forEach((k) => {
      if (!num(o[k]) || o[k] < 0 || o[k] > 3) {
        ng(where + ` の ${k} が 0〜3 の数値ではありません`, String(o[k])); qBad++;
      }
    });
    if (o.x === 0 || o.y === 0) {
      wn(where + ' の x か y が 0 です', '象限がはっきりせず、タイブレークに回ります');
    }
    if (o.label && o.label.length > 26) {
      wn(where + ` の label が ${o.label.length} 字です`, '24字前後に収めると1行で読めます');
    }
  });
});
if (!qBad) { ok('すべての設問の配点が有効な範囲に収まっています'); }

/* ---------------------------------------------------------------- タイプ */
head('■ タイプ');
const TYPE_KEYS = ['soukatsu', 'yoin', 'sengen', 'shoutai'];
const hex = (c) => /^#[0-9a-fA-F]{3,8}$/.test(String(c));
if (!Array.isArray(C.types) || C.types.length !== 4) {
  ng('types が4つではありません');
} else {
  const keys = C.types.map((t) => t.key);
  TYPE_KEYS.forEach((k) => {
    if (keys.indexOf(k) < 0) { ng(`タイプ ${k} がありません`, 'app.js の判定はこの4つを前提にしています'); }
  });
  if (new Set(keys).size !== keys.length) { ng('タイプの key が重複しています', keys.join(', ')); }
  C.types.forEach((t) => {
    ['name', 'tagline', 'catch', 'summary', 'strength', 'leak',
     'badExample', 'goodExample', 'exampleNote', 'affinity', 'shareText'].forEach((f) => {
      if (!t[f]) { ng(`${t.key} の ${f} が空です`); }
    });
    if (!hex(t.color)) { ng(`${t.key} の color が16進色ではありません`, String(t.color)); }
    if (!hex(t.colorDark)) { ng(`${t.key} の colorDark が16進色ではありません`, String(t.colorDark)); }
  });
  if (!fail) { ok('4タイプの必須項目と色が揃っています'); }
}

/* -------------------------------------------------------------- 処方箋 */
head('■ 処方箋');
const WEAK = ['clarity', 'bridge', 'space'];
WEAK.forEach((w) => {
  const rx = (C.prescriptions || []).filter((p) => p.weakest === w);
  if (rx.length !== 1) {
    ng(`weakest="${w}" の処方箋が1本ではありません`, `実際: ${rx.length}本`);
    return;
  }
  const r = rx[0];
  ['title', 'diagnosis', 'formula', 'worked', 'pitfall'].forEach((f) => {
    if (!r[f]) { ng(`${w} の処方箋の ${f} が空です`); }
  });
  const fl = String(r.formula).split('\n').filter(Boolean).length;
  const wl = String(r.worked).split('\n').filter(Boolean).length;
  if (fl !== wl) {
    wn(`${w} の型と記入例の行数が違います`, `型 ${fl}行 / 記入例 ${wl}行。1対1で対応させると読者が真似しやすくなります`);
  }
});
if (!fail) { ok('3種の処方箋が1本ずつ揃っています'); }

/* ------------------------------------------------------------ スコア帯 */
head('■ 結スコアの段階');
const bands = (C.bands || []).slice().sort((a, b) => a.min - b.min);
if (bands.length < 1) {
  ng('bands がありません');
} else {
  let cursor = 0, gap = false;
  bands.forEach((b) => {
    if (b.min !== cursor) { ng('スコア帯に隙間か重なりがあります', `${cursor} の次が ${b.min} から`); gap = true; }
    cursor = b.max + 1;
    if (!b.label || !b.comment) { ng(`スコア帯 ${b.min}-${b.max} の label か comment が空です`); }
  });
  if (cursor !== 101) { ng('スコア帯が 0〜100 を覆っていません', `${cursor - 1} までしかありません`); }
  else if (!gap) { ok(`スコア帯 ${bands.length} 段階が 0〜100 を隙間なく覆っています`); }
}

/* ---------------------------------------- 採点（実装そのものを読み込む） */
head('■ 採点の総当たり（app.js の実装をそのまま使用）');
function extract(name) {
  const i = appSrc.indexOf('function ' + name);
  if (i < 0) { throw new Error('app.js に ' + name + ' が見つかりません'); }
  let depth = 0;
  const start = appSrc.indexOf('{', i);
  for (let k = start; k < appSrc.length; k++) {
    if (appSrc[k] === '{') { depth++; }
    else if (appSrc[k] === '}') { depth--; if (!depth) { return appSrc.slice(i, k + 1); } }
  }
  throw new Error(name + ' の終端が見つかりません');
}
let score, CAL;
try {
  const calStart = appSrc.indexOf('var CAL = (function');
  const calSrc = appSrc.slice(calStart, appSrc.indexOf('})();', calStart) + 5);
  const body = calSrc + '\n' + extract('clamp') + '\n' + extract('score') + '\nreturn { score: score, CAL: CAL };';
  const N = Q.length;
  const out = new Function('C', 'Q', 'N', 'TOTAL_A', body)(C, Q, N, N + 1);
  score = out.score; CAL = out.CAL;
  ok('app.js から採点ロジックを取り出せました');
} catch (e) {
  ng('採点ロジックを取り出せません', e.message);
  console.log('\n' + (fail ? `NG ${fail}件` : '') + (warn ? ` / 警告 ${warn}件` : ''));
  process.exit(1);
}

const N = Q.length;
if (N > 20) {
  wn(`設問が ${N} 問あるため総当たりを省略します`, '4^' + N + ' 通りは現実的でないため、分布は実データで確認してください');
} else {
  const combos = Math.pow(4, N);
  const a = new Array(N + 1).fill(0);
  const T = {}, W = {}, L = {}, B = {};
  let min = Infinity, max = -Infinity, bad = 0;
  for (let v = 0; v < combos; v++) {
    let t = v;
    for (let i = 1; i <= N; i++) { a[i] = t % 4; t = Math.floor(t / 4); }
    const r = score(a);
    if (!isFinite(r.total)) { bad++; continue; }
    T[r.key] = (T[r.key] || 0) + 1;
    W[r.weakest] = (W[r.weakest] || 0) + 1;
    L[r.level] = (L[r.level] || 0) + 1;
    const b = bands.filter((x) => r.total >= x.min && r.total <= x.max)[0];
    const bk = b ? b.min + '-' + b.max : '該当なし';
    B[bk] = (B[bk] || 0) + 1;
    if (r.total < min) { min = r.total; }
    if (r.total > max) { max = r.total; }
  }
  const pc = (n) => (100 * n / combos).toFixed(1) + '%';
  const show = (o) => Object.entries(o).map(([k, v]) => `${k} ${pc(v)}`).join(' / ');

  if (bad) { ng(`スコアが数値にならない組み合わせが ${bad} 件あります`, '配点の幅が0になっていないか確認してください'); }
  else { ok(`全 ${combos.toLocaleString()} 通りでスコアが算出できました（${min}〜${max}）`); }

  TYPE_KEYS.forEach((k) => {
    if (!T[k]) { ng(`タイプ ${k} に到達できる回答がありません`, '配点を見直してください'); }
  });
  if (TYPE_KEYS.every((k) => T[k])) { ok('4タイプすべてに到達できます'); }

  TYPE_KEYS.forEach((k) => {
    const p = 100 * (T[k] || 0) / combos;
    if (p < 10 || p > 45) {
      wn(`タイプ ${k} の出現が ${p.toFixed(1)}% です`, '10〜45%から外れています。結果の個別性が落ちます');
    }
  });

  if (B['該当なし']) { ng(`どのスコア帯にも入らない結果が ${pc(B['該当なし'])} あります`); }
  bands.forEach((b) => {
    const key = b.min + '-' + b.max;
    if (!B[key]) { wn(`スコア帯「${b.label}」に到達する回答がありません`, `${b.min}-${b.max}`); }
  });

  console.log('');
  console.log('  タイプ    : ' + show(T));
  console.log('  最弱要素  : ' + show(W));
  console.log('  判定の強度: ' + show(L));
  console.log('  スコア帯  : ' + show(B));
  console.log('  較正      : raw ' + CAL.rawMin + '〜' + CAL.rawMax +
    ' / cMax ' + CAL.cMax + ' bMax ' + CAL.bMax + ' sMax ' + CAL.sMax);
}

/* -------------------------------------------- 生成物が最新かどうか */
head('■ 生成物（content.js を編集したら build-pages.js を実行してください）');
const stale = [];
C.types.forEach((t) => {
  const f = path.join(YUI, 't', String(t.key).replace(/[^A-Za-z0-9_-]/g, '') + '.html');
  if (!fs.existsSync(f)) { ng(`t/${t.key}.html がありません`); return; }
  const html = fs.readFileSync(f, 'utf8');
  if (html.indexOf(t.name) < 0 || html.indexOf(String(t.catch).slice(0, 12)) < 0) { stale.push(`t/${t.key}.html`); }
});
const idx = path.join(YUI, 'index.html');
if (!fs.existsSync(idx)) { ng('index.html がありません'); }
else if (fs.readFileSync(idx, 'utf8').indexOf(String(C.copy.hook).slice(0, 14)) < 0) { stale.push('index.html'); }
const abt = path.join(YUI, 'about.html');
if (!fs.existsSync(abt)) { ng('about.html がありません'); }
else if (fs.readFileSync(abt, 'utf8').indexOf(String(C.about.profile).slice(0, 14)) < 0) { stale.push('about.html'); }

if (stale.length) {
  ng('生成物が content.js に追いついていません', stale.join(', ') + ' → node _ops/build/build-pages.js');
} else {
  ok('生成ページは content.js と一致しています');
}

const ver = C.config.ogpVersion || 'v1';
['yui-top'].concat(C.types.map((t) => String(t.key).replace(/[^A-Za-z0-9_-]/g, ''))).forEach((slug) => {
  const f = path.join(YUI, 'ogp', `${slug}-${ver}.png`);
  if (!fs.existsSync(f)) {
    ng(`OGP画像 ogp/${slug}-${ver}.png がありません`, 'node _ops/build/render-ogp.js を実行してください');
  }
});
if (!stale.length) { ok(`OGP画像 5枚（${ver}）が揃っています`); }

/* ------------------------------------------------ 公開前の設定の埋まり具合 */
head('■ 公開前の設定');
if (!C.config.dmUrl && !C.config.profileUrl && !C.config.lineUrl) {
  wn('dmUrl / profileUrl / lineUrl がすべて空です',
    '結果ページから連絡を取る手段が1本もありません。公開前に profileUrl だけでも埋めてください');
} else {
  ok('連絡先の導線が設定されています');
}
if (C.config.gaMeasurementId &&
    (C.config.analyticsBlockedHosts || []).indexOf('daisukenaka.github.io') < 0) {
  wn('GA4が有効で、daisukenaka.github.io が計測の除外ホストに入っていません',
    'このドメインのプライバシーポリシーはCookie不取得と記載しています。_ops/playbook/40 を確認してください');
}

/* ---------------------------------------------------------------- まとめ */
console.log('\n' + '─'.repeat(52));
if (fail) {
  console.log(`NG ${fail}件${warn ? ` / 警告 ${warn}件` : ''} — 直してから公開してください。`);
  process.exit(1);
}
console.log(`すべて通過${warn ? ` / 警告 ${warn}件（内容を確認のうえ進めて構いません）` : ''}`);
