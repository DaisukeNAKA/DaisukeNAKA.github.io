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
  var SUB_LABEL = { kijun: "基準", dentatsu: "伝達", ketsudan: "決断" };

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
  /* アニメーションを切っている人には、遷移の待ち時間も無意味な空白になります。 */
  var reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

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
    track("yui_env", {
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
    toastT = setTimeout(function () {
      t.classList.remove("on");
      /* opacity:0 は支援技術のツリーから外れないため、文言自体を消します。 */
      setTimeout(function () { if (!t.classList.contains("on")) { t.textContent = ""; } }, 320);
    }, 2600);
  }

  /* ---- コピー：clipboard → execCommand → 手動選択。
          失敗したときに「コピーしました」と嘘をつかないことが要件です。 ---- */
  function manualCopy(text) {
    var back = document.createElement("div");
    back.className = "backdrop";
    var box = document.createElement("div");
    box.className = "manual-copy";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "文面を手動でコピー");
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
    function onKey(e) { if (e.key === "Escape") { shut(); } }
    function shut() {
      document.removeEventListener("keydown", onKey);
      if (back.parentNode) { back.parentNode.removeChild(back); }
      if (box.parentNode) { box.parentNode.removeChild(box); }
    }
    document.addEventListener("keydown", onKey);
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
        /* Promise が返ってきた時点で結末は Promise が教えてくれます。
           ウォッチドッグは「Promiseを返さない壊れた実装」のための保険なので、ここで解除します。
           解除しないと、共有シートの表示が1.4秒を超えたときに
           共有が成功しているのに裏でクリップボードを上書きしてしまいます。 */
        clearTimeout(wd);
        pr.then(function () {
          settled = true; clearTimeout(wd);
          track("yui_share_click", { channel: "web_share", status: "success" });
        }, function (err) {
          settled = true; clearTimeout(wd);
          if (err && err.name === "AbortError") {
            track("yui_share_click", { channel: "web_share", status: "abort" });
          } else {
            track("yui_share_click", { channel: "web_share", status: "error" });
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
  var TOTAL_A = N + 1;   /* index 0 は属性設問 */
  /* 1問2bit を base32（5bit/文字）に詰める。設問数を増やしても自動で伸びます。 */
  var CODE_LEN = Math.ceil(TOTAL_A * 2 / 5);
  var R_RE = new RegExp("^#\\/r\\/([a-z2-7]{" + CODE_LEN + "})$");
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
    var o = { rawMin: 0, rawMax: 0, kMax: 0, dMax: 0, tMax: 0, axMax: 0, ayMax: 0 };
    Q.forEach(function (q) {
      var lo = Infinity, hi = -Infinity, k = 0, d = 0, t = 0, ax = 0, ay = 0;
      q.options.forEach(function (opt) {
        var sum = opt.kijun + opt.dentatsu + opt.ketsudan;
        if (sum < lo) { lo = sum; }
        if (sum > hi) { hi = sum; }
        if (opt.kijun > k) { k = opt.kijun; }
        if (opt.dentatsu > d) { d = opt.dentatsu; }
        if (opt.ketsudan > t) { t = opt.ketsudan; }
        if (Math.abs(opt.x) > ax) { ax = Math.abs(opt.x); }
        if (Math.abs(opt.y) > ay) { ay = Math.abs(opt.y); }
      });
      o.rawMin += lo; o.rawMax += hi; o.kMax += k; o.dMax += d; o.tMax += t;
      o.axMax += ax; o.ayMax += ay;
    });
    /* 設問を編集した結果いずれかの幅が0になっても、スコアが NaN にならないようにします。 */
    o.span = (o.rawMax - o.rawMin) || 1;
    o.kMax = o.kMax || 1; o.dMax = o.dMax || 1; o.tMax = o.tMax || 1;
    o.axMax = o.axMax || 1; o.ayMax = o.ayMax || 1;
    return o;
  })();
  function clamp(v, lo, hi) {
    if (typeof v !== "number" || !isFinite(v)) { return lo; }
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function score(a) {
    var x = 0, y = 0, k = 0, d = 0, t = 0;
    for (var i = 0; i < N; i++) {
      var o = Q[i].options[a[i + 1]];   /* a[0] は属性設問 */
      x += o.x; y += o.y; k += o.kijun; d += o.dentatsu; t += o.ketsudan;
    }
    var sub = {
      kijun: Math.round(100 * k / CAL.kMax),
      dentatsu: Math.round(100 * d / CAL.dMax),
      ketsudan: Math.round(100 * t / CAL.tMax)
    };
    var raw = k + d + t;
    /* 較正：理論下限〜上限を 8〜100 に写す。境界 49/72 との組み合わせで
       低19% / 中65% / 高16% の分布になる（全1,048,576通りで検算済み）。 */
    var total = clamp(Math.round(8 + 92 * (raw - CAL.rawMin) / CAL.span), 0, 100);

    var X = Math.round(clamp(x / CAL.axMax, -1, 1) * 100);
    var Y = Math.round(clamp(y / CAL.ayMax, -1, 1) * 100);
    if (X === 0) { X = (sub.dentatsu > sub.kijun) ? 1 : -1; }
    if (Y === 0) { Y = (sub.ketsudan >= 50) ? 1 : -1; }

    var key = X < 0 ? (Y < 0 ? "sekkei" : "suishin")
                    : (Y < 0 ? "kyomei" : "chokkan");

    var order = ["ketsudan", "kijun", "dentatsu"];
    var weakest = order[0], strongest = order[0];
    order.forEach(function (k) {
      if (sub[k] < sub[weakest]) { weakest = k; }
      if (sub[k] > sub[strongest]) { strongest = k; }
    });

    var iv = Math.round((Math.abs(X) + Math.abs(Y)) / 2);
    /* 閾値は全1,048,576通りの実分布から決めています。
       55/25 では58%が「バランス」に落ち、型を名乗らせる直前にページ自身が
       「あなたの型は像を結ばない」と言う状態になっていました。
       30/15 で 振り切り28% / 標準47% / バランス25% になります。 */
    var level = iv >= 30 ? "strong" : (iv >= 15 ? "normal" : "balanced");
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
  function safeHex(c, fallback) {
    return /^#[0-9a-fA-F]{3,8}$/.test(String(c)) ? String(c) : fallback;
  }
  function safeKey(k) { return String(k).replace(/[^A-Za-z0-9_-]/g, ""); }

  /* シェアやタイプ別ページのリンク先は、設定値ではなく「いま開かれているURL」から組み立てます。
     こうしておくと、置き場所を別のドメインへ移したとき、
     設定を書き換える前からシェアのリンクが正しい先を指します。
     （canonical と og:url は検索エンジン向けに絶対URLが必要なので、そちらは config.siteUrl を使います） */
  function siteBase() {
    try {
      if (location.protocol === "http:" || location.protocol === "https:") {
        var dir = location.pathname.replace(/[^/]*$/, "");
        return (location.origin + dir).replace(/\/$/, "");
      }
    } catch (e) {}
    return String(CFG.siteUrl || "").replace(/\/$/, "");
  }
  function typeColor(t) {
    return safeHex(isDark() ? t.colorDark : t.color, "#c8453c");
  }

  /* ========== 2軸マップ ========== */
  function axisMap(X, Y, typeKey) {
    var color = "var(--type)";
    var V = 320, P = 44, S = 232, cx = 160, cy = 160, half = S / 2;
    /* 点のハローが半径16あるため、枠線に食い込まないよう0.86まで内側に収めます。
       極値でも枠内に収まり、象限の読み取りは変わりません。 */
    var INSET = 0.86;
    var px = cx + clamp(X / 100, -1, 1) * half * INSET;
    var py = cy - clamp(Y / 100, -1, 1) * half * INSET;
    var quad = {
      suishin: { x: P, y: P }, chokkan: { x: cx, y: P },
      sekkei: { x: P, y: cy }, kyomei: { x: cx, y: cy }
    }[typeKey];
    function lab(key, x, y, anchor, text) {
      var on = (key === typeKey);
      return '<text x="' + x + '" y="' + y + '" text-anchor="' + anchor + '" font-size="11" ' +
        'letter-spacing=".08em" fill="' + (on ? color : "var(--ink-3)") + '" ' +
        'font-weight="' + (on ? 700 : 400) + '">' + text + '</text>';
    }
    return '<svg class="map" viewBox="0 0 ' + V + ' ' + V + '" role="img" ' +
      'aria-label="婚活の2軸マップ。横軸は相手の選び方、縦軸は進め方。あなたの位置が点で示されています。">' +
      '<rect x="' + P + '" y="' + P + '" width="' + S + '" height="' + S + '" rx="6" fill="var(--surface-2)" stroke="var(--line)" stroke-width="1"/>' +
      '<rect x="' + quad.x + '" y="' + quad.y + '" width="' + half + '" height="' + half + '" fill="' + color + '" opacity=".10"/>' +
      '<line x1="108" y1="' + P + '" x2="108" y2="276" stroke="var(--line)" stroke-dasharray="2 4" opacity=".55"/>' +
      '<line x1="212" y1="' + P + '" x2="212" y2="276" stroke="var(--line)" stroke-dasharray="2 4" opacity=".55"/>' +
      '<line x1="' + P + '" y1="108" x2="276" y2="108" stroke="var(--line)" stroke-dasharray="2 4" opacity=".55"/>' +
      '<line x1="' + P + '" y1="212" x2="276" y2="212" stroke="var(--line)" stroke-dasharray="2 4" opacity=".55"/>' +
      '<line x1="' + P + '" y1="' + cy + '" x2="276" y2="' + cy + '" stroke="var(--line)" stroke-width="1"/>' +
      '<line x1="' + cx + '" y1="' + P + '" x2="' + cx + '" y2="276" stroke="var(--line)" stroke-width="1"/>' +
      lab("suishin", 56, 64, "start", "推進型") +
      lab("chokkan", 264, 64, "end", "直感型") +
      lab("sekkei", 56, 262, "start", "設計型") +
      lab("kyomei", 264, 262, "end", "共鳴型") +
      '<text x="160" y="26" text-anchor="middle" font-size="10" fill="var(--ink-3)">動きながら決める</text>' +
      '<text x="160" y="302" text-anchor="middle" font-size="10" fill="var(--ink-3)">見極めてから決める</text>' +
      '<text transform="rotate(-90 18 160)" x="18" y="160" text-anchor="middle" font-size="10" fill="var(--ink-3)">条件で選ぶ</text>' +
      '<text transform="rotate(90 302 160)" x="302" y="160" text-anchor="middle" font-size="10" fill="var(--ink-3)">感覚で選ぶ</text>' +
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
      (op.medicalDisclaimer ? "<p>" + esc(op.medicalDisclaimer) + "</p>" : "") +
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
  /* 導入の文言は index.html に静的に書き出してあります（低速回線でのずれと、
     スクリプトが読めなかった場合の空ページを避けるため）。ここでは同じ値で上書きするだけです。
     要素が無くても落ちないようにしておくと、HTMLの構成を変えてもページが壊れません。 */
  function setText(id, value) {
    var n = $(id);
    if (n) { n.textContent = value; }
  }
  setText("c-subtitle", C.copy.subtitle);
  setText("c-hook", C.copy.hook);
  bullets("c-promise", C.copy.promise);
  bullets("c-whofor", C.copy.whoFor);
  setText("start", C.copy.startButton);
  setText("start2", C.copy.startButton);
  setText("c-privacy", C.copy.privacyShort || C.copy.privacyLine);
  setText("c-privacy2", C.copy.privacyLine);
  setText("c-author", C.copy.authorBlurb);
  setText("q-total", String(N));
  if ($("q-segs")) { $("q-segs").setAttribute("aria-valuemax", String(N)); }
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
  /* 設問の行き来で履歴を積みません。積むと、結果まで進んだ人が元の投稿へ戻るのに
     10回以上バックする必要が出ます。診断全体で履歴は1エントリに収めます。
     replaceState は hashchange を発火しないため、route() を明示的に呼びます。 */
  function nav(hash) {
    var replaced = true;
    try { history.replaceState(null, "", location.pathname + location.search + hash); }
    catch (e) { replaced = false; location.hash = hash; }
    if (replaced) { route(); }
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
      b.setAttribute("aria-pressed", String(answers[0] === i));
      b.addEventListener("click", function () {
        if (busy) { return; }
        busy = true;
        answers[0] = i;
        Array.prototype.forEach.call(host.children, function (n) {
          n.classList.remove("picked");
          n.setAttribute("aria-pressed", "false");
        });
        b.classList.add("picked");
        b.setAttribute("aria-pressed", "true");
        save();
        track("yui_qualify", { is_business: !!opt.biz });
        setTimeout(function () { busy = false; nav("#/q/1"); }, reduceMotion ? 0 : 200);
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
    $("q-segs").setAttribute("aria-valuenow", String(idx + 1));
    $("q-segs").setAttribute("aria-valuetext", "全" + N + "問中 " + (idx + 1) + "問目");
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
      b.setAttribute("aria-pressed", String(answers[idx + 1] === i));
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
    Array.prototype.forEach.call($("q-opts").children, function (n) {
      n.classList.remove("picked");
      n.setAttribute("aria-pressed", "false");
    });
    node.classList.add("picked");
    node.setAttribute("aria-pressed", "true");
    if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} }
    paintSegs();
    save();
    /* 何を選んだかは送りません。掲示している「回答は端末内だけ」と矛盾するためです。
       何問目まで進んだかだけを送ります。 */
    track("yui_progress", { step: idx + 1 });
    setTimeout(function () {
      $("q-stage").classList.add("out");
      setTimeout(function () {
        if (idx < N - 1) { nav("#/q/" + (idx + 2)); }
        else { nav("#/r/" + encodeAnswers(answers)); }
      }, reduceMotion ? 0 : 170);
    }, reduceMotion ? 0 : 130);
  }

  /* history.back() に頼ると、アプリ内ブラウザがページを再生成したときに
     前の設問ではなくサイト外へ出てしまいます。現在位置から行き先を決めます。 */
  $("q-back").addEventListener("click", function () {
    nav(idx > 0 ? ("#/q/" + idx) : "#/gate");
  });

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

    m = h.match(R_RE);
    if (m) {
      var a = decodeAnswers(m[1]);
      if (!a) { replaceHash("#/"); screen("intro"); return; }
      /* 他人の共有リンクを開いただけで、閲覧者自身の途中回答を壊さないこと。 */
      if (viewSource !== "shared") { answers = a; }
      renderResult(viewSource, a);
      return;
    }

    screen("intro");
    document.title = C.copy.title + " ｜ " + C.copy.subtitle;
    /* 同一ページ内の戻る操作で導入へ帰ってきたときも、途中回答があれば続きから始められるように。 */
    var f0 = firstUnanswered();
    var startLabel = (answers[0] >= 0 && f0 > 0 && f0 < N)
      ? (C.copy.resumeButton + "（" + (f0 + 1) + "問目から）")
      : C.copy.startButton;
    $("start").textContent = startLabel;
    if ($("start2")) { $("start2").textContent = startLabel; }
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);

  /* ========== 「この投稿に戻る」 ========== */
  function postFromQuery() {
    var m = (location.search || "").match(/[?&]s=([A-Za-z0-9_-]{1,32})/);
    if (!m) { return ""; }
    var posts = CFG.posts || {};
    if (!Object.prototype.hasOwnProperty.call(posts, m[1])) { return ""; }
    var u = posts[m[1]];
    return (typeof u === "string" && /^https?:\/\//.test(u)) ? u : "";
  }

  /* ========== 結果 ========== */
  function renderResult(src, ans) {
    var data = ans || answers;
    for (var i = 0; i < TOTAL_A; i++) {
      if (data[i] < 0 || data[i] > 3) { replaceHash("#/"); screen("intro"); return; }
    }
    var r = score(data);
    var t = typeOf(r.key);
    var rx = C.prescriptions.filter(function (p) { return p.weakest === r.weakest; })[0] || C.prescriptions[0];
    var band = bandFor(r.total);
    var bandKey = band.min + "-" + band.max;
    var colorLight = safeHex(t.color, "#c8453c");
    var colorDark = safeHex(t.colorDark, colorLight);
    var iv = C.intensity[r.level];
    var host = $("result");
    var base = siteBase();
    var typeUrl = base + "/t/" + safeKey(t.key) + ".html";
    var backPost = postFromQuery();

    /* シェア文：低スコアの人が沈黙しないよう、75未満は最も強い要素を言葉で出す */
    var shareBody = t.shareText + (r.total >= 73
      ? "（結スコア " + r.total + "）"
      : "（" + SUB_LABEL[r.strongest] + "がいちばん強く出ました）");

    host.style.setProperty("--type-light", colorLight);
    host.style.setProperty("--type-dark", colorDark);

    var sharedBar = (src === "shared")
      ? '<div class="shared-bar"><p style="margin:0">' + esc(C.copy.sharedBanner) + "</p>" +
        '<button class="btn" id="own" type="button">' + esc(C.copy.sharedBannerButton) + "</button></div>"
      : "";

    /* --- コメントCTA（全員） --- */
    /* コメントに載せるのは型名だけにします。婚活は、公開の場で自分の状況を
       明かしたくない層が厚い領域です。弱点まで書かせると投稿が止まります。
       弱点はDM側（dmLine）で受け取り、そこから個別の返信につなげます。 */
    var commentLine = t.name + "でした";
    var commentBody = C.copy.commentBody.replace("◯◯型", t.name);
    var commentCta =
      '<div class="cta">' +
        "<h2>" + esc(C.copy.commentHeading) + "</h2>" +
        "<p>" + esc(commentBody) + "</p>" +
        (canCloseBack ? '<p class="note" style="margin:0 0 14px">' +
           esc(backPost ? C.copy.commentInappPost : C.copy.commentInapp) + "</p>" : "") +
        '<button class="btn" id="cp-type" type="button">「' + esc(commentLine) + "」をコピー</button>" +
        (backPost
          ? '<a class="btn btn-ghost" id="back-post" href="' + esc(backPost) +
            '" target="_blank" rel="noopener">' + esc(C.copy.commentBack) + "</a>"
          : (CFG.profileUrl
              ? '<a class="btn btn-ghost" id="back-post" href="' + esc(CFG.profileUrl) +
                '" target="_blank" rel="noopener">投稿を開く</a>'
              : '<p class="note" style="margin-top:12px">' + esc(C.copy.commentFallback) + "</p>")) +
      "</div>";

    /* --- 無料相談CTA（活動中・検討中の方にだけ） --- */
    var dmLine = t.name + "／" + SUB_LABEL[r.weakest] + "が低いと出ました。無料相談の話を聞かせてください。";
    var bizCta = r.biz
      ? '<div class="cta">' +
          "<h2>" + esc(C.copy.bizHeading) + "</h2>" +
          "<p>" + esc(C.copy.bizBody) + "</p>" +
          '<div class="cta-limit">' + esc(C.copy.bizLimit) + "</div>" +
          (CFG.dmUrl
            ? '<a class="btn" id="dm-go" href="' + esc(CFG.dmUrl) +
              '" target="_blank" rel="noopener">' + esc(C.copy.bizButton) + "</a>"
            : (CFG.profileUrl
                ? '<a class="btn" id="dm-go" href="' + esc(CFG.profileUrl) +
                  '" target="_blank" rel="noopener">' + esc(C.copy.bizProfileButton) + "</a>"
                : "")) +
          '<button class="btn btn-ghost" id="dm-copy" type="button">' + esc(C.copy.bizCopyButton) + "</button>" +
          '<p class="note" style="margin-top:12px">' +
            esc(CFG.dmUrl ? C.copy.bizDmNote : C.copy.bizNoDmNote) + "</p>" +
        "</div>"
      : (CFG.profileUrl
          ? '<div class="cta">' +
              "<h2>" + esc(C.copy.softHeading) + "</h2>" +
              "<p>" + esc(C.copy.softBody) + "</p>" +
              '<a class="btn btn-ghost" id="soft-go" href="' + esc(CFG.profileUrl) +
              '" target="_blank" rel="noopener">' + esc(C.copy.softButton) + "</a>" +
            "</div>"
          : "");

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
        '<div><h1 class="r-name" id="r-name" tabindex="-1">' + esc(t.name) + "</h1>" +
        '<p class="r-tag">' + esc(t.tagline) + " ／ " + esc(iv.label) + "</p></div>" +
      "</div>" +
      '<p class="r-catch">' + esc(t.catch) + "</p>" +

      '<div class="score-row"><span class="score-num">' + r.total + "</span>" +
      '<span class="score-unit">／ 100（結スコア）</span></div>' +
      '<p class="score-band">' + esc(band.label) + "</p>" +
      '<p class="note" style="margin:-4px 0 14px">' + esc(C.copy.scoreDisclaimer) + "</p>" +
      '<p style="font-size:14.5px;color:var(--ink-2)">' + esc(band.comment) + "</p>" +

      '<div class="map-wrap">' + axisMap(r.X, r.Y, r.key) + "</div>" +

      '<div class="bars">' +
        bar("基準", r.sub.kijun, r.weakest === "kijun") +
        bar("伝達", r.sub.dentatsu, r.weakest === "dentatsu") +
        bar("決断", r.sub.ketsudan, r.weakest === "ketsudan") +
      "</div>" +
      '<p class="note" style="margin-top:12px">' + esc(C.copy.subScoreNote) + "</p>" +
      '<div class="intensity-note">' + esc(iv.note) + (r.axisNote ? "<br><br>" + esc(r.axisNote) : "") + "</div>" +

      /* 型を名乗る気持ちがいちばん強いのは、型名とスコアを見た直後です。
         本文と処方箋を読ませたあとでは、6画面ぶんスクロールした先になります。 */
      commentCta +

      '<h2 class="sec">あなたの進め方</h2><p>' + esc(t.summary) + "</p>" +
      '<h2 class="sec">強みが出る場所</h2><p>' + esc(t.strength) + "</p>" +
      '<h2 class="sec">取りこぼしているもの</h2><p>' + esc(t.leak) + "</p>" +

      '<h2 class="sec">プロフィールの書き換え例</h2>' +
      '<div class="ex"><p class="ex-head">BEFORE ／ ありがちな書き方</p><div class="ex-body">' + esc(t.badExample) + "</div></div>" +
      '<div class="ex after"><p class="ex-head">AFTER ／ 書き換えた例</p><div class="ex-body">' + esc(t.goodExample) + "</div></div>" +
      '<p style="margin-top:16px;font-size:14.5px;color:var(--ink-2)">' + esc(t.exampleNote) + "</p>" +

      '<h2 class="sec">この型が生きる場面・つまずく場面</h2><p>' + esc(t.affinity) + "</p>" +

      '<h2 class="sec">あなたへの処方箋</h2>' +
      '<div class="rx">' +
        '<p class="rx-title">' + esc(rx.title) + "</p>" +
        '<p style="font-size:14.5px">' + esc(rx.diagnosis) + "</p>" +
        '<p class="ex-head">手順（そのまま埋めてください）</p>' +
        '<div class="rx-formula">' + esc(rx.formula) + "</div>" +
        '<p class="ex-head">埋めた例</p>' +
        '<div class="rx-worked">' + esc(rx.worked) + "</div>" +
        '<p style="font-size:13.5px;color:var(--ink-2);margin:0">' + esc(rx.pitfall) + "</p>" +
        '<button class="btn btn-ghost" id="rx-copy" type="button" style="margin-top:16px">この手順をコピーする</button>' +
      "</div>" +

      '<h2 class="sec">' + esc(C.copy.shareHeading) + "</h2>" +
      '<p style="font-size:14.5px;color:var(--ink-2)">' + esc(C.copy.shareBody) + "</p>" +
      '<div class="share-text">' + esc(shareBody) + "</div>" +
      '<div class="share-btns">' +
        '<button class="btn" id="sh-native" type="button">シェアする</button>' +
        '<button class="btn btn-ghost" id="sh-copy" type="button">文面をコピー</button>' +
        '<a class="btn btn-ghost" id="sh-x" target="_blank" rel="noopener">Xに投稿</a>' +
      "</div>" +
      '<p class="note" style="margin-top:12px"><a href="t/' + esc(safeKey(t.key)) +
        '.html">このタイプの解説ページ（人に見せるとき用）</a></p>' +

      bizCta + lineCta +

      '<p style="margin:26px 0 0;text-align:center"><a href="about.html">' + esc(C.copy.aboutLink) + "</a></p>" +
      '<button class="btn btn-ghost" id="retake" type="button" style="margin-top:20px">' +
        esc(src === "shared" ? C.copy.startButton : C.copy.retakeButton) + "</button>";

    screen("result");
    host.classList.remove("fade");
    void host.offsetWidth;
    host.classList.add("fade");
    window.scrollTo(0, 0);
    /* 結果が出たことを支援技術に伝え、共有リンクでもタイプが分かるようにします。 */
    try { $("r-name").focus({ preventScroll: true }); } catch (e) {}
    document.title = t.name + " ｜「結」の書き方診断";

    requestAnimationFrame(function () {
      var vals = [r.sub.kijun, r.sub.dentatsu, r.sub.ketsudan];
      Array.prototype.forEach.call(host.querySelectorAll(".bar-track i"), function (n, i2) {
        n.style.width = vals[i2] + "%";
      });
    });

    $("sh-x").href = "https://twitter.com/intent/tweet?text=" +
      encodeURIComponent(shareBody + "\n" + typeUrl);

    on("sh-native", function () {
      nativeShare({ title: C.copy.title, text: shareBody, url: typeUrl }, function () {
        copyText(shareBody + "\n" + typeUrl, "文面をコピーしました");
        track("yui_share_click", { channel: "copy_text", status: "fallback_used" });
      });
    });
    on("sh-copy", function () {
      track("yui_share_click", { channel: "copy_text", status: "success", type: t.key });
      copyText(shareBody + "\n" + typeUrl, "文面をコピーしました");
    });
    on("sh-x", function () { track("yui_share_click", { channel: "x", type: t.key }); });
    on("rx-copy", function () {
      track("yui_rx_copy", { weakest: r.weakest });
      copyText(rx.title + "\n\n" + rx.formula, "手順をコピーしました");
    });
    on("cp-type", function () {
      track("yui_cta_comment", { type: t.key, weakest: r.weakest, has_back_post: !!backPost });
      copyText(commentLine, "コピーしました。コメント欄に貼り付けてください");
    });
    on("back-post", function () { track("yui_cta_post", { type: t.key }); });
    on("dm-go", function () {
      track("yui_cta_dm", { type: t.key, score_band: bandKey, weakest: r.weakest, method: "link" });
      track("generate_lead", { lead_source: "yui_quiz", currency: "JPY", value: 0 });
    });
    on("dm-copy", function () {
      track("yui_cta_dm", { type: t.key, score_band: bandKey, weakest: r.weakest, method: "copy" });
      track("generate_lead", { lead_source: "yui_quiz", currency: "JPY", value: 0 });
      copyText(dmLine, "送る一行をコピーしました");
    });
    on("soft-go", function () {
      track("yui_cta_profile", { type: t.key });
    });
    on("line-go", function () {
      track("yui_cta_line", { type: t.key, score_band: bandKey });
      track("generate_lead", { lead_source: "yui_quiz", currency: "JPY", value: 0 });
    });
    on("retake", function () { track("yui_retake", { type: t.key }); restart(); });
    on("own", function () { track("yui_retake", { type: t.key, from: "shared" }); restart(); });

    /* スコアは生値ではなく帯で送ります。個票を外部に出さないためと、
       運用資料が帯で設計されているためです。 */
    track("yui_result_view", {
      type: t.key, score_band: bandKey, weakest: r.weakest,
      intensity_level: r.level, is_business: r.biz, view_source: src
    });
    /* 共有された他人の結果を、閲覧者の保存データとして書き込まないこと。
       自分で完走した場合は pick() の中で保存済みです。 */
    if (src !== "shared") { save(); }
  }

  function restart() {
    store.del(SKEY);
    var rh = $("resume-host");
    if (rh) { rh.innerHTML = ""; }
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
  function onStart() {
    var f = firstUnanswered();
    track("yui_start", { is_resume: f > 0 && f < N });
    viewSource = "self";
    /* 完走済みのデータが残っている再訪では、最終問ではなく最初からやり直します。 */
    if (f >= N) { restart(); return; }
    if (answers[0] < 0) { go("#/gate"); return; }
    go("#/q/" + (f + 1));
  }
  $("start").addEventListener("click", onStart);
  if ($("start2")) { $("start2").addEventListener("click", onStart); }
  if ($("g-back")) {
    $("g-back").addEventListener("click", function () { nav("#/"); });
  }

  (function boot() {
    var mh = (location.hash || "").match(R_RE);
    if (mh) {
      /* 保存済みの自分の回答と一致するコードなら、リロードでも自分の結果として扱います。 */
      var mine = false, sv = null;
      try { sv = JSON.parse(store.get(SKEY) || "null"); } catch (e) { sv = null; }
      if (sv && sv.v === 2 && sv.a && sv.a.length === TOTAL_A && sv.a.indexOf(-1) < 0) {
        mine = (encodeAnswers(sv.a) === mh[1]);
        if (mine) { answers = sv.a; }
      }
      viewSource = mine ? "self" : "shared";
      route();
      track("page_view", { screen_name: mine ? "result" : "result_shared" });
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
              track("yui_resume", { resume_from_q: f + 1 });
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
