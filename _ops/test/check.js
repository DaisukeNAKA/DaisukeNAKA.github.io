/**
 * 「結」の書き方診断 — 公開前の健全性チェック（ブラウザ不要）
 *
 *   node _ops/test/check.js            # ふだんはこれ（約10秒）
 *   node _ops/test/check.js --full     # エンジンの単体テスト（約2分）も通す
 *
 * content.js は「ここだけ編集すれば全部変わる」設計なので、文言・較正・画面の対応づけが
 * 静かに壊れていないかを、ここで確かめます。
 *
 *   NG … 公開しないでください。直してから、もう一度実行します。
 *   !  … 確かめたうえで進めて構いません（多くはオーナー確認待ちの項目です）。
 *
 * 見ているもの（分け方：データ → コードとの対応 → 採点 → 文言 → 生成物 → 端末の外へ出るもの → 公開前の設定）
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const YUI = path.join(ROOT, 'yui');
const FULL = process.argv.includes('--full');

let fail = 0;
let warn = 0;
const ok = (m) => console.log('  ok   ' + m);
const ng = (m, d) => { console.log('  NG   ' + m + (d ? '\n         ' + d : '')); fail++; };
const wn = (m, d) => { console.log('  !    ' + m + (d ? '\n         ' + d : '')); warn++; };
const head = (m) => console.log('\n' + m);
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const num = (v) => typeof v === 'number' && isFinite(v);

/* ================================================================ 読み込み */
head('■ 読み込み');
global.window = {};
let C, HW;
try {
  require(path.join(YUI, 'content.js'));
  C = global.window.YUI_CONTENT;
  if (!C) { throw new Error('window.YUI_CONTENT がありません'); }
  ok('content.js');
} catch (e) { ng('content.js が読み込めません', e.message); process.exit(1); }
try {
  HW = require(path.join(YUI, 'hw-engine.js'));
  ok('hw-engine.js（VERSION ' + HW.VERSION + '）');
} catch (e) { ng('hw-engine.js が読み込めません', e.message); process.exit(1); }

const H = C.hw || {};
const TYPE_KEYS = ['sekkei', 'kyomei', 'suishin', 'chokkan'];
const ELEMENTS = { kijun: ['tight', 'wide'], dentatsu: ['express', 'receive'], ketsudan: ['hold', 'release'] };

/* ================================================================ データの形 */
head('■ データの形（content.js）');
function need(obj, keys, where, opt) {
  const miss = keys.filter((k) => {
    const v = obj ? obj[k] : undefined;
    if (opt && opt.allowEmpty && opt.allowEmpty.indexOf(k) >= 0) { return typeof v !== 'string'; }
    if (Array.isArray(v)) { return v.length === 0; }
    if (v && typeof v === 'object') { return false; }
    return !isStr(v);
  });
  if (miss.length) { ng(where + ' に不足', miss.join(', ')); } else { ok(where); }
}
need(C.config, ['siteUrl', 'ogpVersion', 'postKeyword'], 'config');
need(H.intro, ['kicker', 'title', 'r01', 'catch', 'r02', 'hook', 'r03', 'startButton', 'altLink', 'promise', 'whoFor', 'author'], 'hw.intro');
need(H.write, ['kicker', 'heading', 'r04', 'sizeHint', 'r05', 'undo', 'clear', 'done', 'ariaCanvas', 'noPointer',
  'secondPrompt', 'secondYes', 'secondHeading', 'problems', 'inappHint', 'lineExternal'], 'hw.write');
need(H.gate, ['scene', 'text', 'note'], 'hw.gate');
need(H.result, ['kicker', 'sharedKicker', 'r07Template', 'r07TemplateLink', 'r08', 'panelTitle', 'sharedPanelTitle',
  'panelNote', 'panelNoteTwoPass', 'calibrationNote', 'medianSourceTemplate', 'refSummary', 'sharedBanner',
  'sharedBannerButton', 'sharedPanelNote', 'reloadPanelNote', 'usedLabel', 'refLabel', 'notUsed', 'mapAria',
  'mapAriaLean', 'mapAriaShared', 'mapAriaLeanShared', 'mapAxes', 'leanTemplate', 'changedTemplate',
  'changedTemplateFar', 'liveHeading', 'highlightHeading', 'sharedHighlightHeading', 'highlightTemplate',
  'highlightTemplateLink', 'elements', 'themeHeading', 'summaryHeading', 'strengthHeading', 'stumbleHeading',
  'exampleHeading', 'affinityHeading', 'saveImage', 'saveImageNote', 'saveImageReady', 'saveImageText',
  'retake', 'forgetPrevious', 'forgetDone', 'toQuiz', 'aboutLink'], 'hw.result');
