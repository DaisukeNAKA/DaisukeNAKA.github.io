/* =========================================================================
 * 「結」の書き方診断 — 共通部品
 *
 * 手書きの診断（index.html / hw.js）と、書かずに受ける10問版（q.html / quiz.js）、
 * タイプ別ページと制作者ページが共通で使う処理をまとめています。
 * 文言はすべて content.js 側にあります。
 *
 * 計測は入れていません。ページの Content-Security-Policy で外部への通信を
 * 物理的に止めているため、ここに解析タグを足しても動きません（プライバシーの記載と一致させるため）。
 * ========================================================================= */
(function () {
  "use strict";

  var C = window.YUI_CONTENT;
  if (!C) { return; }
  var CFG = C.config || {};

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
      storage: storage,
      pointer: typeof window.PointerEvent === "function"
    };
  })();
  /* アプリ内ブラウザは「×」で元の投稿に戻れる。ここが最も摩擦の低い導線になる。 */
  var canCloseBack = (caps.inapp === "instagram" || caps.inapp === "threads" || caps.inapp === "facebook");
  var reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { window.localStorage.removeItem(k); } catch (e) {} }
  };

  /* 計測は入れていないため、呼び出し側を書き換えずに済むよう空の関数だけ置いておきます。 */
  function track() {}

  /* ========== 小道具 ========== */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  /* {token} を差し込む。未知のトークンは空にせず残すと、文言側の書き間違いが画面で見つかります。 */
  function fill(tpl, map) {
    return String(tpl == null ? "" : tpl).replace(/\{([a-zA-Z0-9_]+)\}/g, function (m, k) {
      return Object.prototype.hasOwnProperty.call(map || {}, k) && map[k] != null ? String(map[k]) : m;
    });
  }
  function setText(id, value) {
    var n = $(id);
    if (n && value != null) { n.textContent = value; }
  }
  function bullets(id, src) {
    var host = $(id);
    if (!host) { return; }
    var list = Array.isArray(src) ? src : String(src || "").split("\n");
    host.innerHTML = "";
    list.forEach(function (line) {
      var t = String(line).replace(/^[・\-•]\s*/, "").trim();
      if (t) {
        var li = document.createElement("li");
        li.textContent = t;
        host.appendChild(li);
      }
    });
  }
  function on(id, fn) {
    var n = $(id);
    if (n) { n.addEventListener("click", fn); }
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
    p.className = "manual-copy-lead";
    p.textContent = "自動コピーができませんでした。下の文面を長押しして選択し、コピーしてください。";
    var ta = document.createElement("textarea");
    ta.value = text;
    var close = document.createElement("button");
    close.className = "btn btn-ghost";
    close.type = "button";
    close.textContent = "閉じる";
    /* aria-modal に合わせて、Tab はダイアログの中だけを回し、閉じたら開いたボタンへ戻します。
       開いた直後の背景のタップ（ダブルタップの2回目）では閉じません。 */
    var opener = document.activeElement;
    var openedAt = Date.now();
    function onKey(e) {
      if (e.key === "Escape") { shut(); return; }
      if (e.key === "Tab") {
        var first = ta, last = close;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        else if (document.activeElement !== first && document.activeElement !== last) { e.preventDefault(); first.focus(); }
      }
    }
    function shut() {
      document.removeEventListener("keydown", onKey);
      if (back.parentNode) { back.parentNode.removeChild(back); }
      if (box.parentNode) { box.parentNode.removeChild(box); }
      try { if (opener && opener.focus) { opener.focus(); } } catch (e) {}
    }
    document.addEventListener("keydown", onKey);
    close.addEventListener("click", shut);
    back.addEventListener("click", function () { if (Date.now() - openedAt > 400) { shut(); } });
    box.appendChild(p); box.appendChild(ta); box.appendChild(close);
    document.body.appendChild(back); document.body.appendChild(box);
    try { ta.focus(); ta.setSelectionRange(0, text.length); } catch (e) {}
  }
  function execCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("contenteditable", "true");
    ta.className = "offscreen-copy";
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
           解除しないと、共有シートの表示が1.4秒を超えたときに
           共有が成功しているのに裏でクリップボードを上書きしてしまいます。 */
        clearTimeout(wd);
        pr.then(function () { settled = true; }, function (err) {
          settled = true;
          if (!(err && err.name === "AbortError")) { onFallback(); }
        });
      }
    } catch (e) {
      settled = true; clearTimeout(wd);
      onFallback();
    }
  }

  function safeHex(c, fallback) {
    return /^#[0-9a-fA-F]{3,8}$/.test(String(c)) ? String(c) : fallback;
  }
  function safeKey(k) { return String(k).replace(/[^A-Za-z0-9_-]/g, ""); }
  function typeOf(key) {
    for (var i = 0; i < C.types.length; i++) { if (C.types[i].key === key) { return C.types[i]; } }
    return null;
  }
  function isDark() {
    var attr = document.documentElement.getAttribute("data-theme");
    if (attr === "dark") { return true; }
    if (attr === "light") { return false; }
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }
  /* シェアやタイプ別ページのリンク先は、設定値ではなく「いま開かれているURL」から組み立てます。
     置き場所を別のドメインへ移したとき、設定を書き換える前からリンクが正しい先を指します。 */
  function siteBase() {
    try {
      if (location.protocol === "http:" || location.protocol === "https:") {
        var dir = location.pathname.replace(/[^/]*$/, "");
        return (location.origin + dir).replace(/\/$/, "");
      }
    } catch (e) {}
    return String(CFG.siteUrl || "").replace(/\/$/, "");
  }
  function clamp(v, lo, hi) {
    if (typeof v !== "number" || !isFinite(v)) { return lo; }
    return v < lo ? lo : (v > hi ? hi : v);
  }

  /* ========== 2軸マップ ==========
     X, Y は -100〜100。境界の近くかどうかが見えるよう、中心線を実線で引きます。 */
  function axisMap(X, Y, typeKey, labels) {
    var L = labels || {};
    var color = "var(--type)";
    var V = 320, P = 44, S = 232, cx = 160, cy = 160, half = S / 2;
    /* 点のハローが半径16あるため、枠線に食い込まないよう0.86まで内側に収めます。 */
    var INSET = 0.86;
    var px = cx + clamp(X / 100, -1, 1) * half * INSET;
    var py = cy - clamp(Y / 100, -1, 1) * half * INSET;
    var quad = {
      suishin: { x: P, y: P }, chokkan: { x: cx, y: P },
      sekkei: { x: P, y: cy }, kyomei: { x: cx, y: cy }
    }[typeKey] || { x: P, y: P };
    function name(k) { var t = typeOf(k); return t ? t.name : k; }
    function lab(key, x, y, anchor) {
      var onType = (key === typeKey);
      return '<text x="' + x + '" y="' + y + '" text-anchor="' + anchor + '" font-size="11" ' +
        'letter-spacing=".08em" fill="' + (onType ? color : "var(--ink-3)") + '" ' +
        'font-weight="' + (onType ? 700 : 400) + '">' + esc(name(key)) + '</text>';
    }
    return '<svg class="map" viewBox="0 0 ' + V + ' ' + V + '" role="img" aria-label="' + esc(L.aria || "") + '">' +
      '<rect x="' + P + '" y="' + P + '" width="' + S + '" height="' + S + '" rx="6" fill="var(--surface-2)" stroke="var(--line)" stroke-width="1"/>' +
      '<rect x="' + quad.x + '" y="' + quad.y + '" width="' + half + '" height="' + half + '" fill="' + color + '" opacity=".10"/>' +
      '<line x1="' + P + '" y1="' + cy + '" x2="276" y2="' + cy + '" stroke="var(--line)" stroke-width="1"/>' +
      '<line x1="' + cx + '" y1="' + P + '" x2="' + cx + '" y2="276" stroke="var(--line)" stroke-width="1"/>' +
      lab("suishin", 56, 64, "start") +
      lab("chokkan", 264, 64, "end") +
      lab("sekkei", 56, 262, "start") +
      lab("kyomei", 264, 262, "end") +
      '<text x="160" y="26" text-anchor="middle" font-size="10" fill="var(--ink-3)">' + esc(L.top || "") + '</text>' +
      '<text x="160" y="302" text-anchor="middle" font-size="10" fill="var(--ink-3)">' + esc(L.bottom || "") + '</text>' +
      '<text transform="rotate(-90 18 160)" x="18" y="160" text-anchor="middle" font-size="10" fill="var(--ink-3)">' + esc(L.left || "") + '</text>' +
      '<text transform="rotate(90 302 160)" x="302" y="160" text-anchor="middle" font-size="10" fill="var(--ink-3)">' + esc(L.right || "") + '</text>' +
      '<circle cx="' + px + '" cy="' + py + '" r="16" fill="' + color + '" opacity=".16"/>' +
      '<circle cx="' + px + '" cy="' + py + '" r="6.5" fill="' + color + '" stroke="var(--paper)" stroke-width="2"/>' +
      '</svg>';
  }

  /* ========== フッター（全ページ共通） ========== */
  function renderFooter(host) {
    if (!host) { return; }
    var F = C.footer || {};
    var op = C.operator || {};
    var rows = "";
    if (op.name) { rows += "<dt>制作・運営</dt><dd>" + esc(op.name) + "</dd>"; }
    if (op.business) { rows += "<dt>事業内容</dt><dd>" + esc(op.business) + "</dd>"; }
    if (op.contact) { rows += "<dt>連絡先</dt><dd>" + esc(op.contact) + "</dd>"; }
    var privacy = [F.r11, F.r12, F.r13].filter(Boolean).map(function (s) { return "<p>" + esc(s) + "</p>"; }).join("");
    host.innerHTML =
      "<p class=\"foot-title\">" + esc(C.title || "「結」の書き方診断") + "</p>" +
      (F.r09 ? "<p>" + esc(F.r09) + "</p>" : "") +
      (F.r10 ? "<p>" + esc(F.r10) + "</p>" : "") +
      /* R16（IBJ加盟の表記など）。IBJ本部の確認が済むまで null で、そのあいだは何も出しません。 */
      (typeof F.r16 === "string" && F.r16 ? '<p class="foot-r16">' + esc(F.r16) + "</p>" : "") +
      (privacy ? '<details class="foot-privacy"><summary>書いた線と、この端末に残るものについて</summary>' + privacy + "</details>" : "") +
      (rows ? '<dl class="op-block">' + rows + "</dl>" : "");
  }

  /* ========== 「この投稿に戻る」 ========== */
  function postFromQuery() {
    var m = (location.search || "").match(/[?&]s=([A-Za-z0-9_-]{1,32})/);
    if (!m) { return ""; }
    var posts = CFG.posts || {};
    if (!Object.prototype.hasOwnProperty.call(posts, m[1])) { return ""; }
    var u = posts[m[1]];
    return (typeof u === "string" && /^https?:\/\//.test(u)) ? u : "";
  }

  /* ========== 結果の共通部品 ==========
     手書き版と10問版で、タイプの説明とCTAの出し方を一致させるための部品です。 */
  function applyTypeColor(host, t) {
    var colorLight = safeHex(t.color, "#c8453c");
    var colorDark = safeHex(t.colorDark, colorLight);
    host.style.setProperty("--type-light", colorLight);
    host.style.setProperty("--type-dark", colorDark);
  }

  function typeHeader(t, sub) {
    return '<div class="r-head">' +
        '<div class="seal" aria-hidden="true">結</div>' +
        '<div><h1 class="r-name" id="r-name" tabindex="-1">' + esc(sub && sub.label ? sub.label : t.name) + "</h1>" +
        '<p class="r-tag">' + esc(t.tagline) + "</p></div>" +
      "</div>" +
      '<p class="r-catch">' + esc(t.catch) + "</p>";
  }

  /* opts.basis … 手書き版の結果とタイプ別ページだけ、summary の前に「どんな字をこの型に当てはめるか」を出します。
     10問版では字を書いていないので出しません。 */
  function typeSections(t, opts) {
    var R = (C.hw && C.hw.result) || {};
    var out =
      '<h2 class="sec">' + esc(R.summaryHeading || "") + "</h2>" +
      (opts && opts.basis && t.basis ? '<p class="basis">' + esc(t.basis) + "</p>" : "") +
      "<p>" + esc(t.summary) + "</p>" +
      '<h2 class="sec">' + esc(R.strengthHeading || "") + '</h2><p>' + esc(t.strength) + "</p>" +
      '<h2 class="sec">' + esc(R.stumbleHeading || "") + '</h2><p>' + esc(t.stumble) + "</p>";
    if (t.badExample && t.goodExample) {
      out +=
        '<h2 class="sec">' + esc(R.exampleHeading || "") + "</h2>" +
        '<div class="ex"><p class="ex-head">BEFORE ／ ありがちな書き方</p><div class="ex-body">' + esc(t.badExample) + "</div></div>" +
        '<div class="ex after"><p class="ex-head">AFTER ／ 書き換えた例</p><div class="ex-body">' + esc(t.goodExample) + "</div></div>" +
        (t.exampleNote ? '<p class="ex-note">' + esc(t.exampleNote) + "</p>" : "");
    }
    if (t.affinity) {
      out += '<h2 class="sec">' + esc(R.affinityHeading || "") + '</h2><p>' + esc(t.affinity) + "</p>";
    }
    return out;
  }

  /* 共有・コメント・無料相談・LINE。
     opts: {t, src: "self"|"shared", biz: true|false|null, shareLine, shareUrl, commentLine, dmLine} */
  function ctaBlocks(opts) {
    var CT = C.cta || {};
    var t = opts.t;
    var backPost = postFromQuery();
    var html = { comment: "", biz: "", line: "" };

    /* 共有された結果を開いた人に、ほかの方の型を自分の型としてコメントさせないため、shared では出しません。 */
    html.comment = opts.noComment ? "" :
      '<div class="cta">' +
        "<h2>" + esc(CT.commentHeading) + "</h2>" +
        "<p>" + esc(CT.commentBody) + "</p>" +
        (canCloseBack ? '<p class="note cta-note">' +
           esc(backPost ? CT.commentInappPost : CT.commentInapp) + "</p>" : "") +
        '<button class="btn" id="cp-type" type="button">「' + esc(opts.commentLine) + "」をコピー</button>" +
        (backPost
          ? '<a class="btn btn-ghost" id="back-post" href="' + esc(backPost) +
            '" target="_blank" rel="noopener">' + esc(CT.commentBack) + "</a>"
          : (CFG.profileUrl
              ? '<a class="btn btn-ghost" id="back-post" href="' + esc(CFG.profileUrl) +
                '" target="_blank" rel="noopener">' + esc(CT.commentProfile || "投稿を開く") + "</a>"
              : '<p class="note cta-note">' + esc(CT.commentFallback) + "</p>")) +
      "</div>";

    /* 無料相談の窓口（活動中・検討中の方）。属性が分からないとき（再読み込み後など）も出します。
       出さない側に倒すと、相談したい人が行き場を失うためです。 */
    var showBiz = opts.biz !== false;
    if (showBiz && (CFG.dmUrl || CFG.profileUrl)) {
      /* R14（勧誘の可能性を先に告げる一文）は、相談ボタンの直上に置きます（特商法施行令1条・2条への備え）。
         dmLimit は事実の確認が済むまで空文字で、そのときは何も出しません。 */
      html.biz =
        '<div class="cta">' +
          "<h2>" + esc(CT.dmHeading) + "</h2>" +
          "<p>" + esc(CT.dmBody) + "</p>" +
          (CT.dmLimit ? '<div class="cta-limit">' + esc(CT.dmLimit) + "</div>" : "") +
          (CT.dmLead ? '<p class="cta-lead">' + esc(CT.dmLead) + "</p>" : "") +
          (CFG.dmUrl
            ? '<a class="btn" id="dm-go" href="' + esc(CFG.dmUrl) + '" target="_blank" rel="noopener">' + esc(CT.dmButton) + "</a>"
            : '<a class="btn" id="dm-go" href="' + esc(CFG.profileUrl) + '" target="_blank" rel="noopener">' + esc(CT.dmProfileButton || CT.dmButton) + "</a>") +
          '<button class="btn btn-ghost" id="dm-copy" type="button">' + esc(CT.dmCopyButton || "送る一行をコピー") + "</button>" +
          (CT.dmNote ? '<p class="note cta-note">' + esc(CT.dmNote) + "</p>" : "") +
        "</div>";
    } else if (!showBiz) {
      /* softBody は「4つの型の解説と書き換え例をそのまま読める」と約束しているので、行き先はタイプ別ページです。 */
      var others = (C.types || []).filter(function (o) { return o.key !== t.key; });
      html.biz =
        '<div class="cta">' +
          "<h2>" + esc(CT.softHeading) + "</h2>" +
          "<p>" + esc(opts.noComment && CT.softBodyShared ? CT.softBodyShared : CT.softBody) + "</p>" +
          '<nav class="soft-links" id="soft-go" aria-label="' + esc(CT.softButton) + '">' +
            others.map(function (o) {
              return '<a class="btn btn-ghost" href="t/' + safeKey(o.key) + '.html">' + esc(o.name) + "</a>";
            }).join("") +
          "</nav>" +
        "</div>";
    }

    if (CFG.lineUrl) {
      html.line =
        '<div class="cta">' +
          "<h2>" + esc(CT.lineHeading) + "</h2>" +
          "<p>" + esc(CT.lineBody) + "</p>" +
          (CT.lineLead ? '<p class="cta-lead">' + esc(CT.lineLead) + "</p>" : "") +
          '<a class="btn btn-line" id="line-go" href="' + esc(CFG.lineUrl) + '" target="_blank" rel="noopener">' + esc(CT.lineButton) + "</a>" +
        "</div>";
    }

    function bind() {
      on("cp-type", function () { copyText(opts.commentLine, CT.commentCopied || "コピーしました。コメント欄に貼り付けてください"); });
      on("dm-copy", function () { copyText(opts.dmLine, CT.dmCopied || "送る一行をコピーしました"); });
    }
    return { html: html, bind: bind };
  }

  function shareBlock(opts) {
    var SH = C.share || {};
    var html =
      '<h2 class="sec">' + esc(SH.heading) + "</h2>" +
      '<p class="sec-lead">' + esc(opts.body != null ? opts.body : SH.body) + "</p>" +
      '<div class="share-text">' + esc(opts.text) + "</div>" +
      '<div class="share-btns">' +
        '<button class="btn" id="sh-native" type="button">' + esc(SH.nativeButton || SH.shareButton || "シェアする") + "</button>" +
        '<button class="btn btn-ghost" id="sh-copy" type="button">' + esc(SH.copyButton || "文面とリンクをコピー") + "</button>" +
        /* リンクを付けずに文面だけを共有できる手段。share.body の末文が前提にしています。 */
        '<button class="btn btn-ghost" id="sh-copytext" type="button">' + esc(SH.copyTextButton || "文面だけをコピー") + "</button>" +
        '<a class="btn btn-ghost" id="sh-x" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=' +
          encodeURIComponent(opts.text + "\n" + opts.url) + '">' + esc(SH.xButton || "Xに投稿") + "</a>" +
      "</div>";
    function bind() {
      on("sh-native", function () {
        nativeShare({ title: C.title || "「結」の書き方診断", text: opts.text, url: opts.url }, function () {
          copyText(opts.text + "\n" + opts.url, SH.copied || "文面をコピーしました");
        });
      });
      on("sh-copy", function () { copyText(opts.text + "\n" + opts.url, SH.copied || "文面をコピーしました"); });
      on("sh-copytext", function () { copyText(opts.text, SH.copied || "文面をコピーしました"); });
    }
    return { html: html, bind: bind };
  }

  /* 履歴を積まずに画面を切り替える。積むと、結果まで進んだ人が元の投稿へ戻るのに
     何度もバックする必要が出ます。replaceState は hashchange を発火しないため、route を明示的に呼びます。 */
  function makeNav(route) {
    return {
      replaceHash: function (hash) {
        try { history.replaceState(null, "", location.pathname + location.search + hash); }
        catch (e) { location.hash = hash; }
      },
      nav: function (hash) {
        var replaced = true;
        try { history.replaceState(null, "", location.pathname + location.search + hash); }
        catch (e) { replaced = false; location.hash = hash; }
        if (replaced) { route(); }
      },
      go: function (hash) {
        if (location.hash === hash) { route(); return; }
        location.hash = hash;
      }
    };
  }

  window.YUI = {
    C: C, CFG: CFG, caps: caps, store: store, track: track, reduceMotion: reduceMotion, canCloseBack: canCloseBack,
    $: $, esc: esc, fill: fill, setText: setText, bullets: bullets, on: on, toast: toast, copyText: copyText,
    nativeShare: nativeShare, safeHex: safeHex, safeKey: safeKey, typeOf: typeOf, isDark: isDark,
    siteBase: siteBase, clamp: clamp, axisMap: axisMap, renderFooter: renderFooter, postFromQuery: postFromQuery,
    applyTypeColor: applyTypeColor, typeHeader: typeHeader, typeSections: typeSections,
    ctaBlocks: ctaBlocks, shareBlock: shareBlock, makeNav: makeNav
  };

  /* 静的ページ（タイプ別・制作者）ではフッターだけを描きます。 */
  if (document.getElementById("site-footer")) { renderFooter(document.getElementById("site-footer")); }
})();
