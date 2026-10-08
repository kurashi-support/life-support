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

  var RECIPES = [["親子丼", ["卵", "鶏肉", "玉ねぎ", "ご飯"]], ["野菜炒め", ["キャベツ", "にんじん", "豚肉", "もやし", "ピーマン"]], ["オムライス", ["卵", "ご飯", "玉ねぎ", "ケチャップ", "鶏肉"]], ["カレー", ["じゃがいも", "にんじん", "玉ねぎ", "豚肉", "カレールー"]], ["豚汁", ["豚肉", "大根", "にんじん", "味噌", "じゃがいも"]], ["チャーハン", ["ご飯", "卵", "ネギ", "ハム"]], ["焼きそば", ["麺", "キャベツ", "豚肉", "もやし"]], ["ナポリタン", ["パスタ", "玉ねぎ", "ピーマン", "ソーセージ", "ケチャップ"]], ["肉じゃが", ["じゃがいも", "牛肉", "玉ねぎ", "にんじん"]], ["卵かけご飯と味噌汁", ["卵", "ご飯", "味噌", "豆腐"]], ["麻婆豆腐", ["豆腐", "ひき肉", "ネギ"]], ["きのこパスタ", ["パスタ", "きのこ", "ベーコン"]], ["卵焼き", ["卵"]], ["味噌汁", ["味噌", "豆腐", "ネギ"]], ["納豆ご飯", ["納豆", "ご飯"]], ["ハムエッグ", ["ハム", "卵"]], ["玉ねぎと卵の炒め物", ["玉ねぎ", "卵"]], ["野菜スープ", ["キャベツ", "にんじん", "玉ねぎ"]], ["豚の生姜焼き", ["豚肉", "玉ねぎ", "生姜"]], ["豚キムチ", ["豚肉", "キムチ"]], ["ツナマヨおにぎり", ["ご飯", "ツナ", "マヨネーズ"]], ["にんじんしりしり", ["にんじん", "卵", "ツナ"]], ["お好み焼き", ["キャベツ", "卵", "小麦粉", "豚肉"]], ["豆腐ステーキ", ["豆腐", "ネギ"]]];
  var SYN = [[/たまご|タマゴ|玉子/g, "卵"], [/ごはん|ゴハン|白米|白飯/g, "ご飯"], [/たまねぎ|タマネギ|玉葱/g, "玉ねぎ"], [/長ねぎ|青ねぎ|小ねぎ|万能ねぎ|ねぎ/g, "ネギ"], [/人参|ニンジン/g, "にんじん"], [/ジャガイモ|馬鈴薯/g, "じゃがいも"], [/とうふ|トウフ/g, "豆腐"], [/みそ|ミソ/g, "味噌"], [/豚バラ|豚こま|豚コマ|ぶた肉/g, "豚肉"], [/鶏もも|鶏むね|とり肉|鳥肉|チキン/g, "鶏肉"], [/合いびき|合挽き|豚ひき|牛ひき|挽き肉|ミンチ/g, "ひき肉"], [/きゃべつ/g, "キャベツ"], [/なっとう|ナットウ/g, "納豆"]];
  var norm = function (s) { SYN.forEach(function (p) { s = s.replace(p[0], p[1]) }); return s };

  /* 日付が変わったときの整理:未完了は持ち越し、繰り返しタスクを生成、古い予定/ご飯を削除 */
  function rollover() {
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
  function renderStock() {
    $("stockList").innerHTML = S.stock.length ? S.stock.map(function (k) {
      return '<li><span class="tx">' + esc(k.name) + (k.qty <= k.min ? ' <small>残りわずか</small>' : "") + '</span><button class="x" type="button" data-a="stdn" data-id="' + k.id + '" aria-label="減らす">−</button><b class="stq">' + k.qty + '</b><button class="x" type="button" data-a="stup" data-id="' + k.id + '" aria-label="増やす">＋</button><button class="x" type="button" data-a="stdel" data-id="' + k.id + '" aria-label="削除">×</button></li>';
    }).join("") : '<li><p class="empty">日用品はまだありません</p></li>';
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
  function renderFridge() {
    var l = $("fridge");
    if (!S.fridge.length) { l.innerHTML = '<li style="background:none;padding:0"><p class="empty">まだ何も登録されていません</p></li>'; return }
    l.innerHTML = S.fridge.slice().sort(function (a, b) { return (a.exp || "9999").localeCompare(b.exp || "9999") }).map(function (x) {
      var cls = "", lb = "";
      if (x.exp) { var d = diff(x.exp); lb = d < 0 ? "期限切れ" : d === 0 ? "今日まで" : "あと" + d + "日"; cls = d <= 0 ? "bad" : d <= 2 ? "warn" : "" }
      return '<li class="' + cls + '"><span>' + esc(x.name) + '</span>' + (lb ? '<small>' + lb + '</small>' : '') + '<button class="x" type="button" data-a="fdel" data-id="' + x.id + '" aria-label="' + esc(x.name) + 'を削除">×</button></li>';
    }).join("");
  }

  function renderSummary() {
    if (!window.S && typeof S === "undefined") return; var el = $("sum"); if (!el) return;
    var left = S.todos.filter(function (t) { return !t.done }).length, now = new Date();
    var hm = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
    var ts = S.sched.filter(function (s) { return s.date === today }).sort(function (a, b) { return a.time.localeCompare(b.time) });
    var nx = ts.filter(function (s) { return s.time >= hm })[0];
    var tr = (S.trash || {})[new Date(today + "T00:00:00").getDay()], meal = (S.meals || {})[today];
    var T = [
      ["やること", left ? "残り " + left + "件" : (S.todos.length ? "ぜんぶ完了" : "なし")],
      ["次の予定", nx ? nx.time + " " + nx.text : (ts.length ? "今日の予定は終了" : "予定なし")],
      ["ゴミ出し", tr ? tr + "の日" : "今日はなし"],
      ["今夜のご飯", meal || "未定"]
    ];
    el.innerHTML = T.map(function (x) { return "<div><small>" + x[0] + "</small><b>" + esc(x[1]) + "</b></div>" }).join("");
  }
  function renderAll() {
    var w = ["日", "月", "火", "水", "木", "金", "土"], n = new Date();
    $("today").textContent = n.getFullYear() + "年" + (n.getMonth() + 1) + "月" + n.getDate() + "日(" + w[n.getDay()] + ")";
    $("schDate").value = $("schDate").value || today; $("schDate").min = today;
    renderMoney(); renderTodos(); renderMeal(); renderSched(); renderFridge(); renderShop(); renderTrash(); renderFixed(); renderStock(); renderSummary();
  }

  /* ---- 操作(クリック) ---- */
  var by = function (list, id) { return list.filter(function (x) { return x.id !== id }) };
  var act = {
    edel: function (id) { S.exp = by(S.exp, id) },
    tdone: function (id) { S.todos.forEach(function (t) { if (t.id === id) t.done = !t.done }) },
    tdel: function (id) {
      var t = S.todos.filter(function (x) { return x.id === id })[0];
      if (t && t.rid && confirm("この繰り返しタスクをやめますか?\nOK=今後も削除 / キャンセル=今日だけ削除")) S.rec = by(S.rec, t.rid);
      S.todos = by(S.todos, id);
    },
    sdel: function (id) { S.sched = by(S.sched, id) },
    fdel: function (id) { S.fridge = by(S.fridge, id); $("sug").innerHTML = "" },
    pick: function (id, b) { S.meals[today] = b.dataset.name; $("sug").innerHTML = "" },
    shdone: function (id) { S.shop.forEach(function (x) { if (x.id === id) x.bought = !x.bought }) },
    shdel: function (id) { S.shop = by(S.shop, id) },
    fxdel: function (id) { S.fixed = by(S.fixed, id) },
    stdel: function (id) { S.stock = by(S.stock, id) },
    stup: function (id) { S.stock.forEach(function (k) { if (k.id === id) k.qty++ }) },
    stdn: function (id) { S.stock.forEach(function (k) { if (k.id === id && k.qty > 0) { k.qty--; if (k.qty <= k.min && !S.shop.some(function (x) { return x.name === k.name && !x.bought })) S.shop.push({ id: uid(), name: k.name, bought: false }) } }) },
    tofridge: function () { S.shop.filter(function (x) { return x.bought }).forEach(function (x) { var st = S.stock.filter(function (k) { return k.name === x.name })[0]; if (st) st.qty += 1; else S.fridge.push({ id: uid(), name: x.name, exp: "" }) }); S.shop = S.shop.filter(function (x) { return !x.bought }) },
    addmiss: function (id, b) { b.dataset.miss.split("|").forEach(function (n) { if (!S.shop.some(function (x) { return x.name === n && !x.bought }) && !S.fridge.some(function (x) { return x.name === n })) S.shop.push({ id: uid(), name: n, bought: false }) }) }
  };
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-a]"); if (!b) return;
    act[b.dataset.a](b.dataset.id, b); save(); renderAll();
  });

  /* ---- フォーム ---- */
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
    S.fridge.push({ id: uid(), name: n, exp: $("frExp").value });
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
    e.preventDefault(); var n = $("stName").value.trim(), q = parseInt($("stQty").value, 10), m = parseInt($("stMin").value, 10);
    if (!n) return; q = isNaN(q) ? 0 : q; m = isNaN(m) ? 1 : m;
    S.stock.push({ id: uid(), name: n, qty: q, min: m });
    if (q <= m && !S.shop.some(function (x) { return x.name === n && !x.bought })) S.shop.push({ id: uid(), name: n, bought: false });
    $("stName").value = ""; save(); renderAll();
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
    $("rcItems").innerHTML = rcItems.length ? rcItems.map(function (x, i) {
      return '<li><input type="checkbox" data-i="' + i + '" checked aria-label="選ぶ"><input type="text" class="tx" data-n="' + i + '" value="' + esc(x.name) + '" placeholder="商品名"><input type="number" data-p="' + i + '" value="' + x.price + '" placeholder="金額" inputmode="numeric" style="width:96px;text-align:right" aria-label="税込金額"><button class="x" type="button" data-rm="' + i + '" aria-label="この行を消す">×</button></li>';
    }).join("") : '<li><p class="empty">品物は読み取れませんでした(合計は使えます)</p></li>';
    rcSumText();
  }
  $("rcItems").addEventListener("input", function (e) {
    var t = e.target;
    if (t.dataset.n !== undefined) rcItems[+t.dataset.n].name = t.value;
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
    else if (k === "add") rcItems.push({ name: "その他(差額)", price: t - s });
    else if (k === "disc") rcItems.push({ name: "値引き", price: t - s });
    renderRc();
  });
  $("rcNew").addEventListener("click", function () {
    rcItems.push({ name: "", price: 0 }); renderRc();
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
          responseSchema: Sc.object({ properties: { store: Sc.string(), total: Sc.number(), taxIncluded: Sc.boolean(), items: Sc.array({ items: Sc.object({ properties: { name: Sc.string(), price: Sc.number(), rate: Sc.number() } }) }) } })
        }
      });
    });
    return aiP;
  }
  var AI_PROMPT = "これはレシートの写真です(少し斜めだったり、遠かったり、ピントが甘いことがあります)。買った品物の「商品名」と「金額」だけを読み取り、JSONで返してください。\n" +
    "- 食品に限らず、日用品・衣類・本・交通費・飲食店の料理など、レシートに書かれている品物をすべて対象にします。\n" +
    "- 店名・住所・電話番号・日付・時刻・レジ番号・担当者・登録番号・ポイント・支払い方法・お預り・お釣り・税の内訳・小計・合計の行は、items に入れません。\n" +
    "- price は、レシートに印字されているその行の金額(円の整数)です。数量が2以上なら、その行の合計金額です。値引きの行は、直前の商品の金額から引いた額にします。\n" +
    "- taxIncluded は、品物の金額が税込で印字されていれば true、税抜(外税)で印字され、税が最後にまとめて加算されていれば false です。\n" +
    "- rate は、その品物の消費税率(8 または 10)です。「軽」「※」などの軽減税率の印や、税率ごとの内訳から判断し、分からなければ 10 にします。\n" +
    "- name は、レシートの表記を読みやすく整えた商品名にします(商品コードや記号は除きます)。\n" +
    "- 読み取れない行は、推測で作らず、含めません。\n" +
    "- total はレシートの合計(支払う金額・税込)、store は店名です。レシートでない写真なら items を空にします。";
  function toB64(f) {
    return new Promise(function (ok, ng) {
      var u = URL.createObjectURL(f), im = new Image();
      im.onload = function () {
        URL.revokeObjectURL(u);
        var k = Math.min(1, 1800 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement("canvas");
        c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        ok(c.toDataURL("image/jpeg", 0.88).split(",")[1]);
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
  function readAI(f) {
    return Promise.all([loadAI(), toB64(f)]).then(function (a) {
      return a[0].generateContent([AI_PROMPT, { inlineData: { mimeType: "image/jpeg", data: a[1] } }]);
    }).then(function (r) {
      var txt = r.response.text(), d = JSON.parse(txt), excl = d.taxIncluded === false;
      var items = (d.items || []).map(function (x) {
        var p = Math.round(Number(x.price)), rt = Number(x.rate) === 8 ? 8 : 10;
        return { name: String(x.name || "").trim(), price: excl ? Math.floor(p * (100 + rt) / 100) : p };
      }).filter(function (x) { return x.name && x.price > 0 && x.price <= 1000000 });
      var total = Math.round(Number(d.total)) || 0, note = "";
      if (excl) { note = "税抜の金額を税込に換算しました"; items = fitTotal(items, total) }
      if (!total) total = items.reduce(function (a, x) { return a + x.price }, 0);
      return { items: items, total: total, store: String(d.store || "").trim(), raw: txt, taxNote: note };
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
    rcItems = p.items; $("rcRaw").textContent = (note ? "[" + note + "]\n" : "") + p.raw;
    $("rcTotal").value = p.total || ""; $("rcMemo").value = p.store || ""; $("rcDate").value = today;
    renderRc(); $("rcRes").classList.remove("hidden");
    $("rcMsg").textContent = !p.items.length ? "品物を読み取れませんでした。レシート全体が写るように、明るい場所で撮り直してください"
      : (ai ? "AIで読み取りました。" : "簡易読み取りです(精度が低いため、必ず内容を確認してください)。") + (p.taxNote ? p.taxNote + "。" : "") + "内容を確認して登録してください";
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
    var s = rcItems.reduce(function (x, y) { return x + (y.price || 0) }, 0);
    if (rcItems.length && s !== a && !confirm("品物の合計(" + s.toLocaleString("ja-JP") + "円)と、登録する合計(" + a.toLocaleString("ja-JP") + "円)がちがいます。\nこのまま " + a.toLocaleString("ja-JP") + "円 で登録しますか?")) return;
    var d = $("rcDate").value || today;
    S.exp.push({ id: uid(), date: d, amt: a, memo: $("rcMemo").value.trim() || "レシート", cat: $("rcCat").value });
    save(); renderMoney(); $("rcRes").classList.add("hidden");
    $("rcMsg").textContent = d === today ? "今日の支出に登録しました(ホームで確認できます)" : d + " の支出として登録しました";
  });
  $("rcFr").addEventListener("click", function () {
    var n = 0;
    $("rcItems").querySelectorAll("input[type=checkbox]:checked").forEach(function (c) {
      var nm = $("rcItems").querySelector('[data-n="' + c.dataset.i + '"]').value.trim();
      if (nm && !S.fridge.some(function (x) { return x.name === nm })) { S.fridge.push({ id: uid(), name: nm, exp: "" }); n++ }
    });
    save(); renderFridge(); $("rcMsg").textContent = n + "品を冷蔵庫に追加しました(ごはんタブで確認できます)";
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
    else if (d === "fridge") { if (!S.fridge.some(function (x) { return x.name === nm })) S.fridge.push({ id: uid(), name: nm, exp: "" }); msg = "冷蔵庫に追加しました(ごはんタブで確認できます)" }
    else { var st = S.stock.filter(function (k) { return k.name === nm })[0]; if (st) st.qty++; else S.stock.push({ id: uid(), name: nm, qty: 1, min: 1 }); msg = "日用品ストックに入れました" }
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
  $("guestBtn").addEventListener("click", function () { show("login", false); show("loginBtn", true); setSync("ログインしていません(この端末にのみ保存)") });
  $("loginBtn").addEventListener("click", function () { if (!auth) { alert("クラウドに接続できません。通信を確認してください。"); return } show("login", true) });
  $("loginForm").addEventListener("submit", function (e) { e.preventDefault(); if (!auth) return; $("authMsg").textContent = ""; A.signInWithEmailAndPassword(auth, $("authMail").value.trim(), $("authPass").value).catch(authErr) });
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
      }).catch(function () { setSync("読み込めませんでした。Firestoreのルールと接続を確認してください") });
    });
  }).catch(function () { setSync("クラウドに接続できません(この端末にのみ保存中)") });
})();

/* ---- あいさつの表示 ---- */
(function () {
  var h = new Date().getHours(), g = h < 5 ? "こんばんは" : h < 11 ? "おはようございます" : h < 17 ? "こんにちは" : "こんばんは";
  var t = document.querySelector(".tagline"); if (t) t.textContent = g + "。今日のことは、ここにぜんぶ。";
})();