need(H.collect, ['heading', 'consent', 'copied'], 'hw.collect');
need(C.cta, ['commentHeading', 'commentBody', 'commentBack', 'commentCopied', 'dmHeading', 'dmBody', 'dmLead',
  'dmButton', 'dmCopyButton', 'dmCopied', 'dmLineTemplate', 'dmNote', 'lineHeading', 'lineBody', 'lineLead',
  'lineButton', 'softHeading', 'softBody', 'softButton'], 'cta');
need(C.share, ['heading', 'body', 'quizBody', 'textTemplate', 'quizTextTemplate', 'measureTemplate',
  'measuresSeparator', 'measuresEnd', 'nativeButton', 'xButton', 'copyButton', 'copyTextButton', 'copied'], 'share');
need(C.footer, ['r09', 'r10', 'r11', 'r12', 'r13'], 'footer');
need(C.about, ['lead', 'position', 'sources', 'profile', 'closingTitle', 'closing', 'closingButton'], 'about');
need(C.meta, ['title', 'description'], 'meta');
need(C.aboutMeta, ['title', 'description'], 'aboutMeta');
need(C.quizMeta, ['title', 'description'], 'quizMeta');
need(C.typePageMeta, ['titleTemplate', 'descriptionTemplate'], 'typePageMeta');
need(C.typePageCta, ['heading', 'body'], 'typePageCta');
if (!isStr(C.typePageNote)) { ng('typePageNote がありません'); } else { ok('typePageNote'); }
need(C.quiz && C.quiz.copy, ['title', 'subtitle', 'r02', 'hook', 'promise', 'startButton', 'resumeButton',
  'privacyLine', 'gateNote', 'sharedBanner', 'sharedBannerButton', 'retakeButton', 'toHandwriting',
  'resultKicker', 'themeLead', 'r07', 'r08'], 'quiz.copy');

/* 妥当性チェックのコードごとに、書き直しの案内があるか */
{
  const P = (H.write && H.write.problems) || {};
  const codes = Array.isArray(HW.PROBLEMS) ? HW.PROBLEMS : Object.keys(HW.PROBLEMS || {});
  const miss = codes.filter((k) => !isStr(P[k]));
  if (!isStr(P.cancelled)) { miss.push('cancelled'); }
  if (miss.length) { ng('write.problems に、エンジンの妥当性チェックの案内が不足', miss.join(', ')); }
  else { ok('write.problems はエンジンの ' + codes.length + ' 種類＋途切れに対応'); }
  const bad = Object.keys(P).filter((k) => isStr(P[k]) && k !== 'cancelled' && !/もう一度、枠いっぱいに/.test(P[k]));
  if (bad.length) { ng('書き直しの案内が「もう一度、枠いっぱいに」で終わっていない（section 2）', bad.join(', ')); }
  const speed = Object.keys(P).filter((k) => /ゆっくり|速く|急いで|丁寧に/.test(P[k] || ''));
  if (speed.length) { ng('書き直しの案内に速さの指示がある（f6 を一方へ寄せる）', speed.join(', ')); }
}

