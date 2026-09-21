/* =========================================================================
 * 「結」の書き方診断 — 画面と採点
 *
 * 文言・設問・設定はすべて content.js 側にあります。
 * このファイルは、その定義を画面に出す処理だけを持ちます。
 * ========================================================================= */
(function () {
  "use strict";

  var C = window.YUI_CONTENT;
  if (!C) { return; }

  var CFG = C.config;
  var Q = C.questions;
  var N = Q.length;
  var SKEY = "yui.v1.progress";
  var B32 = "abcdefghijklmnopqrstuvwxyz234567";
  var SUB_LABEL = { clarity: "明快さ", bridge: "接続", space: "余白" };

  /* ========== 環境判定 ========== */
  var caps = (function () {
    var ua = navigator.userAgent || "";
    var storage = false;
    try {
      window.localStorage.setItem("__yui_t", "1");
      storage = window.localStorage.getItem("__yui_t") === "1";
      window.localStorage.removeItem("__yui_t");
    } catch (e) { storage = false; }
    return {
      inapp:
        /Instagram/i.test(ua) ? "instagram" :
        /Barcelona/i.test(ua) ? "threads" :
        /\bLine\//i.test(ua) ? "line" :
        /FBAV|FB_IAB/i.test(ua) ? "facebook" :
        /Twitter/i.test(ua) ? "twitter" : "other",
      os: /iPhone|iPad|iPod/i.test(ua) ? "ios" : (/Android/i.test(ua) ? "android" : "other"),
      share: typeof navigator.share === "function",
      clip: !!(navigator.clipboard && typeof navigator.clipboard.writeText === "function" && window.isSecureContext),
      storage: storage
    };
  })();
  /* アプリ内ブラウザは「×」で元の投稿に戻れる。ここが最も摩擦の低い導線になる。 */
  var canCloseBack = (caps.inapp === "instagram" || caps.inapp === "threads" || caps.inapp === "facebook");

  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { window.localStorage.removeItem(k); } catch (e) {} }
  };

  /* ========== 計測 ==========
   * 測定IDが空、またはホストが analyticsBlockedHosts に載っている間は
   * タグを物理的に読み込みません。Cookieも発行されません。
   * これは、OAuth審査中のドメインで誤って計測が起動する事故を防ぐための安全装置です。 */
  var track = function () {};
  (function initAnalytics() {
    var blocked = (CFG.analyticsBlockedHosts || []).indexOf(location.hostname) >= 0;
    if (!CFG.gaMeasurementId) { return; }
    if (blocked) {
      if (window.console && console.warn) {
        console.warn("[結の書き方診断] " + location.hostname +
          " では計測タグを読み込みません。config.analyticsBlockedHosts を確認してください。");
      }
      return;
    }
    var gs = document.createElement("script");
    gs.async = true;
    gs.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(CFG.gaMeasurementId);
    document.head.appendChild(gs);
    window.dataLayer = window.dataLayer || [];
    var gtag = function () { window.dataLayer.push(arguments); };
    gtag("js", new Date());
    gtag("config", CFG.gaMeasurementId, { anonymize_ip: true });
    track = function (name, params) {
      try {
        var p = params || {};
        p.inapp_browser = caps.inapp;
        p.os = caps.os;
        gtag("event", name, p);
      } catch (e) {}
    };
    track("env_capability", {
      has_web_share: caps.share, has_clipboard_api: caps.clip, has_localstorage: caps.storage
    });
  })();

  /* ========== 小道具 ========== */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function bullets(id, src) {
    var host = $(id);
    if (!host) { return; }
    host.innerHTML = "";
    String(src).split("\n").forEach(function (line) {
      var t = line.replace(/^[・\-•]\s*/, "").trim();
      if (t) {
        var li = document.createElement("li");
        li.textContent = t;
        host.appendChild(li);
      }
    });
  }
  var toastT = null;
  function toast(msg) {
    var t = $("toast");
    if (!t) { return; }
    t.textContent = msg;
    t.classList.add("on");
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove("on"); }, 2600);
  }

  /* ---- コピー：clipboard → execCommand → 手動選択。
          失敗したときに「コピーしました」と嘘をつかないことが要件です。 ---- */
  function manualCopy(text) {
    var back = document.createElement("div");
    back.className = "backdrop";
    var box = document.createElement("div");
    box.className = "manual-copy";
    var p = document.createElement("p");
    p.style.cssText = "font-size:13.5px;margin:0 0 10px;line-height:1.8";
    p.textContent = "自動コピーができませんでした。下の文面を長押しして選択し、コピーしてください。";
    var ta = document.createElement("textarea");
    ta.value = text;
    var close = document.createElement("button");
    close.className = "btn btn-ghost";
    close.type = "button";
    close.textContent = "閉じる";
    close.style.marginTop = "12px";
    function shut() {
      if (back.parentNode) { back.parentNode.removeChild(back); }
      if (box.parentNode) { box.parentNode.removeChild(box); }
    }
    close.addEventListener("click", shut);
    back.addEventListener("click", shut);
    box.appendChild(p); box.appendChild(ta); box.appendChild(close);
    document.body.appendChild(back); document.body.appendChild(box);
    try { ta.focus(); ta.setSelectionRange(0, text.length); } catch (e) {}
  }
  function execCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("contenteditable", "true");
    ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:.01;font-size:16px;border:0;padding:0;";
    document.body.appendChild(ta);
    var ok = false;
    try {
      ta.focus();
      ta.setSelectionRange(0, 999999);
      ok = document.execCommand("copy");
    } catch (e) { ok = false; }
    if (ta.parentNode) { ta.parentNode.removeChild(ta); }
    return ok;
  }
  function copyText(text, okMsg) {
    function fall() {
      if (execCopy(text)) { toast(okMsg); } else { manualCopy(text); }
    }
    if (caps.clip) {
      try { navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fall); }
      catch (e) { fall(); }
    } else { fall(); }
  }

  /* ---- 共有：呼んでも無反応な環境があるため、ウォッチドッグで検知して降りる ---- */
  function nativeShare(payload, onFallback) {
    if (!caps.share) { onFallback(); return; }
    var settled = false;
    var wd = setTimeout(function () { if (!settled) { settled = true; onFallback(); } }, 1400);
    document.addEventListener("visibilitychange", function () {
      settled = true; clearTimeout(wd);
    }, { once: true });
    try {
      var pr = navigator.share(payload);
      if (pr && pr.then) {
        pr.then(function () {
          settled = true; clearTimeout(wd);
          track("share", { method: "web_share", share_status: "success" });
        }, function (err) {
          settled = true; clearTimeout(wd);
          if (err && err.name === "AbortError") {
            track("share", { method: "web_share", share_status: "abort" });
          } else {
            track("share", { method: "web_share", share_status: "error" });
            onFallback();
          }
        });
      }
    } catch (e) {
      settled = true; clearTimeout(wd);
      onFallback();
    }
  }
  /* ========== 回答コード（属性1問＋設問10問＝11answer, 22bit → 5文字） ========== */
  var CODE_LEN = 5;
  var TOTAL_A = N + 1;   /* index 0 は属性設問 */
  function encodeAnswers(a) {
    var v = 0;
    for (var i = 0; i < TOTAL_A; i++) { v += (a[i] & 3) * Math.pow(4, i); }
    var s = "";
    for (var j = CODE_LEN - 1; j >= 0; j--) {
      s += B32.charAt(Math.floor(v / Math.pow(32, j)) % 32);
    }
    return s;
  }
  function decodeAnswers(code) {
    if (!code || code.length !== CODE_LEN) { return null; }
    var v = 0;
    for (var j = 0; j < CODE_LEN; j++) {
      var d = B32.indexOf(code.charAt(j));
      if (d < 0) { return null; }
      v += d * Math.pow(32, CODE_LEN - 1 - j);
    }
    /* 5文字のbase32は25bit表現できますが、実際に使うのは22bit（11問×2bit）です。
       余った範囲の文字列は、切れたリンクや打ち間違いなので、結果を出さずに弾きます。 */
    if (v >= Math.pow(4, TOTAL_A)) { return null; }
    var a = [];
    for (var i = 0; i < TOTAL_A; i++) { a.push(Math.floor(v / Math.pow(4, i)) % 4); }
    if (encodeAnswers(a) !== code) { return null; }
    return a;
  }

  /* ========== 採点（較正は設問データから実行時に算出） ========== */
  var CAL = (function () {
    var o = { rawMin: 0, rawMax: 0, cMax: 0, bMax: 0, sMax: 0, axMax: 0, ayMax: 0 };
    Q.forEach(function (q) {
      var lo = Infinity, hi = -Infinity, c = 0, b = 0, s = 0, ax = 0, ay = 0;
      q.options.forEach(function (opt) {
        var sum = opt.clarity + opt.bridge + opt.space;
        if (sum < lo) { lo = sum; }
        if (sum > hi) { hi = sum; }
        if (opt.clarity > c) { c = opt.clarity; }
        if (opt.bridge > b) { b = opt.bridge; }
        if (opt.space > s) { s = opt.space; }
        if (Math.abs(opt.x) > ax) { ax = Math.abs(opt.x); }
        if (Math.abs(opt.y) > ay) { ay = Math.abs(opt.y); }
      });
      o.rawMin += lo; o.rawMax += hi; o.cMax += c; o.bMax += b; o.sMax += s;
      o.axMax += ax; o.ayMax += ay;
    });
    return o;
  })();
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function score(a) {
    var x = 0, y = 0, c = 0, b = 0, s = 0;
    for (var i = 0; i < N; i++) {
      var o = Q[i].options[a[i + 1]];   /* a[0] は属性設問 */
      x += o.x; y += o.y; c += o.clarity; b += o.bridge; s += o.space;
    }
    var sub = {
      clarity: Math.round(100 * c / CAL.cMax),
      bridge: Math.round(100 * b / CAL.bMax),
      space: Math.round(100 * s / CAL.sMax)
    };
    var raw = c + b + s;
    /* 較正：理論下限〜上限を 8〜100 に写す。境界 52/77 との組み合わせで
       低22% / 中67% / 高11% の分布になる（全1,048,576通りで検算済み）。 */
    var total = clamp(Math.round(8 + 92 * (raw - CAL.rawMin) / (CAL.rawMax - CAL.rawMin)), 0, 100);

    var X = Math.round(clamp(x / CAL.axMax, -1, 1) * 100);
    var Y = Math.round(clamp(y / CAL.ayMax, -1, 1) * 100);
    if (X === 0) { X = (sub.space > sub.clarity) ? 1 : -1; }
    if (Y === 0) { Y = (sub.bridge >= 50) ? 1 : -1; }

    var key = X < 0 ? (Y < 0 ? "soukatsu" : "sengen")
                    : (Y < 0 ? "yoin" : "shoutai");

    var order = ["bridge", "clarity", "space"];
    var weakest = order[0], strongest = order[0];
    order.forEach(function (k) {
      if (sub[k] < sub[weakest]) { weakest = k; }
      if (sub[k] > sub[strongest]) { strongest = k; }
    });

    var iv = Math.round((Math.abs(X) + Math.abs(Y)) / 2);
    var level = iv >= 55 ? "strong" : (iv >= 25 ? "normal" : "balanced");
    var axisNote = "";
    if (Math.abs(X) >= 50 && Math.abs(Y) < 20) { axisNote = C.intensity.axisXOnly; }
    else if (Math.abs(Y) >= 50 && Math.abs(X) < 20) { axisNote = C.intensity.axisYOnly; }

    return {
      X: X, Y: Y, key: key, sub: sub, total: total,
      weakest: weakest, strongest: strongest,
      intensity: iv, level: level, axisNote: axisNote,
      biz: !!(C.qualify.options[a[0]] && C.qualify.options[a[0]].biz)
    };
  }

  function bandFor(total) {
    for (var i = 0; i < C.bands.length; i++) {
      if (total >= C.bands[i].min && total <= C.bands[i].max) { return C.bands[i]; }
    }
    return C.bands[C.bands.length - 1];
  }
  function typeOf(key) {
    for (var i = 0; i < C.types.length; i++) { if (C.types[i].key === key) { return C.types[i]; } }
    return C.types[0];
  }
  function isDark() {
    var attr = document.documentElement.getAttribute("data-theme");
    if (attr === "dark") { return true; }
    if (attr === "light") { return false; }
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }
  function typeColor(t) { return isDark() ? t.colorDark : t.color; }

  /* ========== 2軸マップ ========== */
  function axisMap(X, Y, color, typeKey) {
    var V = 320, P = 44, S = 232, cx = 160, cy = 160, half = S / 2;
    /* 点のハローが半径16あるため、枠線に食い込まないよう0.86まで内側に収めます。
       極値でも枠内に収まり、象限の読み取りは変わりません。 */
    var INSET = 0.86;
    var px = cx + clamp(X / 100, -1, 1) * half * INSET;
    var py = cy - clamp(Y / 100, -1, 1) * half * INSET;
    var quad = {
      sengen: { x: P, y: P }, shoutai: { x: cx, y: P },
      soukatsu: { x: P, y: cy }, yoin: { x: cx, y: cy }
    }[typeKey];
    function lab(key, x, y, anchor, text) {
      var on = (key === typeKey);
      return '<text x="' + x + '" y="' + y + '" text-anchor="' + anchor + '" font-size="11" ' +
        'letter-spacing=".08em" fill="' + (on ? color : "var(--ink-3)") + '" ' +
        'font-weight="' + (on ? 700 : 400) + '">' + text + '</text>';
    }
    return '<svg class="map" viewBox="0 0 ' + V + ' ' + V + '" role="img" ' +
      'aria-label="結の2軸マップ。横軸は結論の所有、縦軸は締めの機能。あなたの位置が点で示されています。">' +
      '<rect x="' + P + '" y="' + P + '" width="' + S + '" height="' + S + '" rx="6" fill="var(--surface-2)" stroke="var(--line)" stroke-width="1"/>' +
      '<rect x="' + quad.x + '" y="' + quad.y + '" width="' + half + '" height="' + half + '" fill="' + color + '" opacity=".10"/>' +
      '<line x1="108" y1="' + P + '" x2="108" y2="276" stroke="var(--line)" stroke-dasharray="2 4" opacity=".55"/>' +
      '<line x1="212" y1="' + P + '" x2="212" y2="276" stroke="var(--line)" stroke-dasharray="2 4" opacity=".55"/>' +
      '<line x1="' + P + '" y1="108" x2="276" y2="108" stroke="var(--line)" stroke-dasharray="2 4" opacity=".55"/>' +
      '<line x1="' + P + '" y1="212" x2="276" y2="212" stroke="var(--line)" stroke-dasharray="2 4" opacity=".55"/>' +
      '<line x1="' + P + '" y1="' + cy + '" x2="276" y2="' + cy + '" stroke="var(--line)" stroke-width="1"/>' +
      '<line x1="' + cx + '" y1="' + P + '" x2="' + cx + '" y2="276" stroke="var(--line)" stroke-width="1"/>' +
      lab("sengen", 56, 64, "start", "宣言型") +
      lab("shoutai", 264, 64, "end", "招待型") +
      lab("soukatsu", 56, 262, "start", "総括型") +
      lab("yoin", 264, 262, "end", "余韻型") +
      '<text x="160" y="26" text-anchor="middle" font-size="10" fill="var(--ink-3)">開く ｜ 次の行動へ送り出す</text>' +
      '<text x="160" y="302" text-anchor="middle" font-size="10" fill="var(--ink-3)">閉じる ｜ 納得で終える</text>' +
      '<text transform="rotate(-90 18 160)" x="18" y="160" text-anchor="middle" font-size="10" fill="var(--ink-3)">引き受ける ｜ 断定</text>' +
      '<text transform="rotate(90 302 160)" x="302" y="160" text-anchor="middle" font-size="10" fill="var(--ink-3)">委ねる ｜ 問い</text>' +
      '<circle cx="' + px + '" cy="' + py + '" r="16" fill="' + color + '" opacity=".16"/>' +
      '<circle cx="' + px + '" cy="' + py + '" r="6.5" fill="' + color + '" stroke="var(--paper)" stroke-width="2"/>' +
      '</svg>';
  }

  /* ========== フッター（全ページ共通） ========== */
  function renderFooter(host) {
    var op = C.operator || {};
    var rows = "";
    if (op.name) { rows += "<dt>制作・運営</dt><dd>" + esc(op.name) + "</dd>"; }
    if (op.business) { rows += "<dt>事業内容</dt><dd>" + esc(op.business) + "</dd>"; }
    if (op.contact) { rows += "<dt>連絡先</dt><dd>" + esc(op.contact) + "</dd>"; }
    host.innerHTML =
      "<p>「結」の書き方診断</p>" +
      "<p>" + esc(C.copy.privacyLine) + "</p>" +
      (op.disclosure ? "<p>" + esc(op.disclosure) + "</p>" : "") +
      "<p>本ページは無料の診断コンテンツです。申込受付・決済・メールアドレスの取得は行いません。</p>" +
      (rows ? '<dl class="op-block">' + rows + "</dl>" : "");
  }

  /* ========== ここから先は index.html 専用 ========== */
  if (!$("intro")) {
    if ($("site-footer")) { renderFooter($("site-footer")); }
    window.YUI = { typeColor: typeColor, esc: esc, renderFooter: renderFooter };
    return;
  }

  renderFooter($("site-footer"));
  $("c-subtitle").textContent = C.copy.subtitle;
  $("c-hook").textContent = C.copy.hook;
  bullets("c-promise", C.copy.promise);
  bullets("c-whofor", C.copy.whoFor);
  $("start").textContent = C.copy.startButton;
  $("c-privacy").textContent = C.copy.privacyLine;
  $("c-author").textContent = C.copy.authorBlurb;
  $("q-total").textContent = String(N);
  (function () {
    var segs = $("q-segs");
    for (var i = 0; i < N; i++) { segs.appendChild(document.createElement("i")); }
  })();

  /* ========== 状態 ========== */
  var answers = new Array(TOTAL_A);
  for (var _i = 0; _i < TOTAL_A; _i++) { answers[_i] = -1; }
  var idx = 0;
  var busy = false;
  var viewSource = "self";

  function firstUnanswered() {
    for (var i = 1; i <= N; i++) { if (answers[i] < 0) { return i - 1; } }
    return N;
  }
  function screen(which) {
    ["intro", "gate", "quiz", "result"].forEach(function (id) { $(id).hidden = (id !== which); });
  }
  function go(hash) {
    if (location.hash === hash) { route(); return; }
    location.hash = hash;
  }
  function replaceHash(hash) {
    try { history.replaceState(null, "", location.pathname + location.search + hash); }
    catch (e) { location.hash = hash; }
  }

  /* ========== 属性設問 ========== */
  function renderGate() {
    $("g-scene").textContent = C.qualify.scene;
    $("g-text").textContent = C.qualify.text;
    var host = $("g-opts");
    host.innerHTML = "";
    C.qualify.options.forEach(function (opt, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "opt" + (answers[0] === i ? " picked" : "");
      b.textContent = opt.label;
      b.setAttribute("data-mark", String(i + 1));
      b.addEventListener("click", function () {
        if (busy) { return; }
        busy = true;
        answers[0] = i;
        Array.prototype.forEach.call(host.children, function (n) { n.classList.remove("picked"); });
        b.classList.add("picked");
        save();
        track("qualify_answer", { choice_index: i, is_business: !!opt.biz });
        setTimeout(function () { busy = false; go("#/q/1"); }, 200);
      });
      host.appendChild(b);
    });
    screen("gate");
    try { $("g-text").focus({ preventScroll: true }); } catch (e) {}
    window.scrollTo(0, 0);
    busy = false;
  }

  /* ========== 設問 ========== */
  var MARKS = ["ア", "イ", "ウ", "エ", "オ"];

  function paintSegs() {
    var segs = $("q-segs").children;
    for (var i = 0; i < segs.length; i++) {
      segs[i].className = (answers[i + 1] >= 0) ? "on" : (i === idx ? "now" : "");
    }
    $("q-segs").setAttribute("aria-valuenow", String(firstUnanswered()));
  }

  function renderQuestion() {
    var q = Q[idx];
    $("q-now").textContent = String(idx + 1);
    $("q-scene").textContent = q.scene;
    $("q-text").textContent = q.text;
    paintSegs();

    var host = $("q-opts");
    host.innerHTML = "";
    q.options.forEach(function (opt, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "opt" + (answers[idx + 1] === i ? " picked" : "");
      b.textContent = opt.label;
      b.setAttribute("data-mark", MARKS[i] || String(i + 1));
      b.addEventListener("click", function () { pick(i, b); });
      host.appendChild(b);
    });

    var st = $("q-stage");
    st.classList.remove("out", "fade");
    void st.offsetWidth;
    st.classList.add("fade");
    screen("quiz");
    try { $("q-text").focus({ preventScroll: true }); } catch (e) {}
    window.scrollTo(0, 0);
    busy = false;
  }

  function pick(i, node) {
    if (busy) { return; }
    busy = true;
    answers[idx + 1] = i;
    Array.prototype.forEach.call($("q-opts").children, function (n) { n.classList.remove("picked"); });
    node.classList.add("picked");
    if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} }
    paintSegs();
    save();
    track("question_answer", { question_index: idx + 1, question_id: Q[idx].id, choice_index: i });
    setTimeout(function () {
      $("q-stage").classList.add("out");
      setTimeout(function () {
        if (idx < N - 1) { go("#/q/" + (idx + 2)); }
        else { go("#/r/" + encodeAnswers(answers)); }
      }, 170);
    }, 130);
  }

  $("q-back").addEventListener("click", function () { history.back(); });

  function save() {
    if (!caps.storage) { return; }
    store.set(SKEY, JSON.stringify({ v: 2, a: answers, t: Date.now() }));
  }

  /* ========== ルーティング ========== */
  function route() {
    var h = location.hash || "";

    if (h === "#/gate") { renderGate(); return; }

    var m = h.match(/^#\/q\/(\d+)$/);
    if (m) {
      if (answers[0] < 0) { replaceHash("#/gate"); renderGate(); return; }
      var n = parseInt(m[1], 10);
      if (!(n >= 1 && n <= N)) { replaceHash("#/"); screen("intro"); return; }
      var allowed = Math.min(n - 1, firstUnanswered());
      idx = allowed;
      if (allowed !== n - 1) { replaceHash("#/q/" + (allowed + 1)); }
      renderQuestion();
      return;
    }

    m = h.match(/^#\/r\/([a-z2-7]{5})$/);
    if (m) {
      var a = decodeAnswers(m[1]);
      if (!a) { replaceHash("#/"); screen("intro"); return; }
      answers = a;
      renderResult(viewSource);
      return;
    }

    screen("intro");
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);

  /* ========== 「この投稿に戻る」 ========== */
  function postFromQuery() {
    var m = (location.search || "").match(/[?&]s=([A-Za-z0-9_-]{1,32})/);
    if (!m) { return ""; }
    var posts = CFG.posts || {};
    return posts[m[1]] || "";
  }

  /* ========== 結果 ========== */
  function renderResult(src) {
    for (var i = 0; i < TOTAL_A; i++) {
      if (answers[i] < 0 || answers[i] > 3) { replaceHash("#/"); screen("intro"); return; }
    }
    var r = score(answers);
    var t = typeOf(r.key);
    var rx = C.prescriptions.filter(function (p) { return p.weakest === r.weakest; })[0] || C.prescriptions[0];
    var band = bandFor(r.total);
    var color = typeColor(t);
    var iv = C.intensity[r.level];
    var host = $("result");
    var base = String(CFG.siteUrl || "").replace(/\/$/, "");
    var typeUrl = base + "/t/" + t.key + ".html";
    var backPost = postFromQuery();

    /* シェア文：低スコアの人が沈黙しないよう、75未満は最も強い要素を言葉で出す */
    var shareBody = t.shareText + (r.total >= 75
      ? "（結スコア " + r.total + "）"
      : "（" + SUB_LABEL[r.strongest] + "がいちばん強く出ました）");

    host.style.setProperty("--type", color);

    var sharedBar = (src === "shared")
      ? '<div class="shared-bar"><p style="margin:0">' + esc(C.copy.sharedBanner) + "</p>" +
        '<button class="btn" id="own" type="button">' + esc(C.copy.sharedBannerButton) + "</button></div>"
      : "";

    /* --- コメントCTA（全員） --- */
    var commentBody = C.copy.commentBody.replace("◯◯型", t.name);
    var commentCta =
      '<div class="cta">' +
        "<h2>" + esc(C.copy.commentHeading) + "</h2>" +
        "<p>" + esc(commentBody) + "</p>" +
        (canCloseBack ? '<p class="note" style="margin:0 0 14px">' + esc(C.copy.commentInapp) + "</p>" : "") +
        '<button class="btn" id="cp-type" type="button">「' + esc(t.name) + "」をコピーする</button>" +
        (backPost ? '<a class="btn btn-ghost" id="back-post" href="' + esc(backPost) + '" target="_blank" rel="noopener">' + esc(C.copy.commentBack) + "</a>"
                  : (!canCloseBack && CFG.profileUrl
                      ? '<a class="btn btn-ghost" id="back-post" href="' + esc(CFG.profileUrl) + '" target="_blank" rel="noopener">投稿を開く</a>'
                      : "")) +
        (!canCloseBack && !backPost && !CFG.profileUrl
          ? '<p class="note" style="margin-top:12px">' + esc(C.copy.commentFallback) + "</p>" : "") +
      "</div>";

    /* --- 商談CTA（仕事で書いている方にだけ） --- */
    var dmLine = t.name + "／" + SUB_LABEL[r.weakest] + "が低いと出ました。締めを一本みてもらえますか。";
    var bizCta = r.biz
      ? '<div class="cta">' +
          "<h2>" + esc(C.copy.bizHeading) + "</h2>" +
          "<p>" + esc(C.copy.bizBody) + "</p>" +
          '<div class="cta-limit">' + esc(C.copy.bizLimit) + "</div>" +
          (CFG.dmUrl
            ? '<a class="btn" id="dm-go" href="' + esc(CFG.dmUrl) + '" target="_blank" rel="noopener">' + esc(C.copy.bizButton) + "</a>" +
              '<button class="btn btn-ghost" id="dm-copy" type="button">' + esc(C.copy.bizCopyButton) + "</button>" +
              '<p class="note" style="margin-top:12px">' + esc(C.copy.bizDmNote) + "</p>"
            : '<button class="btn btn-ghost" id="dm-copy" type="button">' + esc(C.copy.bizCopyButton) + "</button>" +
              '<p class="note" style="margin-top:12px">' + esc(C.copy.bizNoDmNote) + "</p>") +
        "</div>"
      : "";

    /* --- LINE（config.lineUrl があるときだけ） --- */
    var lineCta = CFG.lineUrl
      ? '<div class="cta">' +
          "<h2>" + esc(C.copy.lineHeading) + "</h2>" +
          "<p>" + esc(C.copy.lineBody) + "</p>" +
          '<a class="btn btn-line" id="line-go" href="' + esc(CFG.lineUrl) + '" target="_blank" rel="noopener">' + esc(C.copy.lineButton) + "</a>" +
        "</div>"
      : "";

    host.innerHTML = sharedBar +
      '<p class="kicker">診断結果</p>' +
      '<div class="r-head">' +
        '<div class="seal" aria-hidden="true">結</div>' +
        '<div><h2 class="r-name" id="r-name">' + esc(t.name) + "</h2>" +
        '<p class="r-tag">' + esc(t.tagline) + " ／ " + esc(iv.label) + "</p></div>" +
      "</div>" +
      '<p class="r-catch">' + esc(t.catch) + "</p>" +

      '<div class="score-row"><span class="score-num">' + r.total + "</span>" +
      '<span class="score-unit">／ 100（結スコア）</span></div>' +
      '<p class="score-band">' + esc(band.label) + "</p>" +
      '<p class="note" style="margin:-4px 0 14px">' + esc(C.copy.scoreDisclaimer) + "</p>" +
      '<p style="font-size:14.5px;color:var(--ink-2)">' + esc(band.comment) + "</p>" +

      '<div class="map-wrap">' + axisMap(r.X, r.Y, color, r.key) + "</div>" +

      '<div class="bars">' +
        bar("明快さ", r.sub.clarity, r.weakest === "clarity") +
        bar("接続", r.sub.bridge, r.weakest === "bridge") +
        bar("余白", r.sub.space, r.weakest === "space") +
      "</div>" +
      '<p class="note" style="margin-top:12px">' + esc(C.copy.subScoreNote) + "</p>" +
      '<div class="intensity-note">' + esc(iv.note) + (r.axisNote ? "<br><br>" + esc(r.axisNote) : "") + "</div>" +

      '<h2 class="sec">あなたの締め方</h2><p>' + esc(t.summary) + "</p>" +
      '<h2 class="sec">強みが出る場所</h2><p>' + esc(t.strength) + "</p>" +
      '<h2 class="sec">取りこぼしているもの</h2><p>' + esc(t.leak) + "</p>" +

      '<h2 class="sec">書き換えの実例</h2>' +
      '<div class="ex"><p class="ex-head">BEFORE ／ やりがちな締め</p><div class="ex-body">' + esc(t.badExample) + "</div></div>" +
      '<div class="ex after"><p class="ex-head">AFTER ／ 書き換えた締め</p><div class="ex-body">' + esc(t.goodExample) + "</div></div>" +
      '<p style="margin-top:16px;font-size:14.5px;color:var(--ink-2)">' + esc(t.exampleNote) + "</p>" +

      '<h2 class="sec">相性のいい場面・避けたい場面</h2><p>' + esc(t.affinity) + "</p>" +

      '<h2 class="sec">あなたへの処方箋</h2>' +
      '<div class="rx">' +
        '<p class="rx-title">' + esc(rx.title) + "</p>" +
        '<p style="font-size:14.5px">' + esc(rx.diagnosis) + "</p>" +
        '<p class="ex-head">型（そのまま埋めてください）</p>' +
        '<div class="rx-formula">' + esc(rx.formula) + "</div>" +
        '<p class="ex-head">埋めた例</p>' +
        '<div class="rx-worked">' + esc(rx.worked) + "</div>" +
        '<p style="font-size:13.5px;color:var(--ink-2);margin:0">' + esc(rx.pitfall) + "</p>" +
        '<button class="btn btn-ghost" id="rx-copy" type="button" style="margin-top:16px">この型をコピーする</button>' +
      "</div>" +

      '<h2 class="sec">' + esc(C.copy.shareHeading) + "</h2>" +
      '<p style="font-size:14.5px;color:var(--ink-2)">' + esc(C.copy.shareBody) + "</p>" +
      '<div class="share-text">' + esc(shareBody) + "</div>" +
      '<div class="share-btns">' +
        '<button class="btn" id="sh-native" type="button">シェアする</button>' +
        '<button class="btn btn-ghost" id="sh-copy" type="button">文面をコピー</button>' +
        '<a class="btn btn-ghost" id="sh-x" target="_blank" rel="noopener">Xに投稿</a>' +
        '<a class="btn btn-ghost" href="t/' + t.key + '.html">タイプ解説を読む</a>' +
      "</div>" +

      commentCta + bizCta + lineCta +

      '<p style="margin:26px 0 0;text-align:center"><a href="about.html">' + esc(C.copy.aboutLink) + "</a></p>" +
      '<button class="btn btn-ghost" id="retake" type="button" style="margin-top:20px">' +
        esc(src === "shared" ? C.copy.startButton : C.copy.retakeButton) + "</button>";

    screen("result");
    host.classList.remove("fade");
    void host.offsetWidth;
    host.classList.add("fade");
    window.scrollTo(0, 0);

    requestAnimationFrame(function () {
      var vals = [r.sub.clarity, r.sub.bridge, r.sub.space];
      Array.prototype.forEach.call(host.querySelectorAll(".bar-track i"), function (n, i2) {
        n.style.width = vals[i2] + "%";
      });
    });

    $("sh-x").href = "https://twitter.com/intent/tweet?text=" +
      encodeURIComponent(shareBody + "\n" + typeUrl);

    on("sh-native", function () {
      track("share_open", { result_type: t.key, yui_score: r.total });
      nativeShare({ title: C.copy.title, text: shareBody, url: typeUrl }, function () {
        copyText(shareBody + "\n" + typeUrl, "文面をコピーしました");
        track("share", { method: "copy_text", share_status: "fallback_used" });
      });
    });
    on("sh-copy", function () {
      track("share", { method: "copy_text", share_status: "success", result_type: t.key });
      copyText(shareBody + "\n" + typeUrl, "文面をコピーしました");
    });
    on("sh-x", function () { track("share", { method: "x", result_type: t.key }); });
    on("rx-copy", function () {
      track("prescription_copy", { weakest_axis: r.weakest });
      copyText(rx.title + "\n\n" + rx.formula, "型をコピーしました");
    });
    on("cp-type", function () {
      track("comment_copy", { result_type: t.key, has_back_post: !!backPost });
      copyText(t.name + "でした", "「" + t.name + "でした」をコピーしました");
    });
    on("back-post", function () { track("outbound_click", { cta_id: "back_to_post", result_type: t.key }); });
    on("dm-go", function () {
      track("generate_lead", {
        lead_source: "yui_quiz", method: "dm_link",
        result_type: t.key, yui_score: r.total, weakest_axis: r.weakest
      });
    });
    on("dm-copy", function () {
      track("generate_lead", {
        lead_source: "yui_quiz", method: "dm_copy",
        result_type: t.key, yui_score: r.total, weakest_axis: r.weakest
      });
      copyText(dmLine, "送る一行をコピーしました");
    });
    on("line-go", function () {
      track("generate_lead", { lead_source: "yui_quiz", method: "line", result_type: t.key });
    });
    on("retake", restart);
    on("own", restart);

    track("result_view", {
      result_type: t.key, yui_score: r.total, weakest_axis: r.weakest,
      intensity: r.intensity, is_business: r.biz, view_source: src
    });
    save();
  }

  function restart() {
    store.del(SKEY);
    for (var k = 0; k < TOTAL_A; k++) { answers[k] = -1; }
    idx = 0;
    viewSource = "self";
    go("#/gate");
  }
  function on(id, fn) {
    var n = $(id);
    if (n) { n.addEventListener("click", fn); }
  }
  function bar(label, val, weak) {
    return '<div class="bar-row' + (weak ? " weak" : "") + '">' +
      '<span class="bar-label">' + esc(label) + "</span>" +
      '<span class="bar-track"><i></i></span>' +
      '<span class="bar-val">' + val + "</span></div>";
  }

  /* ========== 開始と復帰 ========== */
  $("start").addEventListener("click", function () {
    track("quiz_start", { is_resume: firstUnanswered() > 0 });
    viewSource = "self";
    if (answers[0] < 0) { go("#/gate"); }
    else { go("#/q/" + (Math.min(firstUnanswered(), N - 1) + 1)); }
  });

  (function boot() {
    if (/^#\/r\/[a-z2-7]{5}$/.test(location.hash || "")) {
      viewSource = "shared";
      route();
      track("page_view", { screen_name: "result_shared" });
      return;
    }
    var raw = store.get(SKEY);
    if (raw) {
      try {
        var st = JSON.parse(raw);
        var fresh = st && st.t && (Date.now() - st.t) < 24 * 3600 * 1000;
        if (st && st.v === 2 && st.a && st.a.length === TOTAL_A && fresh) {
          answers = st.a;
          var f = firstUnanswered();
          if (answers[0] >= 0 && f > 0 && f < N) {
            $("resume-host").innerHTML =
              '<div class="resume-bar">前回は' + f + "問目まで回答済みです。続きから再開できます。" +
              '<button class="btn" id="resume" type="button" style="margin-top:10px">' +
              esc(C.copy.resumeButton) + "（" + (f + 1) + "問目から）</button></div>";
            $("resume").addEventListener("click", function () {
              track("quiz_resume", { resume_from_q: f + 1 });
              go("#/q/" + (f + 1));
            });
          }
        } else if (!fresh) {
          store.del(SKEY);
          for (var k = 0; k < TOTAL_A; k++) { answers[k] = -1; }
        }
      } catch (e) {
        store.del(SKEY);
      }
    }
    route();
    track("page_view", { screen_name: "landing" });
  })();
})();
