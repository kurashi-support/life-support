/* ==========================================================
   Life Support  script.js(動き・処理)
   - 保存と読み込み / 日付の更新 / 各機能(お金・ToDo・予定・冷蔵庫など)
   - レシート読み取り / バーコード・QR / Firebase(ログインとクラウド保存)
   ========================================================== */

(function () {
  "use strict";
  var $ = function (i) { return document.getElementById(i) }, K = "ls2";
  var pad = function (n) { return String(n).padStart(2, "0") };
  var ds = function (d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) };
  var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] }) };
  function load(k, f) { try { var r = localStorage.getItem(k); return r === null ? f : JSON.parse(r) } catch (e) { return f } }
  function save() { try { localStorage.setItem(K, JSON.stringify(S)) } catch (e) { } cloudSave(); try { renderSummary() } catch (e) { } }
  var today = ds(new Date());
  var diff = function (s) { return Math.round((new Date(s + "T00:00:00") - new Date(today + "T00:00:00")) / 864e5) };

  var S = load(K, null);
  if (!S) { /* 旧バージョンのデータを引き継ぐ */
    S = {
      todos: load("ls_todos", []).map(function (t) { return { id: uid(), text: t.text, done: !!t.done, date: today } }),
      sched: load("ls_schedule", []).map(function (s) { return { id: uid(), date: today, time: s.time, text: s.text } }),
      fridge: load("ls_fridge", []).map(function (n) { return { id: uid(), name: n, exp: "" } }),
      memo: load("ls_memo", "")
    };
  }
  S = Object.assign({ budget: 0, exp: [], todos: [], rec: [], meals: {}, sched: [], fridge: [], memo: "", shop: [], trash: {}, fixed: [], stock: [], codes: {} }, S);

  var RECIPES = [["親子丼", ["卵", "鶏肉", "玉ねぎ", "ご飯"]], ["野菜炒め", ["キャベツ", "にんじん", "豚肉", "もやし", "ピーマン"]], ["オムライス", ["卵", "ご飯", "玉ねぎ", "ケチャップ", "鶏肉"]], ["カレー", ["じゃがいも", "にんじん", "玉ねぎ", "豚肉", "カレールー"]], ["豚汁", ["豚肉", "大根", "にんじん", "味噌", "じゃがいも"]], ["チャーハン", ["ご飯", "卵", "ネギ", "ハム"]], ["焼きそば", ["麺", "キャベツ", "豚肉", "もやし"]], ["ナポリタン", ["パスタ", "玉ねぎ", "ピーマン", "ソーセージ", "ケチャップ"]], ["肉じゃが", ["じゃがいも", "牛肉", "玉ねぎ", "にんじん"]], ["卵かけご飯と味噌汁", ["卵", "ご飯", "味噌", "豆腐"]], ["麻婆豆腐", ["豆腐", "ひき肉", "ネギ"]], ["きのこパスタ", ["パスタ", "きのこ", "ベーコン"]], ["卵焼き", ["卵"]], ["味噌汁", ["味噌", "豆腐", "ネギ"]], ["納豆ご飯", ["納豆", "ご飯"]], ["ハムエッグ", ["ハム", "卵"]], ["玉ねぎと卵の炒め物", ["玉ねぎ", "卵"]], ["野菜スープ", ["キャベツ", "にんじん", "玉ねぎ"]], ["豚の生姜焼き", ["豚肉", "玉ねぎ", "生姜"]], ["豚キムチ", ["豚肉", "キムチ"]], ["ツナマヨおにぎり", ["ご飯", "ツナ", "マヨネーズ"]], ["にんじんしりしり", ["にんじん", "卵", "ツナ"]], ["お好み焼き", ["キャベツ", "卵", "小麦粉", "豚肉"]], ["豆腐ステーキ", ["豆腐", "ネギ"]], ["回鍋肉", ["キャベツ", "豚肉", "ピーマン"]], ["鶏の照り焼き", ["鶏肉"]], ["肉豆腐", ["牛肉", "豆腐", "ネギ"]], ["スクランブルエッグ", ["卵", "牛乳", "バター"]], ["冷ややっこ", ["豆腐", "ネギ"]], ["焼きうどん", ["うどん", "キャベツ", "豚肉"]], ["ほうれん草のおひたし", ["ほうれん草"]], ["きのこの味噌汁", ["きのこ", "味噌", "豆腐"]], ["ミートソースパスタ", ["パスタ", "ひき肉", "玉ねぎ", "トマト"]], ["クリームシチュー", ["じゃがいも", "にんじん", "玉ねぎ", "鶏肉", "牛乳"]], ["鮭のバター焼き", ["鮭", "バター"]], ["フレンチトースト", ["パン", "卵", "牛乳"]], ["サラダ", ["レタス", "トマト", "きゅうり"]], ["鶏のから揚げ", ["鶏肉"]], ["キャベツと卵の炒め物", ["キャベツ", "卵"]], ["チーズオムレツ", ["卵", "チーズ"]], ["ひき肉とキャベツの炒め物", ["ひき肉", "キャベツ"]]];
  var SYN = [[/たまご|タマゴ|玉子/g, "卵"], [/ごはん|ゴハン|白米|白飯/g, "ご飯"], [/たまねぎ|タマネギ|玉葱/g, "玉ねぎ"], [/長ねぎ|青ねぎ|小ねぎ|万能ねぎ|ねぎ/g, "ネギ"], [/人参|ニンジン/g, "にんじん"], [/ジャガイモ|馬鈴薯/g, "じゃがいも"], [/とうふ|トウフ/g, "豆腐"], [/みそ|ミソ/g, "味噌"], [/豚バラ|豚こま|豚コマ|ぶた肉/g, "豚肉"], [/鶏もも|鶏むね|とり肉|鳥肉|チキン/g, "鶏肉"], [/合いびき|合挽き|豚ひき|牛ひき|挽き肉|ミンチ/g, "ひき肉"], [/きゃべつ/g, "キャベツ"], [/なっとう|ナットウ/g, "納豆"]];
  var norm = function (s) { SYN.forEach(function (p) { s = s.replace(p[0], p[1]) }); return s };

  /* 日付が変わったときの整理:未完了は持ち越し、繰り返しタスクを生成、古い予定/ご飯を削除 */
  function rollover() {
    S.stock.forEach(function (k) { if (!k.hist && k.bought) { k.hist = [k.bought]; k.base = k.base || k.cycle } if (!k.bought) { k.bought = ds(new Date()); k.cycle = k.cycle || dailyDays(k.name) || 30; delete k.qty; delete k.min } });
    today = ds(new Date()); var dow = new Date().getDay();
    S.todos = S.todos.filter(function (t) { return (!t.done || t.date >= today) && !(t.tid && t.date < today) }).map(function (t) { return t.date < today ? Object.assign({}, t, { date: today }) : t });
    S.rec.forEach(function (r) {
      if ((r.dow < 0 || r.dow === dow) && !S.todos.some(function (t) { return t.rid === r.id && t.date === today }))
        S.todos.push({ id: uid(), text: r.text, done: false, date: today, rid: r.id });
    });
    if (S.tgen !== today) { S.tgen = today; S.todos = S.todos.filter(function (t) { return t.tid !== "trash" }); var tr = S.trash[dow]; if (tr) S.todos.push({ id: uid(), text: tr + "を出す", done: false, date: today, tid: "trash" }) }
    S.sched = S.sched.filter(function (s) { return s.date >= today });
    Object.keys(S.meals).forEach(function (d) { if (d < today) delete S.meals[d] });
    save();
  }

  /* ---- お金 ---- */
  function renderMoney() {
    var ym = today.slice(0, 7), dim = new Date(+ym.slice(0, 4), +ym.slice(5), 0).getDate(), left = dim - Number(today.slice(8)) + 1;
    var mine = S.exp.filter(function (e) { return e.date.slice(0, 7) === ym });
    var sum = function (a) { return a.reduce(function (s, e) { return s + e.amt }, 0) };
    var todayEx = mine.filter(function (e) { return e.date === today }), st = sum(todayEx), sm = sum(mine), sb = sm - st;
    var amt = $("moneyAmt"), bar = $("bar");
    if (!S.budget) {
      amt.className = "big"; amt.innerHTML = "—<span> 円</span>";
      $("moneySub").textContent = "「予算を設定」から予算を入れると、1日に使える額を自動計算します";
      bar.querySelector("i").style.width = "0"; bar.classList.remove("over");
    } else {
      var fx = S.fixed.reduce(function (a, x) { return a + x.amt }, 0), daily = Math.floor((S.budget - fx - sb) / left), remain = daily - st;
      amt.className = "big" + (remain < 0 ? " over" : "");
      amt.innerHTML = remain.toLocaleString("ja-JP") + "<span> 円</span>";
      $("moneySub").textContent = "今月の残り " + (S.budget - fx - sm).toLocaleString("ja-JP") + "円" + (fx ? "(固定費" + fx.toLocaleString("ja-JP") + "円を引いて計算)" : "") + " ・ 1日あたり " + daily.toLocaleString("ja-JP") + "円(残り" + left + "日) ・ 今日使った額 " + st.toLocaleString("ja-JP") + "円";
      bar.querySelector("i").style.width = (daily > 0 ? Math.min(100, st / daily * 100) : 100) + "%";
      bar.classList.toggle("over", remain < 0);
    }
    renderCats(mine, sm);
    $("expList").innerHTML = todayEx.map(function (e) { return '<li><span class="tx">' + esc((e.cat ? e.cat + " " : "") + (e.memo || "支出")) + '</span><b>' + e.amt.toLocaleString("ja-JP") + '円</b><button class="x" type="button" data-a="edel" data-id="' + e.id + '" aria-label="削除">×</button></li>' }).join("");
  }

  var CATS = ["食費", "日用品", "交通", "娯楽", "その他"];
  function renderCats(mine, total) {
    $("cats").innerHTML = total ? CATS.map(function (c) {
      var v = mine.filter(function (e) { return (e.cat || "その他") === c }).reduce(function (a, e) { return a + e.amt }, 0);
      return v ? '<div class="cat"><span>' + c + '</span><div class="bar"><i style="width:' + Math.round(v / total * 100) + '%"></i></div><b>' + v.toLocaleString("ja-JP") + '円</b></div>' : "";
    }).join("") : "";
  }
  function renderShop() {
    $("shopList").innerHTML = S.shop.length ? S.shop.map(function (x) {
      return '<li><button class="chk" type="button" data-a="shdone" data-id="' + x.id + '" aria-pressed="' + x.bought + '" aria-label="購入済み切替">' + (x.bought ? "✓" : "") + '</button><span class="tx' + (x.bought ? " done" : "") + '">' + esc(x.name) + '</span><button class="x" type="button" data-a="shdel" data-id="' + x.id + '" aria-label="削除">×</button></li>';
    }).join("") : '<li><p class="empty">買うものはありません</p></li>';
    $("toFridge").classList.toggle("hidden", !S.shop.some(function (x) { return x.bought }));
  }

  var W = ["日", "月", "火", "水", "木", "金", "土"];
  function nextDue(day) { var n = new Date(today + "T00:00:00"), t = new Date(n.getFullYear(), n.getMonth(), day); if (t < n) t = new Date(n.getFullYear(), n.getMonth() + 1, day); return Math.round((t - n) / 864e5) }
  function renderTrash() {
    var dow = new Date(today + "T00:00:00").getDay(), t = S.trash[dow], el = $("trashToday");
    el.textContent = t ? "今日は「" + t + "」の日です" : "今日はゴミ出しなし"; el.className = "status" + (t ? " ok" : "");
    var nx = "";
    for (var i = 1; i <= 7 && !nx; i++) { var g = S.trash[(dow + i) % 7]; if (g) nx = (i === 1 ? "明日" : i + "日後(" + W[(dow + i) % 7] + ")") + ":" + g }
    $("trashNext").textContent = nx ? "次は " + nx : (Object.keys(S.trash).length ? "" : "「曜日を設定」から登録できます");
  }
  function renderFixed() {
    var tot = S.fixed.reduce(function (a, x) { return a + x.amt }, 0);
    $("fixTotal").textContent = S.fixed.length ? "合計 " + tot.toLocaleString("ja-JP") + "円/月" : "";
    $("fixList").innerHTML = S.fixed.length ? S.fixed.slice().sort(function (a, b) { return nextDue(a.day) - nextDue(b.day) }).map(function (x) {
      var d = nextDue(x.day);
      return '<li><span class="tx">' + esc(x.name) + ' <small>毎月' + x.day + '日(' + (d === 0 ? "今日" : "あと" + d + "日") + ')</small></span><b>' + x.amt.toLocaleString("ja-JP") + '円</b><button class="x" type="button" data-a="fxdel" data-id="' + x.id + '" aria-label="削除">×</button></li>';
    }).join("") : '<li><p class="empty">固定費はまだありません</p></li>';
  }
  /* ---- 日用品・食材の判定と、賞味期限・買い替えの目安 ---- */
  var DAILY = [["シャンプー", 45], ["リンス", 45], ["コンディショナー", 45], ["トリートメント", 45], ["ボディソープ", 35], ["ハンドソープ", 40], ["洗顔", 40], ["歯みがき", 45], ["歯磨き", 45], ["ハミガキ", 45], ["歯ブラシ", 60], ["洗剤", 40], ["柔軟剤", 45], ["漂白", 60], ["トイレットペーパー", 30], ["ティッシュ", 30], ["キッチンペーパー", 30], ["ラップ", 60], ["アルミホイル", 90], ["ゴミ袋", 45], ["ごみ袋", 45], ["スポンジ", 30], ["除菌", 30], ["掃除", 60], ["マスク", 30], ["綿棒", 90], ["カミソリ", 30], ["日焼け止め", 60], ["化粧水", 45], ["乳液", 45], ["電池", 90]];
  var SHELF = [["弁当", 1], ["おにぎり", 1], ["サンドイッチ", 1], ["惣菜", 1], ["刺身", 1], ["サラダ", 2], ["ひき肉", 1], ["挽き肉", 1], ["食パン", 4], ["パン", 4], ["牛乳", 7], ["豆乳", 7], ["卵", 14], ["たまご", 14], ["玉子", 14], ["ヨーグルト", 14], ["チーズ", 21], ["バター", 30], ["納豆", 10], ["豆腐", 5], ["油揚げ", 5], ["こんにゃく", 30], ["ささみ", 2], ["鶏", 2], ["とり", 2], ["豚", 3], ["牛", 3], ["ベーコン", 10], ["ハム", 7], ["ソーセージ", 14], ["ウインナー", 14], ["鮭", 3], ["さけ", 3], ["魚", 2], ["えび", 2], ["いか", 2], ["キャベツ", 7], ["レタス", 5], ["白菜", 10], ["ほうれん草", 3], ["小松菜", 4], ["もやし", 2], ["ねぎ", 7], ["ネギ", 7], ["にんじん", 14], ["人参", 14], ["大根", 10], ["玉ねぎ", 30], ["たまねぎ", 30], ["玉葱", 30], ["じゃがいも", 30], ["ジャガイモ", 30], ["さつまいも", 30], ["トマト", 7], ["きゅうり", 5], ["なす", 5], ["ピーマン", 7], ["ブロッコリー", 5], ["きのこ", 5], ["しめじ", 5], ["えのき", 5], ["しいたけ", 5], ["りんご", 21], ["バナナ", 5], ["みかん", 14], ["いちご", 3], ["レモン", 14], ["うどん", 5], ["そば", 5], ["漬物", 14], ["キムチ", 14], ["味噌", 90], ["ジャム", 30], ["マヨネーズ", 60], ["ケチャップ", 60], ["ドレッシング", 60], ["めんつゆ", 60]];
  function hit(list, name) { for (var i = 0; i < list.length; i++) if (name.indexOf(list[i][0]) >= 0) return list[i][1]; return 0 }
  function dailyDays(n) { return hit(DAILY, n) }
  function shelfDays(n) { return hit(SHELF, n) }
  function kindOf(name, ai) { if (dailyDays(name)) return "日用品"; if (shelfDays(name)) return "食材"; return (ai === "食材" || ai === "日用品") ? ai : "なし" }
  function addDays(d, n) { var t = new Date(d + "T00:00:00"); t.setDate(t.getDate() + n); return ds(t) }
  /* 季節による使う量の変化: ①買った日を記録して、実際の買い方から目安を自動更新 ②記録が少ないうちは、季節で補正した標準の日数 */
  var HOT = ["シャンプー", "リンス", "コンディショナー", "トリートメント", "ボディソープ", "洗剤", "柔軟剤", "日焼け止め"];   /* 夏に使う量が増える */
  var COLD = ["化粧水", "乳液", "ハンドクリーム", "リップ"];                                                              /* 冬に使う量が増える */
  var SEASONAL = ["ティッシュ", "マスク"];                                                                                 /* 冬〜春(風邪・花粉)に増える */
  function hasAny(list, name) { return list.some(function (w) { return name.indexOf(w) >= 0 }) }
  function seasonFactor(name, m) {
    var hot = m >= 6 && m <= 9, cold = m === 12 || m <= 2;
    if (hasAny(HOT, name)) return hot ? 0.85 : cold ? 1.1 : 1;
    if (hasAny(COLD, name)) return cold ? 0.85 : hot ? 1.1 : 1;
    if (hasAny(SEASONAL, name)) return (m >= 11 || m <= 4) ? 0.85 : 1;
    return 1;
  }
  function learnedCycle(k) {
    var h = (k.hist || []).slice().sort(), iv = [], i;
    for (i = 1; i < h.length; i++) {
      var d = Math.round((new Date(h[i] + "T00:00:00") - new Date(h[i - 1] + "T00:00:00")) / 864e5);
      if (d >= 3 && d <= 365) iv.push({ d: d, m: +h[i].slice(5, 7) });
    }
    if (!iv.length) return 0;
    var m0 = +today.slice(5, 7), near = iv.filter(function (x) { var g = Math.abs(x.m - m0); return Math.min(g, 12 - g) <= 1 });
    var use = near.length ? near : iv.slice(-3), w = 0, s = 0;
    use.forEach(function (x, j) { w += j + 1; s += (j + 1) * x.d });
    return Math.round(s / w);
  }
  var USE = { "少なめ": 1.25, "ふつう": 1, "多め": 0.8, "共有": 0.6 };   /* 使う量(髪の長さ・人数・回数など)で、目安の日数を変える */
  function stockCycle(k) {
    if (k.manual) return { c: k.cycle, src: "手入力" };
    var L = learnedCycle(k); if (L) return { c: L, src: "買った間隔から自動" };
    var base = k.base || dailyDays(k.name) || k.cycle || 30, f = seasonFactor(k.name, +today.slice(5, 7)), u = USE[k.use || "ふつう"] || 1;
    return { c: Math.max(7, Math.round(base * f * u)), src: (f === 1 && u === 1) ? "標準の目安" : u !== 1 ? "季節・使う量で調整" : "季節で調整" };
  }
  /* 日用品: 「いつ買ったか」を記録する(残りの量は、システムからは分からないため) */
  function addStock(name, date, cycle, use) {
    var k = S.stock.filter(function (x) { return x.name === name })[0], b = dailyDays(name) || 30;
    if (!k) { k = { id: uid(), name: name, bought: date, hist: [], base: b, cycle: b }; S.stock.push(k) }
    if (!k.hist) k.hist = [k.bought];
    if (k.hist.indexOf(date) < 0) k.hist.push(date);
    k.hist.sort(); k.bought = k.hist[k.hist.length - 1];
    if (cycle) { k.manual = true; k.cycle = cycle }
    if (use && (use !== "ふつう" || !k.use)) k.use = use;
    S.shop = S.shop.filter(function (x) { return !(x.name === name && !x.bought) });
  }
  /* 冷蔵庫: 賞味期限は、食材の種類から目安を自動で入れる */
  function addFridge(name, date) {
    var ex = addDays(date, shelfDays(name) || 7); if (ex < today) return false;
    var f = S.fridge.filter(function (x) { return x.name === name })[0];
    if (f) { f.exp = ex; f.est = true } else S.fridge.push({ id: uid(), name: name, exp: ex, est: true });
    return true;
  }
  function stockState(k) { var el = -diff(k.bought), cc = stockCycle(k), c = cc.c; return { el: el, c: c, src: cc.src, due: el >= c, soon: el >= c * .8 && el < c } }
  function renderStock() {
    var rows = S.stock.slice().sort(function (a, b) { var x = stockState(a), y = stockState(b); return y.el / y.c - x.el / x.c });
    $("stockList").innerHTML = rows.length ? rows.map(function (k) {
      var st = stockState(k), b = new Date(k.bought + "T00:00:00");
      var tag = st.due ? '<small>そろそろ買い時</small>' : st.soon ? '<small class="soon">もうすぐ買い時</small>' : '';
      var last = (b.getMonth() + 1) + "/" + b.getDate() + "に購入(" + (st.el <= 0 ? "今日" : st.el + "日前") + ")";
      return '<li><span class="tx">' + esc(k.name) + ' ' + tag + '<span class="sub2">' + last + '</span><button class="linkbtn" type="button" data-a="stcycle" data-id="' + k.id + '">目安 ' + st.c + '日ごと(' + st.src + ') ✎</button><button class="linkbtn" type="button" data-a="stuse" data-id="' + k.id + '">使う量: ' + (k.use || "ふつう") + ' ✎</button></span>' +
        (st.due ? '<button class="btn b-gh sm" type="button" data-a="stshop" data-id="' + k.id + '">買い物へ</button>' : '') +
        '<button class="btn b-gh sm" type="button" data-a="stbuy" data-id="' + k.id + '">買った</button>' +
        '<button class="x" type="button" data-a="stdel" data-id="' + k.id + '" aria-label="削除">×</button></li>';
    }).join("") : '<li><p class="empty">日用品はまだありません。レシートを登録すると、自動で入ります</p></li>';
  }

  /* ---- Todo ---- */
  function renderTodos() {
    var l = $("todoList");
    l.innerHTML = S.todos.length ? S.todos.map(function (t) {
      return '<li><button class="chk" type="button" data-a="tdone" data-id="' + t.id + '" aria-pressed="' + t.done + '" aria-label="完了切替">' + (t.done ? "✓" : "") + '</button><span class="tx' + (t.done ? " done" : "") + '">' + esc(t.text) + (t.rid ? ' <small>🔁</small>' : '') + '</span><button class="x" type="button" data-a="tdel" data-id="' + t.id + '" aria-label="削除">×</button></li>';
    }).join("") : '<li><p class="empty">やることはありません</p></li>';
    var d = S.todos.filter(function (t) { return t.done }).length;
    $("todoProg").textContent = S.todos.length ? d + "/" + S.todos.length + " 完了" : "";
  }

  /* ---- ご飯 ---- */
  function renderMeal() {
    var m = S.meals[today], st = $("mealStatus");
    st.textContent = m ? "今夜は「" + m + "」に決定!" : "まだ決まっていません";
    st.className = "status" + (m ? " ok" : "");
    $("mealBtn").textContent = m ? "変更する" : "夜ご飯を決める";
    $("mealClear").classList.toggle("hidden", !m);
  }
  function suggest(only) {
    var ul = $("sug");
    if (!S.fridge.length) { ul.innerHTML = '<li>冷蔵庫に食材を登録すると提案できます</li>'; return }
    var f = S.fridge.map(function (x) { return { n: norm(x.name), d: x.exp ? diff(x.exp) : 99 } });
    var res = RECIPES.map(function (r) {
      var sc = 0, use = [], miss = [];
      r[1].forEach(function (i) {
        var m = f.find(function (x) { return x.n.indexOf(i) >= 0 || i.indexOf(x.n) >= 0 });
        if (m) { use.push(i); sc += 1 + (m.d <= 2 ? 2 : m.d <= 5 ? 1 : 0) } else miss.push(i);
      });
      return { name: r[0], use: use, miss: miss, sc: sc };
    }).filter(function (r) { return r.sc > 0 }).sort(function (a, b) { return b.sc - a.sc || a.miss.length - b.miss.length }), note = "";
    if (only) {
      var full = res.filter(function (r) { return !r.miss.length });
      if (full.length) res = full.slice(0, 5);
      else { res = res.filter(function (r) { return r.miss.length === 1 }).slice(0, 3); note = '<li>冷蔵庫の食材だけで作れる料理はまだありません。あと1品で作れる料理です</li>' }
    } else res = res.slice(0, 3);
    ul.innerHTML = res.length ? note + res.map(function (r) {
      return '<li><div><b>' + esc(r.name) + '</b><small>使う: ' + esc(r.use.join("・")) + (r.miss.length ? ' ／ 足りない: ' + esc(r.miss.join("・")) : '') + '</small></div><span class="bt">' + (r.miss.length ? '<button class="btn b-gh" type="button" data-a="addmiss" data-miss="' + esc(r.miss.join("|")) + '">足りない食材を追加</button>' : '') + '<button class="btn b-gh" type="button" data-a="pick" data-name="' + esc(r.name) + '">これにする</button></span></li>';
    }).join("") : '<li>' + (only ? "冷蔵庫の食材だけで作れる料理はありません。食材を追加してみてください" : "合う料理が見つかりませんでした") + '</li>';
  }

  /* ---- 予定 ---- */
  function renderSched() {
    var l = $("tl");
    if (!S.sched.length) { l.innerHTML = '<li><p class="empty">予定はまだありません</p></li>'; return }
    l.innerHTML = S.sched.slice().sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time) }).map(function (s) {
      var d = s.date === today ? "" : (+s.date.slice(5, 7)) + "/" + (+s.date.slice(8)) + " ";
      return '<li><b>' + d + s.time + '</b><span class="tx">' + esc(s.text) + '</span><button class="x" type="button" data-a="sdel" data-id="' + s.id + '" aria-label="削除">×</button></li>';
    }).join("");
  }

  /* ---- 冷蔵庫 ---- */
  var frSel = null;   /* null: ふつうの表示 / オブジェクト: まとめて消すものを選んでいる状態 */
  function renderFridge() {
    if (frSel && !S.fridge.length) frSel = null;
    var l = $("fridge"), n = frSel ? Object.keys(frSel).filter(function (k) { return frSel[k] }).length : 0;
    $("frSelBtn").classList.toggle("hidden", !!frSel || !S.fridge.length); $("frBulk").classList.toggle("hidden", !frSel);
    $("frDel").textContent = "選んだものを消す(" + n + ")"; $("frDel").disabled = !n;
    if (!S.fridge.length) { l.innerHTML = '<li style="background:none;padding:0"><p class="empty">まだ何も登録されていません</p></li>'; return }
    l.innerHTML = S.fridge.slice().sort(function (a, b) { return (a.exp || "9999").localeCompare(b.exp || "9999") }).map(function (x) {
      var cls = "", lb = "";
      if (x.exp) { var d = diff(x.exp); lb = (d < 0 ? "期限切れ" : d === 0 ? "今日まで" : "あと" + d + "日") + (x.est ? "(目安)" : ""); cls = d <= 0 ? "bad" : d <= 2 ? "warn" : "" }
      if (frSel) {
        var on = !!frSel[x.id];
        return '<li class="' + cls + ' pm' + (on ? " sel" : "") + '"><button type="button" class="pick" data-a="fpick" data-id="' + x.id + '" aria-pressed="' + on + '"><span class="ck">' + (on ? "✓" : "") + '</span><span>' + esc(x.name) + '</span>' + (lb ? '<small>' + lb + '</small>' : '') + '</button></li>';
      }
      return '<li class="' + cls + '"><span>' + esc(x.name) + '</span>' + (lb ? '<small>' + lb + '</small>' : '') + '<button class="x" type="button" data-a="fdel" data-id="' + x.id + '" aria-label="' + esc(x.name) + 'を削除">×</button></li>';
    }).join("");
  }

  function renderSummary() {
    var el = $("sum"); if (!el) return;
    var left = S.todos.filter(function (t) { return !t.done }).length, now = new Date();
    var hm = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
    var ts = S.sched.filter(function (s) { return s.date === today }).sort(function (a, b) { return a.time.localeCompare(b.time) });
    var nx = ts.filter(function (s) { return s.time >= hm })[0];
    var tr = (S.trash || {})[new Date(today + "T00:00:00").getDay()], meal = (S.meals || {})[today];
    var soon = S.fridge.filter(function (x) { return x.exp && diff(x.exp) <= 2 }).sort(function (a, b) { return a.exp.localeCompare(b.exp) });
    var due = S.stock.filter(function (k) { return stockState(k).due });
    var d0 = soon.length ? diff(soon[0].exp) : 0;
    var fl = soon.length ? soon[0].name + "(" + (d0 < 0 ? "期限切れ" : d0 === 0 ? "今日まで" : "あと" + d0 + "日") + ")" + (soon.length > 1 ? " ほか" + (soon.length - 1) + "品" : "") : "近いものはなし";
    var dl = due.length ? due[0].name + (due.length > 1 ? " ほか" + (due.length - 1) + "品" : "") + "が買い時" : "買い時はなし";
    var T = [
      ["やること", left ? "残り " + left + "件" : (S.todos.length ? "ぜんぶ完了" : "なし")],
      ["次の予定", nx ? nx.time + " " + nx.text : (ts.length ? "今日の予定は終了" : "予定なし")],
      ["今夜のご飯", meal || "未定"],
      ["ゴミ出し", tr ? tr + "の日" : "今日はなし"],
      ["冷蔵庫の期限", fl, soon.length > 0],
      ["日用品", dl, due.length > 0]
    ];
    el.innerHTML = T.map(function (x) { return "<div" + (x[2] ? ' class="alert"' : "") + "><small>" + x[0] + "</small><b>" + esc(x[1]) + "</b></div>" }).join("");
    var tm = document.querySelector('.tab[data-t="meal"]'), tb = document.querySelector('.tab[data-t="shop"]');
    if (tm) tm.classList.toggle("alert", soon.length > 0); if (tb) tb.classList.toggle("alert", due.length > 0);
  }
  function renderAll() {
    var w = ["日", "月", "火", "水", "木", "金", "土"], n = new Date();
    $("today").textContent = n.getFullYear() + "年" + (n.getMonth() + 1) + "月" + n.getDate() + "日(" + w[n.getDay()] + ")";
    $("schDate").value = $("schDate").value || today; $("schDate").min = today;
    renderMoney(); renderTodos(); renderMeal(); renderSched(); renderFridge(); renderShop(); renderTrash(); renderFixed(); renderStock(); renderMonth(); renderSummary();
  }

  /* ---- 月ごとの家計(一覧・グラフ・編集・CSV) ---- */
  var viewMonth = "";
  function curMonth() { return viewMonth || today.slice(0, 7) }
  function shiftMonth(m, n) { var d = new Date(+m.slice(0, 4), +m.slice(5) - 1 + n, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") }
  function renderMonth() {
    if (!$("mList")) return;
    var m = curMonth(), isNow = m === today.slice(0, 7), yen = function (n) { return n.toLocaleString("ja-JP") + "円" };
    var list = S.exp.filter(function (e) { return e.date.slice(0, 7) === m }).sort(function (a, b) { return b.date.localeCompare(a.date) });
    var total = list.reduce(function (a, e) { return a + e.amt }, 0), fx = S.fixed.reduce(function (a, x) { return a + x.amt }, 0);
    $("mLabel").textContent = m.slice(0, 4) + "年" + (+m.slice(5)) + "月"; $("mNext").disabled = m >= today.slice(0, 7);
    var tiles = [["使った額", yen(total)], ["固定費(月)", yen(fx)]];
    if (S.budget) { var rest = S.budget - fx - total; tiles.push(["予算の残り", yen(rest), rest < 0]) } else tiles.push(["予算", "未設定"]);
    $("mStats").innerHTML = tiles.map(function (t) { return "<div" + (t[2] ? ' class="alert"' : "") + "><small>" + t[0] + "</small><b>" + t[1] + "</b></div>" }).join("");
    var dim = new Date(+m.slice(0, 4), +m.slice(5), 0).getDate(), days = new Array(dim).fill(0);
    list.forEach(function (e) { days[+e.date.slice(8) - 1] += e.amt });
    var mx = Math.max.apply(null, days.concat([1]));
    $("mChart").innerHTML = '<div class="dchart" aria-hidden="true">' + days.map(function (v, i) { return '<i' + (isNow && i + 1 === +today.slice(8) ? ' class="now"' : '') + ' style="height:' + Math.round(v / mx * 100) + '%" title="' + (i + 1) + '日 ' + yen(v) + '"></i>' }).join("") + '</div><div class="dlab"><span>1日</span><span>' + Math.ceil(dim / 2) + '日</span><span>' + dim + '日</span></div>';
    $("mCats").innerHTML = total ? CATS.map(function (c) {
      var v = list.filter(function (e) { return (e.cat || "その他") === c }).reduce(function (a, e) { return a + e.amt }, 0), pc = Math.round(v / total * 100);
      return v ? '<div class="cat"><span>' + c + '</span><div class="bar"><i style="width:' + pc + '%"></i></div><b>' + yen(v) + '(' + pc + '%)</b></div>' : "";
    }).join("") : "";
    $("mList").innerHTML = list.length ? list.map(function (e) {
      return '<li><span class="tx"><small class="d">' + (+e.date.slice(5, 7)) + '/' + (+e.date.slice(8)) + '</small> ' + esc((e.cat || "その他") + " " + (e.memo || "")) + '</span><b>' + yen(e.amt) + '</b><button class="x" type="button" data-a="eedit" data-id="' + e.id + '" aria-label="直す">✎</button><button class="x" type="button" data-a="edel" data-id="' + e.id + '" aria-label="削除">×</button></li>';
    }).join("") : '<li><p class="empty">この月の支出は、まだありません</p></li>';
  }
  /* ---- 削除の「元に戻す」 ---- */
  var toastTimer = null, toastUndo = null;
  function showToast(msg, undo) {
    $("toastMsg").textContent = msg; toastUndo = undo; $("toastUndo").classList.toggle("hidden", !undo); $("toast").classList.remove("hidden"); clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $("toast").classList.add("hidden"); toastUndo = null }, 7000);
  }
  /* ---- 初めて開いたときの案内 ---- */
  function maybeIntro() {
    try { if (localStorage.getItem("ls_intro") === "1") return } catch (e) { }
    if (!$("login").classList.contains("hidden")) return;
    if (S.budget || S.exp.length || S.fridge.length || S.todos.length) { try { localStorage.setItem("ls_intro", "1") } catch (e) { } return }
    $("intro").classList.remove("hidden");
  }

  /* ---- 操作(クリック) ---- */
  var by = function (list, id) { return list.filter(function (x) { return x.id !== id }) };
  var act = {
    eedit: function (id) {
      var e = S.exp.filter(function (x) { return x.id === id })[0]; if (!e) return;
      var a = prompt("金額(円・税込)", e.amt); if (a === null) return;
      var n = parseInt(a, 10); if (!isNaN(n) && n > 0) e.amt = n;
      var m = prompt("メモ", e.memo || ""); if (m === null) return; e.memo = m.trim();
      var c = prompt("カテゴリ(" + CATS.join("・") + ")", e.cat || "その他"); if (c !== null && CATS.indexOf(c.trim()) >= 0) e.cat = c.trim();
    },
    edel: function (id) { S.exp = by(S.exp, id) },
    tdone: function (id) { S.todos.forEach(function (t) { if (t.id === id) t.done = !t.done }) },
    tdel: function (id) {
      var t = S.todos.filter(function (x) { return x.id === id })[0];
      if (t && t.rid && confirm("この繰り返しタスクをやめますか?\nOK=今後も削除 / キャンセル=今日だけ削除")) S.rec = by(S.rec, t.rid);
      S.todos = by(S.todos, id);
    },
    sdel: function (id) { S.sched = by(S.sched, id) },
    fpick: function (id) { if (!frSel) return; if (frSel[id]) delete frSel[id]; else frSel[id] = true },
    fdel: function (id) { S.fridge = by(S.fridge, id); $("sug").innerHTML = "" },
    pick: function (id, b) { S.meals[today] = b.dataset.name; $("sug").innerHTML = "" },
    shdone: function (id) { S.shop.forEach(function (x) { if (x.id === id) x.bought = !x.bought }) },
    shdel: function (id) { S.shop = by(S.shop, id) },
    fxdel: function (id) { S.fixed = by(S.fixed, id) },
    stdel: function (id) { S.stock = by(S.stock, id) },
    stbuy: function (id) { var k = S.stock.filter(function (x) { return x.id === id })[0]; if (k) addStock(k.name, today) },
    stuse: function (id) {
      var k = S.stock.filter(function (x) { return x.id === id })[0]; if (!k) return;
      var names = ["少なめ", "ふつう", "多め", "共有"], cur = names.indexOf(k.use || "ふつう") + 1;
      var v = prompt("使う量を選んでください(番号)\n1: 少なめ\n2: ふつう\n3: 多め(髪が長い・使う回数が多いなど)\n4: 家族・同居人と共有", cur); if (v === null) return;
      var n = parseInt(v, 10); if (n >= 1 && n <= 4) k.use = names[n - 1];
    },
    stcycle: function (id) {
      var k = S.stock.filter(function (x) { return x.id === id })[0]; if (!k) return;
      var v = prompt("何日ごとに買い足しますか?\n(空欄にすると、買った間隔から自動で計算します)", k.manual ? k.cycle : ""); if (v === null) return;
      var n = parseInt(v, 10); if (!isNaN(n) && n >= 1) { k.manual = true; k.cycle = n } else if (v.trim() === "") k.manual = false;
    },
    stshop: function (id) { S.stock.forEach(function (k) { if (k.id === id && !S.shop.some(function (x) { return x.name === k.name && !x.bought })) S.shop.push({ id: uid(), name: k.name, bought: false }) }) },
    tofridge: function () { S.shop.filter(function (x) { return x.bought }).forEach(function (x) { var st = S.stock.filter(function (y) { return y.name === x.name })[0]; if (st || kindOf(x.name, "") === "日用品") addStock(x.name, today); else addFridge(x.name, today) }); S.shop = S.shop.filter(function (x) { return !x.bought }) },
    addmiss: function (id, b) { b.dataset.miss.split("|").forEach(function (n) { if (!S.shop.some(function (x) { return x.name === n && !x.bought }) && !S.fridge.some(function (x) { return x.name === n })) S.shop.push({ id: uid(), name: n, bought: false }) }) }
  };
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-a]"); if (!b) return;
    var del = /del$/.test(b.dataset.a), snap = del ? JSON.stringify(S) : null;   /* 削除は、あとで元に戻せるように */
    act[b.dataset.a](b.dataset.id, b); save(); renderAll();
    if (snap) showToast("削除しました", function () { S = withDef(JSON.parse(snap)); save(); renderAll() });
  });

  /* ---- フォーム ---- */
  $("frSelBtn").addEventListener("click", function () { frSel = {}; renderFridge() });
  $("frCancel").addEventListener("click", function () { frSel = null; renderFridge() });
  $("frAll").addEventListener("click", function () { frSel = {}; S.fridge.forEach(function (x) { frSel[x.id] = true }); renderFridge() });
  $("frExpired").addEventListener("click", function () {
    var old = S.fridge.filter(function (x) { return x.exp && diff(x.exp) < 0 });
    if (!old.length) { showToast("期限切れの食材はありません", null); return }
    frSel = {}; old.forEach(function (x) { frSel[x.id] = true }); renderFridge();
  });
  $("frDel").addEventListener("click", function () {
    var ids = Object.keys(frSel || {}).filter(function (k) { return frSel[k] }); if (!ids.length) return;
    var snap = JSON.stringify(S), sel = frSel;
    S.fridge = S.fridge.filter(function (x) { return !sel[x.id] }); frSel = null; $("sug").innerHTML = "";
    save(); renderAll();
    showToast(ids.length + "品を消しました", function () { S = withDef(JSON.parse(snap)); save(); renderAll() });
  });
  $("mPrev").addEventListener("click", function () { viewMonth = shiftMonth(curMonth(), -1); renderMonth() });
  $("mNext").addEventListener("click", function () { var n = shiftMonth(curMonth(), 1); if (n <= today.slice(0, 7)) { viewMonth = n; renderMonth() } });
  $("mCsv").addEventListener("click", function () {
    var m = curMonth(), rows = S.exp.filter(function (e) { return e.date.slice(0, 7) === m }).sort(function (a, b) { return a.date.localeCompare(b.date) });
    var csv = "\ufeff日付,カテゴリ,メモ,金額(円)\n" + rows.map(function (e) {
      var memo = e.memo || ""; if (/^[=+\-@]/.test(memo)) memo = "'" + memo;
      return [e.date, e.cat || "その他", '"' + memo.replace(/"/g, '""') + '"', e.amt].join(",");
    }).join("\n");
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "家計_" + m + ".csv"; a.click(); URL.revokeObjectURL(a.href);
  });
  $("toastUndo").addEventListener("click", function () { if (toastUndo) toastUndo(); $("toast").classList.add("hidden"); toastUndo = null });
  $("introOk").addEventListener("click", function () { $("intro").classList.add("hidden"); try { localStorage.setItem("ls_intro", "1") } catch (e) { } });
  $("introHelp").addEventListener("click", function () { $("introOk").click(); document.querySelector('.tab[data-t="help"]').click() });

  $("expForm").addEventListener("submit", function (e) {
    e.preventDefault(); var a = parseInt($("expAmt").value, 10); if (isNaN(a) || a <= 0) return;
    S.exp.push({ id: uid(), date: today, amt: a, memo: $("expMemo").value.trim(), cat: $("expCat").value });
    $("expAmt").value = ""; $("expMemo").value = ""; save(); renderMoney();
  });
  $("budgetBtn").addEventListener("click", function () {
    var v = prompt("今月使えるお金の総額(円)を入力してください(固定費を含む)", S.budget || ""); if (v === null) return;
    var n = parseInt(v, 10); if (!isNaN(n) && n >= 0) { S.budget = n; save(); renderMoney() }
  });
  $("todoForm").addEventListener("submit", function (e) {
    e.preventDefault(); var text = $("todoIn").value.trim(); if (!text) return;
    var t = { id: uid(), text: text, done: false, date: today }, rep = $("todoRep").value;
    if (rep) { var r = { id: uid(), text: text, dow: rep === "daily" ? -1 : new Date().getDay() }; S.rec.push(r); t.rid = r.id }
    S.todos.push(t); $("todoIn").value = ""; $("todoRep").value = ""; save(); renderTodos();
  });
  $("mealBtn").addEventListener("click", function () { $("mealIn").value = S.meals[today] || ""; $("mealEdit").classList.remove("hidden"); $("mealIn").focus() });
  $("mealSave").addEventListener("click", function () {
    var v = $("mealIn").value.trim(); if (v) S.meals[today] = v;
    $("mealEdit").classList.add("hidden"); save(); renderMeal();
  });
  $("mealIn").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); $("mealSave").click() } });
  $("mealClear").addEventListener("click", function () { delete S.meals[today]; $("mealEdit").classList.add("hidden"); save(); renderMeal() });
  $("mealSug").addEventListener("click", function () { suggest() });
  $("mealOnly").addEventListener("click", function () { suggest(true) });
  $("schForm").addEventListener("submit", function (e) {
    e.preventDefault(); var t = $("schText").value.trim(); if (!t || !$("schTime").value || !$("schDate").value) return;
    S.sched.push({ id: uid(), date: $("schDate").value, time: $("schTime").value, text: t });
    $("schTime").value = ""; $("schText").value = ""; save(); renderSched();
  });
  $("frForm").addEventListener("submit", function (e) {
    e.preventDefault(); var n = $("frName").value.trim(); if (!n) return;
    var ex = $("frExp").value; S.fridge.push({ id: uid(), name: n, exp: ex || addDays(today, shelfDays(n) || 7), est: !ex });
    $("frName").value = ""; $("frExp").value = ""; $("sug").innerHTML = ""; save(); renderFridge();
  });
  $("memo").value = S.memo;
  $("trashGrid").innerHTML = W.map(function (w, i) { return '<label>' + w + '<input type="text" data-d="' + i + '" placeholder="なし"></label>' }).join("");
  $("trashBtn").addEventListener("click", function () {
    var ed = $("trashEdit"), hid = ed.classList.toggle("hidden");
    if (!hid) ed.querySelectorAll("input").forEach(function (i) { i.value = S.trash[i.dataset.d] || "" });
  });
  $("trashSave").addEventListener("click", function () {
    var t = {}; $("trashEdit").querySelectorAll("input").forEach(function (i) { var v = i.value.trim(); if (v) t[i.dataset.d] = v });
    S.trash = t; S.tgen = ""; $("trashEdit").classList.add("hidden"); rollover(); renderAll();
  });
  $("fixForm").addEventListener("submit", function (e) {
    e.preventDefault(); var a = parseInt($("fixAmt").value, 10), d = parseInt($("fixDay").value, 10), n = $("fixName").value.trim();
    if (!n || isNaN(a) || a <= 0 || isNaN(d) || d < 1 || d > 31) return;
    S.fixed.push({ id: uid(), name: n, amt: a, day: d }); $("fixName").value = ""; $("fixAmt").value = ""; $("fixDay").value = ""; save(); renderAll();
  });
  $("stockForm").addEventListener("submit", function (e) {
    e.preventDefault(); var n = $("stName").value.trim(), c = parseInt($("stCycle").value, 10);
    if (!n) return; addStock(n, $("stDate").value || today, isNaN(c) || c < 1 ? 0 : c, $("stUse").value);
    $("stName").value = ""; $("stCycle").value = ""; $("stUse").value = "ふつう"; save(); renderAll();
  });
  $("shopForm").addEventListener("submit", function (e) {
    e.preventDefault(); var n = $("shopIn").value.trim(); if (!n) return;
    S.shop.push({ id: uid(), name: n, bought: false }); $("shopIn").value = ""; save(); renderShop();
  });
  $("memo").addEventListener("input", function () { S.memo = $("memo").value; save() });

  /* ---- バックアップ ---- */
  $("exportBtn").addEventListener("click", function () {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: "application/json" }));
    a.download = "life-support-backup-" + today + ".json"; a.click(); URL.revokeObjectURL(a.href);
  });
  $("importBtn").addEventListener("click", function () { $("importFile").click() });
  $("importFile").addEventListener("change", function (e) {
    var f = e.target.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var d = JSON.parse(r.result); if (!d || !Array.isArray(d.todos)) throw 0;
        if (!confirm("現在のデータを上書きして読み込みます。よろしいですか?")) return;
        S = Object.assign({ budget: 0, exp: [], todos: [], rec: [], meals: {}, sched: [], fridge: [], memo: "", shop: [], trash: {}, fixed: [], stock: [], codes: {} }, d);
        rollover(); $("memo").value = S.memo; renderAll();
      } catch (x) { alert("読み込めませんでした。バックアップファイルを確認してください。") }
    };
    r.readAsText(f); e.target.value = "";
  });

  /* アプリを開いたまま日付をまたいだ場合に更新 */
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { rollover(); renderAll() } });

  rollover(); renderAll();

  /* ---- タブ切り替え ---- */
  var TABS = ["home", "meal", "shop", "money", "help"];
  function setTab(t) {
    if (TABS.indexOf(t) < 0) t = "home";
    document.querySelectorAll(".card[data-tab]").forEach(function (c) { c.classList.toggle("off", c.dataset.tab !== t) });
    document.querySelectorAll(".tab").forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.t === t)) });
    try { localStorage.setItem("ls_tab", JSON.stringify(t)) } catch (e) { }
  }
  document.querySelector(".tabs").addEventListener("click", function (e) { var b = e.target.closest(".tab"); if (b) { setTab(b.dataset.t); window.scrollTo(0, 0) } });
  setTab(load("ls_tab", "home"));

  /* ---- レシート読み取り(端末内でOCR) ---- */
  var rcItems = [];
  function loadOCR() {
    return window.Tesseract ? Promise.resolve() : new Promise(function (ok, ng) {
      var sc = document.createElement("script"); sc.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js"; sc.onload = ok; sc.onerror = ng; document.head.appendChild(sc);
    });
  }
  function parseReceipt(txt) {
    var t = txt.replace(/[０-９Ａ-Ｚａ-ｚ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 65248) }).replace(/[￥\\]/g, "¥").replace(/，/g, ",");
    var lines = t.split(/\n/).map(function (l) { return l.replace(/([^\x00-\x7F]) +(?=[^\x00-\x7F])/g, "$1").replace(/[|｜_~`"“”]/g, " ").replace(/\s+/g, " ").trim() }).filter(Boolean);
    var num = function (x) { return parseInt(String(x).replace(/[,\s¥]/g, ""), 10) };
    var letters = function (s) { return (s.match(/[\u3040-\u30ff\u3400-\u9fffA-Za-z]/g) || []).length };
    var DATE = /\d{4}\s*[年\/.\-]\s*\d{1,2}\s*[月\/.\-]|\d{1,2}\s*月\s*\d{1,2}\s*日|\d{1,2}:\d{2}/;
    var PHONE = /\d{2,4}[-ー‐]\d{2,4}[-ー‐]\d{3,4}|TEL|FAX|電話|〒|T\d{10,13}|登録番号|https?:|www\.|\.com|\.jp/i;
    var ADDR = /[都道府県].*[市区町村郡]|丁目|番地|\d+-\d+-\d+/;
    var NG = /合計|小計|お預|お釣|釣り?銭|税|対象|点数|現金|カード|ポイント|領収|レジ|担当|責任|様|番号|会員|クーポン|割引|値引|ありがとう|お越し|営業|伝票|取引|端末|ご利用|お支払|支払|電子|マネー|PayPay|Suica|QR|No\.\s*\d|#\d/i;
    var strip = function (s) { return s.replace(/\d+\s*[点個コ本袋]?\s*[x×@＠]\s*\d[\d,]*/gi, " ").replace(/[x×@＠]\s*\d+\s*[点個コ]?/gi, " ").replace(/\s\d{1,2}(?=\s*¥)/g, " ").replace(/\s+/g, " ").trim() };
    var clean = function (n) {
      return n.replace(/^[\d\s\-*#.,:;]{3,}/, "").replace(/^[\s\-*#.,:;]+/, "").replace(/[¥\s※*軽★☆\-.,:;]+$/, "").replace(/\s+/g, " ").trim();
    };
    var stop = lines.length;
    for (var k = 0; k < lines.length; k++) { if (/小計|合計|お買上|お会計|ご請求/.test(lines[k]) && !/点数|数量|個数/.test(lines[k])) { stop = k; break } }
    var PRICE_END = /^(.*?[^\d\s¥,.\-])\s*¥?\s*(\d{1,3}(?:,\d{3})+|\d{2,6})\s*(?:[軽※*★☆外内]|\([軽内外]\))?\s*$/;
    var ONLY_NUM = /^[\d\s@x×＠¥,.点個コ\-]*?(\d{1,3}(?:,\d{3})+|\d{2,6})\s*(?:[軽※*★☆外内]|\([軽内外]\))?$/i;
    var items = [], pend = "";
    for (var i = 0; i < stop; i++) {
      var l = lines[i];
      if (DATE.test(l) || PHONE.test(l) || ADDR.test(l) || NG.test(l)) { pend = ""; continue }
      var s = strip(l), m = s.match(PRICE_END);
      if (m) {
        var nm = clean(m[1]), pr = num(m[2]);
        if (letters(nm) < 2 && pend) nm = clean(pend);
        if (letters(nm) >= 2 && pr >= 10 && pr <= 100000) items.push({ name: nm, price: pr });
        pend = ""; continue;
      }
      var on = s.match(ONLY_NUM);
      if (on && pend) {
        var p2 = num(on[1]);
        if (p2 >= 10 && p2 <= 100000 && letters(pend) >= 2) items.push({ name: clean(pend), price: p2 });
        pend = ""; continue;
      }
      pend = (letters(l) >= 2 && l.length <= 40 && !/\d\s*[軽※*★☆]?$/.test(l)) ? l : "";
    }
    var total = 0;
    lines.forEach(function (l) {
      if (total || !/合計|お買上|お会計|ご請求|税込計/.test(l)) return;
      if (/小計|税率|消費税|内税|対象/.test(l) || (/点数|数量|個数/.test(l) && !/¥/.test(l))) return;
      var ns = l.match(/\d{1,3}(?:,\d{3})+|\d{2,6}/g) || [];
      if (ns.length) { var v = num(ns[ns.length - 1]); if (v >= 10 && v <= 300000) total = v }
    });
    if (!total && items.length) total = items.reduce(function (a, x) { return a + x.price }, 0);
    return { total: total, items: items };
  }
  function cropPaper(c) {
    var W = c.width, H = c.height, d = c.getContext("2d").getImageData(0, 0, W, H).data, g = new Uint8Array(W * H), h = new Array(256).fill(0), i, j, k;
    for (i = 0, j = 0; i < d.length; i += 4, j++) { g[j] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000; h[g[j]]++ }
    var tot = g.length, sum = 0, sb = 0, wb = 0, mx = 0, th = 128;
    for (k = 0; k < 256; k++) sum += k * h[k];
    for (k = 0; k < 256; k++) { wb += h[k]; if (!wb) continue; var wf = tot - wb; if (!wf) break; sb += k * h[k]; var mb = sb / wb, mf = (sum - sb) / wf, v = wb * wf * (mb - mf) * (mb - mf); if (v > mx) { mx = v; th = k } }
    var rows = new Array(H).fill(0), cols = new Array(W).fill(0), x, y;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) if (g[y * W + x] > th) { rows[y]++; cols[x]++ }
    var y0 = 0, y1 = H - 1, x0 = 0, x1 = W - 1;
    while (y0 < H && rows[y0] < W * .2) y0++; while (y1 > y0 && rows[y1] < W * .2) y1--;
    while (x0 < W && cols[x0] < H * .2) x0++; while (x1 > x0 && cols[x1] < H * .2) x1--;
    var mw = Math.round(W * .02), mh = Math.round(H * .02);
    x0 = Math.max(0, x0 - mw); x1 = Math.min(W - 1, x1 + mw); y0 = Math.max(0, y0 - mh); y1 = Math.min(H - 1, y1 + mh);
    var cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    if (cw * ch < W * H * .25 || cw * ch > W * H * .97) return c;
    var o = document.createElement("canvas"); o.width = cw; o.height = ch; o.getContext("2d").drawImage(c, x0, y0, cw, ch, 0, 0, cw, ch); return o;
  }
  function prep(f) {
    return new Promise(function (ok, ng) {
      var u = URL.createObjectURL(f), im = new Image();
      im.onload = function () {
        URL.revokeObjectURL(u);
        var k0 = Math.min(1, 2000 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement("canvas");
        c.width = Math.round(im.naturalWidth * k0); c.height = Math.round(im.naturalHeight * k0);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        c = cropPaper(c);
        var k1 = 1400 / c.width;
        if (k1 > 1) { var u2 = document.createElement("canvas"); u2.width = Math.round(c.width * k1); u2.height = Math.round(c.height * k1); u2.getContext("2d").drawImage(c, 0, 0, u2.width, u2.height); c = u2 }
        var x = c.getContext("2d"), d = x.getImageData(0, 0, c.width, c.height), p = d.data, h = new Array(256).fill(0), i, g, n = c.width * c.height, lo = 0, hi = 255, a = 0;
        for (i = 0; i < p.length; i += 4) { g = Math.round(.299 * p[i] + .587 * p[i + 1] + .114 * p[i + 2]); p[i] = g; h[g]++ }
        for (; lo < 255 && (a += h[lo]) < n * .02; lo++); a = 0;
        for (; hi > 0 && (a += h[hi]) < n * .02; hi--);
        var r = Math.max(1, hi - lo);
        for (i = 0; i < p.length; i += 4) { g = Math.max(0, Math.min(255, (p[i] - lo) * 255 / r)); p[i] = p[i + 1] = p[i + 2] = g }
        x.putImageData(d, 0, 0); ok(c);
      };
      im.onerror = function () { ng() }; im.src = u;
    });
  }
  var rcWorker = null;
  function rcLog(m) { if (m.status === "recognizing text") $("rcMsg").textContent = "読み取り中… " + Math.round(m.progress * 100) + "%" }
  function getWorker() {
    if (!rcWorker) rcWorker = Tesseract.createWorker("jpn", 1, { logger: rcLog }).then(function (w) {
      return w.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" }).then(function () { return w });
    });
    return rcWorker;
  }
  function rcSumText() {
    var s = rcItems.reduce(function (a, x) { return a + (x.price || 0) }, 0), t = parseInt($("rcTotal").value, 10) || 0, h = "";
    $("rcSum").textContent = rcItems.length ? "品物の合計(税込) " + s.toLocaleString("ja-JP") + "円" : "";
    if (rcItems.length) {
      var btn = function (k, label) { return '<button class="btn b-gh" type="button" data-fix="' + k + '">' + label + '</button>' };
      if (t && s === t) h = '<p class="okmark">✓ レシートの合計と一致しています</p>';
      else if (t) {
        var d = t - s, ab = Math.abs(d).toLocaleString("ja-JP");
        h = '<p class="warnmark">品物の合計が、レシートの合計より ' + ab + '円 ' + (d > 0 ? '少ない' : '多い') + 'です(' + (d > 0 ? '読み取れていない品物があるかもしれません' : '値引きや読み間違いかもしれません') + ')</p><div class="row">' +
          (d > 0 ? btn("add", "差額 " + ab + "円を1行として追加") : btn("disc", "差額 " + ab + "円を値引きとして追加")) +
          btn("total", "合計を品物の合計(" + s.toLocaleString("ja-JP") + "円)に合わせる") + '</div>';
      } else h = '<div class="row">' + btn("total", "合計を品物の合計にする") + '</div>';
    }
    $("rcFix").innerHTML = h;
  }
  function renderRc() {
    var KS = [["食材", "冷蔵庫へ"], ["日用品", "日用品へ"], ["なし", "入れない"]];
    $("rcItems").innerHTML = rcItems.length ? rcItems.map(function (x, i) {
      var k = x.kind || "なし";
      return '<li><input type="text" class="tx" data-n="' + i + '" value="' + esc(x.name) + '" placeholder="商品名">' +
        '<select data-k="' + i + '" aria-label="入れ先">' + KS.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === k ? " selected" : "") + '>' + o[1] + '</option>' }).join("") + '</select>' +
        '<input type="number" data-p="' + i + '" value="' + x.price + '" placeholder="金額" inputmode="numeric" style="width:96px;text-align:right" aria-label="税込金額"><button class="x" type="button" data-rm="' + i + '" aria-label="この行を消す">×</button></li>';
    }).join("") : '<li><p class="empty">品物は読み取れませんでした(合計は使えます)</p></li>';
    rcSumText();
  }
  $("rcItems").addEventListener("input", function (e) {
    var t = e.target;
    if (t.dataset.n !== undefined) {
      var it = rcItems[+t.dataset.n]; it.name = t.value;
      var kk = kindOf(t.value, "");
      if (kk !== "なし" && (it.kind || "なし") === "なし") { it.kind = kk; var sel = t.parentNode.querySelector("select"); if (sel) sel.value = kk }
    }
    if (t.dataset.k !== undefined) rcItems[+t.dataset.k].kind = t.value;
    if (t.dataset.p !== undefined) { rcItems[+t.dataset.p].price = parseInt(t.value, 10) || 0; rcSumText() }
  });
  $("rcItems").addEventListener("click", function (e) {
    var b = e.target.closest("[data-rm]"); if (b) { rcItems.splice(+b.dataset.rm, 1); renderRc() }
  });
  $("rcTotal").addEventListener("input", rcSumText);
  $("rcFix").addEventListener("click", function (e) {
    var b = e.target.closest("[data-fix]"); if (!b) return;
    var s = rcItems.reduce(function (a, x) { return a + (x.price || 0) }, 0), t = parseInt($("rcTotal").value, 10) || 0, k = b.dataset.fix;
    if (k === "total") $("rcTotal").value = s;
    else if (k === "add") rcItems.push({ name: "その他(差額)", price: t - s, kind: "なし" });
    else if (k === "disc") rcItems.push({ name: "値引き", price: t - s, kind: "なし" });
    renderRc();
  });
  $("rcNew").addEventListener("click", function () {
    rcItems.push({ name: "", price: 0, kind: "なし" }); renderRc();
    var ins = $("rcItems").querySelectorAll("input[data-n]"); if (ins.length) ins[ins.length - 1].focus();
  });
  $("rcManual").addEventListener("click", function () {
    rcItems = []; $("rcTotal").value = ""; $("rcMemo").value = ""; $("rcDate").value = today; renderRc();
    $("rcRes").classList.remove("hidden"); $("rcMsg").textContent = "品物と合計を入力して、登録してください";
  });
  $("rcBtn").addEventListener("click", function () { $("rcFile").click() });
  var RC_SITE_KEY = "";   /* reCAPTCHA Enterprise のサイトキー(App Check用)。入れるとAI読み取りが使えます */
  var AI_MODEL = "gemini-3.5-flash";
  var aiP = null;
  function loadAI() {
    if (!aiP) aiP = Promise.all([import(BASE + "firebase-app.js"), import(BASE + "firebase-ai.js"), RC_SITE_KEY ? import(BASE + "firebase-app-check.js") : Promise.resolve(null)]).then(function (m) {
      var app = m[0].getApp(), Sc = m[1].Schema;
      if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      if (RC_SITE_KEY && m[2]) m[2].initializeAppCheck(app, { provider: new m[2].ReCaptchaEnterpriseProvider(RC_SITE_KEY), isTokenAutoRefreshEnabled: true });
      var ai = m[1].getAI(app, { backend: new m[1].GoogleAIBackend() });
      return m[1].getGenerativeModel(ai, {
        model: AI_MODEL,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: Sc.object({ properties: { store: Sc.string(), total: Sc.number(), subtotal: Sc.number(), taxIncluded: Sc.boolean(), items: Sc.array({ items: Sc.object({ properties: { name: Sc.string(), price: Sc.number(), rate: Sc.number(), kind: Sc.string() } }) }) } })
        }
      });
    });
    return aiP;
  }
  var AI_PROMPT = "これはレシートの写真です(斜め・遠い・ピンぼけ・指や背景が写っていることがあります)。買った品物だけを読み取り、JSONで返してください。\n" +
    "【含めるもの】食品に限らず、日用品・衣類・本・飲食店の料理・サービスなど、購入した品物の行すべて。\n" +
    "【含めないもの】店名、住所、電話番号、日付、時刻、レシート番号、お客様番号、レジ番号、担当者、登録番号(Tで始まる番号)、「イートイン」「テイクアウト」などの区分、小計、合計、内税・外税、税率ごとの対象額、お預り、お釣り、支払方法(現金・カード・交通系IC・QR決済・電子マネー)、残高、ポイント、クーポン、広告・アンケート・クイズなどの文章。\n" +
    "【金額】price は、その品物の金額(円の整数)です。商品名と金額の間に、数量だけ(「1」「2」など)が書かれている場合、その数字は price ではありません。数量が2以上なら、その行の合計金額を price にします。値引き・割引の行は、直前の品物の金額から引いた額にして、別の行にはしません。\n" +
    "【税】taxIncluded は、品物の金額が税込で印字されている(内税)なら true、税抜(外税)で印字され、税が最後にまとめて加算されているなら false です。rate は、その品物の消費税率(8 または 10)です。「軽」「※」などの軽減税率の印や、税率ごとの内訳から判断し、分からなければ 10 にします。\n" +
    "【種類】kind は、品物の種類です。「食材」(冷蔵庫に入れる食品)、「日用品」(シャンプー・洗剤・ティッシュなどの消耗品)、「その他」のどれかにします。\n" +
    "【合計】total はレシートの合計(支払う金額・税込)、subtotal は小計です。印字がなければ 0 にします。store は店名です。\n" +
    "【ルール】読み取れない行や、自信がない行は、推測で作らず、含めません。name は印字どおりの商品名にして、商品コードや余計な記号は除きます。レシートでない写真なら items を空にします。";
  function toB64(f) {
    return new Promise(function (ok, ng) {
      var u = URL.createObjectURL(f), im = new Image();
      im.onload = function () {
        URL.revokeObjectURL(u);
        var k = Math.min(1, 2000 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement("canvas");
        c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        try { c = cropPaper(c) } catch (e) { }
        ok(c.toDataURL("image/jpeg", 0.92).split(",")[1]);
      };
      im.onerror = function () { ng(new Error("画像を読み込めません")) }; im.src = u;
    });
  }
  function fitTotal(items, total) {
    var sum = items.reduce(function (a, x) { return a + x.price }, 0), d = total - sum;
    if (!items.length || !total || !d || Math.abs(d) > items.length + 2) return items;
    var k = 0; items.forEach(function (x, i) { if (x.price > items[k].price) k = i });
    items[k].price += d; return items;
  }
  /* AIの返事を、品物・合計に直す。gap = 品物の合計 − レシートの合計(0なら一致) */
  function parseAI(txt) {
    var d = JSON.parse(txt), excl = d.taxIncluded === false;
    var items = (d.items || []).map(function (x) {
      var p = Math.round(Number(x.price)), rt = Number(x.rate) === 8 ? 8 : 10;
      return { name: String(x.name || "").trim(), aiKind: String(x.kind || "").trim(), price: excl ? Math.floor(p * (100 + rt) / 100) : p };
    }).filter(function (x) { return x.name && x.price > 0 && x.price <= 1000000 });
    var total = Math.round(Number(d.total)) || 0, sub = Math.round(Number(d.subtotal)) || 0, note = "";
    if (excl) { note = "税抜の金額を税込に換算しました"; items = fitTotal(items, total) }
    var sum = items.reduce(function (a, x) { return a + x.price }, 0), target = excl ? total : (sub || total);
    if (!total) total = sum;
    return { items: items, total: total, store: String(d.store || "").trim(), raw: txt, taxNote: note, gap: target ? sum - target : 0 };
  }
  function readAI(f) {
    var model, img;
    return Promise.all([loadAI(), toB64(f)]).then(function (a) {
      model = a[0]; img = { inlineData: { mimeType: "image/jpeg", data: a[1] } };
      return model.generateContent([AI_PROMPT, img]);
    }).then(function (r) {
      var txt = r.response.text(), p = parseAI(txt);
      if (!p.gap) return p;
      var q = "前回の読み取り結果:\n" + txt + "\n\n問題: 品物の金額の合計が、レシートの" + (p.gap > 0 ? "小計・合計より " : "小計・合計より ") + Math.abs(p.gap) + "円 " + (p.gap > 0 ? "多い" : "少ない") + "です。写真をもう一度よく見て、読み間違い・抜け・余計な行(合計や税の行を品物にしていないか)を直した結果を、同じ形式のJSONで返してください。";
      return model.generateContent([AI_PROMPT, img, q]).then(function (r2) {
        var p2 = parseAI(r2.response.text()); p2.retried = true;
        if (Math.abs(p2.gap) <= Math.abs(p.gap)) return p2;
        p.retried = true; return p;
      }, function () { return p });
    });
  }
  function readTess(f) {
    return loadOCR().then(function () { return Promise.all([getWorker(), prep(f)]) }).then(function (a) {
      $("rcMsg").textContent = "読み取り中…"; return a[0].recognize(a[1]);
    }).then(function (r) {
      var p = parseReceipt(r.data.text); p.raw = r.data.text; p.store = "";
      var sm = p.items.reduce(function (a, x) { return a + x.price }, 0), f = sm ? p.total / sm : 0;
      if (/外税|税抜|税別/.test(r.data.text) && f > 1.03 && f < 1.11) {
        p.items = fitTotal(p.items.map(function (x) { return { name: x.name, price: Math.floor(x.price * f) } }), p.total);
        p.taxNote = "税抜の金額を、合計に合わせて税込に換算しました(概算)";
      }
      return p
    });
  }
  function showRc(p, ai, note) {
    rcItems = p.items.map(function (x) { return { name: x.name, price: x.price, kind: kindOf(x.name, x.aiKind) } }); $("rcRaw").textContent = (note ? "[" + note + "]\n" : "") + p.raw;
    $("rcTotal").value = p.total || ""; $("rcMemo").value = p.store || ""; $("rcDate").value = today;
    renderRc(); $("rcRes").classList.remove("hidden");
    $("rcMsg").textContent = !p.items.length ? "品物を読み取れませんでした。レシート全体が写るように、明るい場所で撮り直してください"
      : (ai ? "AIで読み取りました。" : "簡易読み取りです(精度が低いため、必ず内容を確認してください)。") + (p.retried ? "合計が合わなかったため、AIが読み直しました。" : "") + (p.taxNote ? p.taxNote + "。" : "") + "内容を確認して登録してください";
  }
  $("rcFile").addEventListener("change", function (e) {
    var f = e.target.files[0]; if (!f) return; e.target.value = "";
    $("rcRes").classList.add("hidden");
    var ok = false; try { ok = localStorage.getItem("ls_ai_ok") === "1" } catch (x) { }
    var useAI = (ok || confirm("レシートの写真を、GoogleのAI(Gemini)に送って読み取ります。\nカード番号や会員番号などが写っている場合は、隠してから撮ってください。\n送ってよろしいですか?\n(キャンセルすると、端末の中だけで読み取る簡易読み取りを使います)"));
    if (useAI && !ok) { try { localStorage.setItem("ls_ai_ok", "1") } catch (x) { } }
    $("rcMsg").textContent = useAI ? "AIで読み取り中…(数秒かかります)" : "準備中…(初回は日本語データの読み込みで少し時間がかかります)";
    (useAI ? readAI(f).then(function (p) { showRc(p, true) }, function (err) {
      var why = "AI読み取りエラー: " + String(err && (err.code || err.message) || err);
      $("rcMsg").textContent = "AI読み取りを使えませんでした(Firebase の AI Logic の設定が必要です)。簡易読み取りに切り替えます…";
      return readTess(f).then(function (p) { showRc(p, false, why) });
    }) : readTess(f).then(function (p) { showRc(p, false) }))
      .catch(function () {
        rcWorker = null; rcItems = []; $("rcTotal").value = ""; $("rcMemo").value = ""; $("rcDate").value = today; renderRc(); $("rcRes").classList.remove("hidden");
        $("rcMsg").textContent = "読み取れませんでした。撮り直すか、下に手入力してください";
      });
  });
  $("rcAdd").addEventListener("click", function () {
    var a = parseInt($("rcTotal").value, 10); if (isNaN(a) || a <= 0) { $("rcMsg").textContent = "合計金額を入力してください"; return }
    var sm = rcItems.reduce(function (x, y) { return x + (y.price || 0) }, 0);
    if (rcItems.length && sm !== a && !confirm("品物の合計(" + sm.toLocaleString("ja-JP") + "円)と、登録する合計(" + a.toLocaleString("ja-JP") + "円)がちがいます。\nこのまま " + a.toLocaleString("ja-JP") + "円 で登録しますか?")) return;
    var d = $("rcDate").value || today, nf = 0, nd = 0;
    rcItems.forEach(function (x) {
      var nm = (x.name || "").trim(); if (!nm || x.price < 0) return;
      if (x.kind === "食材") { if (addFridge(nm, d)) nf++ } else if (x.kind === "日用品") { addStock(nm, d); nd++ }
    });
    S.exp.push({ id: uid(), date: d, amt: a, memo: $("rcMemo").value.trim() || "レシート", cat: $("rcCat").value });
    save(); renderAll(); $("rcRes").classList.add("hidden");
    $("rcMsg").textContent = (d === today ? "今日の支出に登録しました" : d + " の支出として登録しました") + (nf || nd ? "。冷蔵庫に" + nf + "品(賞味期限は目安)、日用品に" + nd + "品を入れました" : "");
  });

  /* ---- バーコード・QR読み取り ---- */
  var scLib = null, scQr = null, scCode = "";
  function loadSC() {
    if (window.Html5Qrcode) return Promise.resolve();
    return scLib = scLib || new Promise(function (ok, ng) {
      var sc = document.createElement("script"); sc.src = "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js"; sc.onload = ok; sc.onerror = function () { scLib = null; ng() }; document.head.appendChild(sc);
    });
  }
  function scFmt() { var F = Html5QrcodeSupportedFormats; return [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.QR_CODE] }
  function scEnd() {
    var q = scQr; scQr = null; $("scStop").classList.add("hidden");
    var hide = function () { $("scView").classList.add("hidden") };
    if (q) q.stop().then(function () { q.clear(); hide() }).catch(hide); else hide();
  }
  function scShow(name, msg) {
    $("scName").value = name; $("scCode").textContent = /^\d{8,14}$/.test(scCode) ? "バーコード: " + scCode : "";
    $("scRes").classList.remove("hidden"); $("scMsg").textContent = msg;
  }
  function scLookup(code) {
    var ac = new AbortController(), t = setTimeout(function () { ac.abort() }, 8000);
    return fetch("https://world.openfoodfacts.org/api/v2/product/" + code + ".json?fields=product_name,product_name_ja,brands,quantity", { signal: ac.signal })
      .then(function (r) { return r.json() }).then(function (d) {
        clearTimeout(t); var p = d && d.product; if (!p) return "";
        var n = (p.product_name_ja || p.product_name || "").trim(); if (!n) return "";
        var b = (p.brands || "").split(",")[0].trim();
        return (b && n.indexOf(b) < 0 ? b + " " : "") + n + (p.quantity ? " " + p.quantity : "");
      }).catch(function () { clearTimeout(t); return "" });
  }
  function handleCode(code) {
    scCode = code; $("scRes").classList.add("hidden"); $("scInfo").textContent = "";
    if (/^https?:\/\//i.test(code)) {
      var a = document.createElement("a"); a.href = code; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = code.length > 70 ? code.slice(0, 70) + "…" : code;
      $("scInfo").appendChild(a); $("scMsg").textContent = "QRコードのリンクを読み取りました(開くかどうかは、中身を確認してから選んでください)"; return;
    }
    if (!/^\d{8,14}$/.test(code)) { $("scInfo").textContent = code.slice(0, 120); $("scMsg").textContent = "商品のバーコードではないようです。読み取った内容を表示しています"; return }
    S.codes = S.codes || {};
    if (S.codes[code]) { scShow(S.codes[code], "登録済みの商品です。入れ先を選んでください"); return }
    $("scMsg").textContent = "商品を調べています…";
    scLookup(code).then(function (n) { scShow(n, n ? "見つかりました。名前を確認して、入れ先を選んでください" : "データベースに見つかりませんでした。名前を入力すると、次から自動で出ます") });
  }
  $("scBtn").addEventListener("click", function () {
    if (scQr) return; $("scMsg").textContent = "カメラを準備中…"; $("scRes").classList.add("hidden"); $("scInfo").textContent = "";
    loadSC().then(function () {
      $("scView").classList.remove("hidden"); $("scStop").classList.remove("hidden");
      scQr = new Html5Qrcode("scView", { formatsToSupport: scFmt(), verbose: false });
      return scQr.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 260, height: 160 } }, function (t) { if (scQr) { scEnd(); handleCode(String(t).trim()) } }, function () { });
    }).then(function () { $("scMsg").textContent = "バーコードを枠の中に入れてください" })
      .catch(function () { scQr = null; scEnd(); $("scMsg").textContent = "カメラを使えませんでした。ブラウザのカメラ許可を確認するか、「写真から読む」を使ってください" });
  });
  $("scStop").addEventListener("click", function () { scEnd(); $("scMsg").textContent = "カメラを止めました" });
  $("scPhoto").addEventListener("click", function () { $("scFile").click() });
  $("scFile").addEventListener("change", function (e) {
    var f = e.target.files[0]; if (!f) return; e.target.value = ""; $("scMsg").textContent = "読み取り中…";
    loadSC().then(function () {
      var q = new Html5Qrcode("scTmp", { formatsToSupport: scFmt(), verbose: false });
      return q.scanFile(f, false).then(function (t) { try { q.clear() } catch (x) { } return t });
    }).then(function (t) { handleCode(String(t).trim()) })
      .catch(function () { $("scMsg").textContent = "バーコードを読み取れませんでした。バーコードを大きく、ピントを合わせて撮り直してください" });
  });
  $("scRes").addEventListener("click", function (e) {
    var b = e.target.closest("[data-sc]"); if (!b) return;
    var nm = $("scName").value.trim(); if (!nm) { $("scMsg").textContent = "商品名を入力してください"; return }
    S.codes = S.codes || {}; if (/^\d{8,14}$/.test(scCode)) S.codes[scCode] = nm;
    var d = b.dataset.sc, msg;
    if (d === "shop") { if (!S.shop.some(function (x) { return x.name === nm && !x.bought })) S.shop.push({ id: uid(), name: nm, bought: false }); msg = "買い物リストに追加しました" }
    else if (d === "fridge") { addFridge(nm, today); msg = "冷蔵庫に追加しました。賞味期限は目安で入れています(ごはんタブで確認できます)" }
    else { addStock(nm, today); msg = "日用品に登録しました(今日買った日として記録します)" }
    save(); renderAll(); $("scRes").classList.add("hidden"); $("scMsg").textContent = msg;
  });
  document.querySelector(".tabs").addEventListener("click", function () { if (scQr) scEnd() });

  /* ---- Firebase(ログイン+クラウド保存) ---- */
  var CFG = { apiKey: "AIzaSyCLdsMHrKRwEzyrB_HPiRitPErjIIHWdZ4", authDomain: "life-support-a2a21.firebaseapp.com", projectId: "life-support-a2a21", storageBucket: "life-support-a2a21.firebasestorage.app", messagingSenderId: "789058079447", appId: "1:789058079447:web:7a4e3113758af4d3f0fe92" };
  var BASE = "https://www.gstatic.com/firebasejs/12.19.0/", A = null, F = null, auth = null, db = null, cuid = null, timer = null;
  var show = function (id, on) { $(id).classList.toggle("hidden", !on) };
  function setSync(t) { $("sync").textContent = t }
  function withDef(o) { return Object.assign({ budget: 0, exp: [], todos: [], rec: [], meals: {}, sched: [], fridge: [], memo: "", shop: [], trash: {}, fixed: [], stock: [], codes: {} }, o) }
  function push() { return F.setDoc(F.doc(db, "users", cuid), JSON.parse(JSON.stringify(S))) }
  function cloudSave() {
    if (!cuid) return; setSync("同期中…"); clearTimeout(timer);
    timer = setTimeout(function () { push().then(function () { setSync("クラウドに保存済み") }).catch(function () { setSync("クラウドに保存できませんでした(通信やルールを確認)") }) }, 700);
  }
  function authErr(e) {
    var m = { "auth/invalid-credential": "メールアドレスまたはパスワードが違います", "auth/invalid-email": "メールアドレスの形式が正しくありません", "auth/email-already-in-use": "このメールアドレスはすでに登録されています", "auth/weak-password": "パスワードは6文字以上にしてください", "auth/network-request-failed": "通信できません。接続を確認してください", "auth/operation-not-allowed": "メール/パスワードのログインが有効になっていません", "auth/operation-not-supported-in-this-environment": "ファイルを直接開いている間はログインできません。Live Serverなどで開いてください", "auth/unauthorized-domain": "このアドレスがFirebaseの「承認済みドメイン」に登録されていません" };
    $("authMsg").textContent = m[e.code] || ("エラー: " + (e.code || e.message));
  }

  /* ログイン画面のボタンは、Firebaseの読み込みを待たずに先に登録する */
  $("guestBtn").addEventListener("click", function () { setTimeout(maybeIntro, 300); show("login", false); show("loginBtn", true); setSync("ログインしていません(この端末にのみ保存)") });
  $("loginBtn").addEventListener("click", function () { if (!auth) { alert("クラウドに接続できません。通信を確認してください。"); return } show("login", true) });
  $("loginForm").addEventListener("submit", function (e) { e.preventDefault(); if (!auth) return; $("authMsg").textContent = ""; A.signInWithEmailAndPassword(auth, $("authMail").value.trim(), $("authPass").value).catch(authErr) });
  $("resetBtn").addEventListener("click", function () {
    if (!auth) return; var mail = $("authMail").value.trim();
    if (!mail) { $("authMsg").textContent = "上の欄に、登録したメールアドレスを入れてください"; return }
    $("authMsg").textContent = ""; A.sendPasswordResetEmail(auth, mail).then(function () { $("authMsg").textContent = "再設定のメールを送りました。届かないときは、迷惑メールも確認してください" }).catch(authErr);
  });
  $("signupBtn").addEventListener("click", function () {
    if (!auth) return;
    if (!$("loginForm").reportValidity()) return; $("authMsg").textContent = "";
    A.createUserWithEmailAndPassword(auth, $("authMail").value.trim(), $("authPass").value).catch(authErr);
  });
  $("logoutBtn").addEventListener("click", function () {
    clearTimeout(timer);
    (cuid ? push() : Promise.resolve()).catch(function () { }).then(function () { return A.signOut(auth) }).then(function () { try { localStorage.removeItem(K) } catch (x) { } location.reload() });
  });

  Promise.all([import(BASE + "firebase-app.js"), import(BASE + "firebase-auth.js"), import(BASE + "firebase-firestore.js")]).then(function (m) {
    A = m[1]; F = m[2]; var app = m[0].initializeApp(CFG); auth = A.getAuth(app); db = F.getFirestore(app);
    A.onAuthStateChanged(auth, function (u) {
      if (!u) { cuid = null; show("login", true); show("logoutBtn", false); show("loginBtn", true); return }
      cuid = u.uid; show("login", false); show("logoutBtn", true); show("loginBtn", false); setSync("読み込み中…");
      F.getDoc(F.doc(db, "users", cuid)).then(function (snap) {
        if (snap.exists()) { S = withDef(snap.data()); rollover(); $("memo").value = S.memo; renderAll(); setSync("クラウドと同期しました") }
        else { save() }
        maybeIntro();
      }).catch(function () { setSync("読み込めませんでした。Firestoreのルールと接続を確認してください") });
    });
  }).catch(function () { setSync("クラウドに接続できません(この端末にのみ保存中)"); setTimeout(maybeIntro, 300) });
})();

/* ---- あいさつの表示 ---- */
(function () {
  var h = new Date().getHours(), g = h < 5 ? "こんばんは" : h < 11 ? "おはようございます" : h < 17 ? "こんにちは" : "こんばんは";
  var t = document.querySelector(".tagline"); if (t) t.textContent = g + "。今日のことは、ここにぜんぶ。";
})();