/* 4タイプ */
{
  const keys = (C.types || []).map((t) => t.key);
  if (keys.join(',') !== TYPE_KEYS.join(',')) { ng('types の並びが sekkei,kyomei,suishin,chokkan ではない', keys.join(',')); }
  let bad = 0;
  (C.types || []).forEach((t) => {
    ['name', 'tagline', 'catch', 'basis', 'summary', 'strength', 'stumble', 'live', 'badExample', 'goodExample',
      'exampleNote', 'affinity'].forEach((k) => { if (!isStr(t[k])) { ng(`types.${t.key}.${k} がありません`); bad++; } });
    ['color', 'colorDark'].forEach((k) => {
      if (!/^#[0-9a-fA-F]{6}$/.test(String(t[k]))) { ng(`types.${t.key}.${k} が #rrggbb ではない`, String(t[k])); bad++; }
    });
    if (!C.ogp || !C.ogp.types || !C.ogp.types[t.key]) { ng(`ogp.types.${t.key} がありません`); bad++; }
  });
  if (!bad) { ok('4タイプ（型の文面・色・OGPカード）'); }
}

/* 特徴・テーマ・テーマの向き */
{
  const FT = H.features || {};
  const miss = [];
  for (let i = 1; i <= 13; i++) {
    const f = FT['f' + i];
    if (!f) { miss.push('f' + i); continue; }
    ['name', 'short', 'reading'].forEach((k) => { if (!isStr(f[k])) { miss.push('f' + i + '.' + k); } });
    if (!f.measure || typeof f.measure !== 'object') { miss.push('f' + i + '.measure'); }
  }
  if (miss.length) { ng('hw.features に不足', miss.join(', ')); } else { ok('hw.features f1〜f13'); }

  const TH = H.themes || {};
  const tm = [];
  Object.keys(ELEMENTS).forEach((el) => ELEMENTS[el].forEach((d) => {
    if (!TH[el] || !TH[el][d] || !isStr(TH[el][d].live) || !isStr(TH[el][d].next)) { tm.push(el + '.' + d); }
  }));
  if (tm.length) { ng('hw.themes に不足', tm.join(', ')); } else { ok('hw.themes（3要素×2向き×live/next）'); }

  const TD = H.themeDirection || {};
  const td = [];
  Object.keys(TD).filter((k) => k !== 'quiz').forEach((fk) => {
    const r = TD[fk];
    if (!ELEMENTS[r.element]) { td.push(fk + '.element'); return; }
    ['high', 'low'].forEach((s) => { if (ELEMENTS[r.element].indexOf(r[s]) < 0) { td.push(fk + '.' + s); } });
    if (r.high === r.low) { td.push(fk + ' の high と low が同じ'); }
  });
  const hlSet = ['f2', 'f5', 'f9', 'f3', 'f10', 'f13'];
  hlSet.forEach((fk) => { if (!TD[fk]) { td.push(fk + ' がない（「いちばん特徴」の候補）'); } });
  Object.keys(ELEMENTS).forEach((el) => {
    if (!TD.quiz || ELEMENTS[el].indexOf(TD.quiz[el]) < 0) { td.push('quiz.' + el); }
  });
  /* エンジンの ELEMENT 表と、文面側の要素の割り当てが同じか */
  if (HW.ELEMENT) {
    Object.keys(HW.ELEMENT).forEach((fk) => {
      if (TD[fk] && TD[fk].element !== HW.ELEMENT[fk]) { td.push(fk + '：エンジンは ' + HW.ELEMENT[fk] + '、文面は ' + TD[fk].element); }
    });
  }
  if (td.length) { ng('hw.themeDirection', td.join('／')); } else { ok('hw.themeDirection（6特徴＋10問版、エンジンの要素表と一致）'); }
  const els = (H.result && H.result.elements) || {};
  if (Object.keys(ELEMENTS).some((k) => !isStr(els[k]))) { ng('result.elements に3要素の名前が揃っていない'); }
}

/* ================================================================ コードとの対応 */
head('■ 画面のコードが参照するキーが content.js にあるか');
function refs(file, aliases) {
  const src = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  Object.keys(aliases).forEach((al) => {
    const obj = aliases[al];
    const re = new RegExp('(?:^|[^A-Za-z0-9_.$])' + al + '\\.([A-Za-z_][A-Za-z0-9_]*)', 'g');
    let m;
    const miss = new Set();
    while ((m = re.exec(src)) !== null) {
      const k = m[1];
      if (['hasOwnProperty', 'length'].indexOf(k) >= 0) { continue; }
      if (!obj || !(k in obj)) { miss.add(k); }
    }
    if (miss.size) { out.push(al + ': ' + [...miss].join(', ')); }
  });
  if (out.length) { ng(file, out.join(' ／ ')); } else { ok(file + '（' + Object.keys(aliases).join('・') + '）'); }
}
refs('yui/hw.js', { IN: H.intro, WR: H.write, GT: H.gate, RS: H.result, CO: H.collect, SH: C.share, HW: HW });
refs('yui/quiz.js', { QC: C.quiz.copy, RS: H.result, IN: H.intro });
refs('yui/common.js', { CT: C.cta, SH: C.share, R: H.result, F: C.footer, CFG: C.config });

/* ================================================================ 差し込み記号 */
head('■ 差し込み記号（{…}）');
{
  /* パスの正規表現 → そこで使える記号。hw.js・quiz.js・common.js・build-pages.js が埋めるものだけです。 */
  const ALLOW = [
    [/^hw\.result\.r07Template$/, ['features']],
    [/^hw\.result\.medianSourceTemplate$/, ['n', 'date']],
    [/^hw\.result\.(mapAria|mapAriaShared)$/, ['type']],
    [/^hw\.result\.(mapAriaLean|mapAriaLeanShared|leanTemplate)$/, ['type', 'toward']],
    [/^hw\.result\.(changedTemplate|changedTemplateFar)$/, ['prev', 'now']],
    [/^hw\.result\.highlightTemplate$/, ['feature', 'measure', 'element']],
    [/^hw\.result\.highlightTemplateLink$/, ['feature', 'element']],
    [/^hw\.result\.saveImageText\.line$/, ['type', 'measures']],
    [/^hw\.features\.f(1|9|10)\./, ['ratio']],
    [/^hw\.features\.f2\./, ['pct', 'medPct', 'absPct']],
    [/^hw\.features\.f(3|6)\./, ['v', 'med']],
    [/^hw\.features\.f4\./, ['count']],
    [/^hw\.features\.f5\./, ['total', 'stops', 'ms', 'medMs']],
    [/^hw\.features\.f7\./, ['hw', 'medHw']],
    [/^hw\.features\.f8\./, ['pct', 'medPct']],
    [/^hw\.features\.f12\./, ['absdeg']],
    [/^hw\.features\.f13\./, ['protPct', 'medProtPct']],
    [/^quiz\.copy\.themeLead$/, ['element']],
    [/^share\.textTemplate$/, ['type', 'measures']],
    [/^share\.quizTextTemplate$/, ['type']],
    [/^share\.measureTemplate$/, ['short', 'brief']],
    [/^cta\.dmLineTemplate$/, ['type']],
    [/^typePageMeta\.(titleTemplate|descriptionTemplate)$/, ['type', 'catch']],
  ];
  const bad = [];
  let n = 0;
  (function walk(o, p) {
    if (typeof o === 'string') {
      const toks = (o.match(/\{[A-Za-z0-9_]+\}/g) || []).map((t) => t.slice(1, -1));
      if (!toks.length) { return; }
      n += toks.length;
      const rule = ALLOW.find((r) => r[0].test(p));
      toks.forEach((t) => { if (!rule || rule[1].indexOf(t) < 0) { bad.push(p + ' の {' + t + '}'); } });
    } else if (o && typeof o === 'object') {
      Object.keys(o).forEach((k) => walk(o[k], p ? p + '.' + k : k));
    }
  })(Object.assign({}, C, { calibration: null, quizQuestions: null }), '');
  if (bad.length) { ng('埋める側のない差し込み記号（画面に {…} のまま出ます）', bad.join('／')); }
  else { ok(n + ' か所の差し込み記号は、すべて埋める側があります'); }
  /* 必ず要る記号 */
  const must = [['share.textTemplate', C.share.textTemplate, 'type'], ['share.quizTextTemplate', C.share.quizTextTemplate, 'type'],
    ['hw.result.leanTemplate', H.result.leanTemplate, 'toward'], ['cta.dmLineTemplate', C.cta.dmLineTemplate, 'type']];
  must.forEach(([p, s, t]) => { if (String(s).indexOf('{' + t + '}') < 0) { ng(p + ' に {' + t + '} がありません'); } });
}

/* ================================================================ 較正 */
head('■ 較正（calibration）');
{
  const K = C.calibration || {};
  const errs = [];
  ['x', 'y'].forEach((ax) => {
    const w = (K.weights || {})[ax] || {};
    const sum = Object.keys(w).reduce((a, k) => a + w[k], 0);
    if (Math.abs(sum - 1) > 1e-6) { errs.push(`weights.${ax} の合計が 1 ではない（${sum}）`); }
    Object.keys(w).forEach((fk) => {
      const f = (K.features || {})[fk];
      if (!f || !num(f.median) || !num(f.scale) || f.scale <= 0) { errs.push(fk + ' の median/scale'); }
      if ([1, -1].indexOf((K.dirs || {})[fk]) < 0) { errs.push(fk + ' の dirs'); }
    });
    if (!num((K.center || {})[ax])) { errs.push('center.' + ax); }
    if (!num((K.axisScale || {})[ax]) || K.axisScale[ax] <= 0) { errs.push('axisScale.' + ax); }
  });
  if (!(num(K.boundary) && K.boundary > 0 && K.boundary < 1)) { errs.push('boundary'); }
  if (errs.length) { ng('較正の値', errs.join('／')); } else { ok('較正の形（重み・中央値・尺度・向き・中心）'); }
  if (/^synthetic/.test(String(K.version || ''))) {
    wn('較正は合成データの仮の値です（' + K.version + '）',
      '画面には calibrationNote が出ます。パイロット（?collect=1）の実測で置き換えたら medianSourceTemplate に切り替わります。');
  } else if (!num(K.n) || !isStr(K.date)) {
    ng('実測の較正なのに n（人数）か date がない', 'medianSourceTemplate の「協力者{n}人」が事実と違う表示になります');
  } else { ok('実測の較正（' + K.n + '人・' + K.date + '）'); }
}

/* ================================================================ エンジン */
head('■ エンジン（合成データでの通し）');
let SY = null;
try { SY = require('./synth.js'); } catch (e) { wn('synth.js が読み込めません（通しの確認を省きます）', e.message); }
{
  const needFns = ['analyze', 'average', 'score', 'encodeShare', 'decodeShare'];
  const miss = needFns.filter((f) => typeof HW[f] !== 'function');
  if (!Array.isArray(HW.TEMPLATE) || !HW.TEMPLATE.length) { miss.push('TEMPLATE'); }
  if (miss.length) { ng('hw.js が使うエンジンの機能が不足', miss.join(', ')); } else { ok('hw.js が使う機能が揃っています'); }
}
if (SY) {
  const N = 120;
  const count = { sekkei: 0, kyomei: 0, suishin: 0, chokkan: 0 };
  let valid = 0, roundTrip = 0, longest = 0, badCode = 0;
  for (let i = 0; i < N; i++) {
    let strokes;
    try { strokes = SY.synth({ seed: 9000 + i }); } catch (e) { ng('synth が失敗', e.message); break; }
    const a = HW.analyze(strokes, { side: (SY.DEFAULTS && SY.DEFAULTS.side) || 320 });
    if (!a || (a.problems && a.problems.length)) { continue; }
    valid++;
    const s = HW.score(a.feats, C.calibration);
    count[s.key] = (count[s.key] || 0) + 1;
    const code = HW.encodeShare(s, a.feats, a.marks);
    if (!code) { continue; }
    longest = Math.max(longest, String(code).length);
    if (!/^[0-9a-z]+$/.test(String(code))) { badCode++; }
    const d = HW.decodeShare(code);
    if (d && d.key === s.key) { roundTrip++; }
  }
  if (valid < N * 0.9) { ng(`合成の「結」が妥当性チェックを通る割合が低い（${valid}/${N}）`); }
  else { ok(`合成の「結」 ${valid}/${N} が妥当性チェックを通過`); }
  if (roundTrip !== valid) { ng(`結果コードの往復で型が一致しない（${roundTrip}/${valid}）`); }
  else { ok(`結果コードの往復 ${roundTrip}/${valid}（最長 ${longest} 文字）`); }
  if (badCode) { ng('結果コードに英小文字・数字以外が入っている', badCode + ' 件'); }
  /* 結果コードは、型・境目・いちばん特徴・f1/f2/f5 の値だけ。線の座標が入る長さではないことを確かめます。 */
  if (longest > 16) { ng('結果コードが長すぎます（線の記録が入っていないか確認）', longest + ' 文字'); }
  const shares = TYPE_KEYS.map((k) => `${k} ${Math.round(100 * count[k] / Math.max(1, valid))}%`).join('・');
  /* synth の既定値は「1人の書き手が書き直した字」なので、型は1〜2つに集まるのが正常です。
     型の割合の関門（各15〜35%）は、人ごとのクセを振った hw-calibration.js で確かめます。 */
  console.log('  …    合成の既定の書き手1人・' + valid + '回分の型（参考。割合の関門は hw-calibration.js）：' + shares);
}
if (FULL) {
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'hw-engine.test.js')], { encoding: 'utf8', timeout: 600000 });
  const tail = String(r.stdout || '').trim().split('\n').slice(-2).join(' ');
  if (r.status === 0) { ok('hw-engine.test.js：' + tail); } else { ng('hw-engine.test.js が失敗', tail || String(r.stderr).slice(0, 400)); }
} else {
  console.log('  …    エンジンの単体テストは --full で実行します（約2分）');
}

