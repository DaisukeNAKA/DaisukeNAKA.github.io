/* =========================================================================
 * 「結」の書き方診断 — 手書きの画面（index.html）
 *
 * 原案：スマホの画面に指で「結」を一文字書き、その書き方から婚活のタイプを出す。
 * この原案から二度外れた経緯があるため（文章の締めの診断 → 10問の設問式）、
 * ここを設問式に置き換えないでください。書かずに受けたい方のための10問版は q.html にあります。
 *
 * 書いた線はこのページのメモリの中だけで扱い、外へは送りません（CSP で通信自体を止めています）。
 * 端末に残すのは、前回の型の名前だけです。
 * ========================================================================= */
(function () {
  "use strict";

  var Y = window.YUI, HW = window.YUI_HW;
  if (!Y || !HW || !document.getElementById("intro")) { return; }
  var C = Y.C, CFG = Y.CFG, $ = Y.$, esc = Y.esc, fill = Y.fill;
  var H = C.hw || {}, IN = H.intro || {}, WR = H.write || {}, GT = H.gate || {}, RS = H.result || {};
  var FT = H.features || {}, TH = H.themes || {};
  var CAL = C.calibration;
  var LKEY = "yui.hw.last";
  /* 解析に渡す座標系。画面の大きさや回転に左右されないよう、線は枠の一辺を1とした値で持ち、
     解析のときだけこの大きさに引き伸ばします（解析側も一辺で割り戻すので、値は変わりません）。 */
  var ANALYSIS_SIDE = 1000;

  /* ========== 状態（すべてメモリの中だけ） ========== */
  var S = {
    pass: 1,          /* 1回目か2回目か */
    strokes: [],      /* 書いている最中の線 [{points:[{x,y,t}]}]（0〜1の正規化座標） */
    a1: null, a2: null, s1: null, s2: null,  /* 解析結果と、その線 */
    qualify: -1,
    current: null,    /* 直近に出した結果 {code, key, scored, feats} */
    cancels: 0
  };

  var nv = Y.makeNav(route);

  /* ========== 導入の文言（index.html に静的に書き出した値を同じ値で上書き） ========== */
  Y.setText("c-r01", IN.r01);
  Y.setText("c-catch", IN.catch);
  Y.setText("c-hook", IN.hook);
  Y.setText("c-r02", IN.r02);
  Y.setText("c-r03", IN.r03);
  Y.setText("start", IN.startButton);
  Y.setText("start2", IN.startButton);
  Y.setText("alt-quiz-intro", IN.altLink);
  Y.bullets("c-promise", IN.promise);
  Y.bullets("c-whofor", IN.whoFor);
  Y.setText("c-author", IN.author);

  function screen(which) {
    ["intro", "write", "gate", "result"].forEach(function (id) { var n = $(id); if (n) { n.hidden = (id !== which); } });
  }

  /* ========== 書く画面 ========== */
  var cv = $("cv"), pad = $("pad"), ctx = cv ? cv.getContext("2d") : null;
  var side = 0, active = null;

  function inkColor() {
    try { return getComputedStyle(document.body).color || "#171b21"; } catch (e) { return "#171b21"; }
  }
  function resize() {
    if (!cv || !pad) { return; }
    var r = pad.getBoundingClientRect();
    var s = Math.max(120, Math.round(r.width));
    var dpr = window.devicePixelRatio || 1;
    side = s;
    cv.width = Math.round(s * dpr);
    cv.height = Math.round(s * dpr);
    cv.style.width = s + "px";
    cv.style.height = s + "px";
    if (ctx) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    redraw();
  }
  function drawStroke(st) {
    var p = st.points;
    if (!ctx || !p.length) { return; }
    ctx.beginPath();
    ctx.moveTo(p[0].x * side, p[0].y * side);
    if (p.length === 1) { ctx.lineTo(p[0].x * side + 0.01, p[0].y * side + 0.01); }
    for (var i = 1; i < p.length; i++) { ctx.lineTo(p[i].x * side, p[i].y * side); }
    ctx.stroke();
  }
  function redraw() {
    if (!ctx) { return; }
    ctx.clearRect(0, 0, side, side);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    /* 表示の線幅も、解析の接筆判定と同じ比（一辺の2.2%）にします。見た目と判定がずれないように。 */
    ctx.lineWidth = Math.max(3, side * 0.022);
    ctx.strokeStyle = inkColor();
    S.strokes.forEach(drawStroke);
    if (active) { drawStroke(active.stroke); }
    updateButtons();
  }
  function updateButtons() {
    var has = S.strokes.length > 0;
    if ($("w-undo")) { $("w-undo").disabled = !has; }
    if ($("w-clear")) { $("w-clear").disabled = !has; }
    if ($("w-done")) { $("w-done").disabled = !has; }
  }
  function localPoint(ev) {
    var r = cv.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / side, y: (ev.clientY - r.top) / side, t: ev.timeStamp };
  }
  function problem(msg) {
    var n = $("w-problem");
    if (n) { n.textContent = msg || ""; n.hidden = !msg; }
  }

  if (cv) {
    cv.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) { return; }
      /* 2本目の指は無視します。1本目の線だけを書いた線として扱います。 */
      if (active) { e.preventDefault(); return; }
      problem("");
      active = { id: e.pointerId, stroke: { points: [localPoint(e)] } };
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
      redraw();
    });
    cv.addEventListener("pointermove", function (e) {
      if (!active || e.pointerId !== active.id) { return; }
      var list = (typeof e.getCoalescedEvents === "function") ? e.getCoalescedEvents() : null;
      if (!list || !list.length) { list = [e]; }
      for (var i = 0; i < list.length; i++) { active.stroke.points.push(localPoint(list[i])); }
      e.preventDefault();
      redraw();
    });
    cv.addEventListener("pointerup", function (e) {
      if (!active || e.pointerId !== active.id) { return; }
      /* 指を離した時刻を最後の点として持ちます。止めてから離したか（とめ）を測るのに使います。 */
      active.stroke.points.push(localPoint(e));
      S.strokes.push(active.stroke);
      active = null;
      redraw();
    });
    cv.addEventListener("pointercancel", function (e) {
      if (!active || e.pointerId !== active.id) { return; }
      /* 画面の操作（戻る・更新など）に指を取られた画は、書いた線として扱わず捨てます。 */
      active = null;
      S.cancels++;
      problem(WR.problems && WR.problems.cancelled);
      if (S.cancels >= 2 && $("w-inapp")) { $("w-inapp").hidden = false; }
      redraw();
    });
    /* 古い WebKit や、アプリ側のスワイプ判定に指を取られないよう、既定の動作も止めます。 */
    cv.addEventListener("touchstart", function (e) { e.preventDefault(); }, { passive: false });
    cv.addEventListener("touchmove", function (e) { e.preventDefault(); }, { passive: false });
    if (typeof window.ResizeObserver === "function") { new window.ResizeObserver(resize).observe(pad); }
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", function () { setTimeout(resize, 60); });
  }

  Y.on("w-undo", function () { S.strokes.pop(); problem(""); redraw(); });
  Y.on("w-clear", function () { S.strokes = []; problem(""); redraw(); });
  Y.on("w-done", function () {
    var a = analyzeCurrent();
    if (!a) { return; }
    if (!a.ok) {
      var msgs = (a.problems || []).map(function (c) { return (WR.problems || {})[c]; }).filter(Boolean);
      problem(msgs.slice(0, 2).join(" ") || (WR.problems && WR.problems.tooFewStrokes));
      return;
    }
    if (S.pass === 2) { S.a2 = a; S.s2 = S.strokes.slice(); }
    else { S.a1 = a; S.s1 = S.strokes.slice(); S.a2 = null; S.s2 = null; }
    S.strokes = [];
    if (S.qualify < 0) { nv.nav("#/gate"); }
    else { showOwnResult(); }
  });

  function analyzeCurrent() {
    var scaled = S.strokes.map(function (st) {
      return { points: st.points.map(function (p) { return { x: p.x * ANALYSIS_SIDE, y: p.y * ANALYSIS_SIDE, t: p.t }; }) };
    });
    try { return HW.analyze(scaled, { side: ANALYSIS_SIDE }); }
    catch (e) {
      problem(WR.problems && WR.problems.tooFewStrokes);
      return null;
    }
  }

  function showWrite(pass) {
    S.pass = pass;
    S.strokes = [];
    active = null;
    Y.setText("w-heading", pass === 2 ? (WR.secondHeading || WR.heading) : WR.heading);
    problem("");
    screen("write");
    window.scrollTo(0, 0);
    resize();
    /* 枠を画面の中央へ。ページ最上部のまま書き始めると、下向きの画でアプリの「引っ張って更新」が
       反応することがあるためです。 */
    try { pad.scrollIntoView({ block: "center" }); } catch (e) {}
    try { $("w-heading").focus({ preventScroll: true }); } catch (e) {}
  }

  if (!Y.caps.pointer) {
    /* Pointer Events が無い古い環境では、手書きの精度が保てないため10問版へ案内します。 */
    if ($("w-nopointer")) { $("w-nopointer").hidden = false; }
    if ($("pad-wrap")) { $("pad-wrap").hidden = true; }
  }

  /* ========== 属性設問（書いたあとに1問だけ。結果には影響しません） ========== */
  function renderGate() {
    Y.setText("g-scene", GT.scene || C.qualify.scene);
    Y.setText("g-text", GT.text || C.qualify.text);
    Y.setText("g-note", GT.note);
    var host = $("g-opts");
    host.innerHTML = "";
    C.qualify.options.forEach(function (opt, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "opt";
      b.textContent = opt.label;
      b.setAttribute("data-mark", String(i + 1));
      b.addEventListener("click", function () {
        S.qualify = i;
        showOwnResult();
      });
      host.appendChild(b);
    });
    screen("gate");
    try { $("g-text").focus({ preventScroll: true }); } catch (e) {}
    window.scrollTo(0, 0);
  }

  /* ========== 採点と結果 ========== */
  function currentFeats() {
    if (S.a1 && S.a2) { return HW.average(S.a1.feats, S.a2.feats); }
    return S.a1 ? S.a1.feats : null;
  }
  function showOwnResult() {
    var feats = currentFeats();
    if (!feats) { nv.nav("#/write"); return; }
    var scored = HW.score(feats, CAL);
    var code = HW.encodeShare(scored, feats);
    var prev = readLast();
    S.current = { code: code, key: scored.key, scored: scored, feats: feats, prevKey: prev && prev.k !== scored.key ? prev.k : null };
    Y.store.set(LKEY, JSON.stringify({ k: scored.key, t: Date.now() }));
    nv.nav("#/r/" + code);
  }
  function readLast() {
    var raw = Y.store.get(LKEY);
    if (!raw) { return null; }
    try {
      var o = JSON.parse(raw);
      if (o && Y.typeOf(o.k) && o.t && (Date.now() - o.t) < 30 * 24 * 3600 * 1000) { return o; }
    } catch (e) {}
    return null;
  }

  /* 測定値の差し込み語。文言側はこの中から必要なものだけを使います。 */
  function tokensFor(fk, feats) {
    var v = feats[fk];
    var cf = (CAL && CAL.features && CAL.features[fk]) || {};
    var med = typeof cf.median === "number" ? cf.median : null;
    var num = (typeof v === "number") ? v : (v && typeof v.ratio === "number" ? v.ratio : (v && typeof v.v === "number" ? v.v : null));
    function r1(x) { return x == null ? "" : String(Math.round(x * 10) / 10); }
    function pct(x) { return x == null ? "" : String(Math.round(x * 100)); }
    function signed(x) { return x == null ? "" : (x > 0 ? "+" : (x < 0 ? "−" : "±")) + String(Math.abs(Math.round(x * 10) / 10)); }
    return {
      v: r1(num), pct: pct(num), med: r1(med), medPct: pct(med),
      deg: signed(num), absdeg: r1(num == null ? null : Math.abs(num)), ms: num == null ? "" : String(Math.round(num)),
      medMs: med == null ? "" : String(Math.round(med)),
      count: num == null ? "" : String(Math.round(num)), ratio: r1(num),
      state: v && v.state ? v.state : "", dir: (num != null && med != null) ? (num > med ? "high" : (num < med ? "low" : "mid")) : "mid"
    };
  }
  function measureLine(fk, feats) {
    var def = FT[fk] || {};
    var v = feats[fk];
    var tk = tokensFor(fk, feats);
    var m = def.measure;
    if (m && typeof m === "object") {
      m = (v && v.state && m[v.state]) || m[tk.dir] || m["default"] || "";
    }
    return fill(m, tk);
  }
  function readingLine(fk, feats) {
    var def = FT[fk] || {};
    var rd = def.reading;
    var v = feats[fk];
    if (rd && typeof rd === "object") {
      var tk = tokensFor(fk, feats);
      rd = (v && v.state && rd[v.state]) || rd[tk.dir] || rd["default"] || "";
    }
    return rd || "";
  }
  function featureAvailable(fk, feats) {
    var v = feats[fk];
    if (v == null) { return false; }
    if (typeof v === "object" && "state" in v && v.state == null) { return false; }
    return true;
  }
  var USED = ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8"];
  var REF = ["f9", "f10", "f11", "f12", "f13"];

  function measureRows(list, feats, label) {
    return list.filter(function (fk) { return FT[fk] && featureAvailable(fk, feats); }).map(function (fk) {
      return '<li class="m-row" data-f="' + fk + '">' +
        '<p class="m-name">' + esc(FT[fk].name) + ' <span class="m-use">' + esc(label) + "</span></p>" +
        '<p class="m-val">' + esc(measureLine(fk, feats)) + "</p>" +
        '<p class="m-read">' + esc(readingLine(fk, feats)) + "</p>" +
      "</li>";
    }).join("");
  }

  /* 本人の字を、正規化座標から描き直します。画像として外に出すことはありません。 */
  function strokesSvg(strokes, marks) {
    var W = 300;
    var paths = (strokes || []).map(function (st, i) {
      var d = st.points.map(function (p, j) {
        return (j ? "L" : "M") + (Math.round(p.x * W * 10) / 10) + " " + (Math.round(p.y * W * 10) / 10);
      }).join("");
      return '<path class="ink" pathLength="1" d="' + d + '" style="animation-delay:' + (i * 0.16).toFixed(2) + 's"/>';
    }).join("");
    var mk = "";
    var circ = function (pt, cls) {
      if (!pt || pt.length < 2) { return ""; }
      return '<circle class="mk ' + cls + '" cx="' + (pt[0] * W).toFixed(1) + '" cy="' + (pt[1] * W).toFixed(1) + '" r="11"/>';
    };
    if (marks) {
      if (marks.gap) {
        mk += '<rect class="mk mk-gap" x="' + (marks.gap.x0 * W).toFixed(1) + '" y="' + (marks.gap.y0 * W).toFixed(1) +
          '" width="' + Math.max(2, (marks.gap.x1 - marks.gap.x0) * W).toFixed(1) + '" height="' + ((marks.gap.y1 - marks.gap.y0) * W).toFixed(1) + '"/>';
      }
      mk += circ(marks.kouUL, "mk-ul") + circ(marks.kouLL, "mk-ll") + circ(marks.kouLR, "mk-lr");
      if (marks.slant && marks.slant.length === 2) {
        mk += '<line class="mk mk-slant" x1="' + (marks.slant[0][0] * W).toFixed(1) + '" y1="' + (marks.slant[0][1] * W).toFixed(1) +
          '" x2="' + (marks.slant[1][0] * W).toFixed(1) + '" y2="' + (marks.slant[1][1] * W).toFixed(1) + '"/>';
      }
      (marks.stops || []).forEach(function (s) {
        mk += '<circle class="mk ' + (s.stop ? "mk-stop" : "mk-flow") + '" cx="' + (s.x * W).toFixed(1) + '" cy="' + (s.y * W).toFixed(1) + '" r="4"/>';
      });
    }
    return '<svg class="yui-ink" viewBox="0 0 ' + W + " " + W + '" role="img" aria-label="' + esc(RS.panelAria || "あなたが書いた「結」") + '">' +
      '<rect x="30" y="30" width="240" height="240" class="guide"/>' + paths + mk + "</svg>";
  }

  function usedNames(scored) {
    var names = (scored.used || []).map(function (fk) { return FT[fk] ? FT[fk].name : null; }).filter(Boolean);
    return names.join("／");
  }

  function mapPoint(scored) {
    var cx = (CAL && CAL.center) ? CAL.center.x : 0, cy = (CAL && CAL.center) ? CAL.center.y : 0;
    /* 軸の値はおおむね -1〜1。境界の近さが見えるよう、そのまま百分率に写します。 */
    return { X: Math.round(Y.clamp((scored.x - cx) * 100, -100, 100)), Y: Math.round(Y.clamp((scored.y - cy) * 100, -100, 100)) };
  }
  function approxPoint(key, lean) {
    var sx = (key === "kyomei" || key === "chokkan") ? 1 : -1;
    var sy = (key === "suishin" || key === "chokkan") ? 1 : -1;
    return { X: sx * (lean && lean.x ? 12 : 45), Y: sy * (lean && lean.y ? 12 : 45) };
  }

  function typeLabel(t, scored) {
    if (scored && scored.lean && scored.lean.toward) {
      var to = Y.typeOf(scored.lean.toward);
      if (to && RS.leanTemplate) { return fill(RS.leanTemplate, { type: t.name, toward: to.name }); }
    }
    return t.name;
  }

  /* 共有・再読み込み用の短い値から、表示できる測定値だけを文にします。 */
  function sharedMeasureRows(dec) {
    var rows = "";
    (dec.items || []).forEach(function (it) {
      var fk = it.feature;
      if (!FT[fk]) { return; }
      var fake = {};
      if (it.state) { fake[fk] = { state: it.state }; }
      else { fake[fk] = it.value; }
      rows += '<li class="m-row" data-f="' + fk + '">' +
        '<p class="m-name">' + esc(FT[fk].name) + "</p>" +
        '<p class="m-val">' + esc(measureLine(fk, fake)) + "</p>" +
        '<p class="m-read">' + esc(readingLine(fk, fake)) + "</p></li>";
    });
    return rows;
  }

  function render(view) {
    /* view: {src:"self"|"reload"|"shared", key, scored?, feats?, marks?, strokes?, dec?} */
    var t = Y.typeOf(view.key);
    if (!t) { nv.replaceHash("#/"); screen("intro"); return; }
    var host = $("result");
    Y.applyTypeColor(host, t);
    var scored = view.scored || (view.dec ? { key: view.key, lean: view.dec.lean, highlight: view.dec.highlight, used: USED } : null);
    var feats = view.feats || null;
    var pt = feats ? mapPoint(scored) : approxPoint(view.key, scored && scored.lean);
    var label = typeLabel(t, scored);
    var hl = scored && scored.highlight;
    var theme = hl && TH[hl.element] ? TH[hl.element][hl.sign >= 0 ? "pos" : "neg"] : null;
    var measure1 = "", measure2 = "";

    var sharedBar = view.src === "shared"
      ? '<div class="shared-bar"><p>' + esc(RS.sharedBanner || C.share.sharedBanner) + "</p>" +
        '<button class="btn" id="own" type="button">' + esc(RS.sharedBannerButton || IN.startButton) + "</button></div>"
      : "";

    var panel;
    if (feats && view.strokes) {
      var rowsUsed = measureRows(USED, feats, RS.usedLabel || "タイプ判定に使用");
      var rowsRef = measureRows(REF, feats, RS.refLabel || "参考表示のみ");
      measure1 = hl && FT[hl.feature] ? FT[hl.feature].name + "：" + measureLine(hl.feature, feats) : "";
      measure2 = FT.f1 && featureAvailable("f1", feats) ? FT.f1.name + "：" + measureLine("f1", feats) : "";
      panel =
        '<div class="ink-panel">' +
          '<h2 class="sec">' + esc(RS.panelTitle) + "</h2>" +
          '<div class="ink-wrap">' + strokesSvg(view.strokes, view.marks) + "</div>" +
          '<p class="note">' + esc(RS.panelNote) + "</p>" +
          '<ul class="m-list">' + rowsUsed + "</ul>" +
          (rowsRef ? '<details class="m-more"><summary>' + esc(RS.refSummary || "参考として測ったところ") + '</summary><ul class="m-list">' + rowsRef + "</ul></details>" : "") +
          (RS.calibrationNote ? '<p class="note">' + esc(RS.calibrationNote) + "</p>" : "") +
        "</div>";
    } else {
      var rows = view.dec ? sharedMeasureRows(view.dec) : "";
      panel =
        '<div class="ink-panel">' +
          '<h2 class="sec">' + esc(RS.panelTitle) + "</h2>" +
          '<p class="note">' + esc(RS.sharedPanelNote) + "</p>" +
          (rows ? '<ul class="m-list">' + rows + "</ul>" : "") +
        "</div>";
      if (view.dec && view.dec.items && view.dec.items.length) {
        var it0 = view.dec.items[0], f0 = {};
        f0[it0.feature] = it0.state ? { state: it0.state } : it0.value;
        measure1 = FT[it0.feature] ? FT[it0.feature].name + "：" + measureLine(it0.feature, f0) : "";
      }
    }

    var changed = (view.src === "self" && S.current && S.current.prevKey && Y.typeOf(S.current.prevKey))
      ? '<p class="changed-note">' + esc(fill(RS.changedTemplate, { prev: Y.typeOf(S.current.prevKey).name, now: t.name })) + "</p>"
      : "";

    var highlight = (hl && FT[hl.feature] && theme)
      ? '<div class="hl">' +
          '<h2 class="sec">' + esc(RS.highlightHeading) + "</h2>" +
          '<p class="hl-feature">' + esc(FT[hl.feature].name) + (feats ? "　" + esc(measureLine(hl.feature, feats)) : "") + "</p>" +
          '<h3 class="sub3">' + esc(RS.liveHeading) + "</h3><p>" + esc(theme.live) + "</p>" +
          '<h3 class="sub3">' + esc(RS.themeHeading) + "</h3><p>" + esc(theme.next) + "</p>" +
        "</div>"
      : "";

    var shareText = fill(C.share.textTemplate, { type: t.name, m1: measure1, m2: measure2 }).replace(/\s*[／/]\s*$/, "");
    var typeUrl = Y.siteBase() + "/t/" + Y.safeKey(t.key) + ".html";
    var share = Y.shareBlock({ text: shareText, url: typeUrl });
    var cta = Y.ctaBlocks({
      t: t,
      src: view.src,
      biz: view.src === "self" && S.qualify >= 0 ? !!C.qualify.options[S.qualify].biz : (view.src === "shared" ? false : null),
      commentLine: t.name + "でした",
      dmLine: fill(C.cta.dmLineTemplate || "{type}と出ました。無料相談の話を聞かせてください。", { type: t.name })
    });

    var second = (view.src === "self" && S.a1 && !S.a2)
      ? '<div class="second"><p>' + esc(WR.secondPrompt) + "</p>" +
        '<button class="btn btn-ghost" id="write-2" type="button">' + esc(WR.secondYes) + "</button></div>"
      : "";
    var saveImg = (view.src === "self" && view.strokes)
      ? '<div class="save-img"><button class="btn btn-ghost" id="save-img" type="button">' + esc(RS.saveImage) + "</button>" +
        '<p class="note">' + esc(RS.saveImageNote) + '</p><div id="save-img-host"></div></div>'
      : "";

    host.innerHTML = sharedBar +
      '<p class="kicker">' + esc(RS.kicker) + "</p>" +
      Y.typeHeader(t, { label: label }) +
      '<p class="r07">' + esc(fill(RS.r07Template, { features: usedNames(scored) || "" })) + "</p>" +
      '<p class="r08">' + esc(RS.r08) + "</p>" +
      changed +
      panel +
      '<div class="map-wrap">' + Y.axisMap(pt.X, pt.Y, t.key, {
        aria: RS.mapAria, top: RS.mapAxes && RS.mapAxes.top, bottom: RS.mapAxes && RS.mapAxes.bottom,
        left: RS.mapAxes && RS.mapAxes.left, right: RS.mapAxes && RS.mapAxes.right }) + "</div>" +
      cta.html.comment +
      highlight +
      (t.live ? '<h2 class="sec">' + esc(RS.liveHeading) + "</h2><p>" + esc(t.live) + "</p>" : "") +
      Y.typeSections(t) +
      '<p class="not-used">' + esc(RS.notUsed) + "</p>" +
      second +
      share.html +
      saveImg +
      cta.html.biz + cta.html.line +
      '<div class="again">' +
        '<button class="btn" id="retake" type="button">' + esc(RS.retake) + "</button>" +
        '<a class="btn btn-ghost" id="to-quiz" href="q.html">' + esc(RS.toQuiz) + "</a>" +
      "</div>" +
      '<p class="about-link"><a href="about.html">' + esc(RS.aboutLink) + "</a></p>";

    screen("result");
    host.classList.remove("fade");
    void host.offsetWidth;
    host.classList.add("fade");
    window.scrollTo(0, 0);
    try { $("r-name").focus({ preventScroll: true }); } catch (e) {}
    document.title = t.name + " ｜「結」の書き方診断";

    cta.bind();
    share.bind();
    Y.on("retake", function () { restart(); });
    Y.on("own", function () { restart(); });
    Y.on("write-2", function () { nv.nav("#/write2"); });
    Y.on("save-img", function () { makeImage(t, view.strokes, [measure1, measure2]); });
  }

  /* 画像は、本人がボタンを押したときだけ、この端末の中で作ります。 */
  function makeImage(t, strokes, lines) {
    var hostEl = $("save-img-host");
    if (!hostEl) { return; }
    var W = 1080, Hh = 1350;
    var c = document.createElement("canvas");
    c.width = W; c.height = Hh;
    var g = c.getContext("2d");
    if (!g) { return; }
    var paper = "#f7f4ee", ink = "#171b21", accent = Y.safeHex(t.color, "#c8453c");
    g.fillStyle = paper; g.fillRect(0, 0, W, Hh);
    g.strokeStyle = "rgba(23,27,33,.18)"; g.setLineDash([10, 12]); g.lineWidth = 3;
    g.strokeRect(190, 150, 700, 700);
    g.setLineDash([]);
    g.strokeStyle = ink; g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = 22;
    (strokes || []).forEach(function (st) {
      var p = st.points; if (!p.length) { return; }
      g.beginPath();
      g.moveTo(190 + p[0].x * 700, 150 + p[0].y * 700);
      for (var i = 1; i < p.length; i++) { g.lineTo(190 + p[i].x * 700, 150 + p[i].y * 700); }
      g.stroke();
    });
    g.fillStyle = accent;
    g.font = "700 76px 'Hiragino Mincho ProN','Yu Mincho',serif";
    g.textAlign = "center";
    g.fillText(t.name, W / 2, 985);
    g.fillStyle = "#454b56";
    g.font = "400 34px 'Hiragino Sans','Noto Sans JP',sans-serif";
    lines.filter(Boolean).slice(0, 2).forEach(function (l, i) { g.fillText(String(l).slice(0, 30), W / 2, 1060 + i * 52); });
    g.fillStyle = "#666e7c";
    g.font = "400 28px 'Hiragino Sans','Noto Sans JP',sans-serif";
    g.fillText("「結」の書き方診断 ／ 結婚相談所AGOEN", W / 2, 1270);
    var url = "";
    try { url = c.toDataURL("image/png"); } catch (e) { url = ""; }
    if (!url) { return; }
    hostEl.innerHTML = '<img class="save-img-out" alt="' + esc(t.name + "の画像") + '" src="' + url + '">';
  }

  function restart() {
    S.a1 = S.a2 = S.s1 = S.s2 = null;
    S.current = null;
    S.strokes = [];
    nv.go("#/write");
  }

  /* ========== ルーティング ========== */
  function route() {
    var h = location.hash || "";
    if (h === "#/write") { showWrite(1); return; }
    if (h === "#/write2") { if (S.a1) { showWrite(2); } else { nv.nav("#/write"); } return; }
    if (h === "#/gate") { if (S.a1) { renderGate(); } else { nv.nav("#/write"); } return; }
    var m = h.match(/^#\/r\/([A-Za-z0-9._~-]{1,64})$/);
    if (m) {
      var code = m[1];
      if (S.current && S.current.code === code) {
        var a = S.a2 || S.a1;
        render({ src: "self", key: S.current.key, scored: S.current.scored, feats: S.current.feats,
                 strokes: S.a2 ? S.s2 : S.s1, marks: a ? a.marks : null });
        return;
      }
      var dec = null;
      try { dec = HW.decodeShare(code); } catch (e) { dec = null; }
      if (!dec || !Y.typeOf(dec.key)) { nv.replaceHash("#/"); screen("intro"); return; }
      var last = readLast();
      render({ src: (last && last.k === dec.key) ? "reload" : "shared", key: dec.key, dec: dec });
      return;
    }
    screen("intro");
    document.title = (C.title || "「結」の書き方診断") + " ｜ " + (IN.catch || "");
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);

  function onStart() { S.strokes = []; nv.go("#/write"); }
  Y.on("start", onStart);
  Y.on("start2", onStart);
  Y.on("g-back", function () { nv.nav("#/write"); });

  route();
})();
