/* =========================================================================
 * 「結」の書き方診断 — 書かずに受ける10問版（q.html）
 *
 * 手書きの診断（index.html）の代わりの経路です。指で書くのが難しい方・書きたくない方のために置いています。
 * 結果の4タイプと結果画面の作りは手書き版と同じで、点数は出しません。
 * 設問・配点は content.js の quiz.questions にあります。
 * ========================================================================= */
(function () {
  "use strict";

  var Y = window.YUI;
  if (!Y || !document.getElementById("quiz")) { return; }
  var C = Y.C, $ = Y.$, esc = Y.esc, fill = Y.fill;
  var QC = (C.quiz && C.quiz.copy) || {};
  var RS = (C.hw && C.hw.result) || {};
  var TH = (C.hw && C.hw.themes) || {};
  var Q = C.quiz.questions;
  var N = Q.length;
  var SKEY = "yui.quiz.v3.progress";
  var B32 = "abcdefghijklmnopqrstuvwxyz234567";

  /* ========== 回答コード（属性1問＋設問10問＝11answer, 22bit → 5文字） ========== */
  var TOTAL_A = N + 1;   /* index 0 は属性設問 */
  var CODE_LEN = Math.ceil(TOTAL_A * 2 / 5);
  var R_RE = new RegExp("^#\\/r\\/([a-z2-7]{" + CODE_LEN + "})$");
  function encodeAnswers(a) {
    var v = 0;
    for (var i = 0; i < TOTAL_A; i++) { v += (a[i] & 3) * Math.pow(4, i); }
    var s = "";
    for (var j = CODE_LEN - 1; j >= 0; j--) { s += B32.charAt(Math.floor(v / Math.pow(32, j)) % 32); }
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
    /* 余った範囲の文字列は、切れたリンクや打ち間違いなので、結果を出さずに弾きます。 */
    if (v >= Math.pow(4, TOTAL_A)) { return null; }
    var a = [];
    for (var i = 0; i < TOTAL_A; i++) { a.push(Math.floor(v / Math.pow(4, i)) % 4); }
    if (encodeAnswers(a) !== code) { return null; }
    return a;
  }

  /* ========== 採点（較正は設問データから実行時に算出） ========== */
  var CAL = (function () {
    var o = { kMax: 0, dMax: 0, tMax: 0, axMax: 0, ayMax: 0 };
    Q.forEach(function (q) {
      var k = 0, d = 0, t = 0, ax = 0, ay = 0;
      q.options.forEach(function (opt) {
        if (opt.kijun > k) { k = opt.kijun; }
        if (opt.dentatsu > d) { d = opt.dentatsu; }
        if (opt.ketsudan > t) { t = opt.ketsudan; }
        if (Math.abs(opt.x) > ax) { ax = Math.abs(opt.x); }
        if (Math.abs(opt.y) > ay) { ay = Math.abs(opt.y); }
      });
      o.kMax += k; o.dMax += d; o.tMax += t; o.axMax += ax; o.ayMax += ay;
    });
    o.kMax = o.kMax || 1; o.dMax = o.dMax || 1; o.tMax = o.tMax || 1;
    o.axMax = o.axMax || 1; o.ayMax = o.ayMax || 1;
    return o;
  })();
  function clamp(v, lo, hi) {
    if (typeof v !== "number" || !isFinite(v)) { return lo; }
    return v < lo ? lo : (v > hi ? hi : v);
  }
  /* 点数は出しません。型と、次に意識するテーマ（3要素のうち最も薄く出たもの）を決めるだけです。
     「低い」とは表示しません。テーマは肯定的な言い方で出します。 */
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
    var X = Math.round(clamp(x / CAL.axMax, -1, 1) * 100);
    var Yv = Math.round(clamp(y / CAL.ayMax, -1, 1) * 100);
    if (X === 0) { X = (sub.dentatsu > sub.kijun) ? 1 : -1; }
    if (Yv === 0) { Yv = (sub.ketsudan >= 50) ? 1 : -1; }
    var key = X < 0 ? (Yv < 0 ? "sekkei" : "suishin") : (Yv < 0 ? "kyomei" : "chokkan");
    var order = ["ketsudan", "kijun", "dentatsu"];
    var weakest = order[0];
    order.forEach(function (kk) { if (sub[kk] < sub[weakest]) { weakest = kk; } });
    return {
      X: X, Y: Yv, key: key, sub: sub, weakest: weakest,
      biz: !!(C.qualify.options[a[0]] && C.qualify.options[a[0]].biz)
    };
  }

  /* ========== 導入 ========== */
  Y.setText("c-subtitle", QC.subtitle);
  Y.setText("c-hook", QC.hook);
  Y.bullets("c-promise", QC.promise);
  Y.setText("start", QC.startButton);
  Y.setText("c-privacy", QC.privacyLine);
  Y.setText("q-total", String(N));
  if ($("q-segs")) {
    $("q-segs").setAttribute("aria-valuemax", String(N));
    for (var _s = 0; _s < N; _s++) { $("q-segs").appendChild(document.createElement("i")); }
  }

  /* ========== 状態 ========== */
  var answers = new Array(TOTAL_A);
  for (var _i = 0; _i < TOTAL_A; _i++) { answers[_i] = -1; }
  var idx = 0, busy = false, shown = false;
  /* 1日を過ぎて消した記録が、開いた結果のアドレスと同じだったとき、その結果を本人のものとして扱うための控え */
  var staleCode = null;
  var nv;
  var TITLE = (C.quizMeta && C.quizMeta.title) || "書かずに受ける10問版 ｜「結」の書き方診断";

  function firstUnanswered() {
    for (var i = 1; i <= N; i++) { if (answers[i] < 0) { return i - 1; } }
    return N;
  }
  function screen(which) {
    ["intro", "gate", "quiz", "result"].forEach(function (id) { $(id).hidden = (id !== which); });
  }
  function save() {
    if (!Y.caps.storage) { return; }
    Y.store.set(SKEY, JSON.stringify({ v: 3, a: answers, t: Date.now() }));
  }

  /* ========== 属性設問 ========== */
  function renderGate() {
    Y.setText("g-scene", C.qualify.scene);
    Y.setText("g-text", C.qualify.text);
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
        save();
        setTimeout(function () { busy = false; nv.nav("#/q/1"); }, Y.reduceMotion ? 0 : 200);
      });
      host.appendChild(b);
    });
    screen("gate");
    document.title = TITLE;
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
    document.title = TITLE;
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
    paintSegs();
    /* 途中の回答は、続きから再開できるよう残します。10問すべてに答え終えたら、再開の用はないので消します
       （結果はアドレスに入っていて、開き直しは履歴の印で本人のものと分かります）。 */
    if (firstUnanswered() >= N) { Y.store.del(SKEY); } else { save(); }
    setTimeout(function () {
      $("q-stage").classList.add("out");
      setTimeout(function () {
        if (idx < N - 1) { nv.nav("#/q/" + (idx + 2)); }
        else { nv.nav("#/r/" + encodeAnswers(answers)); }
      }, Y.reduceMotion ? 0 : 170);
    }, Y.reduceMotion ? 0 : 130);
  }
  /* history.back() に頼ると、アプリ内ブラウザがページを再生成したときにサイト外へ出てしまいます。 */
  Y.on("q-back", function () { nv.nav(idx > 0 ? ("#/q/" + idx) : "#/gate"); });

  /* ========== 結果 ==========
     content.js section 14 の順序と差し替えに従います。手書き版の文言のうち「書いた字」を前提にしたもの
     （r07・r08・kicker・sharedBanner・basis・share.body・textTemplate・highlight*・mapAriaLean*）は使いません。 */
  var IN = (C.hw && C.hw.intro) || {};
  var TD = ((C.hw && C.hw.themeDirection) || {}).quiz || {};
  function renderResult(src, data) {
    for (var i = 0; i < TOTAL_A; i++) {
      if (data[i] < 0 || data[i] > 3) { nv.replaceHash("#/"); screen("intro"); return; }
    }
    var shared = src === "shared";
    var r = score(data);
    var t = Y.typeOf(r.key);
    var host = $("result");
    Y.applyTypeColor(host, t);
    var el = r.weakest, dir = TD[el];
    var theme = (TH[el] && dir && TH[el][dir]) ? TH[el][dir] : null;
    var elLabel = (RS.elements && RS.elements[el]) || "";

    var parts = [];
    if (shared) {
      /* 主ボタンは手書き版へ。書きたくない方のために、その横に R06 の経路を置きます。 */
      parts.push('<div class="shared-bar"><p>' + esc(QC.sharedBanner) + "</p>" +
        '<a class="btn" id="own-hw" href="index.html">' + esc(QC.sharedBannerButton) + "</a>" +
        '<p class="alt-path"><a id="own" href="q.html">' + esc(IN.altLink) + "</a></p></div>");
    }
    parts.push('<p class="kicker">' + esc(QC.resultKicker) + "</p>");
    parts.push('<div class="r-head"><div class="seal" aria-hidden="true">結</div>' +
      '<div><h1 class="r-name" id="r-name" tabindex="-1">' + esc(t.name) + "</h1></div></div>");
    parts.push('<p class="r07">' + esc(QC.r07) + "</p>");
    parts.push('<p class="r08">' + esc(QC.r08) + "</p>");
    parts.push('<p class="r-tag">' + esc(t.tagline) + "</p>");
    parts.push('<p class="r-catch">' + esc(t.catch) + "</p>");
    parts.push('<div class="map-wrap">' + Y.axisMap(r.X, r.Y, r.key, {
      aria: fill(shared ? RS.mapAriaShared : RS.mapAria, { type: t.name }),
      top: RS.mapAxes && RS.mapAxes.top, bottom: RS.mapAxes && RS.mapAxes.bottom,
      left: RS.mapAxes && RS.mapAxes.left, right: RS.mapAxes && RS.mapAxes.right }) + "</div>");

    /* 婚活での生かし方：liveHeading は types.<型>.live の見出しとして1回だけ。
       テーマは themeLead → themeHeading → next だけを出します（themes.*.live は出しません）。 */
    if (t.live) { parts.push('<h2 class="sec">' + esc(RS.liveHeading) + "</h2><p>" + esc(t.live) + "</p>"); }
    if (theme && theme.next) {
      parts.push('<div class="hl">' +
        (QC.themeLead ? '<p class="hl-feature">' + esc(fill(QC.themeLead, { element: elLabel })) + "</p>" : "") +
        '<h2 class="sec">' + esc(RS.themeHeading) + "</h2><p>" + esc(theme.next) + "</p></div>");
    }
    parts.push(Y.typeSections(t));

    var cta = Y.ctaBlocks({
      t: t, src: src, noComment: shared, biz: shared ? false : r.biz,
      commentLine: t.name + "でした",
      dmLine: fill(C.cta.dmLineTemplate, { type: t.name })
    });
    parts.push(cta.html.comment + cta.html.biz + cta.html.line);

    var share = null;
    if (!shared) {
      share = Y.shareBlock({
        text: fill(C.share.quizTextTemplate, { type: t.name }),
        url: Y.siteBase() + "/t/" + Y.safeKey(t.key) + ".html",
        body: C.share.quizBody
      });
      parts.push(share.html);
    }
    parts.push('<div class="again">' +
      '<a class="btn" id="to-hw" href="index.html">' + esc(QC.toHandwriting) + "</a>" +
      (shared ? "" : '<button class="btn btn-ghost" id="retake" type="button">' + esc(QC.retakeButton) + "</button>") +
    "</div>");
    parts.push('<p class="about-link"><a href="about.html">' + esc(RS.aboutLink) + "</a></p>");

    host.innerHTML = parts.join("");
    screen("result");
    host.classList.remove("fade");
    void host.offsetWidth;
    host.classList.add("fade");
    window.scrollTo(0, 0);
    try { $("r-name").focus({ preventScroll: true }); } catch (e) {}
    document.title = t.name + " ｜" + (C.title || "「結」の書き方診断") + "（10問版）";
    cta.bind();
    if (share) { share.bind(); }
    Y.on("retake", restart);
    var own = $("own");
    if (own) {
      own.addEventListener("click", function (e) { e.preventDefault(); restart(); });
    }
    /* 保存するのは答えたとき（pick）だけです。結果を開き直したり戻ったりしただけで書き直すと、
       「もう一度受ける」で消した答えや、1日たって消した答えが、また端末に残ってしまいます。
       自分の結果には、この履歴の項目に印を付けます。保存がブロックされた環境で開き直したときや、
       「もう一度受ける」のあとに戻ったときも、ほかの方の結果として扱わないためです。 */
    if (!shared) {
      try { history.replaceState({ yuiOwnQ: encodeAnswers(data) }, "", location.href); } catch (e) {}
    }
  }

  function restart() {
    Y.store.del(SKEY);
    for (var k = 0; k < TOTAL_A; k++) { answers[k] = -1; }
    idx = 0;
    staleCode = null;
    nv.go("#/gate");
  }

  /* 途中の回答が残っているときの案内。導入を出すたびに、いまの回答数で描き直します。 */
  function renderResume() {
    var host = $("resume-host");
    var f = firstUnanswered();
    var can = answers[0] >= 0 && f > 0 && f < N;
    Y.setText("start", can ? fill(QC.resumeButtonTemplate, { next: f + 1 }) : QC.startButton);
    if (!host) { return; }
    host.innerHTML = can
      ? '<p class="note resume-note">' + esc(fill(QC.resumeNote, { done: f })) + "</p>"
      : "";
  }
  function isOwn(code) {
    if (history.state && history.state.yuiOwnQ === code) { return true; }
    if (staleCode && staleCode === code) { return true; }
    return answers.indexOf(-1) < 0 && encodeAnswers(answers) === code;
  }

  /* ========== ルーティング ========== */
  function route() {
    var h = location.hash || "";
    if (h === "#/gate") { renderGate(); shown = true; return; }
    var m = h.match(/^#\/q\/(\d+)$/);
    if (m) {
      var n = parseInt(m[1], 10);
      /* 途中の回答が無いまま途中の問のアドレスを開いたときは、属性の1問ではなく導入から始めます。 */
      if (answers[0] < 0 || !(n >= 1 && n <= N)) { nv.replaceHash("#/"); showIntro(); return; }
      var allowed = Math.min(n - 1, firstUnanswered());
      idx = allowed;
      if (allowed !== n - 1) { nv.replaceHash("#/q/" + (allowed + 1)); }
      renderQuestion();
      shown = true;
      return;
    }
    m = h.match(R_RE);
    if (m) {
      var a = decodeAnswers(m[1]);
      if (!a) { nv.replaceHash("#/"); showIntro(); return; }
      /* 自分の結果かどうかは、開いたコードごとに決めます。ほかの方の共有リンクを開いただけで、
         閲覧者自身の途中回答を壊さないこと。 */
      var own = isOwn(m[1]);
      if (own) { answers = a; }
      renderResult(own ? "self" : "shared", a);
      shown = true;
      return;
    }
    showIntro();
  }
  function showIntro() {
    screen("intro");
    document.title = TITLE;
    renderResume();
    window.scrollTo(0, 0);
    /* 別の画面から戻ってきたときは、見出しに読み上げの位置を戻します（最初の表示では動かしません）。 */
    if (shown) { try { $("intro-title").focus({ preventScroll: true }); } catch (e) {} }
    shown = true;
  }
  nv = Y.makeNav(route);
  window.addEventListener("hashchange", route);

  function onStart() {
    var f = firstUnanswered();
    /* 完走済みのデータが残っている再訪では、最終問ではなく最初からやり直します。 */
    if (f >= N) { restart(); return; }
    if (answers[0] < 0) { nv.go("#/gate"); return; }
    nv.go("#/q/" + (f + 1));
  }
  Y.on("start", onStart);
  Y.on("g-back", function () { nv.nav("#/"); });

  (function boot() {
    var raw = Y.store.get(SKEY);
    if (raw) {
      var st = null;
      try { st = JSON.parse(raw); } catch (e) { st = null; }
      var valid = st && st.v === 3 && st.a && st.a.length === TOTAL_A;
      var fresh = valid && st.t && (Date.now() - st.t) >= 0 && (Date.now() - st.t) < 24 * 3600 * 1000;
      if (fresh) {
        answers = st.a;
      } else {
        /* 1日を過ぎた回答（や壊れた記録）は、どのアドレスで開いても、ここで消します（privacyLine・footer.r11 の約束）。 */
        if (valid && st.a.indexOf(-1) < 0) { staleCode = encodeAnswers(st.a); }
        Y.store.del(SKEY);
      }
    }
    route();
  })();
})();