/* ================================================================ 10問版 */
head('■ 10問版（書かずに診断する経路）');
{
  const Q = (C.quiz && C.quiz.questions) || [];
  let bad = 0;
  if (Q.length !== 10) { ng('設問が10問ではない', String(Q.length)); bad++; }
  Q.forEach((q, i) => {
    const at = 'q' + (i + 1);
    if (!isStr(q.scene) || !isStr(q.text)) { ng(at + ' に scene か text がない'); bad++; }
    if (!Array.isArray(q.options) || q.options.length !== 4) { ng(at + ' の選択肢が4つではない'); bad++; return; }
    q.options.forEach((o, j) => {
      const w = at + ' の選択肢' + (j + 1);
      if (!isStr(o.label)) { ng(w + ' に label がない'); bad++; }
      if (String(o.label).length > 26) { wn(w + ' が26字を超えています', o.label); }
      if (!num(o.x) || Math.abs(o.x) > 2 || !num(o.y) || Math.abs(o.y) > 2) { ng(w + ' の x/y が -2〜2 ではない'); bad++; }
      ['kijun', 'dentatsu', 'ketsudan'].forEach((k) => {
        if (!(Number.isInteger(o[k]) && o[k] >= 0 && o[k] <= 3)) { ng(w + ' の ' + k + ' が 0〜3 の整数ではない'); bad++; }
      });
    });
  });
  const qo = (C.qualify && C.qualify.options) || [];
  if (!qo.length || qo.length > 4 || qo.some((o) => !isStr(o.label) || typeof o.biz !== 'boolean')) {
    ng('qualify.options（1〜4個、label と biz:true/false）'); bad++;
  }
  if (!bad) { ok('設問10問×4択、属性の1問'); }

  /* quiz.js と同じ採点で、全 4^10 通りを総当たりします。 */
  if (!bad) {
    const cal = { kMax: 0, dMax: 0, tMax: 0, axMax: 0, ayMax: 0 };
    Q.forEach((q) => {
      cal.kMax += Math.max(...q.options.map((o) => o.kijun));
      cal.dMax += Math.max(...q.options.map((o) => o.dentatsu));
      cal.tMax += Math.max(...q.options.map((o) => o.ketsudan));
      cal.axMax += Math.max(...q.options.map((o) => Math.abs(o.x)));
      cal.ayMax += Math.max(...q.options.map((o) => Math.abs(o.y)));
    });
    const cnt = { sekkei: 0, kyomei: 0, suishin: 0, chokkan: 0 };
    const weak = { kijun: 0, dentatsu: 0, ketsudan: 0 };
    const total = Math.pow(4, Q.length);
    const clamp = (v) => (v < -1 ? -1 : v > 1 ? 1 : v);
    for (let code = 0; code < total; code++) {
      let x = 0, y = 0, k = 0, d = 0, t = 0, c = code;
      for (let i = 0; i < Q.length; i++) {
        const o = Q[i].options[c & 3]; c >>= 2;
        x += o.x; y += o.y; k += o.kijun; d += o.dentatsu; t += o.ketsudan;
      }
      const sub = { kijun: Math.round(100 * k / cal.kMax), dentatsu: Math.round(100 * d / cal.dMax), ketsudan: Math.round(100 * t / cal.tMax) };
      let X = Math.round(clamp(x / cal.axMax) * 100), Y = Math.round(clamp(y / cal.ayMax) * 100);
      if (X === 0) { X = sub.dentatsu > sub.kijun ? 1 : -1; }
      if (Y === 0) { Y = sub.ketsudan >= 50 ? 1 : -1; }
      cnt[X < 0 ? (Y < 0 ? 'sekkei' : 'suishin') : (Y < 0 ? 'kyomei' : 'chokkan')]++;
      let w = 'ketsudan';
      ['ketsudan', 'kijun', 'dentatsu'].forEach((kk) => { if (sub[kk] < sub[w]) { w = kk; } });
      weak[w]++;
    }
    const pct = (v) => Math.round(1000 * v / total) / 10 + '%';
    const line = TYPE_KEYS.map((kk) => kk + ' ' + pct(cnt[kk])).join('・');
    if (TYPE_KEYS.some((kk) => !cnt[kk])) { ng('到達できない型がある', line); }
    else if (TYPE_KEYS.some((kk) => cnt[kk] / total < 0.1 || cnt[kk] / total > 0.4)) { wn('型の出方に偏り（全通り）', line); }
    else { ok('全 ' + total.toLocaleString() + ' 通り：' + line); }
    const wl = Object.keys(weak).map((kk) => kk + ' ' + pct(weak[kk])).join('・');
    if (Object.keys(weak).some((kk) => !weak[kk])) { ng('出ないテーマがある', wl); } else { ok('テーマの内訳：' + wl); }
  }
}

