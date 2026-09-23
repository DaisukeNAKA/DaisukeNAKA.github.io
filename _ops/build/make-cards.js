/**
 * OGPカードの定義（cards.json）を content.js の ogp・types・typeColors から作ります。
 * 文言を二重に持たないためのスクリプトです。カードの文言は content.js の ogp で直してください。
 *
 * 実行:  node _ops/build/make-cards.js && NODE_PATH=/opt/node22/lib/node_modules node _ops/build/render-ogp.js
 *
 * headline は types.<型>.name をそのまま使います（content.js section 13）。
 * トップの見出し・説明は、カードの幅（左の本文欄 660px）に収まるよう、読点の位置で改行します。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
/* check.js から呼ばれたときは content.js が読み込み済みなので、そのまま使います。 */
if (!global.window || !global.window.YUI_CONTENT) {
  global.window = global.window || {};
  require(path.join(ROOT, 'yui', 'content.js'));
}
const C = global.window.YUI_CONTENT;

/* 最初の読点のあとで1回だけ改行します。すでに改行があればそのままにします。 */
const breakAtComma = (s) => (String(s).indexOf('\n') >= 0 ? String(s) : String(s).replace(/、/, '、\n'));
/* トップの説明は1行18字ほどで折れるので、文節の切れ目（「〜で」「〜る」の直後）で改行します。
   改行が無い文言に変わったときは、読点のあとで改行するだけにします。 */
const breakSub = (s) => {
  const t = String(s);
  if (t.indexOf('\n') >= 0) { return t; }
  const m = t.match(/^(.{8,18}?で)(.{6,16}?る)(.+)$/);
  return m ? `${m[1]}\n${m[2]}\n${m[3]}` : breakAtComma(t);
};
const color = (key) => (C.typeColors && C.typeColors[key]) || {};

function build() {
  const top = C.ogp.top;
  const cards = [{
    slug: 'yui-top',
    accent: '#c8453c',
    accentDark: '#e8776c',
    kicker: top.kicker,
    headline: breakAtComma(top.headline),
    headlineSize: 60,
    sub: breakSub(top.sub),
    foot: top.foot,
  }];
  C.types.forEach((t) => {
    const o = C.ogp.types[t.key];
    cards.push({
      slug: t.key,
      accent: t.color || color(t.key).color,
      accentDark: t.colorDark || color(t.key).colorDark,
      kicker: o.kicker,
      headline: t.name,
      headlineSize: 76,
      sub: o.sub,
      foot: o.foot,
    });
  });
  return cards;
}

if (require.main === module) {
  const cards = build();
  fs.writeFileSync(path.join(__dirname, 'cards.json'), JSON.stringify(cards, null, 2) + '\n', 'utf8');
  console.log(`cards.json に ${cards.length} 枚分を書き出しました。`);
}
module.exports = { build };
