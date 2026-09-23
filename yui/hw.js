/* =========================================================================
 * 「結」の書き方診断 — 手書きの画面（index.html）
 *
 * 原案：スマホの画面に指で「結」を一文字書き、その書き方から婚活のタイプを出す。
 * この原案から二度外れた経緯があるため（文章の締めの診断 → 10問の設問式）、
 * ここを設問式に置き換えないでください。書かずに受けたい方のための10問版は q.html にあります。
 *
 * 書いた線はこのページのメモリの中だけで扱い、外へは送りません（CSP で通信自体を止めています）。
 * 端末に残すのは、前回の型の名前と保存した時刻だけです（yui.hw.last）。
 * 文言の置き場所と出し分けの決まりは content.js（YUI_HW_COPY の section 4・5・6・9）にあります。
 * ========================================================================= */
(function () {
  "use strict";

  var Y = window.YUI, HW = window.YUI_HW;
  if (!Y || !HW || !document.getElementById("intro")) { return; }
  var C = Y.C, $ = Y.$, esc = Y.esc, fill = Y.fill;
  var H = C.hw || {}, IN = H.intro || {}, WR = H.write || {}, GT = H.gate || {}, RS = H.result || {};
  var FT = H.features || {}, TH = H.themes || {}, TD = H.themeDirection || {}, CO = H.collect || {};
  var SH = C.share || {};
  var CAL = C.calibration;
  var LKEY = "yui.hw.last";
  /* 解析に渡す座標系。線は枠の一辺を1とした値で持ち、解析のときだけこの大きさに引き伸ばします
     （解析側も一辺で割り戻すので値は変わりません。画面の回転や大きさに左右されないため）。 */
  var ANALYSIS_SIDE = 1000;
  var COLLECT = /[?&]collect=1(?:&|$)/.test(location.search || "");

  /* お手本の縦横比と、士の縦画の突き出し。f7・f13 はお手本との差で返ってくるので、
     画面では、お手本の値を足して「高さ÷幅」「突き出しの%」に戻して見せます。 */
  var TPL = (function () {
    if (typeof HW.TPL_RATIO === "number" && typeof HW.TPL_F13 === "number") { return { ratio: HW.TPL_RATIO, f13: HW.TPL_F13 }; }
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    (HW.TEMPLATE || []).forEach(function (st) {
      st.pts.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    });
    var ratio = (x1 > x0) ? (y1 - y0) / (x1 - x0) : 1;
    function st(n) { for (var i = 0; i < HW.TEMPLATE.length; i++) { if (HW.TEMPLATE[i].n === n) { return HW.TEMPLATE[i].pts; } } return null; }
    var s7 = st(7), s8 = st(8), s9 = st(9), f13 = 0;
    if (s7 && s8 && s9) {
      var top8 = Math.min.apply(null, s8.map(function (p) { return p[1]; }));
      var y7 = (s7[0][1] + s7[s7.length - 1][1]) / 2, y9 = (s9[0][1] + s9[s9.length - 1][1]) / 2;
      f13 = (y9 - y7) ? (y7 - top8) / (y9 - y7) : 0;
    }
    return { ratio: ratio, f13: f13 };
  })();

  /* ========== 状態（すべてメモリの中だけ） ========== */
  var S = {
    pass: 1,
    strokes: [],      /* 書いている最中の線 [{points:[{x,y,t}]}]（0〜1の正規化座標） */
    a1: null, a2: null, s1: null, s2: null,
    qualify: -1,
    current: null,
    cancels: 0
  };
  var nv = Y.makeNav(route);

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
    /* 実際の枠の幅に合わせます（下限で広げると、拡大表示のときに枠からはみ出します）。 */
    var s = Math.max(40, Math.round(r.width));
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
    ctx.lineWidth = Math.max(3, side * (HW.LW || 0.022));
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
  /* 案内の欄は常に読み上げの対象に置いたまま、中身だけを入れ替えます。表示と同時に中身が入った
     aria-live の欄は、読み上げられないことがあるためです。空のときは CSS で高さを 0 にします。 */
  function problem(msg) {
    var n = $("w-problem");
    if (n) { n.hidden = false; n.textContent = msg || ""; }
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
      /* 指を離した位置と時刻を最後の点にします。止めてから離したか（とめ）を測るのに使います。 */
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
      if (S.cancels >= 2) { showInappHint(); }
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
    if (!a || !a.ok) {
      var P = WR.problems || {};
      var codes = a && a.problems && a.problems.length ? a.problems : ["noMatch"];
      /* 知らない理由コードでも、同じ「もう一度」の案内を出します（エンジンの約束）。 */
      var msgs = codes.map(function (c) { return P[c] || P.noMatch || P.tooFewStrokes; }).filter(Boolean);
      var uniq = [];
      msgs.forEach(function (m) { if (uniq.indexOf(m) < 0) { uniq.push(m); } });
      problem(uniq.slice(0, 2).join(" "));
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
    /* とめの印（marks.stops）は、較正の f5 の中央値をしきい値にします。渡さないとエンジン既定の STOP_MS になり、
       f5 の行の「止めてから離した画」の数が、同じ行の中央値と食い違います。 */
    try { return HW.analyze(scaled, { side: ANALYSIS_SIDE, cal: CAL }); }
    catch (e) { return null; }
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
    /* 画面は上端から見せます。枠を中央へ送ると、枠の直上に置いた R06（書かずに診断）と R03・R04 が
       画面の外へ押し出されるためです。「引っ張って更新」は、枠の touch-action:none と touchstart の
       preventDefault、body の overscroll-behavior で止めています。 */
    try { $("w-heading").focus({ preventScroll: true }); } catch (e) {}
  }

  if (!Y.caps.pointer) {
    /* Pointer Events が無い古い環境では、書いた線を正しく測れないため10問版へ案内します。 */
    if ($("w-nopointer")) { $("w-nopointer").hidden = false; }
    /* 書けない画面で「書き順は自由」「何度でも書き直せます」や押せないボタンを並べないよう、書くための部品はまとめて隠します。 */
    ["pad-wrap", "w-r04", "w-size", "w-r05", "w-btns", "w-done"].forEach(function (id) { if ($(id)) { $(id).hidden = true; } });
  }

  /* ========== 属性設問（書いたあとに1問だけ。型には影響しません） ========== */
  function renderGate() {
    Y.setText("g-scene", GT.scene || C.qualify.scene);
    Y.setText("g-text", GT.text || C.qualify.text);
    var host = $("g-opts");
    host.innerHTML = "";
    C.qualify.options.forEach(function (opt, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "opt";
      b.textContent = opt.label;
      b.setAttribute("data-mark", String(i + 1));
      b.addEventListener("click", function () { S.qualify = i; showOwnResult(); });
      host.appendChild(b);
    });
    screen("gate");
    try { $("g-text").focus({ preventScroll: true }); } catch (e) {}
    window.scrollTo(0, 0);
  }

  /* ========== 採点 ========== */
  function currentFeats() {
    if (S.a1 && S.a2) { return HW.average(S.a1.feats, S.a2.feats); }
    return S.a1 ? S.a1.feats : null;
  }
  function drawnMarks() { var a = S.a2 || S.a1; return a ? a.marks : null; }
  function showOwnResult() {
    var feats = currentFeats();
    var scored = feats ? HW.score(feats, CAL) : null;
    if (!scored) { nv.nav("#/write"); return; }
    var code = HW.encodeShare(scored, feats, drawnMarks());
    /* 前回との比較は、今回1回目を書く前に端末にあった結果と比べます。2回目のあとに readLast() を読むと、
       数秒前の1回目の結果と比べてしまうためです。 */
    if (!S.a2) { S.sessionPrev = readLast(); }
    var prev = S.sessionPrev || null;
    S.current = { code: code, key: scored.key, scored: scored, feats: feats,
                  prevKey: prev && prev.k !== scored.key ? prev.k : null };
    Y.store.set(LKEY, JSON.stringify({ k: scored.key, t: Date.now() }));
    /* 結果のアドレスに入れられない組み合わせのときも、画面は出します（共有のリンクはタイプ別ページを指すため）。 */
    nv.nav("#/r/" + (code || "self"));
  }
  function readLast() {
    var raw = Y.store.get(LKEY);
    if (!raw) { return null; }
    try {
      var o = JSON.parse(raw);
      if (o && Y.typeOf(o.k) && o.t && (Date.now() - o.t) >= 0 && (Date.now() - o.t) < 30 * 24 * 3600 * 1000) { return o; }
    } catch (e) {}
    return null;
  }

  /* ========== 測定値の文面（content.js section 5 の表どおりに選ぶ） ========== */
  function cf(fk) { return (CAL && CAL.features && CAL.features[fk]) || {}; }
  function r1(x) { return (Math.round(x * 10) / 10).toFixed(1); }
  function r2(x) { return (Math.round(x * 100) / 100).toFixed(2); }
  function pct(x) { return String(Math.round(x * 100)); }
  function stopCounts(marks) {
    var st = (marks && marks.stops) || [], n = 0;
    for (var i = 0; i < st.length; i++) { if (st[i] && st[i].stop === true) { n++; } }
    return { stops: n, total: st.length };
  }
  /* ctx: {twoPass, marks} … 自分の結果（src "self"）のとき */
  /* 測れなかった特徴も行として残し、measure.none を出します（section 5）。シェア文・画像には使いません（brief は空）。 */
  function rowNone(fk) {
    var m = (FT[fk] && FT[fk].measure) || {};
    return m.none ? { fk: fk, measure: m.none, brief: "", none: true } : null;
  }
  function rowSelf(fk, feats, ctx) {
    var def = FT[fk];
    if (!def) { return null; }
    var v = feats[fk];
    if (v == null) { return rowNone(fk); }
    var m = def.measure || {}, b = def.brief || {}, key = null, tk = {};
    var med = cf(fk).median;
    switch (fk) {
      case "f1": case "f9": case "f10":
        if (!v.state) { return rowNone(fk); }
        tk.ratio = r2(v.ratio);
        key = (v.state === "closed" && tk.ratio === "0.00" && m.closedTouch) ? "closedTouch" : v.state;
        break;
      case "f2":
        tk.medPct = pct(med); tk.pct = pct(v); tk.absPct = pct(Math.abs(v));
        key = v < 0 ? "overlap" : "value";
        break;
      case "f3": case "f6":
        tk.v = r1(v); tk.med = r1(med); key = "value";
        break;
      case "f4":
        tk.count = String(v); key = v > 0 ? "joined" : "separate";
        break;
      case "f5":
        var sc = stopCounts(ctx.marks);
        if (!sc.total) { return rowNone(fk); }
        tk.stops = String(sc.stops); tk.total = String(sc.total);
        tk.ms = String(Math.round(v)); tk.medMs = String(Math.round(med));
        key = (sc.stops > 0 ? "value" : "valueNone") + (sc.total === 1 ? "1" : "") + (ctx.twoPass ? "Two" : "");
        return { fk: fk, measure: fill(m[key], tk), brief: fill(b[sc.stops > 0 ? "value" : "valueNone"], tk) };
      case "f7":
        tk.hw = r2(v + TPL.ratio); tk.medHw = r2(med + TPL.ratio);
        key = tk.hw === tk.medHw ? "even" : (parseFloat(tk.hw) > parseFloat(tk.medHw) ? "tall" : "wide");
        break;
      case "f8":
        tk.pct = pct(v); tk.medPct = pct(med); key = "value";
        break;
      case "f11":
        if (!v.state) { return null; }
        key = v.state;
        break;
      case "f12":
        tk.absdeg = String(Math.abs(Math.round(v * 2) / 2));
        key = Math.abs(v) <= 0.5 ? "flat" : (v > 0 ? "up" : "down");
        break;
      case "f13":
        var p = Math.round((v + TPL.f13) * 100);
        tk.protPct = String(p); tk.medProtPct = String(Math.round((med + TPL.f13) * 100));
        key = p <= 0 ? "flat" : "value";
        break;
      default:
        return null;
    }
    if (!m[key]) { return rowNone(fk); }
    return { fk: fk, measure: fill(m[key], tk), brief: fill(b[key] || "", tk) };
  }
  /* リンク・再読み込みの表示（書いた線も特徴量も無く、decodeShare の disp だけが分かるとき） */
  function rowLink(fk, dec) {
    var def = FT[fk];
    if (!def || !dec || !dec.disp) { return null; }
    var d = dec.disp, m = def.measure || {}, b = def.brief || {};
    if (fk === "f1" && d.f1) {
      return { fk: fk, measure: b[d.f1] || "", brief: b[d.f1] || "" };
    }
    if (fk === "f2" && d.f2 !== null && d.f2 !== undefined) {
      var tk = { pct: String(d.f2), absPct: String(Math.abs(d.f2)), medPct: pct(cf("f2").median) };
      var k = d.f2 < 0 ? "overlap" : "value";
      return { fk: fk, measure: fill(m[k], tk), brief: fill(b[k], tk) };
    }
    if (fk === "f5" && d.f5 !== null && d.f5 !== undefined) {
      var t5 = { stops: String(d.f5) };
      var k5 = d.f5 > 0 ? "link" : "linkNone";
      return { fk: fk, measure: fill(m[k5], t5), brief: fill(b[k5], t5) };
    }
    return null;
  }

  var USED = ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8"];
  var REF = ["f9", "f10", "f11", "f12", "f13"];
  function rowHtml(row, label) {
    var def = FT[row.fk];
    /* 並びは section 4 のとおり「測った事実 → 慣習の読み → 使い方のラベル」。測れなかった行には読みを付けません。 */
    return '<li class="m-row" data-f="' + row.fk + '">' +
      '<p class="m-name">' + esc(def.name) + "</p>" +
      '<p class="m-val">' + esc(row.measure) + "</p>" +
      (def.reading && !row.none ? '<p class="m-read">' + esc(def.reading) + "</p>" : "") +
      (label ? '<p class="m-use-line"><span class="m-use">' + esc(label) + "</span></p>" : "") +
    "</li>";
  }
  function shortOf(row) {
    if (!row || row.none || !row.brief) { return ""; }
    return fill(SH.measureTemplate || "{short}：{brief}", { short: FT[row.fk].short || FT[row.fk].name, brief: row.brief });
  }
  function joinMeasures(list, withEnd) {
    var xs = list.filter(function (s) { return !!s; });
    if (!xs.length) { return ""; }
    return xs.join(SH.measuresSeparator || "／") + (withEnd ? (SH.measuresEnd || "。") : "");
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
          '" width="' + Math.max(2, (marks.gap.x1 - marks.gap.x0) * W).toFixed(1) + '" height="' + Math.max(2, (marks.gap.y1 - marks.gap.y0) * W).toFixed(1) + '"/>';
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
    return '<svg class="yui-ink" viewBox="0 0 ' + W + " " + W + '" role="img" aria-label="' + esc(RS.panelAria || "") + '">' +
      '<rect x="30" y="30" width="240" height="240" class="guide"/>' + paths + mk + "</svg>";
  }

  function mapPoint(scored) {
    var sc = (CAL && CAL.axisScale) || { x: 0.5, y: 0.5 };
    var cx = (CAL && CAL.center) ? CAL.center.x : 0, cy = (CAL && CAL.center) ? CAL.center.y : 0;
    /* 中心からのずれを、軸のばらつき（axisScale）2つ分で端に届くよう写します。境目の近さが目で分かるように。 */
    return {
      X: Math.round(Y.clamp((scored.x - cx) / (2 * (sc.x || 0.5)) * 100, -100, 100)),
      Y: Math.round(Y.clamp((scored.y - cy) / (2 * (sc.y || 0.5)) * 100, -100, 100))
    };
  }
  function approxPoint(key, lean) {
    var sx = (key === "kyomei" || key === "chokkan") ? 1 : -1;
    var sy = (key === "suishin" || key === "chokkan") ? 1 : -1;
    return { X: sx * (lean && lean.x ? 12 : 45), Y: sy * (lean && lean.y ? 12 : 45) };
  }
  function isLean(l) { return !!(l && (l.x || l.y) && l.toward && Y.typeOf(l.toward)); }

  function themeFor(hl) {
    if (!hl) { return null; }
    var d = TD[hl.feature];
    if (!d || !TH[d.element]) { return null; }
    var th = TH[d.element][hl.sign > 0 ? d.high : d.low];
    return th ? { element: d.element, label: (RS.elements || {})[d.element] || d.element, live: th.live, next: th.next } : null;
  }

  /* ========== 結果 ========== */
  function render(view) {
    /* view: {src:"self"|"reload"|"shared", key, scored?, feats?, strokes?, marks?, dec?} */
    var t = Y.typeOf(view.key);
    if (!t) { nv.replaceHash("#/"); screen("intro"); return; }
    var self = view.src === "self", shared = view.src === "shared";
    var host = $("result");
    Y.applyTypeColor(host, t);
    var lean = self ? view.scored.lean : (view.dec ? view.dec.lean : null);
    var hl = self ? view.scored.highlight : (view.dec ? view.dec.highlight : null);
    var twoPass = self && !!(S.a1 && S.a2);
    var toward = isLean(lean) ? Y.typeOf(lean.toward) : null;
    var label = toward ? fill(RS.leanTemplate, { type: t.name, toward: toward.name }) : t.name;

    /* --- 測定値の行 --- */
    var rows = [], refRows = [], rowBy = {};
    if (self) {
      var rc = { twoPass: twoPass, marks: view.marks };
      USED.forEach(function (fk) { var r = rowSelf(fk, view.feats, rc); if (r) { rows.push(r); rowBy[fk] = r; } });
      REF.forEach(function (fk) { var r = rowSelf(fk, view.feats, rc); if (r) { refRows.push(r); rowBy[fk] = r; } });
    } else {
      ["f1", "f2", "f5"].forEach(function (fk) { var r = rowLink(fk, view.dec); if (r) { rows.push(r); rowBy[fk] = r; } });
    }

    /* --- R07：採点に実際に使った特徴の名前（リンク表示では使った特徴の記録が無いので Link 版） --- */
    var r07 = self
      ? fill(RS.r07Template, { features: (view.scored.used || []).map(function (fk) { return FT[fk] ? FT[fk].name : ""; }).filter(Boolean).join("／") })
      : RS.r07TemplateLink;

    /* --- いちばん特徴が出ていたところ --- */
    var theme = themeFor(hl), hlText = "";
    if (hl && theme && FT[hl.feature]) {
      var hlMeasure = null;
      if (self && rowBy[hl.feature] && !rowBy[hl.feature].none) { hlMeasure = rowBy[hl.feature].measure; }
      else if (!self) {
        if (hl.feature === "f2" || hl.feature === "f5") { hlMeasure = rowBy[hl.feature] ? rowBy[hl.feature].measure : null; }
        else if (hl.feature === "f9" || hl.feature === "f10") { hlMeasure = (FT[hl.feature].brief || {}).open || null; }
      }
      hlText = hlMeasure
        ? fill(RS.highlightTemplate, { feature: FT[hl.feature].name, measure: hlMeasure, element: theme.label })
        : fill(RS.highlightTemplateLink, { feature: FT[hl.feature].name, element: theme.label });
      /* 自分の結果で値を行に出せなかったときは、Link 版の「結果のリンクには…入っていません」が事実と違うので外します。 */
      if (self && !hlMeasure) { hlText = hlText.replace(/（結果のリンク[^）]*）/, ""); }
    }

    /* --- シェア文の測定値（m1＝いちばん特徴の行、m2＝口の左上） --- */
    var m1 = "", m2 = "";
    if (hl && hl.feature !== "f1") {
      if (self) { m1 = shortOf(rowBy[hl.feature]); }
      else if (hl.feature === "f2" || hl.feature === "f5") { m1 = shortOf(rowBy[hl.feature]); }
      else if (hl.feature === "f9" || hl.feature === "f10") { m1 = shortOf({ fk: hl.feature, brief: (FT[hl.feature].brief || {}).open }); }
    }
    m2 = shortOf(rowBy.f1);
    var measuresShare = joinMeasures([m1, m2], true);
    var measuresImage = joinMeasures([m1, m2], false);

    /* --- 組み立て（content.js section 4 の順序） --- */
    var parts = [];
    if (shared) {
      parts.push('<div class="shared-bar"><p>' + esc(RS.sharedBanner) + "</p>" +
        '<button class="btn" id="own" type="button">' + esc(RS.sharedBannerButton) + "</button>" +
        '<p class="alt-path"><a href="q.html">' + esc(IN.altLink) + "</a></p></div>");
    }
    parts.push('<p class="kicker">' + esc(shared ? RS.sharedKicker : RS.kicker) + "</p>");
    parts.push('<div class="r-head"><div class="seal" aria-hidden="true">結</div>' +
      '<div><h1 class="r-name" id="r-name" tabindex="-1">' + esc(label) + "</h1></div></div>");
    parts.push('<p class="r07">' + esc(r07) + "</p>");
    parts.push('<p class="r08">' + esc(RS.r08) + "</p>");
    parts.push('<p class="r-tag">' + esc(t.tagline) + "</p>");
    parts.push('<p class="r-catch">' + esc(t.catch) + "</p>");

    var calNote = (CAL && /^synthetic/.test(String(CAL.version || "")))
      ? RS.calibrationNote
      : fill(RS.medianSourceTemplate, { n: CAL && CAL.n, date: CAL && CAL.date });
    var panel = '<div class="ink-panel"><h2 class="sec">' + esc(shared ? RS.sharedPanelTitle : RS.panelTitle) + "</h2>";
    if (self) {
      panel += '<div class="ink-wrap">' + strokesSvg(view.strokes, view.marks) + "</div>" +
        '<p class="note">' + esc(RS.panelNote) + "</p>" +
        (twoPass ? '<p class="note">' + esc(RS.panelNoteTwoPass) + "</p>" : "") +
        (calNote ? '<p class="note cal-note">' + esc(calNote) + "</p>" : "") +
        '<ul class="m-list">' + rows.map(function (r) { return rowHtml(r, RS.usedLabel); }).join("") + "</ul>" +
        (refRows.length ? '<details class="m-more"><summary>' + esc(RS.refSummary) + '</summary><ul class="m-list">' +
          refRows.map(function (r) { return rowHtml(r, RS.refLabel); }).join("") + "</ul></details>" : "");
    } else {
      panel += '<p class="note">' + esc(shared ? RS.sharedPanelNote : RS.reloadPanelNote) + "</p>" +
        (rows.length && calNote ? '<p class="note cal-note">' + esc(calNote) + "</p>" : "") +
        (rows.length ? '<ul class="m-list">' + rows.map(function (r) { return rowHtml(r, ""); }).join("") + "</ul>" : "");
    }
    panel += "</div>";
    parts.push(panel);

    var pt = self ? mapPoint(view.scored) : approxPoint(view.key, lean);
    var ariaTpl = shared ? (toward ? RS.mapAriaLeanShared : RS.mapAriaShared) : (toward ? RS.mapAriaLean : RS.mapAria);
    parts.push('<div class="map-wrap">' + Y.axisMap(pt.X, pt.Y, t.key, {
      aria: fill(ariaTpl, { type: t.name, toward: toward ? toward.name : "" }),
      top: RS.mapAxes && RS.mapAxes.top, bottom: RS.mapAxes && RS.mapAxes.bottom,
      left: RS.mapAxes && RS.mapAxes.left, right: RS.mapAxes && RS.mapAxes.right }) + "</div>");
    /* 前回との比較は、点を描いたマップのすぐ下に置きます（「境界の近く」と書く文を、点の位置と並べて読めるように）。 */
    if (self && S.current && S.current.prevKey && Y.typeOf(S.current.prevKey)) {
      parts.push('<p class="changed-note">' + esc(fill(isLean(lean) ? RS.changedTemplate : RS.changedTemplateFar,
        { prev: Y.typeOf(S.current.prevKey).name, now: t.name })) + "</p>");
    }
    parts.push('<p class="not-used">' + esc(RS.notUsed) + "</p>");

    /* 婚活での生かし方 */
    var live = "";
    if (t.live) { live += '<h2 class="sec">' + esc(RS.liveHeading) + "</h2><p>" + esc(t.live) + "</p>"; }
    if (theme && hlText) {
      live += '<div class="hl"><h2 class="sec">' + esc(shared ? RS.sharedHighlightHeading : RS.highlightHeading) + "</h2>" +
        '<p class="hl-feature">' + esc(hlText) + "</p>" +
        "<p>" + esc(theme.live) + "</p>" +
        '<h3 class="sub3">' + esc(RS.themeHeading) + "</h3><p>" + esc(theme.next) + "</p></div>";
    }
    parts.push(live);
    parts.push(Y.typeSections(t, { basis: true }));

    var cta = Y.ctaBlocks({
      t: t, src: view.src, noComment: shared,
      biz: self && S.qualify >= 0 ? !!C.qualify.options[S.qualify].biz : (shared ? false : null),
      commentLine: t.name + "でした",
      dmLine: fill(C.cta.dmLineTemplate, { type: t.name })
    });
    parts.push(cta.html.comment + cta.html.biz + cta.html.line);

    var share = null;
    if (!shared) {
      share = Y.shareBlock({
        text: fill(SH.textTemplate, { type: t.name, measures: measuresShare }),
        url: Y.siteBase() + "/t/" + Y.safeKey(t.key) + ".html"
      });
      parts.push(share.html);
    }
    if (self && view.strokes) {
      parts.push('<div class="save-img"><button class="btn btn-ghost" id="save-img" type="button">' + esc(RS.saveImage) + "</button>" +
        '<p class="note">' + esc(RS.saveImageNote) + '</p><div id="save-img-host"></div></div>');
    }
    if (self && S.a1 && !S.a2) {
      parts.push('<div class="second"><p>' + esc(WR.secondPrompt) + "</p>" +
        '<button class="btn btn-ghost" id="write-2" type="button">' + esc(WR.secondYes) + "</button></div>");
    }
    parts.push('<div class="again">' +
      '<button class="btn" id="retake" type="button">' + esc(shared ? RS.sharedBannerButton : RS.retake) + "</button>" +
      '<a class="btn btn-ghost" id="to-quiz" href="q.html">' + esc(RS.toQuiz) + "</a>" +
      (!shared && readLast() ? '<button class="btn btn-ghost" id="forget" type="button">' + esc(RS.forgetPrevious) + "</button>" : "") +
    "</div>");
    parts.push('<p class="about-link"><a href="about.html">' + esc(RS.aboutLink) + "</a></p>");
    if (COLLECT && self) { parts.push(collectPanel(view)); }

    host.innerHTML = parts.join("");
    screen("result");
    host.classList.remove("fade");
    void host.offsetWidth;
    host.classList.add("fade");
    window.scrollTo(0, 0);
    try { $("r-name").focus({ preventScroll: true }); } catch (e) {}
    document.title = t.name + " ｜" + (C.title || "「結」の書き方診断");

    cta.bind();
    if (share) { share.bind(); }
    if (!shared) {
      try { history.replaceState({ yuiOwn: (S.current && S.current.code) || (location.hash || "").replace(/^#\/r\//, "") }, "", location.href); } catch (e) {}
    }
    Y.on("retake", restart);
    Y.on("own", function () { location.hash = ""; restart(); });
    Y.on("write-2", function () { nv.nav("#/write2"); });
    Y.on("forget", function () {
      Y.store.del(LKEY);
      Y.toast(RS.forgetDone);
      var b = $("forget");
      if (b && b.parentNode) { b.parentNode.removeChild(b); }
    });
    Y.on("save-img", function () { makeImage(t, view.strokes, measuresImage); });
    Y.on("collect-copy", function () { Y.copyText($("collect-json").textContent, CO.copied); });
  }

  /* 線が何度も途切れるときの案内。LINE のアプリ内ブラウザは openExternalBrowser=1 を付けると外部ブラウザで開き直せます。 */
  function showInappHint() {
    var box = $("w-inapp");
    if (!box) { return; }
    box.hidden = false;
    var wrap = $("w-line-ext-wrap"), a = $("w-line-ext");
    if (!wrap || !a || !Y.caps || Y.caps.inapp !== "line") { return; }
    var q = (location.search || "").replace(/^\?/, "").split("&").filter(function (kv) {
      return kv && kv.indexOf("openExternalBrowser=") !== 0;
    });
    q.push("openExternalBrowser=1");
    a.setAttribute("href", location.pathname + "?" + q.join("&"));
    wrap.hidden = false;
  }

  /* 較正モード（?collect=1 のときだけ）。特徴量の値だけを出します。線の座標や時刻は入れません。 */
  function collectPanel(view) {
    var data = {
      engine: HW.VERSION, twoPass: !!(S.a1 && S.a2), key: view.scored.key,
      x: Math.round(view.scored.x * 1000) / 1000, y: Math.round(view.scored.y * 1000) / 1000,
      writings: [S.a1, S.a2].filter(Boolean).map(function (a) { return { feats: a.feats, nStrokes: a.nStrokes }; })
    };
    return '<div class="collect cta"><h2>' + esc(CO.heading) + "</h2>" +
      "<p>" + esc(CO.consent) + "</p>" +
      '<p class="note">' + esc(CO.contents) + "</p>" +
      (CO.steps && CO.steps.length ? "<ol>" + CO.steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol>" : "") +
      (CO.attributes ? '<p class="note">' + esc(CO.attributes) + "</p>" : "") +
      '<pre class="collect-json" id="collect-json">' + esc(JSON.stringify(data)) + "</pre>" +
      '<button class="btn btn-ghost" id="collect-copy" type="button">' + esc(CO.copyButton) + "</button></div>";
  }

  /* 画像は、本人がボタンを押したときだけ、この端末の中で作ってページに置きます。
     アプリ内ブラウザではダウンロードを始められないので、保存は長押しで行ってもらいます。 */
  function makeImage(t, strokes, measures) {
    var hostEl = $("save-img-host");
    if (!hostEl) { return; }
    var TX = RS.saveImageText || {};
    var W = 1080, Hh = 1350;
    var c = document.createElement("canvas");
    c.width = W; c.height = Hh;
    var g = c.getContext("2d");
    if (!g) { return; }
    var ink = "#171b21", accent = Y.safeHex(t.color, "#c8453c");
    g.fillStyle = "#f7f4ee"; g.fillRect(0, 0, W, Hh);
    g.textAlign = "center";
    g.fillStyle = "#454b56";
    g.font = "400 34px 'Hiragino Sans','Noto Sans JP',sans-serif";
    if (TX.title) { g.fillText(TX.title, W / 2, 110); }
    g.strokeStyle = "rgba(23,27,33,.18)"; g.setLineDash([10, 12]); g.lineWidth = 3;
    g.strokeRect(190, 160, 700, 700);
    g.setLineDash([]);
    g.strokeStyle = ink; g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = 22;
    (strokes || []).forEach(function (st) {
      var p = st.points; if (!p.length) { return; }
      g.beginPath();
      g.moveTo(190 + p[0].x * 700, 160 + p[0].y * 700);
      for (var i = 1; i < p.length; i++) { g.lineTo(190 + p[i].x * 700, 160 + p[i].y * 700); }
      g.stroke();
    });
    var line = fill(TX.line || "{type}", { type: t.name, measures: measures }).replace(/[\s　]+$/, "");
    var head = line.split(/[\s　]/)[0], rest = line.slice(head.length).replace(/^[\s　]+/, "");
    g.fillStyle = accent;
    g.font = "700 76px 'Hiragino Mincho ProN','Yu Mincho',serif";
    g.fillText(head, W / 2, 1000);
    if (rest) {
      g.fillStyle = "#454b56";
      g.font = "400 32px 'Hiragino Sans','Noto Sans JP',sans-serif";
      var parts = rest.split(SH.measuresSeparator || "／");
      parts.slice(0, 2).forEach(function (l, i) { g.fillText(String(l).slice(0, 30), W / 2, 1075 + i * 50); });
    }
    if (TX.foot) {
      g.fillStyle = "#666e7c";
      g.font = "400 28px 'Hiragino Sans','Noto Sans JP',sans-serif";
      g.fillText(TX.foot, W / 2, 1280);
    }
    var url = "";
    try { url = c.toDataURL("image/png"); } catch (e) { url = ""; }
    if (!url) { return; }
    hostEl.innerHTML = '<img class="save-img-out" alt="' + esc(t.name) + '" src="' + url + '">' +
      (RS.saveImageReady ? '<p class="note">' + esc(RS.saveImageReady) + "</p>" : "");
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
      if (S.current && (S.current.code === code || (code === "self" && !S.current.code))) {
        render({ src: "self", key: S.current.key, scored: S.current.scored, feats: S.current.feats,
                 strokes: S.a2 ? S.s2 : S.s1, marks: drawnMarks() });
        return;
      }
      var dec = null;
      try { dec = HW.decodeShare(code); } catch (e) { dec = null; }
      if (!dec || !Y.typeOf(dec.key)) { nv.replaceHash("#/"); screen("intro"); return; }
      var last = readLast();
      /* 端末に保存できない環境（保存がブロックされている等）でも、自分の結果を開き直したときに
         「ほかの方が共有した結果です」と出さないよう、この履歴の項目に付けた印（history.state）も見ます。 */
      var own = !!(history.state && history.state.yuiOwn === code);
      render({ src: (own || (last && last.k === dec.key)) ? "reload" : "shared", key: dec.key, dec: dec });
      return;
    }
    screen("intro");
    document.title = (C.meta && C.meta.title) || C.title;
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);

  function onStart() { S.strokes = []; nv.go("#/write"); }
  Y.on("start", onStart);
  Y.on("start2", onStart);
  Y.on("g-back", function () { nv.nav("#/write"); });

  route();
})();