/* ================================================================ 文言 */
head('■ 文言（lint-wording.js：禁止文言と必須文言）');
const PAGES = ['index.html', 'q.html', 'about.html'].concat(TYPE_KEYS.map((k) => 't/' + k + '.html'));
{
  const files = ['yui/content.js', 'yui/hw.js', 'yui/quiz.js', 'yui/common.js'].concat(PAGES.map((p) => 'yui/' + p));
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'wording', 'lint-wording.js')].concat(files.map((f) => path.join(ROOT, f))),
    { encoding: 'utf8', cwd: ROOT });
  const last = String(r.stdout || '').trim().split('\n').pop();
  if (r.status === 0) { ok(last); } else { ng('文言チェックで禁止文言または必須文言の欠落', String(r.stdout || r.stderr).split('\n').filter((l) => /禁止|欠落|NG|\[P|\[R/.test(l) && !/許容/.test(l)).slice(0, 12).join('\n         ')); }

  /* 点数・順位を出さない（P15）。画面の文言に「点」「スコア」を約束する言い方がないか。 */
  const all = JSON.stringify(Object.assign({}, C, { calibration: null, quizQuestions: null, quiz: { copy: C.quiz.copy } }));
  const scoreHits = (all.match(/[^。"]{0,12}(スコア|偏差値|ランキング|得点|[0-9０-９]+点(満点|中|差)|点数を出)[^。"]{0,12}/g) || []);
  if (scoreHits.length) { ng('点数・順位の表現', scoreHits.slice(0, 5).join(' ／ ')); } else { ok('点数・スコア・順位の表現なし（P15）'); }
  const lowHits = (all.match(/[^。"]{0,10}(低い|劣る|欠点|弱点)[^。"]{0,10}/g) || []).filter((s) => !/ありません|ではない|しません|書かない|低いとは/.test(s));
  if (lowHits.length) { wn('「低い」「欠点」などの語（文脈を確かめてください）', lowHits.slice(0, 5).join(' ／ ')); }
}

/* ================================================================ 生成物 */
head('■ 生成物（content.js を変えたら build-pages.js・make-cards.js・render-ogp.js）');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yui-check-'));
  const r = cp.spawnSync(process.execPath, [path.join(ROOT, '_ops', 'build', 'build-pages.js')],
    { encoding: 'utf8', env: Object.assign({}, process.env, { YUI_OUT: tmp }) });
  if (r.status !== 0) { ng('build-pages.js が失敗', String(r.stderr).slice(0, 400)); }
  else {
    const stale = PAGES.filter((p) => {
      const a = path.join(YUI, p), b = path.join(tmp, p);
      return !fs.existsSync(a) || fs.readFileSync(a, 'utf8') !== fs.readFileSync(b, 'utf8');
    });
    if (stale.length) { ng('ページが content.js に追いついていません（node _ops/build/build-pages.js）', stale.join(', ')); }
    else { ok(PAGES.length + ' ページは最新'); }
  }
  fs.rmSync(tmp, { recursive: true, force: true });

  let cards = null;
  try { cards = require(path.join(ROOT, '_ops', 'build', 'make-cards.js')).build(); } catch (e) { ng('make-cards.js が失敗', e.message); }
  if (cards) {
    const cur = JSON.parse(read('_ops/build/cards.json'));
    if (JSON.stringify(cur) !== JSON.stringify(cards)) { ng('cards.json が content.js の ogp と違います（node _ops/build/make-cards.js のあと render-ogp.js）'); }
    else { ok('cards.json は content.js の ogp と一致'); }
    const v = C.config.ogpVersion;
    const missing = cards.map((c) => `ogp/${c.slug}-${v}.png`).filter((f) => !fs.existsSync(path.join(YUI, f)));
    if (missing.length) { ng('OGP画像がありません（render-ogp.js）', missing.join(', ')); }
    else {
      const cardsTime = fs.statSync(path.join(ROOT, '_ops', 'build', 'cards.json')).mtimeMs;
      const older = cards.map((c) => `ogp/${c.slug}-${v}.png`).filter((f) => fs.statSync(path.join(YUI, f)).mtimeMs + 1000 < cardsTime);
      if (older.length) { wn('cards.json のほうが OGP画像より新しい（描き直しが要るかもしれません）', older.join(', ')); }
      else { ok('OGP画像 ' + cards.length + ' 枚（' + v + '）'); }
    }
    const stray = fs.readdirSync(path.join(YUI, 'ogp')).filter((f) => !cards.some((c) => f === `${c.slug}-${v}.png`));
    if (stray.length) { wn('使っていない OGP画像があります', stray.join(', ')); }
  }
}

