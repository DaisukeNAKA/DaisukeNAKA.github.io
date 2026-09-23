/* =========================================================================
 * 「結」の書き方診断 — 手書きの計測エンジン（window.YUI_HW）
 *
 * 【不変条件】利用者がスマホ画面に指で「結」を1字書き、その“書き方”を
 * 4つの婚活タイプに当てはめる。これがこの診断の原案です。10問の設問版は、
 * 書けない・書きたくない人のための代替経路としてだけ残します。
 *
 * このファイルは、書いた線から測定値を出し、AGOEN が決めたルールで型に
 * 振り分ける処理だけを持ちます。画面・文言は持ちません。
 *
 * ・DOM・時刻・乱数・通信を使いません。同じ線からは必ず同じ結果が出ます。
 * ・書いた線は引数としてメモリの中にあるだけで、保存も送信もしません。
 * ・筆跡から性格が分かるという根拠はありません。ここでの採点は測定ではなく、
 *   「この測定値ならこの型」という当てはめのルールです。
 *
 * 入力の約束（画面側）：
 *   strokes = [{ points: [{ x, y, t }, ...] }, ...]
 *   x, y はキャンバス（正方形）の CSS px、t は PointerEvent.timeStamp（ms）。
 *   各画の最後の点は pointerup の位置と時刻にしてください（収筆の停止時間に使います）。
 *   opts = { side: キャンバス一辺の CSS px, cal: score() に渡すのと同じ較正（任意） }
 *   （debug: true のときだけ、検証用に各画の対応づけを添えます）
 *   ・座標は side で割ってから使うので、同じ正規化座標なら side がいくつでも結果は完全に同じです
 *     （画面の回転でキャンバスを作り直したとき用）。
 *   ・時刻は詰め直さずにそのまま渡してかまいません。「一画戻す」「全部消す」のあとの考え直しや、
 *     途中の長い間は、間の割合（f8）では外して数え（ふつうの間の3倍を超える間）、速すぎの判定に使う
 *     totalMs でも 1.5 秒で打ち切るので、1〜2か所の長い間では結果が変わりません
 *     （時間制限なし・書き直しは結果に使わない、という約束を計算の側で守るため）。
 *   ・字と関係のないインク（迷いタップ・迷い線・字の上のなぐり書き）は、お手本のどの画にも対応しなければ
 *     測定から外します。小さなものは黙って外し、線の長さの 5% を超えるときは extraInk で弾きます。
 *
 * 返す値（契約。前の版からの変更点に【変更】を付けています。【変更2】はこの版での変更です）：
 *   { ok, problems, feats, marks, nStrokes, totalMs }
 *   ・【変更】ok が false のときは、feats の14個はすべて null です。形の崩れた入力から出た数を、
 *     画面側が ok を見落としても型や表示に使ってしまわないようにするためです。
 *   ・【変更2】nStrokes と 8〜16 画の判定は、広がり（生の点の外接枠の対角線）がキャンバス一辺の 1%（DOT_LEN）以上の
 *     線だけを数えます。以前は道のり（点をつないだ長さ）で測っていたので、静止中も揺れつきの pointermove が届く端末では、
 *     動かしていないタップが「線」に数えられ、画数過多（tooManyStrokes）で弾かれていました。
 *     指が触れて離れただけの点が何回あっても、画数過多にはしません。
 *   ・【変更2】marks.stops（とめの印）は { n, x, y, stop } で、stop は「収筆の停止時間 ≥ marks.stopMs」です。
 *     marks.stopMs は opts.cal の f5 の中央値。opts.cal が無いときは STOP_MS（いま同梱している較正の f5 の中央値 100ms。
 *     以前は 80ms の固定値で、画面側が cal を渡さないと、印と「いちばん特徴」の向きが食い違いました）。
 *     しきい値は較正の中央値にそろえ、f5 は測れた画の「下側の中央値」にしたので、同じ1回の字なら、測れたとめの画が
 *     何画でも、f5 が中央値より長い ⇔ 過半数が「とめ」、短い ⇔「とめ」は半数以下、が必ずそろいます
 *     （5画でも4画でも「とめ 3画以上／2画以下」）。印の側を較正に合わせる方を選び、各画の停止時間（ms）は出しません。
 *     較正を差し替えたら STOP_MS も新しい中央値に変えてください（_ops/test/hw-calibration.js が食い違いを知らせます）。
 *     2回書きの平均で採点するときは、印は片方の回のものなので、向きがそろわないことがあります（encodeShare の項）。
 *   ・【変更2】f5（収筆の止め）は「離した位置に着いてから離すまで」の時間です（stopTime の注記）。以前は
 *     「離した位置の近くにいた時間」で、ゆっくり書くだけで長い止めに見え、速さ（f6）が y 軸に二重に入っていました。
 *   ・【変更2】縦横比 f7・すき間 f2・大きさ f14・速さ f6 の字の高さ・頭部突出 f13 は、字全体の回転（スマホを斜めに持った分）を
 *     回し戻した外接枠で測ります。marks.gap は画面の座標に戻して返します（帯の中央の高さで戻すので、傾いた字では目安の位置です）。
 *   ・【変更2】画の途中で指が離れた切れ端（画の一部）は、時間の特徴（f6・f8・totalMs）では1画にまとめ、
 *     切れ目を「画と画の間」に数えません。広がりが TAP_LEN 未満の切れ端は、なぞり書きと同じ扱い（形・時間に使わない）です。
 *   ・【変更2】字のすぐ外の長い迷い線が本物の画を押しのけて対応づいたときは、その線を外して当て直し、
 *     どの画にも対応しない線として数えます（長ければ extraInk。displaced の注記）。字の線に線の太さ以内で触れている線は、
 *     字の一部と見分けられないので対象にしません（画の先に続けて引いた線は、画を書き足したものとして測ります）。
 *   score(feats, cal)：【変更】feats の代わりに analyze() の結果をそのまま渡してもよく、ok が false なら null。
 *     失敗した解析の feats（すべて null）を渡しても null です。
 *     【変更】highlight（いちばん特徴が出ていたところ）は、中央値との差が丸めの1目盛り以下の測定値を候補にしません。
 *   encodeShare(scored, feats, marks)：【変更2】「いちばん特徴」は、自分の画面とリンクの画面で同じになるよう、ほぼいつも入れます。
 *     marks を渡さなければ、とめの数は「なし」で、f5 の「いちばん特徴」もそのまま入れます（以前は落としていました）。
 *     とめの数が f5 の向きと食い違うとき（長い向きなのに「とめ」2画以下、短い向きなのに3画以上）は、
 *     「いちばん特徴」ではなく、とめの数のほうを「なし」にします。
 *     すき間の % は -15〜69（-0.15 未満は noSplit で弾くので、診断に進んだ字では出ません）。
 *   decodeShare(str)：【変更】encodeShare が出さない組み合わせはすべて null。
 *     【変更2】{ v, key, lean, highlight, disp, items } を返します。items は画面側（yui/hw.js の sharedMeasureRows）が読む
 *     表示用の値の一覧 [{feature:"f1", state}, {feature:"f2", value: すき間の比}, {feature:"f5", value: 止めた画の数}]
 *     （値の無いものは入れず、「いちばん特徴」が f2・f5 ならそれを先頭に）。disp と同じ値です。
 *     【変更2】2つ目の引数（cal）は見ません。較正を差し替えても形式と VERSION は変わらないので、較正に照らして拒むと、
 *     差し替える前に共有されたリンクが読めなくなるためです。
 *   【変更2】TPL_RATIO（お手本の高さ÷幅）と TPL_F13（お手本の頭部突出）を公開します。f7・f13 はお手本との差なので、
 *     画面で「高さ÷幅」「突き出しの%」に戻すときに足してください。
 *
 * 妥当性チェックの理由コード（problems。ひとつでもあれば「もう一度、枠いっぱいに」と案内する）：
 *   tooFewStrokes 画が8本未満 ／ tooManyStrokes 16本超 ／ tooSmall 字が小さい ／ tooFast 1.2秒未満
 *   noSplit 糸へんと吉に分かれない ／ noKou 口が見つからない
 *   noMatch お手本の12画のうち、はっきり対応づく画が9画未満、または全体の当てはまりが悪い
 *   extraInk どの画にも対応しない線が、書いた線の長さの 5% を超える（字の上のなぐり書きなど）
 *   badTime 画の中で時刻が逆戻りする点が多い、画どうしの時間が重なる、長さのある画の半分超が 0ms（画面側の不具合）
 *   画面側は、知らないコードでも同じ「もう一度」の案内を出してください。
 *
 * 公開する関数：analyze（測る）→ average（2回分を特徴ごとに平均）→ score（型に振り分ける）
 *               → encodeShare / decodeShare（URL に入れる短い文字列）
 * ========================================================================= */
