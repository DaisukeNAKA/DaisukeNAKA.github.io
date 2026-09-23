#!/usr/bin/env node
/*
 * 「結」の手書き婚活診断 — 画面文言チェッカー
 *
 * 使い方:
 *   node lint-wording.js <file> [<file> ...]
 *
 * - wording.json の prohibited[].pattern を、画面に出る文言（コメントを除いた本文）に当てる
 * - 「〜ではありません」「〜しません」等の否定文の中に出てくる語は、打消し文言として許容し、
 *   info として別に報告する（例: 「筆跡から性格が分かるものではありません」）
 * - 必須文言（冒頭の運営者明示／遊びであることの明示／送信しない旨／書かずに診断する代替経路）が
 *   ファイル群のどこにも無ければ警告する
 *
 * 終了コード: 禁止文言が1件でもあれば 1、なければ 0
 * 依存なし（Node 18+）。
 */
"use strict";
const fs = require("fs");
const path = require("path");

const spec = JSON.parse(fs.readFileSync(path.join(__dirname, "wording.json"), "utf8"));
const files = process.argv.slice(2);
if (!files.length) {
  console.error("usage: node lint-wording.js <file> [<file> ...]");
  process.exit(2);
}

/* コメントを落として、画面に出る可能性のある文字列だけを残す（厳密な構文解析はしない） */
function stripComments(src, ext) {
  let s = src;
  if (ext === ".html" || ext === ".htm") { s = s.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, " ")); }
  if (ext === ".js" || ext === ".html" || ext === ".htm" || ext === ".json") {
    s = s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "));
    s = s.replace(/(^|[^:"'\\])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
  }
  return s;
}

/* 否定・打消しの文脈（この文の中の禁止語は「言っていない」ので許容） */
const NEGATION = /(ではありません|ではない|ではなく|ものではありません|しません|いません|ありません|不要|根拠はない|根拠はありません|使いません|自由です)/;

function sentencesWithLine(text) {
  const out = [];
  const re = /[^。！？!?\n]+[。！？!?]?/g;
  let m;
  while ((m = re.exec(text))) {
    const line = text.slice(0, m.index).split("\n").length;
    const s = m[0].trim();
    if (s) out.push({ s, line });
  }
  return out;
}

const REQUIRED_ANY = [
  { id: "R01-operator-top", re: /AGOEN[^。\n]{0,20}(つくった|作った|制作・提供|制作し)/, note: "冒頭の運営者明示（ステマ告示対応）" },
  { id: "R02-nature-top",   re: /(性格|相性)[^。\n]{0,12}(分かる|わかる|判定する)ものではありません/, note: "筆跡で性格・相性が分かるものではない旨" },
  { id: "R03-privacy-short",re: /(送信|送り)[^。\n]{0,6}(しません|ません)/, note: "書いた線を送信しない旨" },
  { id: "R06-alt-path",     re: /書かずに/, note: "書かずに診断できる代替経路" },
  { id: "R08-variability",  re: /書くたびに[^。\n]{0,10}変わる/, note: "結果が書くたびに変わり得る旨" }
];

let errors = 0;
const infos = [];
const allText = [];

for (const f of files) {
  const raw = fs.readFileSync(f, "utf8");
  const text = stripComments(raw, path.extname(f).toLowerCase());
  allText.push(text);
  for (const { s, line } of sentencesWithLine(text)) {
    for (const p of spec.prohibited) {
      const re = new RegExp(p.pattern);
      const hit = s.match(re);
      if (!hit) continue;
      if (NEGATION.test(s)) {
        infos.push(`${f}:${line}  [${p.id}] 否定文の中なので許容: 「${hit[0]}」 … ${s.slice(0, 60)}`);
        continue;
      }
      errors++;
      console.log(`${f}:${line}  [${p.id}] 禁止文言「${hit[0]}」`);
      console.log(`    文: ${s.slice(0, 90)}`);
      console.log(`    理由: ${p.why.slice(0, 90)}…`);
      console.log(`    言い換え: ${p.alternative}`);
    }
  }
}

const joined = allText.join("\n");
const missing = REQUIRED_ANY.filter(r => !r.re.test(joined));

if (infos.length) {
  console.log("\n--- 参考（否定文として許容したもの） ---");
  infos.forEach(x => console.log(x));
}
if (missing.length) {
  console.log("\n--- 必須文言が見つからない ---");
  missing.forEach(r => console.log(`  [${r.id}] ${r.note}`));
}
console.log(`\n禁止文言 ${errors} 件 / 必須文言の欠落 ${missing.length} 件`);
process.exit(errors ? 1 : 0);