/* ================================================================ ページの作り */
head('■ ページの作り（CSP・スクリプト・表示順）');
const CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'; font-src 'self'; form-action 'none'; base-uri 'none'";
const html = {};
PAGES.forEach((p) => { try { html[p] = fs.readFileSync(path.join(YUI, p), 'utf8'); } catch (e) { html[p] = ''; } });
{
  const errs = [];
  PAGES.forEach((p) => {
    const s = html[p];
    if (s.indexOf('content="' + CSP + '"') < 0) { errs.push(p + '：CSP'); }
    const scripts = s.match(/<script\b[^>]*>/g) || [];
    scripts.forEach((tag) => {
      const src = (tag.match(/src="([^"]+)"/) || [])[1];
      if (!src) { errs.push(p + '：インラインの <script>'); }
      else if (/^(https?:)?\/\//.test(src)) { errs.push(p + '：外部のスクリプト ' + src); }
    });
    if (/\{[A-Za-z0-9_]+\}/.test(s.replace(/<style[\s\S]*?<\/style>/g, ''))) { errs.push(p + '：{…} が残っている'); }
    const og = (s.match(/property="og:image" content="([^"]+)"/) || [])[1] || '';
    const f = og.replace(/^.*\/ogp\//, 'ogp/');
    if (!og || !fs.existsSync(path.join(YUI, f))) { errs.push(p + '：og:image の画像がない ' + og); }
    if (!/<footer id="site-footer">/.test(s)) { errs.push(p + '：フッターがない'); }
  });
  if (errs.length) { ng('ページ', errs.join('\n         ')); } else { ok('全ページ：CSP（外部へ送れない設定）・スクリプトは同じ場所のファイルだけ・フッター・og:image'); }

  /* 表示順（content.js section 1・2・7-2・14） */
  function order(p, list, what) {
    const s = html[p];
    let at = -1;
    const bad = [];
    list.forEach((txt) => {
      const needle = (txt && txt.raw) ? txt.raw : esc(txt);
      if (txt && txt.raw) { txt = txt.raw; }
      const i = s.indexOf(needle, at + 1);
      if (i < 0) { bad.push('見つからない：' + String(txt).slice(0, 18)); return; }
      if (i < at) { bad.push('順序：' + String(txt).slice(0, 18)); }
      at = i;
    });
    if (bad.length) { ng(p + ' ' + what, bad.join('／')); } else { ok(p + ' ' + what); }
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  const I = H.intro, W = H.write, QC = C.quiz.copy;
  order('index.html', [I.title, I.r01, I.catch, I.r02, I.hook, I.r03, I.startButton, I.altLink], '導入：title→R01→catch→R02→hook→R03→開始→R06');
  order('index.html', [W.heading, I.altLink, I.r03, W.r04, W.sizeHint, { raw: 'id="cv"' }, W.r05], '書く画面：見出し→R06→R03→R04→大きさ→キャンバス→R05');
  order('q.html', [QC.title, I.r01, QC.subtitle, QC.r02, QC.hook, QC.startButton, QC.privacyLine, QC.toHandwriting], '導入：title→R01→subtitle→R02→hook→開始→保存の説明→手書きへ');
  if (html['q.html'].indexOf(esc(QC.gateNote)) < 0 || html['q.html'].indexOf(esc(H.gate.note)) >= 0) {
    ng('q.html の属性の補足が quiz.gateNote になっていない（手書き版の「送信も保存もしません」は使えない）');
  } else { ok('q.html の属性の補足は quiz.gateNote'); }
  C.types.forEach((t) => {
    const p = 't/' + t.key + '.html';
    order(p, [t.name, t.catch, C.typePageNote, H.result.summaryHeading, t.basis, t.summary], 'catch→打消し→basis→summary');
  });
}

/* ================================================================ 端末の外へ出るもの */
head('■ 端末の外へ出るもの・端末に残るもの');
{
  const js = ['hw.js', 'quiz.js', 'common.js', 'hw-engine.js', 'content.js'];
  const hits = [];
  js.forEach((f) => {
    const s = read('yui/' + f).replace(/\/\*[\s\S]*?\*\//g, '');
    if (/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|navigator\.sendBeacon|new Image\(\)\.src/.test(s)) { hits.push(f); }
  });
  if (hits.length) { ng('通信の手段を使うコード', hits.join(', ')); } else { ok('通信するコードなし（CSP の connect-src \'none\' と二重）'); }

  const keys = [];
  ['hw.js', 'quiz.js'].forEach((f) => {
    const s = read('yui/' + f);
    const re = /store\.set\(\s*([A-Z_a-z.]+)/g;
    let m;
    while ((m = re.exec(s)) !== null) { keys.push(f + ':' + m[1]); }
  });
  const allowed = ['hw.js:LKEY', 'quiz.js:SKEY'];
  const odd = keys.filter((k) => allowed.indexOf(k) < 0);
  if (odd.length) { ng('端末に保存するキーが想定外', odd.join(', ')); } else { ok('端末に保存するのは ' + [...new Set(keys)].join('・') + ' だけ'); }
  const hw = read('yui/hw.js');
  const setLast = (hw.match(/store\.set\(LKEY,[^\n]*/) || [''])[0];
  if (/strokes|pts|coords|feats/.test(setLast)) { ng('yui.hw.last に線や特徴量を入れている', setLast); } else { ok('yui.hw.last には型の名前と日時だけ'); }
  const direct = js.filter((f) => f !== 'common.js' && /localStorage|sessionStorage|indexedDB|document\.cookie/.test(read('yui/' + f).replace(/\/\*[\s\S]*?\*\//g, '')));
  if (direct.length) { ng('common.js の store を通さずに端末へ保存している', direct.join(', ')); }
}

/* ================================================================ 古い版の残り */
head('■ 古い版の残り');
{
  const src = ['yui/hw.js', 'yui/quiz.js', 'yui/common.js'].concat(PAGES.map((p) => 'yui/' + p)).map(read).join('\n');
  if (fs.existsSync(path.join(YUI, 'app.js'))) {
    if (/app\.js/.test(src)) { ng('どこかのページが古い app.js を読み込んでいます'); } else { wn('使っていない yui/app.js が残っています'); }
  } else { ok('古い app.js は削除済み'); }
  if (/ユニコ|FPマルシェ/.test(src + read('yui/content.js') + read('_ops/build/cards.json'))) { ng('別の事業（ユニコ・FPマルシェ）の文言が混ざっています'); } else { ok('ほかの事業の文言は混ざっていません'); }
}

/* ================================================================ 公開前の設定 */
head('■ 公開前の設定（オーナー確認待ちの項目）');
{
  const CFG = C.config;
  ['dmUrl', 'profileUrl', 'lineUrl'].forEach((k) => {
    if (!CFG[k]) { wn('config.' + k + ' が空です'); }
    else if (!/^https:\/\//.test(CFG[k])) { ng('config.' + k + ' が https ではない', CFG[k]); }
  });
  if (!/^https:\/\//.test(CFG.siteUrl)) { ng('config.siteUrl が https ではない'); }
  if (!(C.operator && C.operator.contact)) { wn('operator.contact（連絡先）が空です', 'IBJ本部への確認（R16）とあわせて決めてください。'); }
  if (C.footer.r16 == null) { wn('footer.r16（IBJ加盟の表記）が未確定です（null の間は何も出しません）'); }
  if (!C.cta.dmLimit) { wn('cta.dmLimit（無料相談の条件）が空です（空の間は何も出しません）'); }
}

/* ================================================================ まとめ */
console.log('\n────────────────────────────────────────────────────');
if (fail) {
  console.log(`NG ${fail}件 / 警告 ${warn}件 — 直してから公開してください。`);
  process.exit(1);
}
console.log(`NG 0件 / 警告 ${warn}件${warn ? '（! を確認のうえ進めてください）' : ''}`);