(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { root.YUI_HW = factory(); }
})(this, function () {
  "use strict";

  var VERSION = 1;
  /* 接筆の判定に使う線幅。キャンバス一辺=1 の固定比にして、端末の解像度や
   * 画面の回転で「閉じている／開いている」の判定が変わらないようにします。 */
  var LW = 0.022;
  /* とめの印のしきい値の既定値（ms）＝ いま同梱している較正（_ops/test/hw-calibration.js の CALIBRATION）の
   * f5 の中央値です。analyze() に較正（opts.cal）が渡されたときは、その f5 の中央値を使います。
   * 「いちばん特徴」の f5 の向きは中央値との比較なので、印も同じ基準にしないと
   * 「止めが短め」の横に「5画ともとめ」が並ぶことがあるためです。
   * 画面側（yui/hw.js）は analyze() に cal を渡していないので、この値が画面の印のしきい値になります。
   * 較正を差し替えたら、この値も新しい f5 の中央値に変えてください（hw-calibration.js が食い違いを知らせます）。 */
  var STOP_MS = 100;
  /* 収筆の停止を測る画（とめの画）。はらい・点・折れは測りません。 */
  var TOME = [4, 7, 8, 9, 12];
  var HORIZ = [7, 9, 11, 12];
  var VERT = [4, 8];
  var FKEYS = ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10", "f11", "f12", "f13", "f14"];
  var PROBLEMS = ["tooFewStrokes", "tooManyStrokes", "tooSmall", "tooFast", "noSplit", "noKou", "noMatch", "extraInk", "badTime"];

  /* 時間方向の低域通過（ガウス窓）。指のふるえ（4〜12Hz）やセンサーの細かい揺れで、
   * 止め（f5）・速さ（f6）・すき間（f2）・横画の角度（f3）・口の角（f1/f9/f10）が変わらないように
   * するためです。ふるえは健康や年齢の代わりになる指標なので、型に漏れてはいけません。
   * 点の間隔（60〜240Hz）に依らないよう、4ms 刻みの時間の格子に取り直してから平均します。
   *   LP_SIGMA      形を測る線（σ=40ms。8Hz の揺れを約 1/8 に）
   *   LP_SIGMA_STOP 止めを測る線（σ=30ms。8Hz・2px のふるえを約 0.3 に）。以前は 60ms でしたが、窓が広いほど、
   *                 速く書いて止めた画で「着いた時刻」が遅れて見え、止めが書く速さで短く出ていました
   *                 （合成で止め 120ms の人が、速さ 3 字高/秒では、窓 60ms で 20ms 前後、40ms で 70ms、30ms で 90ms）。止めは下の STOP_Q1・STOP_Q2 の
   *                 距離（字の大きさの 12%・6%。320px の枠の字なら 20px・10px）で測るので、低域通過のあとに 1〜2px の
   *                 ふるえが残っても測れます（8Hz・2px のふるえで、止めの差は ±20ms 以内。単体テスト）。 */
  var LP_SIGMA = 40;
  var LP_SIGMA_STOP = 30;
  /* 線の長さ（f6）で落とす小さな揺れの大きさ（字の大きさ=1。Douglas–Peucker 法の許容幅） */
  var INK_EPS = 0.01;
  var LP_DT = 4;
  var LP_MAXN = 2000;
  /* 収筆の止め（f5）を測るときの、離した位置からの距離（字の大きさ=1 の単位）。stopTime の注記を参照。
   * キャンバスの px ではなく字の大きさで決めるので、キャンバスの大きさや字の大きさを変えても同じ値になります。
   * 画が短くて STOP_Q1 まで離れていなければ、半分の距離（STOP_Q1/2・STOP_Q2/2）で測ります。 */
  var STOP_Q1 = 0.12;
  var STOP_Q2 = 0.06;
  /* pointerup が最後の pointermove からこれ以上（キャンバス一辺の 3%）離れていたら、その間も動いていたとみなす */
  var UP_JUMP = 0.03;
  /* totalMs（速すぎの判定用）では、画と画の間を 1.5 秒で打ち切ります（考え直しの間を数えない）。 */
  var GAP_CAP = 1500;
  /* f8 で「考え直しの間」とみなして外す間の下限（ms）。間の中央値の3倍と、この値の大きい方を超えたら外す */
  var PAUSE_MIN = 300;
  /* TAP_LEN・DOT_LEN の「大きさ」は、線の道のり（点をつないだ長さ）ではなく、生の点の外接枠の対角線（extent）で測ります。
   * 指を動かさずに触れているあいだも位置の同じ pointermove が 0.2〜0.4px の揺れつきで届く端末では、
   * 道のりが揺れの分だけ伸び、動かしていないタップが 150ms で 6〜7px、300ms で 25px の「線」に見えるためです。
   * 外接枠なら、揺れの幅（1〜2px）にしかなりません。
   *
   * 最初の位置合わせで外す小さな印（キャンバス一辺の 2% 未満）。迷いタップで外接枠が伸びないように。
   * 画の一部（attachParts）として足す線も、これ未満ならなぞり書きと同じ扱い（字のインクとしては数えるが、
   * 形・時間・外接枠には使わない）にします。書き終えてから画の端に落ちた 1〜2% のタップが「画の続き」として
   * 時間の特徴（f6・f8）を変えないようにするためです。 */
  var TAP_LEN = 0.02;
  /* これより小さい線（キャンバス一辺の 1% 未満。指が触れて離れただけの点）は、はじめから無かったものとして扱う。
   * 画数にも数えず（8〜16画の判定・nStrokes）、どの画にも画の一部にもしない。
   * 字の中に落ちた迷いタップが、近くの画の一部としてつながれて形や時間を変えないように。
   * 本物の画でいちばん短い点（糸の3画目）でも、診断できる大きさの字なら一辺の 5% 以上あります。 */
  var DOT_LEN = 0.01;
  /* 最初の外接枠から外す「離れた線」：ほかのどの線からも、字の大きさのこの割合より離れた線のかたまりで、
   * インクが全体の MAIN_INK 未満のもの。字の外に落ちた 2〜20% の迷い線で外接枠が伸び、お手本が
   * 引き伸ばされて画の対応づけ（ひいては口の開閉や縦横比）が崩れるのを防ぐためです。
   * 本物の「結」では、どの画もおおむね隣の画から字の大きさの 12% 以内にあります（いちばん離れる糸の 5・6 画目で
   * 0.1〜0.12）。まれに外れても、最初の位置合わせが少しずれるだけです（対応づけのあとで外接枠を作り直すため）。
   * かたまりで見るのは、同じ所に2本続けて落ちた迷い線どうしが「隣の線」になって残らないようにするためです。
   * 糸・士・口のかたまりはそれぞれインクの 25〜45% あるので、離れて書いても外れません。 */
  var LINK_D = 0.12;
  var MAIN_INK = 0.15;
  /* 字のすぐ外（LINK_D 以内）に落ちた短い迷い線も、最初の外接枠から外す：長さが字の大きさの SHORT_D 未満で、
   * その線だけで外接枠をどちらかの向きに字の大きさの EDGE_D 以上広げている線。本物の「結」で、短いのに1本だけで
   * 外接枠を広げる画は糸の5画目の先くらい（広げる量は 4% 前後）で、まれに外れても最初の位置合わせが少しずれるだけです
   * （画の対応づけのあと、対応づいた画だけで外接枠を作り直すので、測定値には影響しません）。 */
  var SHORT_D = 0.3;
  var EDGE_D = 0.05;
  /* 画の一部（途中で指が離れた画の続き・口を4画で書いたときの横折の縦）として足してよい範囲。
   * 足す線の各点をお手本の画に投影した位置（画の長さ=1）で見て、
   *  ・半分以上の点が -5%〜105%（PART_EXT）に入る（画の先の外に落ちた迷い線は、ほとんどの点が外に出る）
   *  ・どの点も -35%〜135%（PART_EXT_MAX）を出ない
   *  ・線の向きが、投影した所でのお手本の画の向きと 32° 以内（PART_COS。画の続きなら同じ向きに走る。
   *    画の端の脇に斜めに落ちた迷い線は、投影すると画の先の「続き」に見えてしまうため）
   *  ・すでに対応づいた線が覆っている範囲（両端から画の長さの 5% ずつ内側。PART_JOIN）に入る点が、
   *    4分の1以下（PART_OVERLAP）。画の続きなら、重なるのはつなぎ目のあたりだけ。
   *    画をなぞり直した線は、覆われた範囲にまるごと入る
   * 画の先や脇に落ちた迷い線を「画の一部」として足すと、外接枠・形・時間が変わってしまうためです。
   * 端の許しを 5% ちょうどにしないのは、口を4画で書いた人の横折の縦が、当て直したお手本の終わりより
   * 先まで出ることがあるためです（合成の 500 人で、はみ出しの 90% 点が 14%、99% 点が 24%）。 */
  var PART_EXT = 0.05;
  var PART_EXT_MAX = 0.35;
  var PART_OVERLAP = 0.25;
  var PART_JOIN = 0.05;
  var PART_COS = 0.85;
  /* 最初の位置合わせで試す字全体の回転（度）。スマホを斜めに持って書いた字でも、
   * 回転なしの位置合わせで画の対応づけが崩れて弾かれないように。
   * 回転なしで十分に当てはまったとき（GOOD_STRICT 画以上・当てはまり GOOD_RESID 以下）は試しません。 */
  var ROT_TRY = [10, -10, 20, -20];
  var GOOD_STRICT = 12;
  var GOOD_RESID = 0.03;
  /* どの画にも対応しない線が、書いた線の長さのこの割合を超えたら弾く */
  var EXTRA_INK = 0.05;
  /* 押しのけの確かめ（displaced の注記）で「どのお手本の画からも離れている」とみなす距離（字の大きさ=1）。
   * 本物の画は、正しい位置合わせのもとでは自分のお手本の画から平均 0.01〜0.04 に収まります（MAX_RESID の注記）。 */
  var STRAY_D = 0.05;
  /* 押しのけの確かめを始める当てはまり（照合距離の平均）。displaced の注記 */
  var DISP_RESID = 0.02;
  /* はっきり（1周目のしきい値で）対応づいたお手本の画がこれ未満なら「結」とみなさない */
  var MIN_STRICT = 9;
  /* 当て直しで許す回転（度）。横倒しの字をお手本に無理に合わせないように */
  var MAX_ROT = 30;
  /* 対応づけの当てはまり（照合距離の平均）の上限。合成の「結」では最大 0.031（中央値 0.010）、
   * でたらめな線分では中央値 0.09。人の指の字は合成よりばらつくので、余裕をとって 0.05 にしています。
   * 形の似た「給」（0.046）は通ります（文字認識ではないため。仕様書の想定どおり）。 */
  var MAX_RESID = 0.05;
  /* 異常に長い線で計算が止まらないよう、1本あたりの点の数に上限を置く（本物の画は 200 点に届かない） */
  var MAX_SHAPE_PTS = 600;
  var MAX_CO_PTS = 200;
  /* キャンバスから大きく外れた点（一辺の 10 倍より外）は、単位の取り違えなどの異常値として捨てる */
  var MAX_COORD = 10;

  /* 照合のしきい値（字の外接枠の長辺=1 の単位）。
   * 形のクセ（すき間・傾き・縦横比）は位置合わせで吸収され、残る誤差は 0.01〜0.04 程度。
   * 隣の画と取り違えると 0.08 を超えるので、その間に置いています。 */
  var MAXC = 0.10;
  var MAXC2 = 0.16;
  var PART_MAX = 0.07;
  var LEN_RATIO = 2;
  var LEN_ADD = 0.1;
  var RANGE_PENALTY = 0.03;
  var CONNECT = 0.06;

  /* ---------------------------------------------------------------- お手本
   * 自作の12画（キャンバス一辺=1 の座標）。KanjiVG は CC BY-SA 3.0 で、同梱すると
   * 帰属表示と同一条件での継承が必要になるため使っていません。
   * 書き順は標準（糸へん 1〜6、吉 7〜12：士 7,8,9／口 10,11,12）。
   * ただし照合は書き順ではなく位置で行うので、どの順で書いても同じ画に対応づきます。
   * 横画は水平に置いています。右上がりの表示（f12）は「お手本より何度上がっているか」です。
   * kind: h=横画 v=縦画 d=斜め・点・く box=口の横折（折れのある画） */
  var TEMPLATE = [
    { n: 1,  part: "ito", kind: "d",   pts: [[0.31, 0.12], [0.21, 0.29], [0.31, 0.34]] },
    { n: 2,  part: "ito", kind: "d",   pts: [[0.36, 0.22], [0.17, 0.48], [0.40, 0.45]] },
    { n: 3,  part: "ito", kind: "d",   pts: [[0.38, 0.36], [0.45, 0.47]] },
    { n: 4,  part: "ito", kind: "v",   pts: [[0.28, 0.46], [0.28, 0.88]] },
    { n: 5,  part: "ito", kind: "d",   pts: [[0.20, 0.62], [0.14, 0.75]] },
    { n: 6,  part: "ito", kind: "d",   pts: [[0.37, 0.64], [0.44, 0.73]] },
    { n: 7,  part: "ki",  kind: "h",   pts: [[0.47, 0.26], [0.89, 0.26]] },
    { n: 8,  part: "ki",  kind: "v",   pts: [[0.68, 0.12], [0.68, 0.42]] },
    { n: 9,  part: "ki",  kind: "h",   pts: [[0.52, 0.42], [0.84, 0.42]] },
    { n: 10, part: "ki",  kind: "v",   pts: [[0.52, 0.55], [0.52, 0.86]] },
    { n: 11, part: "ki",  kind: "box", pts: [[0.52, 0.55], [0.84, 0.55], [0.84, 0.86]] },
    { n: 12, part: "ki",  kind: "h",   pts: [[0.52, 0.86], [0.84, 0.86]] }
  ];

  /* ================================================================ 幾何 */
  function pt(x, y) { return { x: x, y: y }; }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  /* Math.hypot はブラウザごとに末尾の桁が違うことがあるので、sqrt で計算します。 */
  function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
  function plen(p) { var s = 0; for (var i = 1; i < p.length; i++) { s += dist(p[i - 1], p[i]); } return s; }
  /* 点の広がり（外接枠の対角線）。TAP_LEN・DOT_LEN の判定に使います（道のりではなく。TAP_LEN の注記） */
  function extent(p) {
    if (!p.length) { return 0; }
    var b = bbox(p);
    return Math.sqrt(b.w * b.w + b.h * b.h);
  }

  function segDist2(p, a, b) {
    var vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy, r = 0;
    if (L2 > 0) { r = clamp(((p.x - a.x) * vx + (p.y - a.y) * vy) / L2, 0, 1); }
    var dx = p.x - (a.x + vx * r), dy = p.y - (a.y + vy * r);
    return dx * dx + dy * dy;
  }
  /* 点から折れ線までの最短距離 */
  function polyDist(p, pl) {
    if (pl.length === 1) { return dist(p, pl[0]); }
    var m = Infinity;
    for (var i = 1; i < pl.length; i++) { var d = segDist2(p, pl[i - 1], pl[i]); if (d < m) { m = d; } }
    return Math.sqrt(m);
  }
  /* 点を折れ線に投影したときの、書き出しからの弧長 */
  function projParam(p, pl) {
    var best = Infinity, at = 0, acc = 0;
    for (var i = 1; i < pl.length; i++) {
      var a = pl[i - 1], b = pl[i], vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy, r = 0;
      if (L2 > 0) { r = clamp(((p.x - a.x) * vx + (p.y - a.y) * vy) / L2, 0, 1); }
      var dx = p.x - (a.x + vx * r), dy = p.y - (a.y + vy * r), d = dx * dx + dy * dy, L = Math.sqrt(L2);
      if (d < best) { best = d; at = acc + r * L; }
      acc += L;
    }
    return at;
  }
  /* 点を折れ線に投影した位置を、折れ線の長さ L で割った値（書き出し=0、終わり=1）。
   * 端より外の点は、端の線分を延長した向きで測り、負や 1 を超える値にします（画の先に落ちた線を見分けるため）。 */
  function extParam(p, pl, L) {
    if (!(L > 0) || pl.length < 2) { return 0; }
    var s = projParam(p, pl);
    if (s > 0 && s < L) { return s / L; }
    var a = s <= 0 ? pl[0] : pl[pl.length - 2], b = s <= 0 ? pl[1] : pl[pl.length - 1];
    var vx = b.x - a.x, vy = b.y - a.y, n = Math.sqrt(vx * vx + vy * vy);
    if (!(n > 0)) { return s / L; }
    if (s <= 0) { return Math.min(0, ((p.x - a.x) * vx + (p.y - a.y) * vy) / n) / L; }
    return 1 + Math.max(0, ((p.x - b.x) * vx + (p.y - b.y) * vy) / n) / L;
  }

  /* 点の複製。時刻 t を持つ点なら t も写します（取り直した点から、低域通過した線の同じ時刻の位置を引くため）。 */
  function cp(p) { var q = pt(p.x, p.y); if (p.t !== undefined) { q.t = p.t; } return q; }
  /* 弧長で n 点に取り直す。端点は必ず元の端点に一致させます（接筆の判定で端点を使うため）。
   * 元の点が時刻を持っていれば、取り直した点の時刻も同じ割合で補います。 */
  function resampleN(pts, n) {
    var out = [], i, k, hasT = pts.length && pts[0].t !== undefined;
    if (!pts.length) { return out; }
    var cum = [0];
    for (i = 1; i < pts.length; i++) { cum.push(cum[i - 1] + dist(pts[i - 1], pts[i])); }
    var L = cum[cum.length - 1];
    if (pts.length === 1 || !(L > 0) || !isFinite(L)) {
      for (k = 0; k < n; k++) { out.push(cp(pts[0])); }
      return out;
    }
    var j = 1;
    for (k = 0; k < n; k++) {
      if (k === n - 1) { out.push(cp(pts[pts.length - 1])); break; }
      var s = n > 1 ? L * k / (n - 1) : 0;
      while (j < pts.length - 1 && cum[j] < s) { j++; }
      var seg = cum[j] - cum[j - 1], r = seg > 0 ? clamp((s - cum[j - 1]) / seg, 0, 1) : 0;
      var q = pt(pts[j - 1].x + (pts[j].x - pts[j - 1].x) * r, pts[j - 1].y + (pts[j].y - pts[j - 1].y) * r);
      if (hasT) { q.t = pts[j - 1].t + (pts[j].t - pts[j - 1].t) * r; }
      out.push(q);
    }
    return out;
  }
  /* 刻み step で取り直す。点の数は maxN（既定 4000）までにします。
   * 桁外れに長い線（単位の取り違えなど）で、点の数が無限大になって止まらないようにするためです。 */
  function resample(pts, step, maxN) {
    var L = plen(pts), cap = maxN || 4000;
    var n = (step > 0 && L > 0) ? Math.round(L / step) + 1 : 2;
    if (!isFinite(n) || n > cap) { n = cap; }
    if (n < 2) { n = 2; }
    return resampleN(pts, n);
  }
  /* 3点移動平均（端点はそのまま）。指の細かい揺れで角度や長さが膨らまないようにします。 */
  function smooth3(p) {
    if (p.length < 3) { return p.slice(); }
    var out = [cp(p[0])];
    for (var i = 1; i < p.length - 1; i++) {
      var q = pt((p[i - 1].x + p[i].x + p[i + 1].x) / 3, (p[i - 1].y + p[i].y + p[i + 1].y) / 3);
      if (p[i].t !== undefined) { q.t = (p[i - 1].t + p[i].t + p[i + 1].t) / 3; }
      out.push(q);
    }
    out.push(cp(p[p.length - 1]));
    return out;
  }
  function bbox(pts) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      if (p.x < x0) { x0 = p.x; } if (p.x > x1) { x1 = p.x; }
      if (p.y < y0) { y0 = p.y; } if (p.y > y1) { y1 = p.y; }
    }
    return { x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0, h: y1 - y0 };
  }
  function mean(a) { var s = 0; for (var i = 0; i < a.length; i++) { s += a[i]; } return a.length ? s / a.length : NaN; }
  function median(a) {
    if (!a.length) { return NaN; }
    var b = a.slice().sort(function (p, q) { return p - q; }), m = b.length >> 1;
    return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
  }
  /* 並べ替えてから q 分位の値（点の番号は四捨五入。補間しないので、同じ点の集まりからは必ず同じ値） */
  function qSorted(a, q) {
    if (!a.length) { return null; }
    var b = a.slice().sort(function (p, r) { return p - r; });
    return b[Math.round(q * (b.length - 1))];
  }
  function centroid(pts) {
    var x = 0, y = 0;
    for (var i = 0; i < pts.length; i++) { x += pts[i].x; y += pts[i].y; }
    return pt(x / pts.length, y / pts.length);
  }
  /* 主軸（最小二乗の向き）。画面座標のまま単位ベクトルで返します。 */
  function axisOf(pts) {
    var c = centroid(pts), sxx = 0, syy = 0, sxy = 0;
    for (var i = 0; i < pts.length; i++) {
      var dx = pts[i].x - c.x, dy = pts[i].y - c.y;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
    var th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    return { x: c.x, y: c.y, ux: Math.cos(th), uy: Math.sin(th) };
  }
  /* 横画の角度（右上がりを正、度）。画面の y は下向きなので符号を反転します。 */
  function hAngle(pts) {
    var a = axisOf(pts), ux = a.ux, uy = a.uy;
    if (ux < 0 || (ux === 0 && uy > 0)) { ux = -ux; uy = -uy; }
    return Math.atan2(-uy, ux) * 180 / Math.PI;
  }
  /* 縦画の傾き（下の端が右へ出るほど正、度）。字全体が回っている分の推定に使います。 */
  function vTilt(pts) {
    var a = axisOf(pts), ux = a.ux, uy = a.uy;
    if (uy < 0 || (uy === 0 && ux < 0)) { ux = -ux; uy = -uy; }
    return Math.atan2(-uy, ux) * 180 / Math.PI + 90;
  }
  function trimmed(p, frac) {
    var n = p.length, a = Math.floor(n * frac), b = Math.ceil(n * (1 - frac));
    if (b - a < 2) { return p.slice(); }
    return p.slice(a, b);
  }
  function cross(ax, ay, bx, by) { return ax * by - ay * bx; }
  function segCross(a, b, c, d) {
    var r1 = cross(b.x - a.x, b.y - a.y, c.x - a.x, c.y - a.y);
    var r2 = cross(b.x - a.x, b.y - a.y, d.x - a.x, d.y - a.y);
    if (r1 === 0 && r2 === 0) { return false; }
    var r3 = cross(d.x - c.x, d.y - c.y, a.x - c.x, a.y - c.y);
    var r4 = cross(d.x - c.x, d.y - c.y, b.x - c.x, b.y - c.y);
    return r1 * r2 <= 0 && r3 * r4 <= 0;
  }
  /* 2本の線が交わっているか（交差していれば接筆は「閉」） */
  function polyCross(A, B) {
    var ba = bbox(A), bb = bbox(B);
    if (ba.x1 < bb.x0 || bb.x1 < ba.x0 || ba.y1 < bb.y0 || bb.y1 < ba.y0) { return false; }
    for (var i = 1; i < A.length; i++) {
      for (var j = 1; j < B.length; j++) {
        if (segCross(A[i - 1], A[i], B[j - 1], B[j])) { return true; }
      }
    }
    return false;
  }
  function turnAt(a, b, c) {
    var d = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x);
    while (d > Math.PI) { d -= 2 * Math.PI; }
    while (d < -Math.PI) { d += 2 * Math.PI; }
    return Math.abs(d);
  }

  /* 丸め：判定の前に丸めて、ブラウザごとの Math 関数の精度差が境目で結果を変えないようにします。 */
  function rnd(v, step) {
    if (v === null || v === undefined || !isFinite(v)) { return null; }
    var r;
    if (step === 0.01) { r = Math.round(v * 100) / 100; }
    else if (step === 0.001) { r = Math.round(v * 1000) / 1000; }
    else if (step === 0.0001) { r = Math.round(v * 10000) / 10000; }
    else if (step === 0.5) { r = Math.round(v * 2) / 2; }
    else if (step === 10) { r = Math.round(v / 10) * 10; }
    else { r = Math.round(v); }
    return r === 0 ? 0 : r;   // -0 を 0 にそろえる
  }
  var STEP = { f2: 0.01, f3: 0.5, f5: 10, f6: 0.01, f7: 0.01, f8: 0.01, f12: 0.5, f13: 0.01, f14: 0.01 };

  /* ============================================================ お手本の前処理 */
  var TPL = [], TB;
  (function () {
    var all = [];
    for (var k = 0; k < TEMPLATE.length; k++) {
      var v = [];
      for (var j = 0; j < TEMPLATE[k].pts.length; j++) {
        v.push(pt(TEMPLATE[k].pts[j][0], TEMPLATE[k].pts[j][1]));
        all.push(v[j]);
      }
      TPL.push({ n: TEMPLATE[k].n, part: TEMPLATE[k].part, v: v, r: resample(v, 0.025) });
    }
    TB = bbox(all);
  })();
  var TPL_RATIO = TB.h / TB.w;

  /* 頭部突出：士の縦画(8)の上端が、上の横画(7)よりどれだけ上に出ているか / 7と9の間隔 */
  function protrusion(p7, p8, p9, minGap) {
    if (!p7 || !p8 || !p9) { return null; }
    var top = p8[0];
    for (var i = 1; i < p8.length; i++) { if (p8[i].y < top.y) { top = p8[i]; } }
    var a7 = axisOf(p7), a9 = axisOf(p9);
    function yAt(a, x) { return Math.abs(a.ux) < 1e-9 ? a.y : a.y + (x - a.x) * a.uy / a.ux; }
    var y7 = yAt(a7, top.x), y9 = yAt(a9, top.x), gap = y9 - y7;
    if (!(gap > minGap)) { return null; }
    return (y7 - top.y) / gap;
  }
  var TPL_F13 = protrusion(TPL[6].v, TPL[7].v, TPL[8].v, 0);

  /* ================================================================ 照合
   * 利用者の画を、書き順ではなく位置（場所・向き・長さ）でお手本の12画に対応づけます。
   * 1本で続けて書いた画（連綿）は、お手本の連続した2〜3画の組として候補に入れます。
   * 余った画（口を4画で書いた、途中で指が離れた等）は、近い画の「一部」として足します。 */
  function mapPt(M, p) { return pt(M[0] * p.x + M[1] * p.y + M[2], M[3] * p.x + M[4] * p.y + M[5]); }
  function mapAll(M, a) { var o = []; for (var i = 0; i < a.length; i++) { o.push(mapPt(M, a[i])); } return o; }

  /* 双方向の平均最短距離の大きい方。片方向だけだと、短い画が長い画の一部に吸い込まれ、
   * 両方向の平均だと、続け書きの一部（口の底など）が「説明されないインク」のまま残っても
   * 安く見えてしまうため。 */
  function chamfer(u, polys, tpts) {
    var a = 0, b = 0, i, k;
    for (i = 0; i < u.length; i++) {
      var m = Infinity;
      for (k = 0; k < polys.length; k++) { var d = polyDist(u[i], polys[k]); if (d < m) { m = d; } }
      a += m;
    }
    for (i = 0; i < tpts.length; i++) { b += polyDist(tpts[i], u); }
    return Math.max(a / u.length, b / tpts.length);
  }
  function directed(u, poly) {
    var a = 0;
    for (var i = 0; i < u.length; i++) { a += polyDist(u[i], poly); }
    return a / u.length;
  }
  /* 並べ替えの同点を、入力の順番ではなく字の中の位置で決めます（書き順で結果が変わらないように）。 */
  function geoCmp(S, i, j) { return (S[i].gx - S[j].gx) || (S[i].gy - S[j].gy) || (S[i].t0 - S[j].t0); }

  /* off：対応づけに使わない画の番号（押しのけの確かめで、1本を外して当て直すとき。displaced の注記）。-1 なら全部使う */
  function assignOnce(S, Ms, off) {
    var TV = [], TR = [], TL = [], k, i, a, b, m;
    if (off === undefined) { off = -1; }
    for (k = 0; k < 12; k++) { TV.push(mapAll(Ms[k], TPL[k].v)); TR.push(mapAll(Ms[k], TPL[k].r)); TL.push(plen(TV[k])); }
    /* 長さのつり合い：書いた線は、対応づけるお手本の画（続け書きならその合計）の 2 倍＋字の大きさの 10% より
     * 長くない。字の上のなぐり書きのような長い線が、近くの画やその一部として取り込まれないように。
     * （続け書きのつなぎ線や、画の書き足しの分は、この余裕に収まります） */
    function lenOk(ii, aa, bb) {
      var t = 0;
      for (var kk = aa; kk <= bb; kk++) { t += TL[kk]; }
      return S[ii].len <= LEN_RATIO * t + LEN_ADD;
    }
    var cands = [];
    for (i = 0; i < S.length; i++) {
      if (i === off) { continue; }
      for (a = 0; a < 12; a++) {
        for (b = a; b < 12 && b <= a + 2; b++) {
          if (TPL[b].part !== TPL[a].part) { break; }
          if (!lenOk(i, a, b)) { continue; }
          var tpts = [];
          for (k = a; k <= b; k++) { tpts = tpts.concat(TR[k]); }
          var c = chamfer(S[i].co, TV.slice(a, b + 1), tpts) * (1 + RANGE_PENALTY * (b - a));
          if (c < MAXC) { cands.push({ i: i, a: a, b: b, c: c }); }
        }
      }
    }
    cands.sort(function (p, q) { return (p.c - q.c) || (p.a - q.a) || (p.b - q.b) || geoCmp(S, p.i, q.i); });
    var sUsed = [], tUsed = [], A = [];
    function take(cd) {
      for (var kk = cd.a; kk <= cd.b; kk++) { if (tUsed[kk]) { return; } }
      sUsed[cd.i] = true;
      for (kk = cd.a; kk <= cd.b; kk++) { tUsed[kk] = true; }
      A.push({ i: cd.i, a: cd.a, b: cd.b, c: cd.c, parts: [], dup: [] });
    }
    function freeStrokes() {
      var f = [];
      for (var ii = 0; ii < S.length; ii++) { if (!sUsed[ii] && ii !== off) { f.push(ii); } }
      f.sort(function (p, q) { return geoCmp(S, p, q); });
      return f;
    }
    for (m = 0; m < cands.length; m++) { if (!sUsed[cands[m].i]) { take(cands[m]); } }
    /* 続け書きとして取った組のうち、実際には線が通っていない画を手放す。
     * 例：糸の1-2を続けて書くと、すぐそばの点(3)まで組に入りやすく、本物の点が行き場を失うため。 */
    for (m = 0; m < A.length; m++) {
      var en = A[m];
      if (en.a === en.b) { continue; }
      var hit = {}, lo = 99, hi = -1, u = S[en.i].co;
      for (var q = 0; q < u.length; q++) {
        var bk = en.a, bd = Infinity;
        for (k = en.a; k <= en.b; k++) { var dq = polyDist(u[q], TV[k]); if (dq < bd) { bd = dq; bk = k; } }
        hit[bk] = (hit[bk] || 0) + 1;
      }
      for (k = en.a; k <= en.b; k++) { if ((hit[k] || 0) >= 2) { lo = Math.min(lo, k); hi = Math.max(hi, k); } }
      if (hi < 0) { continue; }
      for (k = en.a; k <= en.b; k++) { if (k < lo || k > hi) { tUsed[k] = false; } }
      en.a = lo; en.b = hi;
    }
    /* 取り返し：続け書きの組の端の画に、単独でよく合う画が余っていれば、そちらに渡す。
     * 組の端が本物の画を横取りして、その画が行き場を失うのを防ぐため。 */
    var fr = freeStrokes();
    for (m = 0; m < fr.length; m++) {
      var bestA = null, bestK = -1, bestC = MAXC;
      for (var e0 = 0; e0 < A.length; e0++) {
        var ea = A[e0];
        if (ea.a === ea.b) { continue; }
        var ends = [ea.a, ea.b];
        for (var z = 0; z < 2; z++) {
          if (!lenOk(fr[m], ends[z], ends[z])) { continue; }
          var cz = chamfer(S[fr[m]].co, [TV[ends[z]]], TR[ends[z]]);
          if (cz < bestC) { bestC = cz; bestA = ea; bestK = ends[z]; }
        }
      }
      if (bestA) {
        if (bestK === bestA.a) { bestA.a++; } else { bestA.b--; }
        tUsed[bestK] = false;
        take({ i: fr[m], a: bestK, b: bestK, c: bestC });
      }
    }

    /* 線の各点を、お手本の画 k に投影した位置（書き出し=0、終わり=1。端より外は負や 1 超） */
    function spanOf(u, k) {
      var t = [], lo = Infinity, hi = -Infinity;
      for (var q = 0; q < u.length; q++) {
        var v = extParam(u[q], TV[k], TL[k]);
        t.push(v);
        if (v < lo) { lo = v; }
        if (v > hi) { hi = v; }
      }
      return { t: t, lo: lo, hi: hi };
    }
    /* 余った線 id を、単独で取られたお手本の画の組 en の「一部」にしてよいか。
     *  1 = 一部として足す（途中で指が離れた画の続き・口を4画で書いたときの横折の縦など）
     *  0 = 字のインクとしては数えるが、形・時間・外接枠には使わない（なぞり書き・画の上や脇に斜めに落ちた迷い線）
     * -1 = 足さない（画の長さの範囲の外。画の先に落ちた迷い線） */
    function partFit(en, id) {
      var k = en.a, sp = spanOf(S[id].co, k), cov = [spanOf(S[en.i].co, k)], q, c, inside = 0, within = 0;
      if (sp.lo < -PART_EXT_MAX || sp.hi > 1 + PART_EXT_MAX) { return -1; }
      for (q = 0; q < sp.t.length; q++) { if (sp.t[q] >= -PART_EXT && sp.t[q] <= 1 + PART_EXT) { within++; } }
      if (within * 2 < sp.t.length) { return -1; }
      /* 向き：線の主軸と、線の重心にいちばん近いお手本の画の線分の向き */
      var ax = axisOf(S[id].co), T = TV[k], bj = 1, bdd = Infinity;
      for (q = 1; q < T.length; q++) { var dq = segDist2(ax, T[q - 1], T[q]); if (dq < bdd) { bdd = dq; bj = q; } }
      var vx = T[bj].x - T[bj - 1].x, vy = T[bj].y - T[bj - 1].y, vn = Math.sqrt(vx * vx + vy * vy);
      if (vn > 0 && Math.abs(ax.ux * vx + ax.uy * vy) / vn < PART_COS) { return 0; }
      for (q = 0; q < en.parts.length; q++) { cov.push(spanOf(S[en.parts[q]].co, k)); }
      for (q = 0; q < sp.t.length; q++) {
        for (c = 0; c < cov.length; c++) { if (sp.t[q] > cov[c].lo + PART_JOIN && sp.t[q] < cov[c].hi - PART_JOIN) { inside++; break; } }
      }
      return inside > PART_OVERLAP * sp.t.length ? 0 : 1;
    }
    /* 余った画を、いちばん近いお手本の画の「一部」として足す（その画が単独で取られているときだけ）。
     * 足してよいかは partFit で、この呼び出しの位置合わせ（最後の当て直しのあとなら、最終の位置合わせ）で確かめます。 */
    function attachParts(limit) {
      var f = freeStrokes();
      for (var q = 0; q < f.length; q++) {
        var bk = -1, bd = Infinity;
        for (var kk = 0; kk < 12; kk++) {
          var d = directed(S[f[q]].co, TV[kk]);
          if (d < bd) { bd = d; bk = kk; }
        }
        if (bd >= limit || !lenOk(f[q], bk, bk)) { continue; }
        for (var e = 0; e < A.length; e++) {
          if (A[e].a === bk && A[e].b === bk) {
            var fit = partFit(A[e], f[q]);
            /* 画の続きに見えても、TAP_LEN 未満の小さな線はなぞり書きと同じ扱い（TAP_LEN の注記） */
            if (fit === 1 && S[f[q]].ext < TAP_LEN) { fit = 0; }
            if (fit === 1) { A[e].parts.push(f[q]); sUsed[f[q]] = true; }
            else if (fit === 0) { A[e].dup.push(f[q]); sUsed[f[q]] = true; }
            break;
          }
        }
      }
    }
    attachParts(PART_MAX * 0.6);
    /* 2周目：残った画と、まだ埋まっていないお手本の画を、ゆるいしきい値で1対1に結ぶ */
    var f2 = freeStrokes(), c2 = [];
    for (m = 0; m < f2.length; m++) {
      for (k = 0; k < 12; k++) {
        if (tUsed[k] || !lenOk(f2[m], k, k)) { continue; }
        var cc = chamfer(S[f2[m]].co, [TV[k]], TR[k]);
        if (cc < MAXC2) { c2.push({ i: f2[m], a: k, b: k, c: cc }); }
      }
    }
    c2.sort(function (p, q) { return (p.c - q.c) || (p.a - q.a) || geoCmp(S, p.i, q.i); });
    for (m = 0; m < c2.length; m++) { if (!sUsed[c2[m].i]) { take(c2[m]); } }
    attachParts(PART_MAX);
    /* 延長：まだ誰も取っていないお手本の画に、隣の画を書いた線が続けて通っていれば、組を広げる。
     * 口を一筆で書いたとき、底の横画だけが組から漏れるのを防ぐため。 */
    for (k = 0; k < 12; k++) {
      if (tUsed[k]) { continue; }
      for (m = 0; m < A.length; m++) {
        var ex = A[m];
        if (ex.parts.length || !((ex.b === k - 1) || (ex.a === k + 1)) || TPL[k].part !== TPL[ex.a].part || ex.b - ex.a >= 2) { continue; }
        var uu = S[ex.i].co, near = 0;
        for (var q2 = 0; q2 < uu.length; q2++) {
          var dk = polyDist(uu[q2], TV[k]), other = Infinity;
          for (var k2 = ex.a; k2 <= ex.b; k2++) { other = Math.min(other, polyDist(uu[q2], TV[k2])); }
          if (dk < other && dk < PART_MAX) { near++; }
        }
        if (near >= 3) {
          if (ex.b === k - 1) { ex.b = k; } else { ex.a = k; }
          tUsed[k] = true;
          break;
        }
      }
    }
    A.sort(function (p, q) { return p.a - q.a; });
    return { A: A, TV: TV };
  }

  /* 1回目の対応づけから、お手本→利用者の字への一次変換を最小二乗で当て直します。
   * 1回目は字全体で1つ（回転・右上がり・縦横比のクセを吸収）、2回目は糸へんと吉で別々に
   * （糸と吉の間の広さや、左右の大きさのバランスの違いを吸収）当て直します。 */
  function det3(m) {
    return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
           m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
           m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  }
  /* 対応点は「利用者の点 ↔ いま写しているお手本の線上の最寄りの点」（ICP と同じ考え方）。
   * 続け書きや、2本に分けて書いた画も、そのまま位置合わせに使えるようにするため。 */
  function nearestOn(p, poly) {
    var best = Infinity, bj = 1, br = 0;
    for (var j = 1; j < poly.length; j++) {
      var a = poly[j - 1], b = poly[j], vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy, r = 0;
      if (L2 > 0) { r = clamp(((p.x - a.x) * vx + (p.y - a.y) * vy) / L2, 0, 1); }
      var dx = p.x - (a.x + vx * r), dy = p.y - (a.y + vy * r), d = dx * dx + dy * dy;
      if (d < best) { best = d; bj = j; br = r; }
    }
    return { d: Math.sqrt(best), j: bj, r: br };
  }
  function fitAffine(S, entries, Ms) {
    var N = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], BX = [0, 0, 0], BY = [0, 0, 0], e, j, r, c, k, q;
    var TVm = [];
    for (k = 0; k < 12; k++) { TVm.push(mapAll(Ms[k], TPL[k].v)); }
    for (e = 0; e < entries.length; e++) {
      var en = entries[e], ids = [en.i].concat(en.parts);
      for (q = 0; q < ids.length; q++) {
        var u = S[ids[q]].co;
        for (j = 0; j < u.length; j++) {
          var best = null, bk = en.a;
          for (k = en.a; k <= en.b; k++) {
            var nr = nearestOn(u[j], TVm[k]);
            if (!best || nr.d < best.d) { best = nr; bk = k; }
          }
          if (best.d > 0.08) { continue; }   // 続け書きのつなぎ線などは使わない
          var A0 = TPL[bk].v[best.j - 1], A1 = TPL[bk].v[best.j];
          var v = [A0.x + (A1.x - A0.x) * best.r, A0.y + (A1.y - A0.y) * best.r, 1];
          for (r = 0; r < 3; r++) {
            for (c = 0; c < 3; c++) { N[r][c] += v[r] * v[c]; }
            BX[r] += v[r] * u[j].x; BY[r] += v[r] * u[j].y;
          }
        }
      }
    }
    var D = det3(N);
    if (!(Math.abs(D) > 1e-12)) { return null; }
    function solve(B) {
      var out = [];
      for (var col = 0; col < 3; col++) {
        var m = [N[0].slice(), N[1].slice(), N[2].slice()];
        for (var row = 0; row < 3; row++) { m[row][col] = B[row]; }
        out.push(det3(m) / D);
      }
      return out;
    }
    var px = solve(BX), py = solve(BY);
    return [px[0], px[1], px[2], py[0], py[1], py[2]];
  }
  /* 変換の回転（度）。一次変換の部分を回転とそれ以外に分けたときの回転角の近似です。 */
  function rotOf(M) { return Math.atan2(M[3] - M[1], M[0] + M[4]) * 180 / Math.PI; }
  /* 当て直しが極端（反転・潰れ・強いせん断・30°を超える回転）なら使わない。
   * 形の崩れた入力や横倒しの字を、お手本に無理に合わせて「結」と数えないように。 */
  function sane(M2, M) {
    var d0 = M[0] * M[4] - M[1] * M[3], d2 = M2[0] * M2[4] - M2[1] * M2[3];
    return d2 > 0 && d0 > 0 && d2 / d0 >= 0.5 && d2 / d0 <= 2 &&
      Math.abs(M2[1]) <= 0.5 * Math.abs(M2[4]) && Math.abs(M2[3]) <= 0.5 * Math.abs(M2[0]) &&
      Math.abs(rotOf(M2)) <= MAX_ROT;
  }
  function refit(S, res, Ms, perPart) {
    /* 当てはまりのよい画だけを使う（取り違えた画が1本混ざると、変換全体が引きずられるため）。
     * 照合のよい順に 7 割。字全体なら 4 組以上、糸へん・吉それぞれなら 3 組以上。 */
    var groups = perPart ? [[0, 5], [6, 11]] : [[0, 11]], need = perPart ? 3 : 4;
    var out = Ms.slice(), changed = false;
    for (var g = 0; g < groups.length; g++) {
      var lo = groups[g][0], hi = groups[g][1], good = [], e, k;
      for (e = 0; e < res.A.length; e++) {
        var en = res.A[e];
        if (en.a >= lo && en.b <= hi) { good.push(en); }
      }
      good.sort(function (p, q) { return (p.c - q.c) || (p.a - q.a); });
      good = good.slice(0, Math.max(need, Math.ceil(good.length * 0.7)));
      /* 上下の両方に手がかりがないと、外挿で大きくずれる（士だけで口の位置を決める等）ので当て直さない */
      var top = false, bottom = false, mid = lo + 3;
      for (e = 0; e < good.length; e++) { if (good[e].a < mid) { top = true; } if (good[e].b >= mid) { bottom = true; } }
      if (good.length < need || !top || !bottom) { continue; }
      var M2 = fitAffine(S, good, Ms);
      if (!M2 || !sane(M2, Ms[lo])) { continue; }
      for (k = lo; k <= hi; k++) { out[k] = M2; }
      changed = true;
    }
    return changed ? out : null;
  }

  /* 対応づけから、お手本の各画に対応する線（キャンバス座標、お手本の向きにそろえたもの）を作る。
   * P は形の線（弧長で取り直して3点平均）、PL は同じ点の時刻での低域通過の線（ふるえを除いた線）。 */
  function buildPaths(S, res) {
    var P = [], PL = [], endK = [], covers = [], renmen = 0, k, j, e;
    for (k = 0; k < 12; k++) { P.push(null); PL.push(null); }
    for (e = 0; e < res.A.length; e++) {
      var en = res.A[e], TV = res.TV;
      if (en.a === en.b) {
        var ids = [en.i].concat(en.parts), list = [];
        for (j = 0; j < ids.length; j++) {
          var s = S[ids[j]], q0 = projParam(s.shc[0], TV[en.a]), q1 = projParam(s.shc[s.shc.length - 1], TV[en.a]);
          list.push({ pts: q0 <= q1 ? s.shape : s.shape.slice().reverse(), lp: q0 <= q1 ? s.lp : s.lp.slice().reverse(), key: (q0 + q1) / 2, id: ids[j] });
          endK[ids[j]] = en.a;
          covers[ids[j]] = [en.a + 1];
        }
        list.sort(function (p, q) { return (p.key - q.key) || geoCmp(S, p.id, q.id); });
        var cat = [], catL = [];
        for (j = 0; j < list.length; j++) { cat = cat.concat(list[j].pts); catL = catL.concat(list[j].lp); }
        P[en.a] = cat;
        PL[en.a] = catL;
        continue;
      }
      /* 連綿：1本の線の各点を、組の中で最も近いお手本の画に振り分け、前後7点の最頻値でならしてから区切る。
       * どのお手本の画からも遠い点（画と画のつなぎ線）は -1 にして、どの画にも入れない。
       * つなぎ線が混ざると、その画の角度や端点が大きくずれるため。 */
      var st = S[en.i], lab = [], lab2 = [], n = st.shc.length;
      /* at より前で、最後に -1 以外のラベルが付いた位置（間に -1 しか挟んでいないかの判定用） */
      var lastK = function (at) {
        for (var b = at - 1; b >= 0; b--) { if (lab2[b] !== -1) { return b; } }
        return -1;
      };
      for (j = 0; j < n; j++) {
        var bk = en.a, bd = Infinity;
        for (k = en.a; k <= en.b; k++) { var d = polyDist(st.shc[j], TV[k]); if (d < bd) { bd = d; bk = k; } }
        lab.push(bd > CONNECT ? -1 : bk);
      }
      for (j = 0; j < n; j++) {
        var cnt = {}, best = lab[j], bc = -1;
        for (var w = Math.max(0, j - 3); w <= Math.min(n - 1, j + 3); w++) { cnt[lab[w]] = (cnt[lab[w]] || 0) + 1; }
        for (k = en.a - 1; k <= en.b; k++) {
          var kl = k < en.a ? -1 : k;
          if ((cnt[kl] || 0) > bc) { bc = cnt[kl] || 0; best = kl; }
        }
        if ((cnt[lab[j]] || 0) === bc) { best = lab[j]; }   // 同数なら元のラベルを残す
        lab2.push(best);
      }
      /* 同じ画の区間が、つなぎ線（-1）だけを挟んで2つに切れていたら1つにつなぐ。
       * 画の途中でお手本から少し離れただけで、書き出しを見失わないようにするため。 */
      var runs = {}, rs = 0, open = {};
      for (j = 1; j <= n; j++) {
        if (j === n || lab2[j] !== lab2[rs]) {
          var kk = lab2[rs];
          if (kk >= 0) {
            var cur = open[kk] && open[kk].e === lastK(rs) ? { s: open[kk].s, e: j - 1 } : { s: rs, e: j - 1 };
            open[kk] = cur;
            if (!runs[kk] || (cur.e - cur.s) > (runs[kk].e - runs[kk].s)) { runs[kk] = cur; }
          }
          rs = j;
        }
      }
      var covered = 0;
      for (k = en.a; k <= en.b; k++) {
        var rn = runs[k];
        if (!rn || rn.e - rn.s + 1 < 2) { continue; }
        covered++;
        var sub = st.shape.slice(rn.s, rn.e + 1), subc = st.shc.slice(rn.s, rn.e + 1), subL = st.lp.slice(rn.s, rn.e + 1);
        var p0 = projParam(subc[0], TV[k]), p1 = projParam(subc[subc.length - 1], TV[k]);
        P[k] = p0 <= p1 ? sub : sub.reverse();
        PL[k] = p0 <= p1 ? subL : subL.reverse();
      }
      if (covered >= 2) { renmen++; }
      endK[en.i] = lab2[n - 1];
      var cov = [];
      for (k = en.a; k <= en.b; k++) { if (runs[k] && runs[k].e - runs[k].s + 1 >= 2) { cov.push(k + 1); } }
      covers[en.i] = cov;
    }
    return { P: P, PL: PL, endK: endK, renmen: renmen, covers: covers };
  }

  /* ============================================================ 時間の計測 */
  /* 低域通過した線。4ms 刻み（長すぎる画は 2000 点まで）の時間の格子に取り直し、ガウス窓で平均します。
   * ・点の間は線形に補う。点の間隔（60〜240Hz）に依らず、同じ窓で同じ時間を平均するため。
   * ・pointerup の点は時刻だけを使い、位置は最後の pointermove のままとする。静止中に
   *   pointermove が来ない端末では、止まっていた間の位置は最後の pointermove の位置だからです。
   *   ただし pointerup が最後の pointermove からキャンバスの 3% 以上離れていれば、その間も指が
   *   動いていた（点が間引かれた）とみなして、pointerup の位置まで線形に補います。
   * 2通り作ります。
   *  x, y   （止め用）：書き始めから pointerup まで。σ=LP_SIGMA_STOP。画の端では窓を片側だけにして
   *           重みの和で割り直すので、端の位置も揺れを除いた値になる。収筆の止め（f5。stopTime）に使う。
   *  sx, sy （形用）  ：書き始めから最後の pointermove まで（離す前の静止は入れない）。σ=LP_SIGMA。
   *           窓を画の端までの距離で左右対称に狭めるので、端の点は元の点のまま、端に近いほど弱く平均する。
   *           片側の窓は、動きながら書き始めた（書き終えた）端を線の内側へ引き込み、その量が書く速さで
   *           変わるため使いません。静止を入れないのは、止めのある端とない端で線の形が変わらないように
   *           （同じ形を逆向きに書いても同じ値になるように）するためです。
   *           口の角 f1/f9/f10・すき間 f2・横画 7/9/12 の角度・頭部突出 f13・線の長さ f6 に使います。 */
  /* 格子の刻み（LP_DT=4ms）に満たない、ごく短い時間で書かれた線は「時間の分からない線」として1点の格子にし、
   * 形は低域通過しない元の線を使います（shapeStrokes・inkLen）。0.0000001ms のような時間で書かれた線で、
   * 窓の幅（σ÷刻み）が桁外れに大きくなり、配列を確保できずに落ちるのを防ぐためです。 */
  function lpGrid(raw, last, tB) {
    var tA = raw[0].t, dur = tB - tA;
    var G = (dur >= LP_DT && isFinite(dur)) ? Math.min(LP_MAXN, Math.ceil(dur / LP_DT) + 1) : 1;
    if (G < 2) { return { t0: tA, dt: 0, x: [raw[last].x], y: [raw[last].y] }; }
    var dt = dur / (G - 1), gx = [], gy = [], i, j = 0;
    for (i = 0; i < G; i++) {
      var t = tA + i * dt;
      while (j < last && raw[j + 1].t <= t) { j++; }
      if (j >= last) { gx.push(raw[last].x); gy.push(raw[last].y); continue; }
      var a = raw[j], b = raw[j + 1], r = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 1;
      gx.push(a.x + (b.x - a.x) * r); gy.push(a.y + (b.y - a.y) * r);
    }
    return { t0: tA, dt: dt, x: gx, y: gy };
  }
  /* ガウス窓の平均。sym=true なら窓を端までの距離で左右対称に狭める（端の点は元のまま） */
  function lpSmooth(g, sigma, sym) {
    var G = g.x.length;
    if (G < 2) { return { t0: g.t0, dt: g.dt, x: g.x.slice(), y: g.y.slice() }; }
    /* 窓の半幅は格子の点の数までに抑える（それより広い窓は、端で打ち切られるので結果が同じ） */
    var K = Math.min(Math.ceil(3 * sigma / g.dt), G - 1), W = [], k, i, ox = [], oy = [];
    for (k = 0; k <= K; k++) { W.push(Math.exp(-(k * g.dt) * (k * g.dt) / (2 * sigma * sigma))); }
    for (i = 0; i < G; i++) {
      var h = sym ? Math.min(K, i, G - 1 - i) : K, sx = 0, sy = 0, sw = 0;
      for (k = Math.max(0, i - h); k <= Math.min(G - 1, i + h); k++) {
        var w = W[k > i ? k - i : i - k];
        sx += w * g.x[k]; sy += w * g.y[k]; sw += w;
      }
      ox.push(sx / sw); oy.push(sy / sw);
    }
    return { t0: g.t0, dt: g.dt, x: ox, y: oy };
  }
  function lowpass(raw) {
    var m = raw.length - 1, last = m > 0 ? m - 1 : 0;
    if (m > 0 && dist(raw[m], raw[last]) > UP_JUMP) { last = m; }
    var A = lpSmooth(lpGrid(raw, last, raw[m].t), LP_SIGMA_STOP, false);
    return { t0: A.t0, dt: A.dt, x: A.x, y: A.y, shape: lpSmooth(lpGrid(raw, last, raw[last].t), LP_SIGMA, true), tEnd: raw[last].t };
  }
  /* 形用の低域通過の線の、時刻 t での位置（格子の間は線形に補い、範囲の外は端の位置） */
  function lpAt(L, t) {
    var B = L.shape, G = B.x.length;
    if (G < 2 || !(B.dt > 0)) { return pt(B.x[0], B.y[0]); }
    var u = clamp((t - B.t0) / B.dt, 0, G - 1), i = Math.min(G - 2, Math.floor(u)), r = u - i;
    return pt(B.x[i] + (B.x[i + 1] - B.x[i]) * r, B.y[i] + (B.y[i + 1] - B.y[i]) * r);
  }
  function lpPath(L) { var o = []; for (var i = 0; i < L.x.length; i++) { o.push(pt(L.x[i], L.y[i])); } return o; }

  /* 収筆の停止時間（f5 の1画分）：指が離した位置に着いてから、指を離すまでの時間。
   * 「離した位置の近くにいた時間」をそのまま測ると、ゆっくり書く人ほど着く前の減速にも時間がかかるので、
   * 止めずに離しても長い止めに見えます（以前の測り方。速さ 0.3 字高/秒で止め 0ms の人が 280ms、5画とも「とめ」）。
   * 速さは f6 で別に測っているので、y 軸に速さが二重に入ることにもなっていました。
   * そこで、着く前の近づき方から「着いた時刻」を割り出し、そこから離すまでを止めとします。
   *  ・低域通過した線（止め用）が、離した位置から q1（字の大きさの 12%）より外にいた最後の時刻 t1 と、
   *    q2（6%）より外にいた最後の時刻 t2 を取る。どちらも止まる前の、まだ動いている区間なので、
   *    ふるえ（低域通過のあとに残る 1px 前後）やセンサーの揺れの影響は小さい。
   *  ・近づく運動を最小加加速度の運動（人の到達運動の標準的なモデル。Flash & Hogan 1985）とみなし、
   *    残りの距離の割合 f と残りの時間の割合 w の関係 f = 10w³−15w⁴+6w⁵ から、
   *    t2 から着くまでの時間 = (t2−t1)·w(q2/L)/(w(q1/L)−w(q2/L))（L はその画の長さ）を求める。
   *  ・止め = 離した時刻 −（t2 ＋ 着くまでの時間）。負なら 0。
   * 合成データ（近づき方はこの同じモデル）では、止め 0ms の人は速さ 0.3〜3 字高/秒のどれでも 0ms 付近、
   * 止め 250ms の人は 200〜240ms（速さによる差は ±20ms ほど）になります。人の指の近づき方がこのモデルから
   * どれだけずれるかは、パイロットの実測で確かめる必要があります（ずれた分は、速さへの依存として残ります）。
   * ・距離は字の大きさに比例させるので、キャンバスの大きさ（画面の回転で作り直したとき）でも、字の大きさでも変わりません。
   * ・静止中に位置の変わらない pointermove が来る端末でも、来ない端末でも同じ値になります（低域通過の注記）。
   * cs は字の大きさ、len はその画（お手本の画に対応づいた線）の長さ（どちらもキャンバス一辺=1）。
   * 測れないとき（時間の分からない線、画が短すぎて q1/2 まで離れていない）は null。 */
  function mjRemain(f) {
    if (!(f > 0)) { return 0; }
    if (f >= 0.5) { return 0.5; }
    var lo = 0, hi = 0.5;
    for (var k = 0; k < 40; k++) {
      var m = (lo + hi) / 2, v = m * m * m * (10 - 15 * m + 6 * m * m);
      if (v < f) { lo = m; } else { hi = m; }
    }
    return (lo + hi) / 2;
  }
  /* 低域通過した線が、終点から q より外にいた最後の時刻（格子の間は線形に補う）。一度も出ていなければ null */
  function lastBeyond(L, q) {
    var G = L.x.length, e = G - 1, fx = L.x[e], fy = L.y[e];
    function d(i) { var dx = L.x[i] - fx, dy = L.y[i] - fy; return Math.sqrt(dx * dx + dy * dy); }
    for (var j = e - 1; j >= 0; j--) {
      var dj = d(j);
      if (dj >= q) {
        var dn = d(j + 1), a = dj > dn ? clamp((dj - q) / (dj - dn), 0, 1) : 0;
        return L.t0 + (j + a) * L.dt;
      }
    }
    return null;
  }
  function stopTime(L, cs, len) {
    var G = L.x.length;
    if (G < 2 || !(L.dt > 0) || !(cs > 0) || !(len > 0)) { return null; }
    var tUp = L.t0 + (G - 1) * L.dt;
    for (var h = 1; h <= 2; h++) {
      var q1 = STOP_Q1 * cs / h, q2 = STOP_Q2 * cs / h;
      var t1 = lastBeyond(L, q1), t2 = lastBeyond(L, q2);
      if (t1 === null || t2 === null) { continue; }
      var w1 = mjRemain(q1 / len), w2 = mjRemain(q2 / len);
      if (!(w1 > w2)) { return null; }
      var tm = t2 + (t2 - t1) * w2 / (w1 - w2);
      return Math.max(0, tUp - tm);
    }
    return null;
  }
  /* インクの長さ（f6 用）：形用の低域通過の線を、字の大きさの 1% 刻みで取り直し、Douglas–Peucker 法で
   * 字の大きさの INK_EPS 以内の小さな揺れを落としてから測る。
   * ・ふるえやセンサーの揺れで線が長く見え、同じ人が速く出てしまうのを防ぐため。
   * ・離す前の静止中に pointermove が来る端末（止めた位置のまわりの小さな揺れが線に入る）と、
   *   来ない端末とで長さが変わらないようにするため。
   * ・線の両端を同じ規則で扱うので、同じ形を逆向きに書いても同じ長さになります。 */
  function inkLen(s, cs) {
    /* 時間の分からない線（lpGrid の注記）は、低域通過しない形の線で測ります */
    var src = s.L.shape.x.length >= 2 ? lpPath(s.L.shape) : s.shape;
    var p = resample(src, 0.01 * cs, MAX_SHAPE_PTS), n = p.length;
    if (n < 3) { return plen(p); }
    var keep = [], stack = [[0, n - 1]], eps2 = INK_EPS * cs * INK_EPS * cs, i;
    keep[0] = keep[n - 1] = true;
    while (stack.length) {
      var sg = stack.pop(), a = sg[0], b = sg[1], best = -1, bd = eps2;
      for (i = a + 1; i < b; i++) { var d = segDist2(p[i], p[a], p[b]); if (d > bd) { bd = d; best = i; } }
      if (best >= 0) { keep[best] = true; stack.push([a, best]); stack.push([best, b]); }
    }
    var q = [];
    for (i = 0; i < n; i++) { if (keep[i]) { q.push(p[i]); } }
    return plen(q);
  }

  /* ============================================================ 接筆・転折 */
  /* 口の角のすき間（線幅の何倍か）。交わっていれば 0。
   * どちらの端がもう一方の線に届いているかは人によって違うので、両方向の小さい方を取ります。 */
  function cornerGap(A, aEnd, B, bEnd) {
    if (!A || !B) { return null; }
    if (polyCross(A, B)) { return 0; }
    var pa = aEnd ? A[A.length - 1] : A[0], pb = bEnd ? B[B.length - 1] : B[0];
    return Math.min(polyDist(pa, B), polyDist(pb, A)) / LW;
  }
  function state3(ratio) {
    if (ratio === null) { return null; }
    return ratio <= 1 ? "closed" : (ratio <= 2 ? "ambiguous" : "open");
  }
  function gapFeat(g) {
    var r = rnd(g, 0.01);
    return r === null ? null : { state: state3(r), ratio: r };
  }
  /* 横折(11)の折れ目のうち、前後の直線部分に当てはめた線の交点から、実際の線までの距離。
   * 角ばっていれば交点のそばを通り（小さい）、丸ければ内側を通る（大きい）。口の幅で割ります。 */
  function cornerCut(p11, kouW) {
    if (!p11 || p11.length < 4 || !(kouW > 0)) { return null; }
    /* 折れ目は ±8 点（線の約 12%）の向きの変化で探す。丸く曲げた人でも折れ目を見失わないように */
    var r = resampleN(p11, 64), ci = -1, best = 0, i;
    for (i = 10; i <= 53; i++) {
      var t = turnAt(r[i - 8], r[i], r[i + 8]);
      if (t > best) { best = t; ci = i; }
    }
    if (ci < 0 || best < Math.PI / 4) { return null; }
    var legA = r.slice(2, ci - 9), legB = r.slice(ci + 10, 62);
    if (legA.length < 4 || legB.length < 4) { return null; }
    var la = axisOf(legA), lb = axisOf(legB), den = la.ux * lb.uy - la.uy * lb.ux;
    if (Math.abs(den) < 0.2) { return null; }
    var s = ((lb.x - la.x) * lb.uy - (lb.y - la.y) * lb.ux) / den;
    var X = pt(la.x + s * la.ux, la.y + s * la.uy);
    return polyDist(X, r) / kouW;
  }
  /* 転折の判定。あいまいな帯（0.03〜0.05）は「判定なし」にして、表示もしません。 */
  function tensetsu(v) {
    if (typeof v !== "number" || !isFinite(v)) { return null; }
    return v <= 0.03 ? "kaku" : (v >= 0.05 ? "maru" : null);
  }
  /* 横折の横の部分。折れ目は線の 15〜80% の範囲で探す（終わり際の小さな鉤を折れ目と取り違えないように）。
   * 角度を測る横の部分は、弧長で前後 4 点（線の約 10%）の左右対称の移動平均でならします。
   * 指のふるえの波で当てはめの角度がぶれないようにするためです。時間の低域通過は使いません
   * （折れ目を止まらずに曲がる人ほど角が丸くなり、書く速さで角度が変わってしまうため）。 */
  function firstLeg(p11) {
    if (!p11 || p11.length < 4) { return null; }
    var r = resampleN(p11, 40), ci = 20, best = 0, i, k;
    for (i = 6; i <= 32; i++) {
      var t = turnAt(r[i - 3], r[i], r[i + 3]);
      if (t > best) { best = t; ci = i; }
    }
    if (ci - 3 < 3) { return null; }
    var leg = r.slice(1, ci - 2), out = [];
    for (i = 0; i < leg.length; i++) {
      var h = Math.min(4, i, leg.length - 1 - i), sx = 0, sy = 0;
      for (k = i - h; k <= i + h; k++) { sx += leg[k].x; sy += leg[k].y; }
      out.push(pt(sx / (2 * h + 1), sy / (2 * h + 1)));
    }
    return out;
  }

  /* ================================================================ 解析 */
  /* 入力を整える：キャンバス一辺=1 の座標にし、壊れた点を捨て、画を書き始めの時刻で並べる。
   * ・数でない点と、キャンバスの一辺の 10 倍より外の点は捨てる（単位の取り違えなどで計算が止まらないように）。
   * ・画の中で、前の点より時刻が戻る点は捨てる。時刻がばらばらのままだと、止めや速さが
   *   でたらめな値になって型が変わるため。多いとき（点の 5% 超）や、画どうしの時間が重なるとき、
   *   長さのある画の半分超が 0ms のときは badTime として知らせる。 */
  function prepare(strokes, side) {
    var out = [], total = 0, dropped = 0;
    if (!(side > 0) || !isFinite(side) || !strokes || typeof strokes.length !== "number") { return { S: out, bad: false }; }
    for (var i = 0; i < strokes.length; i++) {
      var s = strokes[i];
      if (!s || !s.points || typeof s.points.length !== "number") { continue; }
      var raw = [];
      for (var j = 0; j < s.points.length; j++) {
        var p = s.points[j];
        if (!p) { continue; }
        var x = +p.x / side, y = +p.y / side, t = +p.t;
        if (!isFinite(x) || !isFinite(y) || !isFinite(t) || Math.abs(x) > MAX_COORD || Math.abs(y) > MAX_COORD || Math.abs(t) > 1e13) { continue; }
        total++;
        if (raw.length && t < raw[raw.length - 1].t) { dropped++; continue; }
        raw.push({ x: x, y: y, t: t });
      }
      if (raw.length) { spreadTimes(raw); out.push({ raw: raw, t0: raw[0].t, t1: raw[raw.length - 1].t, ext: extent(raw) }); }
    }
    /* 時間の特徴は書いた順で測るので、書き始めの時刻で並べる（同時刻なら位置で決める） */
    out.sort(function (a, b) { return (a.t0 - b.t0) || (a.raw[0].x - b.raw[0].x) || (a.raw[0].y - b.raw[0].y); });
    /* 指1本で書くので、線どうしの時間が重なることはない。長さのある画のほとんどが 0ms ということもない。
     * どちらかがあれば、時刻の付け方の不具合。触れただけの点（広がりが DOT_LEN 未満）はどのみち使わないので数えない。
     * 0ms の画は「半分を超えたら」にします。時刻が 100ms 刻みに丸められるブラウザ（指紋対策）では、
     * 短い点の画だけが 0ms になることがあるためです。 */
    var overlap = 0, zero = 0, real = 0, prev = null;
    for (i = 0; i < out.length; i++) {
      var Li = out[i].ext;
      if (Li < DOT_LEN) { continue; }
      if (prev && out[i].t0 < prev.t1) { overlap++; }
      if (Li >= TAP_LEN) { real++; if (out[i].t1 <= out[i].t0) { zero++; } }
      prev = out[i];
    }
    return { S: out, bad: dropped > Math.max(2, 0.05 * total) || overlap > 0 || (real > 0 && zero * 2 > real) };
  }

  /* 同じ時刻の点が続くとき（getCoalescedEvents の点に親イベントの時刻が付く端末や、時刻を 16〜100ms に
   * 丸めるブラウザ）は、その時刻のまわりに等間隔に並べ直す。本当に点を取った時刻はその前後にあり、
   * 並べ直さないと時間の低域通過で同じ時刻の点が1つにつぶれて、線の形と長さが崩れるためです。
   * ・並べる範囲は、前の時刻との中点から次の時刻との中点まで。切り上げ（フレームの配送時刻）でも
   *   切り捨て（時刻の丸め）でも、ずれが片寄らないようにするため。
   * ・画の最初の塊はその時刻から、最後の塊（pointerup の直前）はその時刻までに収める。
   *   離す前の静止（止め）の長さを変えないため。pointerup の時刻そのものも動かしません。 */
  function spreadTimes(raw) {
    var n = raw.length - 1, i = 0, j, k;
    while (i < n) {
      j = i;
      while (j + 1 < n && raw[j + 1].t === raw[i].t) { j++; }
      if (j > i) {
        var T = raw[i].t, L = j - i + 1;
        var Ta = i > 0 ? (raw[i - 1].t + T) / 2 : T;
        var Tb = j + 1 < n ? (T + raw[j + 1].t) / 2 : T;
        if (Tb > Ta) {
          for (k = i; k <= j; k++) {
            /* 最初の塊は端点を T にそろえ、それ以外は範囲を L 等分した区間の中央に置く */
            raw[k].t = i === 0 ? Ta + (Tb - Ta) * (k - i) / (L - 1) : Ta + (Tb - Ta) * (k - i + 0.5) / L;
          }
        }
      }
      i = j + 1;
    }
  }

  function emptyFeats() { var f = {}; for (var i = 0; i < FKEYS.length; i++) { f[FKEYS[i]] = null; } return f; }
  function numAsc(p, q) { return p - q; }

  /* 画の番号の組の外接枠（生の点で測る） */
  function bboxOf(S, ids) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (var q = 0; q < ids.length; q++) {
      var raw = S[ids[q]].raw;
      for (var i = 0; i < raw.length; i++) {
        var p = raw[i];
        if (p.x < x0) { x0 = p.x; } if (p.x > x1) { x1 = p.x; }
        if (p.y < y0) { y0 = p.y; } if (p.y > y1) { y1 = p.y; }
      }
    }
    return { x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0, h: y1 - y0 };
  }
  function sameBox(a, b) { return a.x0 === b.x0 && a.x1 === b.x1 && a.y0 === b.y0 && a.y1 === b.y1; }
  /* 書いた時間：各画の長さと、画と画の間（1.5秒で打ち切り）の和。速すぎの判定だけに使う。
   * 考え直しの間や、書き終えてからの迷いタップで「ゆっくり書いた」ことにならないように。
   * unitOf（unitMap）があれば、同じ画の切れ端どうしの間（途中で指が離れた間）は数えません。 */
  function effMs(S, ids, unitOf) {
    var s = 0;
    for (var j = 0; j < ids.length; j++) {
      var a = S[ids[j]];
      s += a.t1 - a.t0;
      if (j > 0 && !sameUnit(unitOf, ids[j - 1], ids[j])) { s += Math.min(GAP_CAP, Math.max(0, a.t0 - S[ids[j - 1]].t1)); }
    }
    return s;
  }
  /* 時間の特徴で「1画」として扱うまとまり：お手本の画（続け書きの組）に対応づいた線と、その「画の一部」。
   * 画の途中で指が一瞬離れた（タッチの取りこぼし）だけで、切れ目が「画と画の間」に数えられ、
   * 1画の長さの中央値や間の割合（f8）が変わって型が変わらないようにするためです。unitOf[画の番号] = 組の番号 */
  function unitMap(res) {
    var u = {};
    for (var e = 0; e < res.A.length; e++) {
      u[res.A[e].i] = e;
      for (var q = 0; q < res.A[e].parts.length; q++) { u[res.A[e].parts[q]] = e; }
    }
    return u;
  }
  function sameUnit(unitOf, a, b) { return !!unitOf && unitOf[a] !== undefined && unitOf[a] === unitOf[b]; }
  /* 対応づけの結果から、画の番号を集める。
   *  usedIds：お手本の画（または続け書きの組）そのものとして対応づいた画と、その「画の一部」。
   *           外接枠（作り直し・f14・f7・f2）も時間の特徴（f5・f6・f8・totalMs）も、これで測ります。
   *  inkIds ：さらに、なぞり書きなど形には使わない重ね書き（dup）を加えたもの。extraInk の判定用です。 */
  function collectIds(res, withParts, withDup) {
    var u = [];
    for (var e = 0; e < res.A.length; e++) {
      var en = res.A[e], q;
      u.push(en.i);
      if (withParts) { for (q = 0; q < en.parts.length; q++) { u.push(en.parts[q]); } }
      if (withDup) { for (q = 0; q < en.dup.length; q++) { u.push(en.dup[q]); } }
    }
    return u.sort(numAsc);
  }
  function usedIds(res) { return collectIds(res, true, false); }
  function inkIds(res) { return collectIds(res, true, true); }
  /* 対応づけの良さ：
   *  strict：1周目の厳しいしきい値で対応づいたお手本の画の数　resid：照合距離の平均
   *  extra ：どの画にも対応しないインクの割合（なぞり書きは対応したものとして数える）
   *  bad   ：この対応づけのままだと弾かれる理由の数（noMatch と extraInk）
   * 最初の位置合わせを回して試したときは、bad の少ないもの → strict の多いもの → resid の小さいもの を選びます。
   * strict だけで比べると、口を4画で書いた人の字で、横折の2本を捨てて「底の横画が横折も兼ねる」ような
   * 取り違えのほうが、対応づいた画の数が多く見えてしまうためです。 */
  function quality(res, S, off) {
    var nStrict = 0, rsum = 0, e, i, ok = {}, IK = inkIds(res), all = 0, out = 0;
    for (e = 0; e < res.A.length; e++) {
      if (res.A[e].c < MAXC) { nStrict += res.A[e].b - res.A[e].a + 1; }
      rsum += res.A[e].c;
    }
    for (i = 0; i < IK.length; i++) { ok[IK[i]] = true; }
    for (i = 0; i < S.length; i++) {
      if (i === off) { continue; }   // 対応づけから外した線は、無かったものとして比べる（押しのけの確かめの当て直し）
      var li = plen(S[i].shape);
      all += li;
      if (!ok[i]) { out += li; }
    }
    var resid = res.A.length ? rsum / res.A.length : Infinity, extra = all > 0 ? out / all : 0;
    var bad = (nStrict < MIN_STRICT || !(resid <= MAX_RESID) ? 1 : 0) + (extra > EXTRA_INK ? 1 : 0);
    return { strict: nStrict, resid: resid, extra: extra, bad: bad };
  }
  function better(q, r) {
    if (q.bad !== r.bad) { return q.bad < r.bad; }
    return q.strict > r.strict || (q.strict === r.strict && q.resid < r.resid);
  }

  /* 画ごとの前処理：形の線（弧長で取り直して3点平均）、照合用の粗い線（字の大きさ=1）、
   * 形の線と同じ点の時刻での低域通過の線。取り直しの間隔は字の大きさに比例させ、
   * 大きさを変えても同じ形なら同じ値になるようにします。 */
  function shapeStrokes(S, B, cs) {
    var step = cs * 0.01;
    for (var i = 0; i < S.length; i++) {
      var s = S[i], j, raw = s.raw, up = raw[raw.length - 1];
      /* 形の点の時刻は、離す前の静止を含めない（pointerup の時刻を最後の pointermove の時刻に詰める）。
       * 静止の時刻が取り直しと3点平均で端の点に混ざると、止めのある端だけ線の形がずれ、
       * 同じ形を逆向きに書いたときに値が変わってしまうため。 */
      if (up.t > s.L.tEnd) { raw = raw.slice(0, raw.length - 1).concat([{ x: up.x, y: up.y, t: s.L.tEnd }]); }
      s.shape = smooth3(resample(raw, step, MAX_SHAPE_PTS));
      s.shc = [];
      s.lp = [];
      /* 時間の分からない線（lpGrid の注記）は、低域通過の線の代わりに形の線をそのまま使う */
      var noT = s.L.shape.x.length < 2;
      for (j = 0; j < s.shape.length; j++) {
        s.shc.push(pt((s.shape[j].x - B.x0) / cs, (s.shape[j].y - B.y0) / cs));
        s.lp.push(noT ? pt(s.shape[j].x, s.shape[j].y) : lpAt(s.L, s.shape[j].t));
      }
      s.co = resample(s.shc, 0.03, MAX_CO_PTS);
      /* 長さのつり合いを見るための線の長さ（字の大きさ=1）。ふるえや止めの間の小さな揺れで長く見えて、
       * ふるえのある人の画が弾かれないよう、f6 と同じ測り方（低域通過＋小さな揺れを落とす）にします。 */
      s.len = inkLen(s, cs) / cs;
      var g = centroid(s.co);
      s.gx = g.x; s.gy = g.y;
    }
  }
  /* 最初の位置合わせ：お手本を中心のまわりに deg 度（右側が上がる向きを正）回してから、その外接枠を
   * 字の外接枠に合わせる一次変換（お手本の座標 → 字の外接枠の左上を原点、字の大きさ=1 の座標）。 */
  function initM(B, cs, deg) {
    var sx, sy;
    if (deg === 0) {   // 回転なしは、お手本の外接枠をそのまま使う（丸め誤差まで従来と同じ値にするため）
      sx = B.w / cs / TB.w; sy = B.h / cs / TB.h;
      return [sx, 0, -TB.x0 * sx, 0, sy, -TB.y0 * sy];
    }
    var a = deg * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
    var cx = TB.x0 + TB.w / 2, cy = TB.y0 + TB.h / 2, rx0 = Infinity, ry0 = Infinity, rx1 = -Infinity, ry1 = -Infinity;
    for (var k = 0; k < 12; k++) {
      for (var j = 0; j < TPL[k].v.length; j++) {
        var p = TPL[k].v[j], dx = p.x - cx, dy = p.y - cy;
        var x = cx + dx * co + dy * si, y = cy - dx * si + dy * co;
        if (x < rx0) { rx0 = x; } if (x > rx1) { rx1 = x; }
        if (y < ry0) { ry0 = y; } if (y > ry1) { ry1 = y; }
      }
    }
    sx = B.w / cs / (rx1 - rx0); sy = B.h / cs / (ry1 - ry0);
    return [sx * co, sx * si, sx * (cx - cx * co - cy * si - rx0),
            -sy * si, sy * co, sy * (cy + cx * si - cy * co - ry0)];
  }
  /* 位置合わせ一式：最初の位置合わせ → 対応づけ → 字全体で当て直し → 糸へんと吉で別々に当て直し。
   * 回転なしで十分に当てはまらなければ、±10°・±20° 回した最初の位置合わせからもやり直し、
   * いちばんよく当てはまったもの（弾かれる理由が少ない → はっきり対応づいた画が多い → 照合距離の平均が小さい。
   * quality の注記）を使います。
   * 外接枠を作り直したあとも、いつも回転なしから試します。前の回の回転から始めると、同じ字でも
   * 迷い線があったかどうかで別の当てはめに落ち着き、測定値が変わることがあるためです。 */
  function align(S, B, cs, off, rotList) {
    shapeStrokes(S, B, cs);
    var rots = rotList || [0].concat(ROT_TRY), best = null, r, k;
    for (r = 0; r < rots.length; r++) {
      var M = initM(B, cs, rots[r]), Ms = [];
      for (k = 0; k < 12; k++) { Ms.push(M); }
      var res = assignOnce(S, Ms, off);
      res.Ms = Ms; res.rot = rots[r];
      for (var it = 0; it < 2; it++) {
        var M2 = refit(S, res, Ms, it === 1);
        if (M2) { Ms = M2; res = assignOnce(S, Ms, off); res.Ms = Ms; res.rot = rots[r]; }
      }
      var q = quality(res, S, off);
      if (!best || better(q, best.q)) { best = { res: res, q: q }; }
      if (best.q.bad === 0 && best.q.strict >= GOOD_STRICT && best.q.resid <= GOOD_RESID) { break; }
    }
    return best.res;
  }
  /* 外接枠の選び方と位置合わせ一式（off の画は対応づけに使わない。-1 なら全部使う）。
   * 最初の外接枠（mainStrokes）で位置合わせをし、対応づいた画（お手本の画そのもの＋その一部）だけで外接枠を作り直して、
   * 位置合わせをやり直す（最大2回）。どの画にも対応しないインク（迷いタップ・迷い線・なぐり書き）を、
   * 大きさ・縦横比・すき間・位置合わせに入れないためです。外接枠が変わらなくなったら終わりです。
   * 以前は、最初の外接枠に紛れ込んだ迷い線が引き伸ばされたお手本の画の「一部」につながれ、作り直した外接枠にまた入る、
   * という堂々めぐりがありました。いまは (1) 最初の外接枠から離れた線・字の端の短い線を外し（mainStrokes）、
   * (2) 画の一部は、その回の位置合わせで画の長さの範囲・向き・重なりを確かめてから足し（partFit）、
   * (3) 字のすぐ外の長い迷い線が本物の画を押しのけていないかを確かめます（displaced）。
   * 画の一部を外接枠から外さないのは、途中で指が離れて2〜3本に切れた画でも、切れなかったときと同じ
   * 縦横比・大きさ・すき間になるようにするためです（外すと、縦画4を2本に切っただけで f7 が 8 割の人で変わった）。 */
  function solve(S, use, off, rotList) {
    var u = [], i;
    for (i = 0; i < use.length; i++) { if (use[i] !== off) { u.push(use[i]); } }
    var B = bboxOf(S, u), cs = Math.max(B.w, B.h);
    var Bm = bboxOf(S, mainStrokes(S, u));
    if (Math.max(Bm.w, Bm.h) > 0) { B = Bm; cs = Math.max(B.w, B.h); }
    var res = align(S, B, cs, off, rotList), A = usedIds(res);
    for (var round = 0; round < 2 && A.length; round++) {
      var B2 = bboxOf(S, A);
      if (sameBox(B2, B) || !(Math.max(B2.w, B2.h) > 0)) { break; }
      B = B2; cs = Math.max(B.w, B.h);
      res = align(S, B, cs, off, rotList); A = usedIds(res);
    }
    return { res: res, B: B, cs: cs, off: off };
  }
  /* お手本の画そのもの（組の先頭の線）でないのに、お手本のどれかの画のそば（平均 MAXC 未満）にある線の数：
   * 画の一部・なぞり書き・押し出された本物の画（広がりが TAP_LEN 以上）。どの画からも遠い迷い線は数えません
   * （押しのけの手がかりにならず、確かめの当て直しが無駄に重くなるだけなので）。 */
  function nonPrimary(res, S) {
    var prim = {}, c = 0, e, i, k;
    for (e = 0; e < res.A.length; e++) { prim[res.A[e].i] = true; }
    for (i = 0; i < S.length; i++) {
      if (prim[i] || S[i].ext < TAP_LEN) { continue; }
      for (k = 0; k < 12; k++) { if (directed(S[i].co, res.TV[k]) < MAXC) { c++; break; } }
    }
    return c;
  }
  /* 押しのけの確かめ。字のすぐ外（LINK_D 以内）の長い迷い線（SHORT_D 以上）は最初の外接枠に残るので、お手本が
   * 引き伸ばされ、迷い線がお手本の画を1つ取り、本物の画が「画の一部」やなぞり書きに押し出されることがあります。
   * 押し出された画も字のインクとして数えるので extraInk にならず、対応づけの違う測定値が黙って出ていました
   * （糸の左や士の上に 20〜25% の迷い線で、型が変わる例があった）。
   * 続け書きの組（糸の 1-2 など）から画を1つ取られるだけのこともあり、そのときは押し出される線が無く、当てはまりだけが悪くなります。
   * そこで、お手本の画のそばにあるのにお手本の画そのものでない線（nonPrimary）があるとき、または当てはまり（照合距離の平均）が DISP_RESID を
   * 超えるとき（合成のきれいな字では 99% 点が 0.022）だけ、対応づいた画の外接枠の端を作っている線を
   * 1本ずつ外して当て直し（solve の off）、次のすべてを満たせば、その線を「字と関係のない線」として外した当て直しを使います。
   *  (0) その線が、字のほかの線から線の太さ（LW）より離れている（本物の画は、たいていほかの画に接している）
   *  (1) はっきり対応づいたお手本の画の数が減らない  (2) 当てはまり（照合距離の平均）が良くなる
   *  (3) 外した線が、当て直した位置合わせで、どのお手本の画からも平均 STRAY_D 以上離れている
   *      （本物の画は自分のお手本の画に重なるので外れない。口を4画で書いた横折の片方・途中で切れた画・なぞり書きも同じ）
   * 外した線は、どの画にも対応しないインクとして数えるので、長ければ extraInk で弾かれ、短ければ黙って外れます
   * （どちらでも、測定値が迷い線で黙って変わることはありません）。候補が複数あれば、当てはまりのいちばん良いものを選びます。 */
  function displaced(S, use, fit) {
    var res = fit.res, q0 = quality(res, S);
    if (!res.A.length || (!nonPrimary(res, S) && !(q0.resid > DISP_RESID))) { return fit; }
    /* どのみち「結」として当てはまらない入力（noMatch で弾く）は確かめない（弾くことは変わらず、重い当て直しを避ける） */
    if (use.length < 4 || q0.strict < MIN_STRICT || !(q0.resid <= MAX_RESID)) { return fit; }
    /* 候補：外接枠の端を1本だけで作っている線（その線を除くと枠が縮む）と、照合距離がいちばん大きいお手本の画そのもの。
     * 迷い線は、枠を広げてお手本を引き伸ばすか、枠の内側でお手本の画を1つ横取りするかのどちらかなので */
    var A = usedIds(res), box = [], i, j, cand = [], worst = -1, wc = -1;
    for (i = 0; i < A.length; i++) { box.push(bboxOf(S, [A[i]])); }
    for (i = 0; i < A.length; i++) {
      if (S[A[i]].ext < TAP_LEN) { continue; }
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (j = 0; j < A.length; j++) {
        if (j === i) { continue; }
        x0 = Math.min(x0, box[j].x0); y0 = Math.min(y0, box[j].y0); x1 = Math.max(x1, box[j].x1); y1 = Math.max(y1, box[j].y1);
      }
      if (x0 > box[i].x0 || box[i].x1 > x1 || y0 > box[i].y0 || box[i].y1 > y1) { cand.push(A[i]); }
    }
    for (i = 0; i < res.A.length; i++) {
      if (res.A[i].c > wc && S[res.A[i].i].ext >= TAP_LEN) { wc = res.A[i].c; worst = res.A[i].i; }
    }
    if (worst >= 0 && cand.indexOf(worst) < 0) { cand.push(worst); }
    /* 候補ごとの当て直しは、回さない位置合わせと、元の当てはめで選ばれた回転だけで試す（速さのため。
     * 元の回転だけにすると、迷い線に引きずられて選ばれた回転しか試さず、迷い線を見逃すことがあった）。
     * 選んだ候補は、最後に全部の回転を試す当て直しでやり直すので、その線が無かったときと同じ結果になります。 */
    var best = null, bestQ = null, quick = res.rot ? [0, res.rot] : [0], IK = inkIds(res), rawP = {};
    function coarse(id) { if (!rawP[id]) { rawP[id] = resample(S[id].raw, LW / 2, MAX_SHAPE_PTS); } return rawP[id]; }
    for (i = 0; i < cand.length; i++) {
      /* (0) 字のほかの線に触れている線（線の太さ LW 以内）は外さない。本物の画はたいていほかの画と接したり交わったりしていて、
       *     字全体が傾いて位置合わせが甘いときに、当てはまりの悪い本物の画（口の縦・士の縦など）を外してしまわないように。
       *     字に触れている迷い線は、字のインクと見分けられないので、この確かめの対象にしません。 */
      var cp0 = coarse(cand[i]), touch = false;
      for (j = 0; j < IK.length && !touch; j++) {
        if (IK[j] === cand[i]) { continue; }
        var other = coarse(IK[j]);
        for (var q = 0; q < cp0.length; q++) { if (polyDist(cp0[q], other) < LW) { touch = true; break; } }
      }
      if (touch) { continue; }
      var alt = solve(S, use, cand[i], quick), qa = quality(alt.res, S);
      if (!(qa.strict >= q0.strict && qa.resid < q0.resid)) { continue; }
      /* (3)：外した線の照合用の線（S[..].co）は、いま当て直した外接枠で作られている */
      var far = Infinity, TV = alt.res.TV;
      for (j = 0; j < 12; j++) { far = Math.min(far, directed(S[cand[i]].co, TV[j])); }
      if (!(far >= STRAY_D)) { continue; }
      if (!best || qa.resid < bestQ.resid) { best = alt; bestQ = qa; }
    }
    if (!cand.length) { return fit; }
    if (best) { return solve(S, use, best.off); }
    /* 候補の当て直しで、画ごとの照合用の線が別の外接枠で作り直されているので、元の外接枠で作り直す */
    shapeStrokes(S, fit.B, fit.cs);
    return fit;
  }

  /* 最初の外接枠に入れる画：長さがキャンバス一辺の 2% 以上で、字のほかの線から離れたかたまり（迷い線）でないもの。
   * 「離れている」の基準（字の大きさの LINK_D 倍）の字の大きさは、線ごとに「その線を除いたほかの線の外接枠」で測ります。
   * 迷い線そのもので外接枠が大きく見えると基準もゆるくなり、字のすぐ外の迷い線が残ってしまうためです。
   * 線どうしの距離は、粗く取り直した点どうしで測ります（速さのため。誤差は刻みの半分）。 */
  function mainStrokes(S, cand) {
    if (cand.length < 3) { return cand; }
    var B0 = bboxOf(S, cand), cs0 = Math.max(B0.w, B0.h);
    if (!(cs0 > 0)) { return cand; }
    var pts = [], ink = [], box = [], lim = [], par = [], total = 0, i, j, a, b;
    for (i = 0; i < cand.length; i++) {
      pts.push(resample(S[cand[i]].raw, 0.02 * cs0, 60));
      ink.push(plen(S[cand[i]].raw));
      box.push(bboxOf(S, [cand[i]]));
      par.push(i);
      total += ink[i];
    }
    for (i = 0; i < cand.length; i++) {
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (j = 0; j < cand.length; j++) {
        if (j === i) { continue; }
        x0 = Math.min(x0, box[j].x0); y0 = Math.min(y0, box[j].y0); x1 = Math.max(x1, box[j].x1); y1 = Math.max(y1, box[j].y1);
      }
      lim.push(LINK_D * Math.max(x1 - x0, y1 - y0));
    }
    function root(x) { while (par[x] !== x) { x = par[x]; } return x; }
    for (i = 0; i < cand.length; i++) {
      for (j = i + 1; j < cand.length; j++) {
        if (root(i) === root(j)) { continue; }
        var bi = box[i], bj = box[j], L = Math.min(lim[i], lim[j]);
        if (bi.x0 - bj.x1 > L || bj.x0 - bi.x1 > L || bi.y0 - bj.y1 > L || bj.y0 - bi.y1 > L) { continue; }
        var near = false;
        for (a = 0; a < pts[i].length && !near; a++) {
          for (b = 0; b < pts[j].length; b++) { if (dist(pts[i][a], pts[j][b]) <= L) { near = true; break; } }
        }
        if (near) { par[root(j)] = root(i); }
      }
    }
    var cInk = {}, keep = [], kept = 0;
    for (i = 0; i < cand.length; i++) { cInk[root(i)] = (cInk[root(i)] || 0) + ink[i]; }
    for (i = 0; i < cand.length; i++) {
      if (cInk[root(i)] >= MAIN_INK * total) { keep.push(cand[i]); kept += ink[i]; }
    }
    /* 外すのは合わせてインクの 1/4 未満まで。字そのものがばらばらに書かれたときは、全部を使います */
    if (!(keep.length >= 3 && kept >= 0.75 * total)) { keep = cand; }
    return trimEdges(S, keep);
  }
  /* SHORT_D・EDGE_D の注記の線を外す（外すのは一度に、残りが3本以上のときだけ） */
  function trimEdges(S, ids) {
    var Bk = bboxOf(S, ids), cs = Math.max(Bk.w, Bk.h), out = [], i, j;
    if (!(cs > 0) || ids.length < 4) { return ids; }
    for (i = 0; i < ids.length; i++) {
      var s = S[ids[i]], bi = bboxOf(S, [ids[i]]);
      if (plen(s.raw) < SHORT_D * cs) {
        var others = [];
        for (j = 0; j < ids.length; j++) { if (j !== i) { others.push(ids[j]); } }
        var Bo = bboxOf(S, others), g = EDGE_D * cs;
        if (Bo.x0 - bi.x0 > g || bi.x1 - Bo.x1 > g || Bo.y0 - bi.y0 > g || bi.y1 - Bo.y1 > g) { continue; }
      }
      out.push(ids[i]);
    }
    return out.length >= 3 ? out : ids;
  }

  /* とめの印のしきい値：較正の f5 の中央値（無ければ STOP_MS） */
  function stopThreshold(cal) {
    var c = cal && cal.features ? cal.features.f5 : null;
    return (c && typeof c.median === "number" && isFinite(c.median) && c.median >= 0) ? c.median : STOP_MS;
  }

  /* 字全体の回転（ラジアン。右側が上がる向きを正）：お手本の各画と、それに対応づいた線（お手本の向きにそろえた
   * 低域通過の線 PL）を、弧長で同じ割合の点どうしで対応させ、お手本→字の一次変換を最小二乗で1回で求めます。
   * お手本の縦の向きが、字の中でどちらへ倒れているか（atan2(M[1], M[4])）を回転とします。
   * ・対応を「弧長の割合」で取るので、字全体を回すと推定もちょうどその角度だけ変わります
   *   （最寄りの点で対応を取る位置合わせ（fitAffine）は、1回では回転の 9 割ほどしか戻りません）。
   * ・全部の画を使うので、縦画1〜2本の傾きより安定します。
   * ・横画の右上がり（せん断）は縦の向きを変えないので、右上がりのクセ（f12）は回転に数えません。
   * 求められないとき・MAX_ROT を超えるときは 0（回さない）。 */
  var TILT_N = 16;
  function charTilt(PL) {
    var N = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], BX = [0, 0, 0], BY = [0, 0, 0], k, j, r, c, used = 0;
    for (k = 0; k < 12; k++) {
      if (!PL[k] || PL[k].length < 2 || !(plen(PL[k]) > 0)) { continue; }
      var u = resampleN(PL[k], TILT_N), t = resampleN(TPL[k].v, TILT_N);
      for (j = 0; j < TILT_N; j++) {
        var v = [t[j].x, t[j].y, 1];
        for (r = 0; r < 3; r++) {
          for (c = 0; c < 3; c++) { N[r][c] += v[r] * v[c]; }
          BX[r] += v[r] * u[j].x; BY[r] += v[r] * u[j].y;
        }
      }
      used++;
    }
    if (used < 4) { return 0; }
    var D = det3(N);
    if (!(Math.abs(D) > 1e-12)) { return 0; }
    function solve3(B) {
      var out = [];
      for (var col = 0; col < 3; col++) {
        var m = [N[0].slice(), N[1].slice(), N[2].slice()];
        for (var row = 0; row < 3; row++) { m[row][col] = B[row]; }
        out.push(det3(m) / D);
      }
      return out;
    }
    var mx = solve3(BX), my = solve3(BY);
    if (!(my[1] > 0)) { return 0; }
    var a = Math.atan2(mx[1], my[1]);
    return Math.abs(a) <= MAX_ROT * Math.PI / 180 ? a : 0;
  }

  function analyze(strokes, opts) {
    opts = opts || {};
    var side = +opts.side;
    var prep = prepare(strokes, side), S = [], i, k, j;
    /* 触れただけの点（広がりが DOT_LEN 未満）は、はじめから無かったものとして扱う（画数にも数えない） */
    for (i = 0; i < prep.S.length; i++) { if (prep.S[i].ext >= DOT_LEN) { S.push(prep.S[i]); } }
    var n = S.length, problems = {};
    var feats = emptyFeats();
    var marks = { kouUL: null, kouLL: null, kouLR: null, gap: null, slant: null, stops: [], stopMs: stopThreshold(opts.cal) };
    var debug = null, all = [];
    for (i = 0; i < n; i++) { all.push(i); }
    var totalMs = n ? rnd(effMs(S, all), 10) : 0;
    if (prep.bad) { problems.badTime = 1; }
    if (n < 8) { problems.tooFewStrokes = 1; }
    if (n > 16) { problems.tooManyStrokes = 1; }
    function finish() {
      if (totalMs < 1200) { problems.tooFast = 1; }
      var list = [];
      for (var q = 0; q < PROBLEMS.length; q++) { if (problems[PROBLEMS[q]]) { list.push(PROBLEMS[q]); } }
      /* 妥当でない字の測定値は返さない（画面側が ok を見落としても、型や表示に使われないように） */
      var out = { ok: list.length === 0, problems: list, feats: list.length ? emptyFeats() : feats, marks: marks, nStrokes: n, totalMs: totalMs };
      if (debug) { out.debug = debug; }
      return out;
    }
    if (!n) { problems.tooSmall = 1; problems.noSplit = 1; problems.noKou = 1; return finish(); }

    /* 最初の外接枠には、キャンバス一辺の 2% 未満の小さな印（迷いタップ）と、字から離れた迷い線を入れない。
     * 字の外の線で外接枠が伸びると、最初の位置合わせがずれて口の開閉まで変わってしまうため。 */
    var use = [];
    for (i = 0; i < n; i++) { if (S[i].ext >= TAP_LEN) { use.push(i); } }
    if (!use.length) { use = all.slice(); }
    var B = bboxOf(S, use), cs = Math.max(B.w, B.h);
    /* 17 画以上は字ではないので、重い照合（迷い線の見分けも含む）をせずに返す */
    if (n > 16 || !(cs > 0)) {
      if (!(rnd(Math.sqrt(B.w * B.h), 0.01) >= 0.35)) { problems.tooSmall = 1; }
      if (!(cs > 0)) { problems.noSplit = 1; problems.noKou = 1; }
      return finish();
    }

    for (i = 0; i < n; i++) { S[i].L = lowpass(S[i].raw); }
    /* 外接枠の選び方・位置合わせ（solve）と、迷い線による押しのけの確かめ（displaced） */
    var fit = displaced(S, use, solve(S, use, -1));
    var res = fit.res, A = usedIds(res), unitOf = unitMap(res);
    B = fit.B; cs = fit.cs;

    /* 測定に使う外接枠（大きさ f14・縦横比 f7・すき間 f2 の字幅と帯・速さ f6 の字の高さ）は、対応づいた画の形用の
     * 低域通過の線を、字全体の回転（charTilt）の分だけ回し戻してから作る。
     * ・生の点で作ると、ふるえの振れ幅だけ字が大きく・すき間が狭く出るため。
     * ・画面の縦横のまま作ると、スマホを斜めに持って字全体が傾いただけで、外接枠の縦横比（f7）・すき間（f2）・
     *   字の高さが変わり、型が変わっていたため（10° で 4 人に 1 人）。字の傾きは使わない約束です（仕様書 F21）。 */
    var bp = buildPaths(S, res), P = bp.P, PL = bp.PL;
    var ang = charTilt(PL), ca = Math.cos(ang), sa = Math.sin(ang), rc = pt(0, 0);
    function unrot(p) { var dx = p.x - rc.x, dy = p.y - rc.y; return pt(rc.x + dx * ca - dy * sa, rc.y + dx * sa + dy * ca); }
    function rerot(p) { var dx = p.x - rc.x, dy = p.y - rc.y; return pt(rc.x + dx * ca + dy * sa, rc.y - dx * sa + dy * ca); }
    function unrotAll(a) { if (!a) { return a; } var o = []; for (var q = 0; q < a.length; q++) { o.push(unrot(a[q])); } return o; }
    if (A.length) {
      var lpAll = [];
      for (j = 0; j < A.length; j++) { lpAll = lpAll.concat(S[A[j]].lp); }
      var B0 = bbox(lpAll);
      rc = pt(B0.x0 + B0.w / 2, B0.y0 + B0.h / 2);
      var B3 = bbox(unrotAll(lpAll));
      if (Math.max(B3.w, B3.h) > 0) { B = B3; cs = Math.max(B.w, B.h); }
      totalMs = rnd(effMs(S, A, unitOf), 10);
    }
    feats.f14 = rnd(Math.sqrt(B.w * B.h), 0.01);
    if (!(feats.f14 >= 0.35)) { problems.tooSmall = 1; }

    /* どの画にも対応しない線が、書いた線の長さの 5% を超えたら弾く（字の上のなぐり書き・消し線など）。
     * なぞり書き（dup）は字のインクとして数えます。 */
    var isUsed = {}, inkAll = 0, inkOut = 0, IK = inkIds(res);
    for (j = 0; j < IK.length; j++) { isUsed[IK[j]] = true; }
    for (i = 0; i < n; i++) {
      var li = plen(S[i].shape);
      inkAll += li;
      if (!isUsed[i]) { inkOut += li; }
    }
    if (inkAll > 0 && inkOut > EXTRA_INK * inkAll) { problems.extraInk = 1; }

    /* お手本の画のうち、1周目の厳しいしきい値で対応づいた画の数と、当てはまり（照合距離の平均）。
     * 2周目のゆるいしきい値だけで拾った画ばかりの入力（でたらめな線分、横倒しの字）を「結」と数えないため。
     * どの画にも対応づかなければ（何も測れていないので）、形の測定もしません。 */
    var qa = quality(res, S), nStrict = qa.strict, resid = qa.resid;
    if (nStrict < MIN_STRICT || !(resid <= MAX_RESID)) { problems.noMatch = 1; }
    if (!res.A.length) { problems.noSplit = 1; problems.noKou = 1; return finish(); }

    function Pk(num) { return P[num - 1]; }
    function PLk(num) { return PL[num - 1]; }
    /* 回し戻した低域通過の線（外接枠・すき間・口の幅・頭部突出に使う） */
    var PR = [];
    for (k = 0; k < 12; k++) { PR.push(unrotAll(PL[k])); }
    function PRk(num) { return PR[num - 1]; }
    /* 検証用：書いた各画（書き始めの時刻順。触れただけの点は除く）が、お手本の何画目に対応づいたか */
    if (opts.debug) {
      var asg = [];
      for (i = 0; i < n; i++) { asg.push(bp.covers[i] || []); }
      debug = { assign: asg, strict: nStrict, resid: rnd(resid, 0.0001), used: A.slice(), tilt: rnd(ang * 180 / Math.PI, 0.01), off: fit.off };
    }

    /* ---- 妥当性：糸へんと吉に分かれるか、口が見つかるか ---- */
    var itoN = 0, kiN = 0, itoLP = [], kiLP = [];
    for (k = 1; k <= 12; k++) {
      if (!Pk(k)) { continue; }
      if (k <= 6) { itoN++; itoLP = itoLP.concat(PRk(k)); }
      else { kiN++; kiLP = kiLP.concat(PRk(k)); }
    }
    /* f2 糸と吉のすき間：字の高さの 25〜75% の帯で、吉の左端 − 糸の右端（字幅で割る）。回し戻した線で測ります。
     * 端は、低域通過した線の、帯の中の点の x の 90%点（糸）と 10%点（吉）で測ります。
     * いちばん端の1点で測ると、ふるえやセンサーの揺れの山がそのまま端になってすき間が狭く出るうえ、
     * 書くたびの値のぶれも大きくなるためです（合成データで、1回ごとの再現性 r が .83 → .88）。 */
    var by0 = B.y0 + 0.25 * B.h, by1 = B.y0 + 0.75 * B.h, xi = [], xk = [];
    for (j = 0; j < itoLP.length; j++) { if (itoLP[j].y >= by0 && itoLP[j].y <= by1) { xi.push(itoLP[j].x); } }
    for (j = 0; j < kiLP.length; j++) { if (kiLP[j].y >= by0 && kiLP[j].y <= by1) { xk.push(kiLP[j].x); } }
    var itoR = qSorted(xi, 0.9), kiL = qSorted(xk, 0.1);
    var f2raw = (itoR !== null && kiL !== null && B.w > 0) ? (kiL - itoR) / B.w : null;
    var itoC = itoLP.length ? centroid(itoLP) : null, kiC = kiLP.length ? centroid(kiLP) : null;
    if (itoN < 3 || kiN < 4 || !itoC || !kiC || !(itoC.x < kiC.x) || f2raw === null || f2raw < -0.15) { problems.noSplit = 1; }

    var p10 = Pk(10), p11 = Pk(11), p12 = Pk(12), kouW = null;
    if (!p10 || !p11 || !p12) { problems.noKou = 1; }
    else {
      var kou = PRk(10).concat(PRk(11), PRk(12)), kb = bbox(kou), shi = [];
      kouW = kb.w;
      if (PRk(7)) { shi = shi.concat(PRk(7)); }
      if (PRk(9)) { shi = shi.concat(PRk(9)); }
      /* 口は士より下にあり、字の大きさに対して潰れていないこと */
      if (kb.w < 0.08 * cs || kb.h < 0.08 * cs || (shi.length && !(centroid(kou).y > centroid(shi).y))) { problems.noKou = 1; }
    }

    /* ---- 形の特徴 ----
     * 口の角のすき間は、低域通過した線で測ります（ふるえで線が波打つと、波の山どうしが交わって
     * 「閉」に寄るため）。この線の端の点は元の点のままなので、ふるえのない人の値はほとんど変わりません。 */
    feats.f1 = gapFeat(cornerGap(PLk(10), false, PLk(11), false));    // 口の左上：10の書き出し↔11の書き出し
    feats.f9 = gapFeat(cornerGap(PLk(11), true, PLk(12), true));      // 口の右下：11の終わり↔12の終わり
    feats.f10 = gapFeat(cornerGap(PLk(10), true, PLk(12), false));    // 口の左下：10の終わり↔12の書き出し
    feats.f2 = rnd(f2raw, 0.01);

    /* 横画の角度は低域通過した線で測る（ふるえで角度がばらついて見えないように） */
    var hz = {};
    for (j = 0; j < HORIZ.length; j++) {
      k = HORIZ[j];
      var src = k === 11 ? firstLeg(Pk(11)) : (PLk(k) ? trimmed(PLk(k), 0.1) : null);
      if (src && src.length >= 2 && plen(src) > 0) { hz[k] = hAngle(src); }
    }
    /* 他の横画から 20° 以上外れた角度は、横画として測れていない（取り違え・つなぎ線）とみなして除く */
    var hv = [], hmed = [];
    for (j = 0; j < HORIZ.length; j++) { if (hz[HORIZ[j]] !== undefined) { hmed.push(hz[HORIZ[j]]); } }
    hmed = median(hmed);
    for (j = 0; j < HORIZ.length; j++) {
      k = HORIZ[j];
      if (hz[k] !== undefined && Math.abs(hz[k] - hmed) <= 20) { hv.push(hz[k]); } else { delete hz[k]; }
    }
    if (hv.length >= 3) {
      var hm = mean(hv), ss = 0;
      for (j = 0; j < hv.length; j++) { ss += (hv[j] - hm) * (hv[j] - hm); }
      feats.f3 = rnd(Math.sqrt(ss / hv.length), 0.5);         // 横画の角度のばらつき（母標準偏差）
    }
    feats.f4 = bp.renmen;

    /* 右上がり：横画の角度の平均から、縦画(4,8)の傾きで分かる「字全体の回転」を引く。
     * スマホを斜めに持って書いた分まで右上がりに数えないようにするため。お手本の横画は水平。 */
    if (hv.length) {
      var vt = [];
      for (j = 0; j < VERT.length; j++) {
        var pv = PLk(VERT[j]);
        if (pv && pv.length >= 2 && plen(pv) > 0) {
          var tv = vTilt(trimmed(pv, 0.1));
          if (Math.abs(tv) <= 25) { vt.push(tv); }   // 25° を超えて倒れた線は縦画として使わない
        }
      }
      feats.f12 = rnd(mean(hv) - (vt.length ? mean(vt) : 0), 0.5);
    }
    var pr = protrusion(PRk(7), PRk(8), PRk(9), 0.02 * cs);
    feats.f13 = pr === null ? null : rnd(pr - TPL_F13, 0.01);
    feats.f7 = B.w > 0 ? rnd(B.h / B.w - TPL_RATIO, 0.01) : null;
    var cut = cornerCut(p11, kouW);
    if (cut !== null) {
      var cv = rnd(cut, 0.01);
      feats.f11 = { state: tensetsu(cv), v: cv };
    }

    /* ---- 時間の特徴（対応づいた画だけで、書いた順に測る） ----
     * 画の途中で指が離れた切れ端（画の一部）は、1画にまとめて数えます（unitMap の注記）。
     * f6 速さ：低域通過した線の長さ ÷ 字の高さ（回し戻した外接枠）÷ 指が触れていた秒数。
     * f8 間の割合：画と画のふつうの間の平均 ÷（それ＋1画の長さの中央値）。全体の合計を使わないのは、
     *   一画戻して考え直した間や、途中で手を止めた1〜2か所の長い間で型が変わらないようにするためです
     *   （時間制限なし・書き直しは結果に使わない、という約束）。
     *   1画の長さは、切れ端の指が触れていた時間の和。同じ画の切れ端どうしの間は、画と画の間に数えません。 */
    var penMs = 0, ink = 0, gaps = [], durU = {}, durs = [];
    for (j = 0; j < A.length; j++) {
      var sj = S[A[j]], uj = unitOf[A[j]];
      penMs += sj.t1 - sj.t0;
      durU[uj] = (durU[uj] || 0) + (sj.t1 - sj.t0);
      ink += inkLen(sj, cs);
      if (j > 0 && !sameUnit(unitOf, A[j - 1], A[j])) { gaps.push(Math.max(0, sj.t0 - S[A[j - 1]].t1)); }
    }
    for (k in durU) { if (durU.hasOwnProperty(k)) { durs.push(durU[k]); } }
    if (penMs > 0 && B.h > 0) { feats.f6 = rnd(ink / B.h / (penMs / 1000), 0.01); }
    if (gaps.length) {
      /* 間の中央値の 3 倍（最低 0.3 秒）を超える間は「考え直し・よそ見」として外し、残りの間の平均を使う。
       * 中央値そのものを使うと、1か所の長い間で順位が1つずれて値が動くため、外してから平均します。 */
      var g0 = median(gaps), lim = Math.max(3 * g0, PAUSE_MIN), gs = 0, gn = 0;
      for (j = 0; j < gaps.length; j++) { if (gaps[j] <= lim) { gs += gaps[j]; gn++; } }
      var mg = gn ? gs / gn : g0, md = median(durs);
      if (mg + md > 0) { feats.f8 = rnd(mg / (mg + md), 0.01); }
    }

    /* 収筆の止め（f5）と、とめの印。とめの画（TOME）ごとに、お手本の画の終わりにいちばん近い所で離した線で測ります
     * （途中で切れた画なら、終わりの切れ端）。画の長さ（stopTime の len）は、その画に対応づいた線の長さです。
     * f5 は測れた画の「下側の中央値」（小さい方から数えて (n+1)/2 番目。5画なら3番目、4画なら2番目）。
     * とめの印（しきい値は較正の中央値）と「いちばん特徴」の f5 の向き（較正の中央値より長い／短い）が、
     * 同じ1回の字では、何画測れていても必ずそろうようにするためです：
     *   f5 がしきい値以上 ⇔ 測れた画の過半数が「とめ」、f5 がしきい値未満 ⇔「とめ」は半数以下。
     * （ふつうの中央値だと、4画のとき真ん中の2つの平均になり、2画だけ「とめ」でも「止めが長め」になりえた） */
    var stops = [];
    for (j = 0; j < TOME.length; j++) {
      k = TOME[j];
      var tEnd = res.TV[k - 1][res.TV[k - 1].length - 1], bi = -1, bdist = Infinity;
      for (i = 0; i < n; i++) {
        if (bp.endK[i] !== k - 1) { continue; }
        var dd = dist(S[i].shc[S[i].shc.length - 1], tEnd);
        if (dd < bdist) { bdist = dd; bi = i; }
      }
      if (bi < 0 || !Pk(k)) { continue; }
      /* 途中で指が離れて切れた画は、終わりの切れ端までの切れ端を時刻順につないだ線で測る。終わりの切れ端だけだと、
       * 切れ端の書き出し（画の途中）で低域通過の窓が片側になり、近づき方を読み違えるため（止めが 40ms ほど短く出た） */
      var Lk = S[bi].L, pieces = [];
      for (i = 0; i < A.length; i++) { if (sameUnit(unitOf, A[i], bi) && S[A[i]].t0 <= S[bi].t0) { pieces.push(A[i]); } }
      if (pieces.length > 1) {
        var joined = [];
        for (i = 0; i < pieces.length; i++) {
          var rr = S[pieces[i]].raw;
          for (var z = 0; z < rr.length; z++) { if (!joined.length || rr[z].t >= joined[joined.length - 1].t) { joined.push(rr[z]); } }
        }
        Lk = lowpass(joined);
      }
      var ms = stopTime(Lk, cs, plen(Pk(k)));
      if (ms === null) { continue; }
      var lp = S[bi].raw[S[bi].raw.length - 1];
      ms = rnd(ms, 10);
      stops.push(ms);
      /* 印は f5 と同じ 10ms 刻みに丸めてから、しきい値（較正の中央値）と比べる */
      marks.stops.push({ n: k, x: rnd(lp.x, 0.001), y: rnd(lp.y, 0.001), stop: ms >= marks.stopMs });
    }
    if (stops.length) { stops.sort(numAsc); feats.f5 = stops[(stops.length - 1) >> 1]; }

    /* ---- 結果パネルに重ねる印（キャンバス一辺=1 の座標） ---- */
    function mid(a, b) { return [rnd((a.x + b.x) / 2, 0.001), rnd((a.y + b.y) / 2, 0.001)]; }
    if (p10 && p11) { marks.kouUL = mid(p10[0], p11[0]); }
    if (p10 && p12) { marks.kouLL = mid(p10[p10.length - 1], p12[0]); }
    if (p11 && p12) { marks.kouLR = mid(p11[p11.length - 1], p12[p12.length - 1]); }
    if (f2raw !== null) {
      /* すき間の帯は回し戻した座標で測ったので、帯の中央の高さで画面の座標に戻して描く */
      var ym = (by0 + by1) / 2, ga = rerot(pt(itoR, ym)), gb = rerot(pt(kiL, ym)), gm = (ga.y + gb.y) / 2, gh = (by1 - by0) / 2;
      marks.gap = { x0: rnd(ga.x, 0.001), x1: rnd(gb.x, 0.001), y0: rnd(gm - gh, 0.001), y1: rnd(gm + gh, 0.001) };
    }
    if (PLk(7) && hz[7] !== undefined) {
      var a7 = axisOf(PLk(7)), b7 = bbox(PLk(7)), ux = a7.ux, uy = a7.uy;
      if (ux < 0) { ux = -ux; uy = -uy; }
      if (Math.abs(ux) > 1e-9) {
        var ya = a7.y + (b7.x0 - a7.x) * uy / ux, yb = a7.y + (b7.x1 - a7.x) * uy / ux;
        marks.slant = [[rnd(b7.x0, 0.001), rnd(ya, 0.001)], [rnd(b7.x1, 0.001), rnd(yb, 0.001)]];
      }
    }
    return finish();
  }

  /* ================================================================ 2回の平均 */
  /* 測れた値かどうか。形の崩れた値（ratio や v が数でない等）は「測れなかった」として扱い、
   * もう片方の回の値だけを使います。 */
  function measured(v, key) {
    if (v === null || v === undefined) { return false; }
    if (key === "f1" || key === "f9" || key === "f10") { return typeof v.ratio === "number" && isFinite(v.ratio); }
    if (key === "f11") { return typeof v.v === "number" && isFinite(v.v); }
    return typeof v === "number" && isFinite(v);
  }
  function average(A, B) {
    A = A || {}; B = B || {};
    var out = {}, i;
    function pick(a, b, key, f) {
      var ha = measured(a, key), hb = measured(b, key);
      if (!ha && !hb) { return null; }
      if (!ha) { return f(b, b); }
      if (!hb) { return f(a, a); }
      return f(a, b);
    }
    for (i = 0; i < FKEYS.length; i++) {
      var key = FKEYS[i], a = A[key], b = B[key];
      if (key === "f1" || key === "f9" || key === "f10") {
        out[key] = pick(a, b, key, function (p, q) { return gapFeat((p.ratio + q.ratio) / 2); });
      } else if (key === "f11") {
        out[key] = pick(a, b, key, function (p, q) {
          var v = rnd((p.v + q.v) / 2, 0.01);
          return { state: tensetsu(v), v: v };
        });
      } else if (key === "f4") {
        out[key] = pick(a, b, key, function (p, q) { return Math.floor((p + q) / 2 + 0.5); });
      } else {
        out[key] = pick(a, b, key, function (p, q) { return rnd((p + q) / 2, STEP[key]); });
      }
    }
    return out;
  }

  /* ================================================================ 採点
   * 各特徴を、パイロット（いまは合成データ）の中央値と尺度で z に直し、±2 で打ち切って 2 で割る。
   * 口の左上（f1）だけは 閉=−1／あいまい=0／開=+1 のまま使う。
   * x = 条件で選ぶ(−) ↔ 感覚で選ぶ(+)、y = 見極めてから動く(−) ↔ 動きながら決める(+)。
   * 基準・伝達・決断は点数にしません。いちばん中央値から離れた測定値を1つ選び、
   * それに結びつく要素について「生かし方」と「次に意識するとよいテーマ」を出すためだけに使います。 */
  var TYPE_OF = { "--": "sekkei", "-+": "suishin", "+-": "kyomei", "++": "chokkan" };
  var HL_ORDER = ["f2", "f5", "f9", "f3", "f10", "f13"];
  var ELEMENT = { f10: "kijun", f3: "kijun", f2: "dentatsu", f13: "dentatsu", f9: "ketsudan", f5: "ketsudan" };
  var CODE3 = { closed: -1, ambiguous: 0, open: 1 };
  var CORNER = { f9: true, f10: true };
  /* 口の角（閉／あいまい／開の3段階）を「いちばん特徴が出ていたところ」の候補にするときの強さ。
   * 閉じるのがふつう（中央値）の角が「開」なら、z=1.5 と同じ強さとして並べます。合成データでは
   * 開いた角は 5〜8% で、連続の特徴が片側に 1.5σ 以上外れる割合（約 7%）と同じくらいの珍しさだからです。
   * 「あいまい」（線幅の1〜2倍）は指の太さとタッチのずれの範囲なので、候補にしません。 */
  var HL_CAT = 1.5;

  function numOf(feats, key) {
    var v = feats ? feats[key] : null;
    if (v === null || v === undefined) { return null; }
    if (key === "f1" || key === "f9" || key === "f10") {
      return (v.state && CODE3[v.state] !== undefined) ? CODE3[v.state] : null;
    }
    if (key === "f11") { return (typeof v.v === "number" && isFinite(v.v)) ? v.v : null; }
    return (typeof v === "number" && isFinite(v)) ? v : null;
  }
  function calOk(c) { return !!c && typeof c.median === "number" && isFinite(c.median) && c.scale > 0 && isFinite(c.scale); }
  /* 軸に使う z：±2 で打ち切って 2 で割る（1つの特徴だけで軸が決まらないように） */
  function zOf(v, c) { return calOk(c) ? clamp((v - c.median) / c.scale, -2, 2) / 2 : null; }
  function keyOf(sx, sy) { return TYPE_OF[(sx > 0 ? "+" : "-") + (sy > 0 ? "+" : "-")]; }

  /* 「いちばん特徴が出ていたところ」：打ち切らない z の絶対値がいちばん大きい測定値。
   * 打ち切ると多くの人が上限（|z|=1）に並び、同点を並び順だけで決めることになるためです。
   * 同点なら、口の角どうしは線幅比の大きい（より開いた）方、それ以外は HL_ORDER の順。
   * 中央値との差が丸めの1目盛り（STEP）以下の測定値は候補にしません。丸めの粗い特徴（横画のばらつき f3 は 0.5°刻み）は
   * 1目盛りずれただけで |z| が大きく出て、ほかの特徴を押しのけてしまうためです（その差は測定の刻みの内です）。
   * どの候補も中央値から1目盛り以内なら、取り上げるところは無し（null）にします。 */
  /* 連続の測定値 v（特徴 k）を候補にするときの z（丸めた値）。候補にしないときは null。
   * decodeShare でも同じ式で「その向きが出うるか」を確かめるので、1か所にまとめています。 */
  function hlZ(k, v, c) {
    if (v === null || !calOk(c)) { return null; }
    if (Math.abs(v - c.median) <= STEP[k] * (1 + 1e-9)) { return null; }
    var zz = rnd((v - c.median) / c.scale, 0.0001);
    return zz ? zz : null;
  }
  function pickHighlight(feats, CF) {
    var hl = null, best = 0, bestTie = 0;
    for (var h = 0; h < HL_ORDER.length; h++) {
      var k = HL_ORDER[h], c = CF[k], zz, tie = 0;
      if (CORNER[k]) {
        var fv = feats[k];
        if (!fv || CODE3[fv.state] === undefined || fv.state === "ambiguous" || !c || typeof c.median !== "number" || !isFinite(c.median)) { continue; }
        var mc = clamp(Math.round(c.median), -1, 1), code = CODE3[fv.state];
        if (code === mc) { continue; }
        zz = code > mc ? HL_CAT : -HL_CAT;
        tie = (typeof fv.ratio === "number" && isFinite(fv.ratio)) ? (zz > 0 ? fv.ratio : -fv.ratio) : 0;
      } else {
        zz = hlZ(k, numOf(feats, k), c);
        if (zz === null) { continue; }
      }
      var az = Math.abs(zz);
      if (!(az > 0)) { continue; }
      if (az > best || (az === best && hl && CORNER[hl.feature] && CORNER[k] && tie > bestTie)) {
        best = az; bestTie = tie;
        hl = { feature: k, element: ELEMENT[k], sign: zz > 0 ? 1 : -1 };
      }
    }
    return hl;
  }

  /* 較正（cal）が無い、または x・y のどちらかの軸に使える測定値が1つも無いときは null を返します。
   * 何も測れていないのに「設計型」などと出してしまわないためです。
   * feats の代わりに analyze() の結果をそのまま渡してもよく、妥当でない字（ok が false）なら null です
   * （妥当でない字の feats はすべて null なので、feats を渡しても null になります）。 */
  function score(feats, cal) {
    if (!cal || !cal.weights || !cal.weights.x || !cal.weights.y || !cal.features || !cal.center ||
        typeof cal.center.x !== "number" || typeof cal.center.y !== "number") { return null; }
    if (feats && typeof feats === "object" && typeof feats.ok === "boolean" && feats.feats && typeof feats.feats === "object") {
      if (!feats.ok) { return null; }
      feats = feats.feats;
    }
    feats = feats || {};
    var used = [], z = {}, axis = {}, ax, k;
    var W = cal.weights, D = cal.dirs || {}, CF = cal.features;
    var AX = ["x", "y"];
    for (var a = 0; a < 2; a++) {
      ax = AX[a];
      var sum = 0, wsum = 0;
      for (k in W[ax]) {
        if (!W[ax].hasOwnProperty(k) || !(W[ax][k] > 0)) { continue; }
        var v = numOf(feats, k), zz;
        if (v === null) { continue; }
        zz = k === "f1" ? v : zOf(v, CF[k]);
        if (zz === null) { continue; }
        z[k] = rnd(zz, 0.0001);
        sum += W[ax][k] * (D[k] || 1) * zz;
        wsum += W[ax][k];
        used.push(k);
      }
      if (!(wsum > 0)) { return null; }
      axis[ax] = rnd(sum / wsum, 0.0001);
    }
    var dx = axis.x - cal.center.x, dy = axis.y - cal.center.y;
    var key = keyOf(dx, dy);
    /* 境界付近：中央値から boundary 以内なら「○○型寄り」と出す。
     * axisScale（軸スコアの尺度）があれば、その何倍かで測る（仕様書の ±0.25SD）。 */
    var bd = typeof cal.boundary === "number" ? cal.boundary : 0.25;
    var bx = bd * ((cal.axisScale && cal.axisScale.x) || 1);
    var by = bd * ((cal.axisScale && cal.axisScale.y) || 1);
    var nx = Math.abs(dx) < bx, ny = Math.abs(dy) < by, toward = null;
    if (nx && ny) { toward = (Math.abs(dx) / bx <= Math.abs(dy) / by) ? keyOf(-dx || 1, dy) : keyOf(dx, -dy || 1); }
    else if (nx) { toward = keyOf(-dx || 1, dy); }
    else if (ny) { toward = keyOf(dx, -dy || 1); }

    return { x: axis.x, y: axis.y, key: key, lean: { x: nx, y: ny, toward: toward }, highlight: pickHighlight(feats, CF), used: used, z: z };
  }

  /* ================================================================ シェア
   * URL に入れるのは、版・型・境界の印・いちばん特徴が出た測定値の種類と向き・
   * 表示用の測定値3つ（口の左上の状態、すき間の%、とめの数）だけ。書いた線は入れません。
   * 形式（10文字）：版 型 境界 寄り先 特徴 向き 左上 すき間(2桁) とめ
   * とめの数は marks.stops から数えます。encodeShare(scored, feats, marks) と3つ目に marks を渡すか、
   * 2つ目に analyze() の結果（{feats, marks}）をそのまま渡してください。無ければ「なし（n）」になります。
   * 画面側（yui/hw.js）は encodeShare(scored, feats) と marks を渡さないので、とめの数はいつも「なし」です。
   * 「いちばん特徴」は、自分の画面と、リンク・再読み込みの画面で同じになるよう、次のときだけ外します：
   *  ・すき間（f2）が「いちばん特徴」なのに、すき間の値が無い（score() からは起きない）
   *  ・口の角が「閉」の向き（下の注記）
   * とめ（f5）が「いちばん特徴」で、とめの数がその向きと食い違うとき（長い向きなのに「とめ」2画以下、
   * 短い向きなのに3画以上。2回書きの平均の向きと、1回分の印を合わせて渡したときなどに起きる）は、
   * 「いちばん特徴」ではなく、とめの数のほうを「なし」にします。
   *  ・この「3画以上／2画以下」は、測れたとめの画が5画でも4画でも「過半数がとめ／半数以下」と同じです（analyze の f5 の注記）。
   *    3画以下しか測れなかった字では食い違うことがあり、そのときも数を「なし」にします。
   * すき間の % は -15〜69 に収めます（-0.15 未満の字は noSplit で弾くので、診断に進んだ字では出ません）。 */
  var F2_MIN = -15, F2_MAX = 69;
  var K2C = { sekkei: "s", suishin: "u", kyomei: "k", chokkan: "c" };
  var C2K = { s: "sekkei", u: "suishin", k: "kyomei", c: "chokkan" };
  var F2C = { f2: "2", f3: "3", f5: "5", f9: "9", f10: "a", f13: "d" };
  var C2F = { "2": "f2", "3": "f3", "5": "f5", "9": "f9", a: "f10", d: "f13" };
  var S2C = { closed: "c", ambiguous: "a", open: "o" };
  var C2S = { c: "closed", a: "ambiguous", o: "open" };
  var AXES = { sekkei: [-1, -1], suishin: [-1, 1], kyomei: [1, -1], chokkan: [1, 1] };
  var SHARE_RE = /^1[sukc][0-3][sukcn][2359adn][pmn][caon](?:[0-9]{2}|nn)[0-5n]$/;

  function shareData(scored, feats, marks) {
    if (!scored || typeof scored !== "object" || !K2C[scored.key]) { return null; }
    if (feats && feats.feats) { marks = marks || feats.marks; feats = feats.feats; }
    var f1 = feats && feats.f1 && S2C[feats.f1.state] ? feats.f1.state : null;
    var f2 = feats && typeof feats.f2 === "number" && isFinite(feats.f2) ? clamp(Math.round(feats.f2 * 100), F2_MIN, F2_MAX) : null;
    var f5 = null;
    if (marks && marks.stops && marks.stops.length) {
      f5 = 0;
      for (var i = 0; i < marks.stops.length && i < 5; i++) { if (marks.stops[i] && marks.stops[i].stop === true) { f5++; } }
    }
    /* いちばん特徴の向きは +/− だけ。口の角が「閉」の側で選ばれることは、閉じるのが中央値のいまの較正では
     * 起きず、その文面もありません。較正が変わって起きたときは、版を上げるまで特徴を入れずに書き出します。 */
    var h = scored.highlight, hl = null;
    if (h && F2C[h.feature] && (h.sign === 1 || h.sign === -1) && !(CORNER[h.feature] && h.sign < 0) &&
        !(h.feature === "f2" && f2 === null)) {
      hl = { feature: h.feature, element: ELEMENT[h.feature], sign: h.sign };
      if (h.feature === "f5" && !stopsAgree(h.sign, f5)) { f5 = null; }
    }
    return shareOut(scored.key, scored.lean || {}, hl, f1, f2, f5);
  }
  /* とめの数（null は「なし」）が、f5 の向きと食い違わないか（shareData と decodeShare で同じ規則を使う） */
  function stopsAgree(sign, n) { return n === null || (sign > 0 ? n >= 3 : n <= 2); }
  /* shareData と decodeShare が返す形（同じ形にして、書き出して読み戻せば同じ内容になるように）。
   * items は、共有・再読み込みの画面（yui/hw.js の sharedMeasureRows・measure1）が読む表示用の値の一覧です。
   *  { feature: "f1", state } ／ { feature: "f2", value: すき間（字幅に対する比。0.12 など）} ／
   *  { feature: "f5", value: 止めてから離した画の数 }（f5 の value はミリ秒ではなく画の数です）
   * 値の無いものは入れません。並びは「いちばん特徴」（f2・f5 のとき）を先頭に、残りを f1・f2・f5 の順。
   * 画面側は items[0] をシェア文の1つ目の測定値にするので、自分の画面（1つ目は「いちばん特徴」）とそろえるためです。 */
  function shareOut(key, lean, hl, f1, f2, f5) {
    var items = [], order = ["f1", "f2", "f5"], k;
    if (hl && (hl.feature === "f2" || hl.feature === "f5")) { order = [hl.feature].concat(hl.feature === "f2" ? ["f1", "f5"] : ["f1", "f2"]); }
    for (k = 0; k < order.length; k++) {
      if (order[k] === "f1" && f1 !== null) { items.push({ feature: "f1", state: f1 }); }
      if (order[k] === "f2" && f2 !== null) { items.push({ feature: "f2", value: f2 / 100 }); }
      if (order[k] === "f5" && f5 !== null) { items.push({ feature: "f5", value: f5 }); }
    }
    return {
      v: VERSION, key: key,
      lean: { x: !!lean.x, y: !!lean.y, toward: K2C[lean.toward] ? lean.toward : null },
      highlight: hl,
      disp: { f1: f1, f2: f2, f5: f5 },
      items: items
    };
  }
  function packShare(o) {
    if (!o) { return null; }
    var s = String(o.v) + K2C[o.key] + String((o.lean.x ? 1 : 0) + (o.lean.y ? 2 : 0)) +
      (o.lean.toward ? K2C[o.lean.toward] : "n") +
      (o.highlight ? F2C[o.highlight.feature] : "n") +
      (o.highlight ? (o.highlight.sign > 0 ? "p" : "m") : "n") +
      (o.disp.f1 ? S2C[o.disp.f1] : "n") +
      (o.disp.f2 === null ? "nn" : ("0" + (o.disp.f2 + 30)).slice(-2)) +
      (o.disp.f5 === null ? "n" : String(o.disp.f5));
    /* 読み戻せない組み合わせ（寄り先の矛盾など）は書き出さない */
    return decodeShare(s) ? s : null;
  }
  function encodeShare(scored, feats, marks) { return packShare(shareData(scored, feats, marks)); }
  /* 受け取った文字列は信用しない：長さ・文字種・組み合わせをすべて確かめ、1つでも外れたら null。
   * encodeShare が出さない組み合わせは、すべて null です（単体テストで全通りを確かめています）。
   * 【変更】2つ目の引数（cal）は使いません。較正を実測に差し替えても版（VERSION）と形式は変わらないので、
   * 較正に照らして拒むと、差し替える前に共有されたリンクが読めなくなり、画面が黙って最初に戻ってしまうためです。 */
  function decodeShare(str) {
    if (typeof str !== "string" || str.length !== 10 || !SHARE_RE.test(str)) { return null; }
    var key = C2K[str.charAt(1)], flags = +str.charAt(2), tw = str.charAt(3);
    var lx = !!(flags & 1), ly = !!(flags & 2), toward = tw === "n" ? null : C2K[tw];
    if ((flags === 0) !== (toward === null)) { return null; }
    if (toward) {
      var a = AXES[key], b = AXES[toward], fx = a[0] !== b[0], fy = a[1] !== b[1];
      if (fx === fy) { return null; }          // 同じ型・対角の型へは寄らない
      if ((fx && !lx) || (fy && !ly)) { return null; }
    }
    var hf = str.charAt(4), hs = str.charAt(5);
    if ((hf === "n") !== (hs === "n")) { return null; }
    if ((hf === "9" || hf === "a") && hs === "m") { return null; }   // 口の角は「開」の向きしか出ない
    var hl = hf === "n" ? null : { feature: C2F[hf], element: ELEMENT[C2F[hf]], sign: hs === "p" ? 1 : -1 };
    var f1c = str.charAt(6), f2s = str.substr(7, 2), f5c = str.charAt(9);
    var f2 = f2s === "nn" ? null : (+f2s - 30), f5 = f5c === "n" ? null : +f5c;
    if (f2 !== null && (f2 < F2_MIN || f2 > F2_MAX)) { return null; }
    if (hl && hl.feature === "f2" && f2 === null) { return null; }
    if (hl && hl.feature === "f5" && !stopsAgree(hl.sign, f5)) { return null; }
    return shareOut(key, { x: lx, y: ly, toward: toward }, hl, f1c === "n" ? null : C2S[f1c], f2, f5);
  }

  var api = {
    VERSION: VERSION,
    LW: LW,
    STOP_MS: STOP_MS,
    TEMPLATE: TEMPLATE,
    TPL_RATIO: TPL_RATIO,
    TPL_F13: TPL_F13,
    FEATURES: FKEYS.slice(),
    PROBLEMS: PROBLEMS.slice(),
    ELEMENT: ELEMENT,
    analyze: analyze,
    average: average,
    score: score,
    shareData: shareData,
    encodeShare: encodeShare,
    decodeShare: decodeShare
  };
  return api;
});
