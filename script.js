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

  /* ---- データの検証(取り込み・クラウド・保存データを、安全な形に整える) ---- */
  var MAXYEN = 100000000, YEN_MSG = "金額は、1〜100,000,000円の整数で入力してください";
  var CATLIST = ["食費", "日用品", "交通", "娯楽", "その他"], USELIST = ["少なめ", "ふつう", "多め", "共有"];
  function cleanStr(v, n) { return String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n) }
  function okId(v) { return typeof v === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : uid() }
  function okDate(v) { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v + "T00:00:00").getTime()) ? v : "" }
  function okInt(v, lo, hi) { var n = typeof v === "number" ? v : NaN; return isFinite(n) && Math.floor(n) === n && n >= lo && n <= hi ? n : null }
  /* 金額は、整数だけ受け付ける(「1e3」などは受け付けない)。全角の数字、カンマ、円記号は許す */
  function parseYen(v, lo) {
    var t = String(v == null ? "" : v).replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 65248) }).replace(/[,，\s円¥￥]/g, "");
    if (!/^-?\d{1,10}$/.test(t)) return NaN;
    var n = parseInt(t, 10); return (Math.abs(n) <= MAXYEN && n >= (lo === undefined ? 1 : lo)) ? n : NaN;
  }
  function sanitizeState(d) {
    var skipped = 0, st = { budget: 0, exp: [], todos: [], rec: [], meals: {}, sched: [], fridge: [], memo: "", shop: [], trash: {}, fixed: [], stock: [], codes: {}, fl: [] };
    if (!d || typeof d !== "object" || Array.isArray(d)) return { ok: false, state: st, skipped: 0 };
    var arr = function (k, max) { return Array.isArray(d[k]) ? d[k].slice(0, max) : [] };
    var b = okInt(d.budget, 0, MAXYEN * 10); st.budget = b === null ? 0 : b;
    st.memo = typeof d.memo === "string" ? d.memo.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, 5000) : "";
    var tg = okDate(d.tgen); if (tg) st.tgen = tg;
    st.assist = { off: {}, later: {} };
    if (d.assist && typeof d.assist === "object") ["resume", "food", "budget", "stock", "calendar", "busy", "todo", "setup"].forEach(function (k) {
      if (d.assist.off && d.assist.off[k] === true) st.assist.off[k] = true; var lt = d.assist.later ? okDate(d.assist.later[k]) : ""; if (lt) st.assist.later[k] = lt;
    });
    arr("exp", 20000).forEach(function (e) {
      e = e || {}; var a = okInt(e.amt, 1, MAXYEN), dt = okDate(e.date); if (a === null || !dt) { skipped++; return }
      st.exp.push({ id: okId(e.id), date: dt, amt: a, memo: cleanStr(e.memo, 100), cat: CATLIST.indexOf(e.cat) >= 0 ? e.cat : "その他" });
    });
    arr("todos", 2000).forEach(function (t) {
      t = t || {}; var tx = cleanStr(t.text, 100); if (!tx) { skipped++; return }
      var o = { id: okId(t.id), text: tx, done: t.done === true, date: okDate(t.date) || today };
      if (typeof t.rid === "string") o.rid = okId(t.rid); if (t.tid === "trash") o.tid = "trash"; st.todos.push(o);
    });
    arr("rec", 200).forEach(function (r) {
      r = r || {}; var tx = cleanStr(r.text, 100), w = okInt(r.dow, -1, 6); if (!tx || w === null) { skipped++; return }
      st.rec.push({ id: okId(r.id), text: tx, dow: w });
    });
    arr("sched", 2000).forEach(function (s) {
      s = s || {}; var tx = cleanStr(s.text, 100), dt = okDate(s.date), tm = typeof s.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.time) ? s.time : "";
      if (!tx || !dt || !tm) { skipped++; return } st.sched.push({ id: okId(s.id), date: dt, time: tm, text: tx });
    });
    arr("fridge", 1000).forEach(function (f) {
      f = f || {}; var nm = cleanStr(f.name, 50); if (!nm) { skipped++; return } var fo = { id: okId(f.id), name: nm, exp: okDate(f.exp), est: f.est === true }, fp = okInt(f.price, 1, 1000000); if (fp) fo.price = fp; st.fridge.push(fo);
    });
    arr("shop", 1000).forEach(function (s) {
      s = s || {}; var nm = cleanStr(s.name, 50); if (!nm) { skipped++; return } st.shop.push({ id: okId(s.id), name: nm, bought: s.bought === true });
    });
    arr("fixed", 200).forEach(function (x) {
      x = x || {}; var nm = cleanStr(x.name, 50), a = okInt(x.amt, 1, MAXYEN), dy = okInt(x.day, 1, 31); if (!nm || a === null || dy === null) { skipped++; return }
      st.fixed.push({ id: okId(x.id), name: nm, amt: a, day: dy });
    });
    arr("fl", 1000).forEach(function (e) {   /* 冷蔵庫から消した記録(食品ロスの数え方に使う) */
      e = e || {}; var dt = okDate(e.d), nm = cleanStr(e.n, 50), kk = e.k === "exp" ? "exp" : e.k === "ok" ? "ok" : "", p = okInt(e.p, 0, 1000000);
      if (!dt || !nm || !kk) { skipped++; return } st.fl.push({ d: dt, n: nm, p: p === null ? 0 : p, k: kk });
    });
    arr("stock", 500).forEach(function (k) {
      k = k || {}; var nm = cleanStr(k.name, 50); if (!nm) { skipped++; return }
      var bt = okDate(k.bought) || today, h = (Array.isArray(k.hist) ? k.hist : []).map(okDate).filter(Boolean).slice(0, 500);
      if (h.indexOf(bt) < 0) h.push(bt); h.sort();
      var o = { id: okId(k.id), name: nm, bought: h[h.length - 1], hist: h, base: okInt(k.base, 1, 3650) || 30, cycle: okInt(k.cycle, 1, 3650) || 30 };
      if (k.manual === true) o.manual = true; if (USELIST.indexOf(k.use) >= 0) o.use = k.use; st.stock.push(o);
    });
    if (d.meals && typeof d.meals === "object") Object.keys(d.meals).slice(0, 400).forEach(function (k) { if (okDate(k) && typeof d.meals[k] === "string") st.meals[k] = cleanStr(d.meals[k], 50) });
    if (d.trash && typeof d.trash === "object") Object.keys(d.trash).forEach(function (k) { if (/^[0-6]$/.test(k) && typeof d.trash[k] === "string") st.trash[k] = cleanStr(d.trash[k], 30) });
    if (d.codes && typeof d.codes === "object") Object.keys(d.codes).slice(0, 5000).forEach(function (k) { if (/^\d{8,14}$/.test(k) && typeof d.codes[k] === "string") st.codes[k] = cleanStr(d.codes[k], 80) });
    return { ok: true, state: st, skipped: skipped };
  }

  var S = load(K, null);
  if (!S) { /* 旧バージョンのデータを引き継ぐ */
    S = {
      todos: load("ls_todos", []).map(function (t) { return { id: uid(), text: t.text, done: !!t.done, date: today } }),
      sched: load("ls_schedule", []).map(function (s) { return { id: uid(), date: today, time: s.time, text: s.text } }),
      fridge: load("ls_fridge", []).map(function (n) { return { id: uid(), name: n, exp: "" } }),
      memo: load("ls_memo", "")
    };
  }
  S = sanitizeState(S).state;

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
    S.fl = (S.fl || []).filter(function (e) { return e.d >= addDays(today, -400) });   /* 食品ロスの記録は、約13か月ぶんだけ残す */
    save();
  }

  /* ---- お金 ---- */
  /* ---- 今日使えるお金の、くわしい説明: 1日平均・明日以降の1日あたり・ペースの注意(色だけでなく、文字でも伝える) ---- */
  function moneyMoreHtml(sm, st, left, dim) {
    var day = dim - left + 1, lines = [];
    if (sm > 0) lines.push("今月の1日平均の支出: " + yenTxt(Math.round(sm / day)));
    if (S.budget) {
      var fx = S.fixed.reduce(function (a, x) { return a + x.amt }, 0), net = S.budget - fx, remainMonth = net - sm, daily = Math.floor((net - (sm - st)) / left), remain = daily - st;
      if (remain < 0) lines.unshift("⚠ 今日の分を、" + yenTxt(-remain) + "こえています");
      if (left > 1) {
        if (remainMonth <= 0) lines.push("今月の予算は、もう使い切っています");
        else lines.push("明日以降: 1日あたり " + yenTxt(Math.floor(remainMonth / (left - 1))) + (remain > 0 ? "(今日の残り " + yenTxt(remain) + "が、明日以降に回ります)" : remain < 0 ? "(今日の超過を、明日以降でならします)" : ""));
      }
      if (day >= 5 && sm > 0 && net > 0) { var proj = Math.round(sm / day * dim); if (proj > net) lines.push("このペースが続くと、月末に約 " + yenTxt(proj - net) + "、予算をこえそうです") }
    }
    return lines.map(esc).join("<br>");
  }
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
    var mm = $("moneyMore"); if (mm) mm.innerHTML = moneyMoreHtml(sm, st, left, dim);
    renderCats(mine, sm);
    $("expList").innerHTML = todayEx.map(function (e) { return '<li><span class="tx">' + esc((e.cat ? e.cat + " " : "") + (e.memo || "支出")) + '</span><b>' + e.amt.toLocaleString("ja-JP") + '円</b><button class="x" type="button" data-a="edel" data-id="' + esc(e.id) + '" aria-label="削除">×</button></li>' }).join("");
  }

  var CATS = ["食費", "日用品", "交通", "娯楽", "その他"];
  var CATCOL = { "食費": "#17695F", "日用品": "#3B7DD8", "交通": "#D99A1E", "娯楽": "#B0508F", "その他": "#7A8A8F" };
  function renderCats(mine, total) {
    $("cats").innerHTML = total ? CATS.map(function (c) {
      var v = mine.filter(function (e) { return (e.cat || "その他") === c }).reduce(function (a, e) { return a + e.amt }, 0);
      return v ? '<div class="cat"><span>' + c + '</span><div class="bar"><i style="background:' + (CATCOL[c] || "#17695F") + ';width:' + Math.round(v / total * 100) + '%"></i></div><b>' + v.toLocaleString("ja-JP") + '円</b></div>' : "";
    }).join("") : "";
  }
  function renderShop() {
    $("shopList").innerHTML = S.shop.length ? S.shop.map(function (x) {
      return '<li><button class="chk" type="button" data-a="shdone" data-id="' + esc(x.id) + '" aria-pressed="' + x.bought + '" aria-label="購入済み切替">' + (x.bought ? "✓" : "") + '</button><span class="tx' + (x.bought ? " done" : "") + '">' + esc(x.name) + '</span><button class="x" type="button" data-a="shdel" data-id="' + esc(x.id) + '" aria-label="削除">×</button></li>';
    }).join("") : '<li><p class="empty">買うものは、まだありません。足りない食材は、「ごはん」の提案から追加できます</p></li>';
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
      return '<li><span class="tx">' + esc(x.name) + ' <small>毎月' + x.day + '日(' + (d === 0 ? "今日" : "あと" + d + "日") + ')</small></span><b>' + x.amt.toLocaleString("ja-JP") + '円</b><button class="x" type="button" data-a="fxdel" data-id="' + esc(x.id) + '" aria-label="削除">×</button></li>';
    }).join("") : '<li><p class="empty">家賃やサブスクを登録すると、「今日使えるお金」が正確になります</p></li>';
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
  function addFridge(name, date, price) {   /* price: レシートの金額(分かるときだけ) */
    var ex = addDays(date, shelfDays(name) || 7); if (ex < today) return false;
    var f = S.fridge.filter(function (x) { return x.name === name })[0];
    if (f) { f.exp = ex; f.est = true; if (price > 0) f.price = price } else { var o = { id: uid(), name: name, exp: ex, est: true }; if (price > 0) o.price = price; S.fridge.push(o) }
    return true;
  }
  /* 冷蔵庫から消した食材を記録する: 期限内に使い切れたか(ok)、期限を過ぎていたか(exp)。食品ロスの推定に使う */
  function logOut(items) {
    if (!S.fl) S.fl = [];
    items.forEach(function (x) { if (x.exp) S.fl.push({ d: today, n: x.name, p: x.price || 0, k: diff(x.exp) < 0 ? "exp" : "ok" }) });
    if (S.fl.length > 1000) S.fl = S.fl.slice(-1000);
  }
  function stockState(k) { var el = -diff(k.bought), cc = stockCycle(k), c = cc.c; return { el: el, c: c, src: cc.src, due: el >= c, soon: el >= c * .8 && el < c } }
  function renderStock() {
    var rows = S.stock.slice().sort(function (a, b) { var x = stockState(a), y = stockState(b); return y.el / y.c - x.el / x.c });
    $("stockList").innerHTML = rows.length ? rows.map(function (k) {
      var st = stockState(k), b = new Date(k.bought + "T00:00:00");
      var tag = st.due ? '<small>そろそろ買い時</small>' : st.soon ? '<small class="soon">もうすぐ買い時</small>' : '';
      var last = (b.getMonth() + 1) + "/" + b.getDate() + "に購入(" + (st.el <= 0 ? "今日" : st.el + "日前") + ")";
      return '<li class="stk"><div class="stk-top"><span class="nm">' + esc(k.name) + '</span>' + tag +
        '<button class="btn b-gh sm" type="button" data-a="stbuy" data-id="' + esc(k.id) + '">買った</button>' +
        '<button class="x" type="button" data-a="stdel" data-id="' + esc(k.id) + '" aria-label="削除">×</button></div>' +
        '<div class="sub2">' + last + ' ・ <button class="linkbtn" type="button" data-a="stcycle" data-id="' + esc(k.id) + '">目安 ' + st.c + '日ごと(' + st.src + ') ✎</button> ・ <button class="linkbtn" type="button" data-a="stuse" data-id="' + esc(k.id) + '">使う量: ' + (k.use || "ふつう") + ' ✎</button></div>' +
        (st.due ? '<div class="stk-btns"><button class="btn b-gh sm" type="button" data-a="stshop" data-id="' + esc(k.id) + '">買い物リストへ</button></div>' : '') + '</li>';
    }).join("") : '<li><p class="empty">日用品はまだありません。レシートを登録すると、自動で入ります</p></li>';
  }

  /* ---- Todo ---- */
  function renderTodos() {
    var l = $("todoList");
    l.innerHTML = S.todos.length ? S.todos.map(function (t) {
      return '<li><button class="chk" type="button" data-a="tdone" data-id="' + esc(t.id) + '" aria-pressed="' + t.done + '" aria-label="完了切替">' + (t.done ? "✓" : "") + '</button><span class="tx' + (t.done ? " done" : "") + '">' + esc(t.text) + (t.rid ? ' <small>🔁</small>' : '') + '</span><button class="x" type="button" data-a="tdel" data-id="' + esc(t.id) + '" aria-label="削除">×</button></li>';
    }).join("") : '<li><p class="empty">今日のやることは、まだありません。下の欄から追加できます</p></li>';
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
    if (!S.sched.length) { l.innerHTML = '<li><p class="empty">予定は、まだありません。日付と時刻を入れて追加できます</p></li>'; return }
    l.innerHTML = S.sched.slice().sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time) }).map(function (s) {
      var d = s.date === today ? "" : (+s.date.slice(5, 7)) + "/" + (+s.date.slice(8)) + " ";
      return '<li><b>' + d + s.time + '</b><span class="tx">' + esc(s.text) + '</span><button class="x" type="button" data-a="sdel" data-id="' + esc(s.id) + '" aria-label="削除">×</button></li>';
    }).join("");
  }

  /* ---- 冷蔵庫 ---- */
  var frSel = null;   /* null: ふつうの表示 / オブジェクト: まとめて消すものを選んでいる状態 */
  function renderFridge() {
    if (frSel && !S.fridge.length) frSel = null;
    var l = $("fridge"), n = frSel ? Object.keys(frSel).filter(function (k) { return frSel[k] }).length : 0;
    $("frSelBtn").classList.toggle("hidden", !!frSel || !S.fridge.length); $("frBulk").classList.toggle("hidden", !frSel);
    $("frDel").textContent = "選んだものを消す(" + n + ")"; $("frDel").disabled = !n;
    var over = S.fridge.filter(function (x) { return x.exp && diff(x.exp) < 0 }), note = $("frExpNote");
    note.classList.toggle("hidden", !over.length || !!frSel);
    note.innerHTML = over.length ? '<span>⚠ 期限が過ぎた食材が ' + over.length + '品あります。消すまで、ここに残ります(勝手には消えません)</span><button class="btn b-gh sm" type="button" data-tidy="1">整理する</button>' : "";
    if (!S.fridge.length) { l.innerHTML = '<li style="background:none;padding:0"><p class="empty">冷蔵庫は空です。食材を追加するか、レシートを登録すると自動で入ります</p></li>'; return }
    l.innerHTML = S.fridge.slice().sort(function (a, b) { return (a.exp || "9999").localeCompare(b.exp || "9999") }).map(function (x) {
      var cls = "", lb = "";
      if (x.exp) { var d = diff(x.exp); lb = (d < 0 ? "⚠ 期限が" + (-d) + "日過ぎています" : d === 0 ? "今日まで" : "あと" + d + "日") + (x.est ? "(目安)" : ""); cls = d <= 0 ? "bad" : d <= 2 ? "warn" : "" }
      if (frSel) {
        var on = !!frSel[x.id];
        return '<li class="' + cls + ' pm' + (on ? " sel" : "") + '"><button type="button" class="pick" data-a="fpick" data-id="' + esc(x.id) + '" aria-pressed="' + on + '"><span class="ck">' + (on ? "✓" : "") + '</span><span>' + esc(x.name) + '</span>' + (lb ? '<small>' + lb + '</small>' : '') + '</button></li>';
      }
      return '<li class="' + cls + '"><span>' + esc(x.name) + '</span>' + (lb ? '<small>' + lb + '</small>' : '') + '<button class="x" type="button" data-a="fdel" data-id="' + esc(x.id) + '" aria-label="' + esc(x.name) + 'を削除">×</button></li>';
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
    var fl = soon.length ? soon[0].name + "(" + (d0 < 0 ? "期限が過ぎています" : d0 === 0 ? "今日まで" : "あと" + d0 + "日") + ")" + (soon.length > 1 ? " ほか" + (soon.length - 1) + "品" : "") : "近いものはなし";
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
    renderAssist();
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
  /* ---- 月ごとの家計: 先月との比較・予算の使用率・6か月の推移・支出の検索 ---- */
  var mq = { q: "", cat: "", sort: "new", scope: "month" };
  function sumOf(l) { return l.reduce(function (a, e) { return a + e.amt }, 0) }
  function renderCompare(m, total, net) {
    var el = $("mCmp"); if (!el) return;
    var pm = shiftMonth(m, -1), isNow = m === today.slice(0, 7), cut = isNow ? +today.slice(8) : 31, yen = function (n) { return n.toLocaleString("ja-JP") + "円" };
    var inM = function (x, up) { return S.exp.filter(function (e) { return e.date.slice(0, 7) === x && +e.date.slice(8) <= up }) };
    var prev = inM(pm, cut), cur = inM(m, cut), pt = sumOf(prev), ct = sumOf(cur), h = '<div class="loss"><b>先月との比較</b>';
    if (!prev.length) h += '<p class="label" style="margin:4px 0 0">先月の記録が、ありません</p>';
    else {
      var d = ct - pt, best = "", bd = 0;
      CATS.forEach(function (cname) { var a = sumOf(cur.filter(function (e) { return (e.cat || "その他") === cname })), b = sumOf(prev.filter(function (e) { return (e.cat || "その他") === cname })); if (Math.abs(a - b) > Math.abs(bd)) { bd = a - b; best = cname } });
      h += '<div class="lrow"><span>' + (isNow ? "先月の同じ日までの支出" : "先月の支出") + '</span><b>' + yen(pt) + '</b></div>' +
        '<div class="lrow' + (d > 0 ? " warn" : "") + '"><span>' + (isNow ? "今月との差" : "この月との差") + '</span><b>' + (d > 0 ? "+" : d < 0 ? "−" : "") + yen(Math.abs(d)) + '</b></div>' +
        (Math.abs(bd) >= 500 ? '<p class="label" style="margin:2px 0 0">' + esc(best + "が、先月より " + yen(Math.abs(bd)) + (bd > 0 ? " 増えています" : " 減っています")) + '</p>' : "");
    }
    if (S.budget && net > 0) {
      var use = Math.round(total / net * 100);
      h += '<div class="lrow"><span>予算の使用率(いまの予算で計算)</span><b>' + use + '%</b></div><div class="bar' + (use > 100 ? " over" : "") + '"><i style="width:' + Math.min(100, use) + '%"></i></div>';
    }
    el.innerHTML = h + '</div>';
  }
  function renderTrend(m) {
    var el = $("mTrend"); if (!el) return; var ms = [], i;
    for (i = 5; i >= 0; i--) ms.push(shiftMonth(m, -i));
    var vals = ms.map(function (x) { return sumOf(S.exp.filter(function (e) { return e.date.slice(0, 7) === x })) }), mx = Math.max.apply(null, vals.concat([1]));
    el.innerHTML = '<b style="font-size:15px">6か月の推移</b><div class="dchart trend">' + vals.map(function (v, k) { return '<i' + (ms[k] === m ? ' class="now"' : "") + ' style="height:' + Math.round(v / mx * 100) + '%" data-m="' + ms[k] + '" title="' + (+ms[k].slice(5)) + '月 ' + v.toLocaleString("ja-JP") + '円"></i>' }).join("") +
      '</div><div class="dlab tlab">' + ms.map(function (x) { return "<span>" + (+x.slice(5)) + "月</span>" }).join("") + '</div><p class="label" style="margin:2px 0 0">棒を押すと、その月を表示します</p>';
  }
  function renderMList(m, yen) {
    var all = mq.scope === "all", q = mq.q.trim().toLowerCase();
    var base = all ? S.exp.slice() : S.exp.filter(function (e) { return e.date.slice(0, 7) === m });
    var list = base.filter(function (e) { return (!mq.cat || (e.cat || "その他") === mq.cat) && (!q || ((e.memo || "") + " " + (e.cat || "その他")).toLowerCase().indexOf(q) >= 0) });
    list.sort(function (a, b) { return mq.sort === "old" ? a.date.localeCompare(b.date) : mq.sort === "big" ? b.amt - a.amt : mq.sort === "small" ? a.amt - b.amt : b.date.localeCompare(a.date) });
    var shown = list.slice(0, 200), filtered = !!(q || mq.cat || all);
    $("mFound").textContent = filtered ? "該当 " + list.length + "件・合計 " + yen(sumOf(list)) + (list.length > 200 ? "(先頭の200件を表示)" : "") : "";
    $("mList").innerHTML = shown.length ? shown.map(function (e) {
      var yr = e.date.slice(0, 4) !== today.slice(0, 4) ? e.date.slice(2, 4) + "/" : "";
      return '<li><span class="tx"><small class="d">' + yr + (+e.date.slice(5, 7)) + '/' + (+e.date.slice(8)) + '</small> ' + esc((e.cat || "その他") + " " + (e.memo || "")) + '</span><b>' + yen(e.amt) + '</b><button class="x" type="button" data-a="eedit" data-id="' + esc(e.id) + '" aria-label="直す">✎</button><button class="x" type="button" data-a="edel" data-id="' + esc(e.id) + '" aria-label="削除">×</button></li>';
    }).join("") : '<li><p class="empty">' + ((q || mq.cat) ? "条件に合う支出は、ありません" : "この月の支出は、まだありません。レシートか、ホームの「使った」で記録できます") + '</p></li>';
  }
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
    $("mChart").innerHTML = '<div class="dchart" aria-hidden="true">' + days.map(function (v, i) { return '<i' + (isNow && i + 1 === +today.slice(8) ? ' class="now"' : '') + ' style="height:' + Math.round(v / mx * 100) + '%" data-i="' + (i + 1) + '" data-v="' + v + '" title="' + (i + 1) + '日 ' + yen(v) + '"></i>' }).join("") + '</div><div class="dlab"><span>1日</span><span>' + Math.ceil(dim / 2) + '日</span><span>' + dim + '日</span></div>';
    $("mInfo").textContent = "棒を押すと、その日の金額が出ます";
    $("mCats").innerHTML = total ? CATS.map(function (c) {
      var v = list.filter(function (e) { return (e.cat || "その他") === c }).reduce(function (a, e) { return a + e.amt }, 0), pc = Math.round(v / total * 100);
      return v ? '<div class="cat"><span>' + c + '</span><div class="bar"><i style="background:' + (CATCOL[c] || "#17695F") + ';width:' + pc + '%"></i></div><b>' + yen(v) + '(' + pc + '%)</b></div>' : "";
    }).join("") : "";
    renderLoss(m); renderCompare(m, total, S.budget - fx); renderTrend(m); renderMList(m, yen);
  }
  /* ---- 食品ロス(推定): 冷蔵庫の「期限」と、レシートの「金額」をつないで数える ---- */
  function lossStats(m) {
    var L = (S.fl || []).filter(function (e) { return e.d.slice(0, 7) === m }), ok = L.filter(function (e) { return e.k === "ok" }), ex = L.filter(function (e) { return e.k === "exp" });
    var withP = ex.filter(function (e) { return e.p > 0 });
    return { ok: ok.length, ex: ex.length, yen: ex.reduce(function (a, e) { return a + (e.p || 0) }, 0), withP: withP.length, total: L.length };
  }
  function renderLoss(m) {
    var el = $("mLoss"); if (!el) return; var t = lossStats(m);
    if (!t.total && !(m === today.slice(0, 7) && S.fridge.some(function (x) { return x.exp && diff(x.exp) < 0 }))) { el.innerHTML = '<div class="loss"><b>食品ロス(推定)</b><p class="label" style="margin:4px 0 0">この月は、まだ記録がありません。冷蔵庫の食材を消すと、「期限内に使い切れたか」「期限を過ぎていたか」を、自動で数えます</p></div>'; return }
    var rate = t.total >= 3 ? Math.round(t.ok / t.total * 100) : -1, yenTxt2 = t.ex ? (t.yen ? "(金額が分かる " + t.withP + "品で、約 " + t.yen.toLocaleString("ja-JP") + "円" + (t.withP < t.ex ? "。ほかの " + (t.ex - t.withP) + "品は、金額が不明" : "") + ")" : "(金額は、不明です。レシートから入れた食材は、金額が入ります)") : "";
    var left = m === today.slice(0, 7) ? S.fridge.filter(function (x) { return x.exp && diff(x.exp) < 0 }) : [], leftYen = left.reduce(function (a, x) { return a + (x.price || 0) }, 0);
    el.innerHTML = '<div class="loss"><b>食品ロス(推定)</b>' +
      '<div class="lrow"><span>期限内に使い切れた食材</span><b>' + t.ok + '品</b></div>' +
      (left.length ? '<div class="lrow warn"><span>いま冷蔵庫に残っている、期限が過ぎた食材</span><b>' + left.length + '品</b></div>' + (leftYen ? '<p class="label" style="margin:2px 0 0">(金額が分かる分で、約 ' + leftYen.toLocaleString("ja-JP") + '円。消すと、上の数に入ります)</p>' : '<p class="label" style="margin:2px 0 0">(消すと、上の数に入ります)</p>') : "") +
      '<div class="lrow' + (t.ex ? " warn" : "") + '"><span>期限(目安)を過ぎて、消した食材</span><b>' + t.ex + '品</b></div>' +
      (yenTxt2 ? '<p class="label" style="margin:2px 0 0">' + esc(yenTxt2) + '</p>' : "") +
      (rate >= 0 ? '<div class="lrow"><span>期限内に使い切れた割合</span><b>' + rate + '%</b></div>' : "") +
      '<p class="label" style="margin:6px 0 0">' + ((t.ex || left.length) ? "期限が近い食材は、ホームの「今日の生活アシスト」で、先に使うものを、お知らせします。" : "期限を過ぎた食材は、ありません。この調子です。") + '(推定です。期限を過ぎてから消した食材を、数えています)</p></div>';
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

  /* ---- アプリ内ダイアログ(prompt・confirm・alert の代わり) ---- */
  var dlgNoEsc = false, dlgOpener = null;
  function closeDialog() { $("dlg").classList.add("hidden") }
  function openDialog(o) {
    var box = $("dlgBody"), btns = $("dlgBtns"); dlgNoEsc = !!o.noEsc; if ($("dlg").classList.contains("hidden")) dlgOpener = document.activeElement;   /* 開く前の位置を覚える(一覧は、開いた後に描き直されるため) */
    $("dlgT").textContent = o.title || ""; $("dlgMsg").textContent = o.msg || ""; $("dlgMsg").classList.toggle("hidden", !o.msg);
    box.innerHTML = ""; btns.innerHTML = ""; $("dlgErr").textContent = "";
    (o.fields || []).forEach(function (f) {
      if (f.type === "checks") {
        if (f.label) { var lb = document.createElement("p"); lb.className = "label"; lb.textContent = f.label; lb.style.margin = "4px 0 0"; box.appendChild(lb) }
        var g = document.createElement("div"); g.className = "dlg-checks"; g.dataset.field = f.id;
        f.options.forEach(function (op) {
          var l = document.createElement("label"), cb = document.createElement("input"), t = document.createElement("span"); l.className = "dlg-check";
          cb.type = "checkbox"; cb.value = op.value; cb.checked = !!op.checked; t.textContent = op.label; l.appendChild(cb); l.appendChild(t); g.appendChild(l);
        });
        if (f.selectAll) {
          var all = document.createElement("button"); all.type = "button"; all.className = "linkbtn"; all.textContent = [].some.call(g.querySelectorAll("input"), function (c) { return !c.checked }) ? "すべて選ぶ" : "すべて解除";
          all.addEventListener("click", function () { var cs = g.querySelectorAll("input"), on = [].some.call(cs, function (c) { return !c.checked }); [].forEach.call(cs, function (c) { c.checked = on }); all.textContent = on ? "すべて解除" : "すべて選ぶ" });
          box.appendChild(all);
        }
        box.appendChild(g); return;
      }
      var wrap = document.createElement("label"), sp = document.createElement("span"), el; wrap.className = "fld"; sp.textContent = f.label; wrap.appendChild(sp);
      if (f.type === "select") {
        el = document.createElement("select");
        f.options.forEach(function (op) { var oe = document.createElement("option"); oe.value = typeof op === "string" ? op : op.value; oe.textContent = typeof op === "string" ? op : op.label; el.appendChild(oe) });
        el.value = f.value;
      } else {
        el = document.createElement("input"); el.type = "text"; if (f.type === "number") el.inputMode = "numeric";
        el.value = f.value == null ? "" : f.value; if (f.max) el.maxLength = f.max; if (f.placeholder) el.placeholder = f.placeholder;
      }
      el.dataset.field = f.id; wrap.appendChild(el);
      if (f.note) { var n = document.createElement("small"); n.className = "label"; n.textContent = f.note; wrap.appendChild(n) }
      box.appendChild(wrap);
    });
    $("dlgForm").onsubmit = function (e) { e.preventDefault(); var p = btns.querySelector("[data-primary]"); if (p) p.click() };
    (o.buttons || []).forEach(function (b, i) {
      var bt = document.createElement("button"); bt.type = "button"; bt.className = "btn " + (b.primary ? "b-pri" : b.danger ? "b-danger" : "b-gh"); bt.textContent = b.label;
      if (b.primary) bt.dataset.primary = "1"; if (i === 0 && !b.primary && !o.noEsc) bt.dataset.cancel = "1";
      bt.addEventListener("click", function () {
        var vals = {};
        box.querySelectorAll("[data-field]").forEach(function (el) {
          vals[el.dataset.field] = el.classList.contains("dlg-checks") ? [].slice.call(el.querySelectorAll("input:checked")).map(function (c) { return c.value }) : el.value;
        });
        var r = b.fn ? b.fn(vals) : null; if (typeof r === "string") { $("dlgErr").textContent = r; return } closeDialog();
      });
      btns.appendChild(bt);
    });
    $("dlg").classList.remove("hidden");
  }
  function info(msg, title) { openDialog({ title: title || "お知らせ", msg: msg, buttons: [{ label: "閉じる", primary: true }] }) }
  /* 元に戻せる変更:変更の前の状態を保存して、お知らせに「元に戻す」を付ける */
  function undoable(msg, fn) {
    var snap = JSON.stringify(S); fn(); save(); renderAll();
    showToast(msg, function () { S = withDef(JSON.parse(snap)); save(); renderAll(); $("memo").value = S.memo });
  }
  /* ---- ダイアログ・案内・ログイン画面の、キーボードとフォーカスの管理 ---- */
  (function () {
    var ids = ["dlg", "intro", "login"], last = null, lastInfo = null, active = null;
    function focusables(el) { return [].slice.call(el.querySelectorAll("input:not([type=hidden]),select,textarea,button")).filter(function (e) { return !e.disabled && e.offsetParent !== null }) }
    function sync() {
      var top = null; ids.forEach(function (id) { if (!top && !$(id).classList.contains("hidden")) top = $(id) });
      if (top && !active) { last = (top.id === "dlg" && dlgOpener && dlgOpener !== document.body) ? dlgOpener : document.activeElement; lastInfo = last && last.dataset ? { a: last.dataset.a, id: last.dataset.id } : null }   /* 背景を操作不可にする前に、いまの位置を覚える */
      [].forEach.call(document.body.children, function (c) { if (c.tagName !== "SCRIPT") c.inert = !!top && c !== top && c.id !== "toast" });
      if (top && top !== active) { var f = focusables(top)[0]; if (f) f.focus() }
      if (!top && active) {
        var back = last && document.body.contains(last) ? last : (lastInfo && lastInfo.a ? document.querySelector('[data-a="' + lastInfo.a + '"][data-id="' + lastInfo.id + '"]') : null);
        if (back) { try { back.focus() } catch (e) { } } else if ($("main")) { $("main").setAttribute("tabindex", "-1"); $("main").focus() }
        last = null; lastInfo = null; dlgOpener = null;
      }
      active = top;
    }
    var mo = new MutationObserver(sync); ids.forEach(function (id) { mo.observe($(id), { attributes: true, attributeFilter: ["class"] }) });
    document.addEventListener("keydown", function (e) {
      if (!active) return;
      if (e.key === "Escape") {
        if (active.id === "dlg" && !dlgNoEsc) { var c = active.querySelector("[data-cancel]") || active.querySelector("button"); if (c) c.click(); e.preventDefault() }
        else if (active.id === "intro") { $("introOk").click(); e.preventDefault() }
      } else if (e.key === "Tab") {
        var f = focusables(active); if (!f.length) return; var a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { z.focus(); e.preventDefault() } else if (!e.shiftKey && document.activeElement === z) { a.focus(); e.preventDefault() }
      }
    });
    sync();
  })();

  /* ---- 期限・買い時を、スマホのカレンダーに、通知つきで追加する(.ics ファイル) ----
     アプリを閉じていても、カレンダーが、決めた時刻に通知してくれる。サーバーは、使わない。
     前に書き出した内容を、この端末に覚えておき、食材や日用品が変わったら、「更新してください」と知らせる。 */
  function icsEsc(t) { return String(t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n") }
  function icsFold(line) {   /* 1行は75バイトまで。超えたら折り返す(日本語の文字の途中では、切らない) */
    var enc = new TextEncoder(), out = [], cur = "", bytes = 0;
    Array.from(line).forEach(function (ch) {
      var b = enc.encode(ch).length, lim = out.length ? 74 : 75;
      if (bytes + b > lim) { out.push(cur); cur = ch; bytes = b } else { cur += ch; bytes += b }
    });
    out.push(cur); return out.join("\r\n ");
  }
  function pad2(n) { return ("0" + n).slice(-2) }
  function icsDT(dateStr, hour, min) { return dateStr.replace(/-/g, "") + "T" + pad2(hour) + pad2(min || 0) + "00" }
  function mdOf(dateStr) { return (+dateStr.slice(5, 7)) + "/" + (+dateStr.slice(8)) }
  function buildReminders(opt) {   /* opt: { lead(何日前), hour(何時), fridge, stock } */
    var ev = [], skipped = 0, now = new Date();
    function add(uid, name, kind, due, title, desc) {
      var date = addDays(due, -opt.lead);
      if (new Date(date + "T" + pad2(opt.hour) + ":00:00") <= now) { skipped++; return }   /* 通知の時刻が、もう過ぎている */
      ev.push({ uid: uid, name: name, kind: kind, due: due, date: date, start: icsDT(date, opt.hour, 0), end: icsDT(date, opt.hour, 30), title: title, desc: desc });
    }
    if (opt.fridge) S.fridge.forEach(function (x) {
      if (!x.exp) return;
      add("ls-fr-" + x.id + "@life-support", x.name, "fr", x.exp, "【冷蔵庫】" + x.name + "の賞味期限" + (x.est ? "(目安)" : "") + "は " + mdOf(x.exp) + " です",
        "冷蔵庫の「" + x.name + "」の賞味期限" + (x.est ? "(目安)" : "") + "は " + x.exp + " です。実際の期限は、パッケージで確認してください。(Life Support)");
    });
    if (opt.stock) S.stock.forEach(function (k) {
      var due = addDays(k.bought, stockState(k).c);
      add("ls-st-" + k.id + "@life-support", k.name, "st", due, "【日用品】" + k.name + "の買い時(目安)は " + mdOf(due) + " ごろです",
        "日用品の「" + k.name + "」は、" + due + " ごろに、買い直す目安です(推定です。実際の残りとは、ちがうことがあります)。(Life Support)");
    });
    var stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"), seq = Math.floor(Date.now() / 60000);   /* SEQUENCE: 書き出すたびに、大きくなる番号(更新だと、カレンダーに伝える) */
    var L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Life Support//JP", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Life Support"];
    ev.forEach(function (e) {
      L.push("BEGIN:VEVENT", "UID:" + e.uid, "DTSTAMP:" + stamp, "LAST-MODIFIED:" + stamp, "SEQUENCE:" + seq, "DTSTART:" + e.start, "DTEND:" + e.end, "SUMMARY:" + icsEsc(e.title), "DESCRIPTION:" + icsEsc(e.desc),
        "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEsc(e.title), "TRIGGER:PT0M", "END:VALARM", "END:VEVENT");
    });
    L.push("END:VCALENDAR");
    return { text: L.map(icsFold).join("\r\n") + "\r\n", count: ev.length, skipped: skipped, events: ev };
  }
  function downloadICS(text) {
    var blob = new Blob([text], { type: "text/calendar;charset=utf-8" }), url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = "life-support-reminders.ics"; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url) }, 4000);
  }
  /* 前回、カレンダー用に書き出した内容(この端末にだけ覚えておく) */
  function calRead() { try { return JSON.parse(localStorage.getItem("ls_cal_export") || "null") } catch (e) { return null } }
  function calWrite(opt, events) {
    var items = {}; events.forEach(function (e) { items[e.uid] = { n: e.name, d: e.date } });
    try { localStorage.setItem("ls_cal_export", JSON.stringify({ opt: opt, at: today, items: items })) } catch (e) { }
  }
  function exportReminders(o) {
    var r = buildReminders(o); if (!r.count) return r;
    try { localStorage.setItem("ls_cal_pref", JSON.stringify({ lead: o.lead, hour: o.hour })) } catch (e) { }
    downloadICS(r.text); calWrite(o, r.events); return r;
  }
  /* 前回の書き出しと、いまの冷蔵庫・日用品を比べて、カレンダーの予定が古くなっていないか調べる */
  function calStatus() {
    var ex = calRead(); if (!ex || !ex.opt || !ex.items) return null;
    var cur = buildReminders(ex.opt), map = {}, now = new Date(), changed = [], added = [], removed = [];
    cur.events.forEach(function (e) { map[e.uid] = e });
    Object.keys(ex.items).forEach(function (uid) {
      var it = ex.items[uid]; if (new Date(it.d + "T" + pad2(ex.opt.hour) + ":00:00") <= now) return;   /* もう通知された予定は、気にしない */
      if (!map[uid]) removed.push(it.n); else if (map[uid].date !== it.d) changed.push(it.n);
    });
    cur.events.forEach(function (e) { if (!ex.items[e.uid]) added.push(e.name) });
    return { ex: ex, changed: changed, added: added, removed: removed, n: changed.length + added.length + removed.length };
  }
  function calStaleText(cs) {
    var t = [];
    if (cs.removed.length) t.push("【なくなった・通知の対象から外れたもの】\n・" + cs.removed.join("\n・"));
    if (cs.changed.length) t.push("【日付が変わったもの】\n・" + cs.changed.join("\n・"));
    return t.join("\n\n");
  }
  function openReminderDialog(which) {
    var pref = {}, ex = calRead(); try { pref = JSON.parse(localStorage.getItem("ls_cal_pref") || "{}") } catch (e) { }
    openDialog({ title: "期限・買い時を、カレンダーで通知する",
      msg: "いまの冷蔵庫と日用品から、カレンダー用のファイルを作ります。スマホで開いて、カレンダーに追加すると、アプリを開いていなくても、決めた時刻に、通知が来ます。\n" +
        "おすすめ: カレンダーアプリで、「Life Support」という専用のカレンダーを作り、追加するときに、それを選びます。更新するときは、専用カレンダーの予定を消してから、新しいファイルを追加すると、古い予定が残りません。\n" +
        "食材や日用品が変わると、アプリのホームで、「カレンダーの更新」をお知らせします。" + (ex && ex.items ? "\n前回は " + mdOf(ex.at) + " に、" + Object.keys(ex.items).length + "件を書き出しました。" : ""),
      fields: [
        { id: "lead", type: "select", label: "いつ通知しますか", value: String(pref.lead != null ? pref.lead : 1), options: [{ value: "0", label: "期限・買い時の当日" }, { value: "1", label: "1日前" }, { value: "2", label: "2日前" }, { value: "3", label: "3日前" }] },
        { id: "hour", type: "select", label: "何時に通知しますか", value: String(pref.hour != null ? pref.hour : 8), options: [7, 8, 9, 12, 18].map(function (h) { return { value: String(h), label: h + ":00" } }) },
        { id: "what", type: "checks", label: "通知するもの", options: [{ value: "fridge", label: "冷蔵庫の食材(賞味期限)", checked: which !== "stock" }, { value: "stock", label: "日用品の買い時", checked: which !== "fridge" }] }],
      buttons: [{ label: "やめる" }, { label: "ファイルを作る", primary: true, fn: function (v) {
        if (!v.what.length) return "通知するものを、選んでください";
        var o = { lead: +v.lead, hour: +v.hour, fridge: v.what.indexOf("fridge") >= 0, stock: v.what.indexOf("stock") >= 0 }, r = exportReminders(o);
        if (!r.count) return "通知できるものが、ありません(期限や買い時が、まだ先の食材・日用品を、登録してください)";
        showToast(r.count + "件の通知用ファイルを作りました。開いて、カレンダーに追加してください" + (r.skipped ? "(時刻が過ぎたもの " + r.skipped + "件は、除きました)" : ""), null);
        renderAssist();
      } }] });
  }
  $("remFr").addEventListener("click", function () { openReminderDialog("fridge") });
  $("remSt").addEventListener("click", function () { openReminderDialog("stock") });

  /* ---- 今日の生活アシスト(保存されているデータだけを使った、ルールベースの提案) ---- */
  var QUICK = ["スクランブルエッグ", "冷ややっこ", "チーズオムレツ", "キャベツと卵の炒め物", "ひき肉とキャベツの炒め物", "野菜炒め"];   /* 作る時間が短い料理(目安。筆者の判断) */
  var RESUME_DAYS = 0;
  (function () {   /* 7日以上あいて開いたときは、その日だけ「おかえりなさい」を出す */
    try {
      var prev = localStorage.getItem("ls_last_open"), rec = JSON.parse(localStorage.getItem("ls_resume") || "null");
      if (prev && prev !== today) { var d = Math.round((new Date(today + "T00:00:00") - new Date(prev + "T00:00:00")) / 864e5); if (d >= 7) { rec = { date: today, days: d }; localStorage.setItem("ls_resume", JSON.stringify(rec)) } }
      localStorage.setItem("ls_last_open", today); if (rec && rec.date === today) RESUME_DAYS = rec.days;
    } catch (e) { }
  })();
  function assistData() { if (!S.assist) S.assist = { off: {}, later: {} }; return S.assist }
  function fridgeHas(r) {
    var f = S.fridge.map(function (x) { return norm(x.name) });
    return r[1].every(function (i) { return f.some(function (n) { return n.indexOf(i) >= 0 || i.indexOf(n) >= 0 }) });
  }
  function nameList(xs, n) { return xs.slice(0, n).map(function (x) { return x.name }).join("・") + (xs.length > n ? " ほか" + (xs.length - n) + "品" : "") }
  function moneyNow() {
    var ym = today.slice(0, 7), dim = new Date(+ym.slice(0, 4), +ym.slice(5), 0).getDate(), left = dim - Number(today.slice(8)) + 1;
    var mine = S.exp.filter(function (e) { return e.date.slice(0, 7) === ym }), sum = function (l) { return l.reduce(function (s, e) { return s + e.amt }, 0) };
    var st = sum(mine.filter(function (e) { return e.date === today })), sm = sum(mine), fx = S.fixed.reduce(function (a, x) { return a + x.amt }, 0);
    var daily = Math.floor((S.budget - fx - (sm - st)) / left);
    return { remainMonth: S.budget - fx - sm, remainToday: daily - st, fx: fx };
  }
  function yenTxt(n) { return n.toLocaleString("ja-JP") + "円" }
  function computeAssists() {
    var a = assistData(), out = [], hid = function (k) { return a.off[k] || a.later[k] === today };
    var undone = S.todos.filter(function (t) { return !t.done }), expired = S.fridge.filter(function (x) { return x.exp && diff(x.exp) < 0 });
    var soon = S.fridge.filter(function (x) { return x.exp && diff(x.exp) <= 2 }).sort(function (x, y) { return x.exp.localeCompare(y.exp) });
    if (RESUME_DAYS && !hid("resume") && (undone.length || expired.length)) {
      var ra = []; if (undone.length) ra.push({ label: "やることを整理する", run: "todo" }); if (expired.length) ra.push({ label: "期限切れの食材を整理する", run: "expired" });
      out.push({ kind: "resume", pr: 0, icon: "👋", title: "おかえりなさい。" + RESUME_DAYS + "日ぶりです", why: "久しぶりでも大丈夫です。たまっている項目を、ここから片づけられます(元に戻せます)", acts: ra });
    }
    if (soon.length && !hid("food")) out.push({ kind: "food", pr: 1, icon: "🧊", title: nameList(soon, 3) + " を、今日のうちに使いましょう", why: "賞味期限" + (soon.some(function (x) { return x.est }) ? "(目安を含む)" : "") + "が、2日以内か、過ぎている食材です" + (function () { var v = soon.reduce(function (a, x) { return a + (x.price || 0) }, 0); return v ? "(金額が分かる分で、約 " + yenTxt(v) + ")" : "" })(), acts: [{ label: "使える料理を見る", run: "food" }] });
    if (S.budget && !hid("budget")) {
      var m = moneyNow(), net = S.budget - m.fx, low = "";
      if (m.remainMonth < 0) low = "今月の予算を、" + yenTxt(-m.remainMonth) + "こえています";
      else if (m.remainToday < 0) low = "今日使えるお金を、" + yenTxt(-m.remainToday) + "こえています";
      else if (net > 0 && m.remainMonth / net <= 0.1) low = "今月の残りが、あと " + yenTxt(m.remainMonth) + " です";
      if (low) out.push({ kind: "budget", pr: 2, icon: "💴", title: low, why: "今月の残り = 予算 − 固定費 − 今月の支出 で計算しています(" + yenTxt(m.remainMonth) + ")", acts: [{ label: "家計を見る", run: "budget" }] });
    }
    var due = S.stock.filter(function (k) { return stockState(k).due });
    if (due.length && !hid("stock")) {
      var pend = due.filter(function (k) { return !S.shop.some(function (x) { return x.name === k.name && !x.bought }) });
      out.push({ kind: "stock", pr: 3, icon: "🧻", title: nameList(due, 3) + " が、買い時です", why: "買ってから、目安の日数がたちました(推定です。実際の残りとは、ちがうことがあります)", acts: [pend.length ? { label: "買い物リストに入れる", run: "stock" } : { label: "買い物リストを見る", run: "shopgo" }] });
    }
    var cs = calStatus();
    if (cs && cs.n && !hid("calendar")) {
      var parts = []; if (cs.changed.length) parts.push("日付が変わったもの " + cs.changed.length + "件"); if (cs.removed.length) parts.push("なくなったもの " + cs.removed.length + "件"); if (cs.added.length) parts.push("新しく増えたもの " + cs.added.length + "件");
      out.push({ kind: "calendar", pr: 3.5, icon: "🔔", title: "カレンダーの通知を、更新したほうがよさそうです", why: "前に書き出したあとで、" + parts.join("・") + "があります。更新ファイルを作って、カレンダーに追加してください", acts: [{ label: "更新ファイルを作る", run: "calupdate" }].concat(cs.changed.length || cs.removed.length ? [{ label: "消す予定を見る", run: "calstale" }] : []) });
    }
    var ts = S.sched.filter(function (s) { return s.date === today });
    if (ts.length >= 3 && !S.meals[today] && !hid("busy")) {
      var q = RECIPES.filter(function (r) { return QUICK.indexOf(r[0]) >= 0 && fridgeHas(r) });
      if (q.length) out.push({ kind: "busy", pr: 4, icon: "🍳", title: "今日は予定が" + ts.length + "件あります。短く作れそうな料理:" + q[0][0], why: "冷蔵庫の食材だけで作れる料理のうち、作る時間が短いもの(目安)です", acts: [{ label: "今夜は「" + q[0][0] + "」にする", run: "busy" }] });
    }
    if (undone.length >= 5 && !hid("todo")) {
      var old = undone.filter(function (t) { return t.date < today }).length;
      out.push({ kind: "todo", pr: 5, icon: "✅", title: "やることが、" + undone.length + "件たまっています", why: "未完了の項目です" + (old ? "(昨日以前から " + old + "件)" : "") + "。今日はやらないものを、いったん外しても大丈夫です(元に戻せます)", acts: [{ label: "整理する", run: "todo" }] });
    }
    if (!S.budget && !hid("setup")) out.push({ kind: "setup", pr: 6, icon: "⚙️", title: "予算を設定すると、今日使えるお金が分かります", why: "いまは予算が未設定のため、「今日使えるお金」を計算できません", acts: [{ label: "予算を設定する", run: "setup" }] });
    return out.sort(function (x, y) { return x.pr - y.pr });
  }
  function goTab(t) { document.querySelector('.tab[data-t="' + t + '"]').click() }
  function tidyTodos() {
    var u = S.todos.filter(function (t) { return !t.done });
    openDialog({ title: "やることを整理する", msg: "今日はやらないものを選ぶと、リストから外します。外したあとも、「元に戻す」で戻せます。", fields: [{ id: "ids", type: "checks", selectAll: true, options: u.map(function (t) { return { value: t.id, label: t.text + (t.date < today ? "(" + (+t.date.slice(5, 7)) + "/" + (+t.date.slice(8)) + "から)" : "") } }) }],
      buttons: [{ label: "やめる" }, { label: "選んだものを外す", primary: true, fn: function (v) {
        if (!v.ids.length) return "外すものを選んでください";
        undoable(v.ids.length + "件を外しました", function () { S.todos = S.todos.filter(function (t) { return v.ids.indexOf(t.id) < 0 }) });
      } }] });
  }
  function tidyExpired() {
    var u = S.fridge.filter(function (x) { return x.exp && diff(x.exp) < 0 });
    openDialog({ title: "期限切れの食材を整理する", msg: "消す食材を選んでください(実際の状態は、パッケージで確認してください)。消したあとも、「元に戻す」で戻せます。", fields: [{ id: "ids", type: "checks", selectAll: true, options: u.map(function (x) { return { value: x.id, label: x.name + "(" + (+x.exp.slice(5, 7)) + "/" + (+x.exp.slice(8)) + (x.est ? "・目安" : "") + ")", checked: true } }) }],
      buttons: [{ label: "やめる" }, { label: "選んだものを消す", primary: true, fn: function (v) {
        if (!v.ids.length) return "消す食材を選んでください";
        undoable(v.ids.length + "品を消しました", function () { logOut(S.fridge.filter(function (x) { return v.ids.indexOf(x.id) >= 0 })); S.fridge = S.fridge.filter(function (x) { return v.ids.indexOf(x.id) < 0 }); $("sug").innerHTML = "" });
      } }] });
  }
  function runAssist(k) {
    if (k === "food") { goTab("meal"); $("mealSug").click(); return }
    if (k === "budget") { goTab("money"); return }
    if (k === "shopgo") { goTab("shop"); return }
    if (k === "setup") { $("budgetBtn").click(); return }
    if (k === "todo") { tidyTodos(); return }
    if (k === "expired") { tidyExpired(); return }
    if (k === "calstale") { var c1 = calStatus(); if (c1) info(calStaleText(c1) || "カレンダーから消す予定は、ありません。", "カレンダーで消す予定"); return }
    if (k === "calupdate") {
      var c2 = calStatus(); if (!c2) return; var r = exportReminders(c2.ex.opt), stale = calStaleText(c2);
      if (!r.count) { info("いま通知できるものが、ありません。" + (stale ? "\nカレンダーの、次の古い予定は、消してください。\n\n" + stale : ""), "更新するものがありません"); renderAssist(); return }
      showToast(r.count + "件の更新用ファイルを作りました。開いて、カレンダーに追加してください", null);
      if (stale) info("カレンダーの、次の古い予定は、消してください(専用カレンダーを、作り直す方法が、確実です)。\n\n" + stale, "カレンダーで消す予定");
      renderAssist(); return;
    }
    if (k === "stock") {
      undoable("買い物リストに入れました", function () { S.stock.filter(function (x) { return stockState(x).due }).forEach(function (x) { if (!S.shop.some(function (y) { return y.name === x.name && !y.bought })) S.shop.push({ id: uid(), name: x.name, bought: false }) }) });
      return;
    }
    if (k === "busy") {
      var q = RECIPES.filter(function (r) { return QUICK.indexOf(r[0]) >= 0 && fridgeHas(r) })[0]; if (!q) return;
      undoable("今夜のご飯を「" + q[0] + "」にしました", function () { S.meals[today] = q[0] });
    }
  }
  function renderAssist() {
    var card = $("assistCard"); if (!card) return;
    var list = computeAssists().slice(0, 3), offN = Object.keys(assistData().off).length;
    card.classList.toggle("hidden", !list.length && !offN);
    $("assistList").innerHTML = list.map(function (x) {
      return '<li class="as" data-k="' + x.kind + '"><div class="as-main"><span class="as-ic" aria-hidden="true">' + x.icon + '</span><div><b>' + esc(x.title) + '</b><small class="why">' + esc(x.why) + '</small></div></div><div class="as-btns">' +
        x.acts.map(function (t) { return '<button class="btn b-pri sm" type="button" data-as="run" data-run="' + t.run + '">' + esc(t.label) + '</button>' }).join("") +
        '<button class="btn b-gh sm" type="button" data-as="later">あとで</button><button class="btn b-gh sm" type="button" data-as="off">表示しない</button></div></li>';
    }).join("");
    $("assistFoot").innerHTML = offN ? '<button class="linkbtn" type="button" data-as="reset">表示しないにした提案を、また表示する(' + offN + '種類)</button>' : "";
  }
  $("assistCard").addEventListener("click", function (e) {
    var b = e.target.closest("[data-as]"); if (!b) return; var li = b.closest("li.as"), k = li && li.dataset.k, a = assistData(), w = b.dataset.as;
    if (w === "run") runAssist(b.dataset.run);
    else if (w === "later") { a.later[k] = today; save(); renderAll(); showToast("今日は、この提案を表示しません", null) }
    else if (w === "off") { a.off[k] = true; save(); renderAll(); showToast("この提案は、表示しません(下のリンクで、また表示できます)", null) }
    else if (w === "reset") { a.off = {}; save(); renderAll() }
  });

  /* ---- 操作(クリック) ---- */
  var by = function (list, id) { return list.filter(function (x) { return x.id !== id }) };
  var act = {
    eedit: function (id) {
      var e = S.exp.filter(function (x) { return x.id === id })[0]; if (!e) return;
      openDialog({ title: "支出を直す", fields: [{ id: "amt", type: "number", label: "金額(円・税込)", value: e.amt }, { id: "memo", type: "text", label: "メモ", value: e.memo || "", max: 100 }, { id: "cat", type: "select", label: "カテゴリ", options: CATS, value: e.cat || "その他" }],
        buttons: [{ label: "やめる" }, { label: "保存", primary: true, fn: function (v) {
          var n = parseYen(v.amt); if (isNaN(n)) return YEN_MSG;
          e.amt = n; e.memo = cleanStr(v.memo, 100); if (CATS.indexOf(v.cat) >= 0) e.cat = v.cat; save(); renderAll(); showToast("直しました", null);
        } }] });
    },
    edel: function (id) { S.exp = by(S.exp, id) },
    tdone: function (id) { S.todos.forEach(function (t) { if (t.id === id) t.done = !t.done }) },
    tdel: function (id) {
      var t = S.todos.filter(function (x) { return x.id === id })[0]; if (!t) return;
      if (t.rid) {
        openDialog({ title: "くり返しのやること", msg: "「" + t.text + "」は、くり返しの設定があります。どちらにしますか?",
          buttons: [{ label: "やめる" }, { label: "今日の分だけ消す", fn: function () { undoable("今日の分を消しました", function () { S.todos = by(S.todos, id) }) } },
            { label: "今後もやめる", primary: true, fn: function () { undoable("くり返しをやめました", function () { S.rec = by(S.rec, t.rid); S.todos = by(S.todos, id) }) } }] });
        return;
      }
      S.todos = by(S.todos, id);
    },
    sdel: function (id) { S.sched = by(S.sched, id) },
    fpick: function (id) { if (!frSel) return; if (frSel[id]) delete frSel[id]; else frSel[id] = true },
    fdel: function (id) { logOut(S.fridge.filter(function (x) { return x.id === id })); S.fridge = by(S.fridge, id); $("sug").innerHTML = "" },
    pick: function (id, b) { S.meals[today] = b.dataset.name; $("sug").innerHTML = "" },
    shdone: function (id) { S.shop.forEach(function (x) { if (x.id === id) x.bought = !x.bought }) },
    shdel: function (id) { S.shop = by(S.shop, id) },
    fxdel: function (id) { S.fixed = by(S.fixed, id) },
    stdel: function (id) { S.stock = by(S.stock, id) },
    stbuy: function (id) { var k = S.stock.filter(function (x) { return x.id === id })[0]; if (k) addStock(k.name, today) },
    stuse: function (id) {
      var k = S.stock.filter(function (x) { return x.id === id })[0]; if (!k) return;
      openDialog({ title: "使う量を選ぶ", msg: "目安の日数に反映します(買った間隔が記録されると、自動で、実際の買い方に合っていきます)。",
        fields: [{ id: "use", type: "select", label: "使う量", value: k.use || "ふつう", options: [{ value: "少なめ", label: "少なめ" }, { value: "ふつう", label: "ふつう" }, { value: "多め", label: "多め(髪が長い・使う回数が多いなど)" }, { value: "共有", label: "家族・同居人と共有" }] }],
        buttons: [{ label: "やめる" }, { label: "保存", primary: true, fn: function (v) { if (USELIST.indexOf(v.use) >= 0) k.use = v.use; save(); renderAll() } }] });
    },
    stcycle: function (id) {
      var k = S.stock.filter(function (x) { return x.id === id })[0]; if (!k) return;
      openDialog({ title: "何日ごとに買い足しますか?", fields: [{ id: "n", type: "number", label: "日数(1〜3650)", value: k.manual ? k.cycle : "", note: "空欄にすると、買った間隔から自動で計算します" }],
        buttons: [{ label: "やめる" }, { label: "保存", primary: true, fn: function (v) {
          var t = String(v.n).trim(), n = /^\d{1,4}$/.test(t) ? parseInt(t, 10) : NaN;
          if (t === "") k.manual = false; else if (n >= 1 && n <= 3650) { k.manual = true; k.cycle = n } else return "日数は、1〜3650の整数で入力してください";
          save(); renderAll();
        } }] });
    },
    stshop: function (id) { S.stock.forEach(function (k) { if (k.id === id && !S.shop.some(function (x) { return x.name === k.name && !x.bought })) S.shop.push({ id: uid(), name: k.name, bought: false }) }) },
    tofridge: function () { S.shop.filter(function (x) { return x.bought }).forEach(function (x) { var st = S.stock.filter(function (y) { return y.name === x.name })[0]; if (st || kindOf(x.name, "") === "日用品") addStock(x.name, today); else addFridge(x.name, today) }); S.shop = S.shop.filter(function (x) { return !x.bought }) },
    addmiss: function (id, b) { b.dataset.miss.split("|").forEach(function (n) { if (!S.shop.some(function (x) { return x.name === n && !x.bought }) && !S.fridge.some(function (x) { return x.name === n })) S.shop.push({ id: uid(), name: n, bought: false }) }) }
  };
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-a]"); if (!b) return;
    var del = /del$/.test(b.dataset.a), snap = del ? JSON.stringify(S) : null;   /* 削除は、あとで元に戻せるように */
    act[b.dataset.a](b.dataset.id, b); save(); renderAll();
    if (snap && snap !== JSON.stringify(S)) showToast("削除しました", function () { S = withDef(JSON.parse(snap)); save(); renderAll() });
    var AM = { stbuy: "買った日を記録しました", stshop: "買い物リストに追加しました" }; if (AM[b.dataset.a]) showToast(AM[b.dataset.a], null);
  });

  /* ---- フォーム ---- */
  $("frExpNote").addEventListener("click", function (e) { if (e.target.closest("[data-tidy]")) tidyExpired() });
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
    logOut(S.fridge.filter(function (x) { return sel[x.id] })); S.fridge = S.fridge.filter(function (x) { return !sel[x.id] }); frSel = null; $("sug").innerHTML = "";
    save(); renderAll();
    showToast(ids.length + "品を消しました", function () { S = withDef(JSON.parse(snap)); save(); renderAll() });
  });
  $("mPrev").addEventListener("click", function () { viewMonth = shiftMonth(curMonth(), -1); renderMonth() });
  $("mNext").addEventListener("click", function () { var n = shiftMonth(curMonth(), 1); if (n <= today.slice(0, 7)) { viewMonth = n; renderMonth() } });
  $("mTrend").addEventListener("click", function (e) { var b = e.target.closest("i[data-m]"); if (b && b.dataset.m <= today.slice(0, 7)) { viewMonth = b.dataset.m; renderMonth() } });
  [["mQ", "input", "q"], ["mCat", "change", "cat"], ["mSort", "change", "sort"], ["mScope", "change", "scope"]].forEach(function (p) { $(p[0]).addEventListener(p[1], function () { mq[p[2]] = this.value; renderMonth() }) });
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
    e.preventDefault(); var a = parseYen($("expAmt").value); if (isNaN(a)) { showToast(YEN_MSG, null); return }
    S.exp.push({ id: uid(), date: today, amt: a, memo: $("expMemo").value.trim(), cat: $("expCat").value });
    $("expAmt").value = ""; $("expMemo").value = ""; save(); renderMoney();
  });
  $("budgetBtn").addEventListener("click", function () {
    openDialog({ title: "今月の予算", fields: [{ id: "n", type: "number", label: "今月使えるお金の総額(円・固定費を含む)", value: S.budget || "" }],
      buttons: [{ label: "やめる" }, { label: "保存", primary: true, fn: function (v) {
        var n = parseYen(v.n, 0); if (isNaN(n)) return "予算は、0〜100,000,000円の整数で入力してください";
        S.budget = n; save(); renderMoney(); showToast("予算を設定しました", null);
      } }] });
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
    $("trashBtn").closest(".card").classList.remove("folded");
    var ed = $("trashEdit"), hid = ed.classList.toggle("hidden");
    if (!hid) ed.querySelectorAll("input").forEach(function (i) { i.value = S.trash[i.dataset.d] || "" });
  });
  $("trashSave").addEventListener("click", function () {
    var t = {}; $("trashEdit").querySelectorAll("input").forEach(function (i) { var v = i.value.trim(); if (v) t[i.dataset.d] = v });
    S.trash = t; S.tgen = ""; $("trashEdit").classList.add("hidden"); rollover(); renderAll();
  });
  $("fixForm").addEventListener("submit", function (e) {
    e.preventDefault(); var a = parseYen($("fixAmt").value), d = parseInt($("fixDay").value, 10), n = cleanStr($("fixName").value, 50);
    if (!n) return; if (isNaN(a)) { showToast(YEN_MSG, null); return }
    if (isNaN(d) || d < 1 || d > 31) { showToast("支払日は、1〜31の数字で入力してください", null); return }
    S.fixed.push({ id: uid(), name: n, amt: a, day: d }); $("fixName").value = ""; $("fixAmt").value = ""; $("fixDay").value = ""; save(); renderAll();
  });
  $("stockForm").addEventListener("submit", function (e) {
    e.preventDefault(); var n = cleanStr($("stName").value, 50), cv = $("stCycle").value.trim(), c = /^\d{1,4}$/.test(cv) ? parseInt(cv, 10) : NaN;
    if (!n) return; if (cv && (isNaN(c) || c < 1 || c > 3650)) { showToast("日数は、1〜3650の整数で入力してください", null); return }
    addStock(n, $("stDate").value || today, isNaN(c) ? 0 : c, $("stUse").value);
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
    var f = e.target.files[0]; e.target.value = ""; if (!f) return;
    if (f.size > 5 * 1024 * 1024) { info("ファイルが大きすぎます(5MBまで)。バックアップのファイルを選んでください。", "読み込めませんでした"); return }
    var rd = new FileReader();
    rd.onload = function () {
      var d; try { d = JSON.parse(rd.result) } catch (x) { info("バックアップ(JSON)のファイルを選んでください。", "読み込めませんでした"); return }
      var r = sanitizeState(d);
      if (!r.ok || !Array.isArray(d.todos)) { info("Life Support のバックアップファイルではないようです。「バックアップを書き出す」で作ったファイルを選んでください。", "読み込めませんでした"); return }
      var n = r.state;
      openDialog({ title: "バックアップを読み込みます", msg: "現在のデータを置き換えます。\n" + sumTxt(n) + (r.skipped ? "\n(読み込めない項目 " + r.skipped + "件は、読み飛ばします)" : "") + "\n読み込んだあとも、「元に戻す」で、元のデータに戻せます。",
        buttons: [{ label: "やめる" }, { label: "読み込む", primary: true, fn: function () {
          var before = JSON.stringify(S); S = n; rollover(); $("memo").value = S.memo; renderAll();
          showToast("バックアップを読み込みました", function () { S = withDef(JSON.parse(before)); save(); renderAll(); $("memo").value = S.memo });
        } }] });
    };
    rd.readAsText(f);
  });

  /* アプリを開いたまま日付をまたいだ場合に更新 */
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { rollover(); renderAll() } });

  rollover(); renderAll();

  /* ---- タブ切り替え ---- */
  var TABS = ["home", "meal", "shop", "money", "help"];
  function setTab(t) {
    if (TABS.indexOf(t) < 0) t = "home";
    document.querySelectorAll(".card[data-tab]").forEach(function (c) { c.classList.toggle("off", c.dataset.tab !== t) });
    document.querySelectorAll(".tab").forEach(function (b) { if (b.dataset.t === t) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current") });
    try { localStorage.setItem("ls_tab", JSON.stringify(t)) } catch (e) { }
  }
  document.querySelector(".tabs").addEventListener("click", function (e) { var b = e.target.closest(".tab"); if (b) { setTab(b.dataset.t); window.scrollTo(0, 0) } });
  setTab(load("ls_tab", "home"));

  /* ---- レシート読み取り(端末内でOCR) ---- */
  var rcOrig = null, rcItems = [];
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
    var PRICE_END = /^(.*?[^\d\s¥,.\-])\s*¥?\s*(\d{1,3}(?:,\d{3})+|\d{2,6})\s*(?:[軽※*★☆外内]|\([軽内外]\))?\s*[A-Z]?\s*$/;   /* 末尾の「※ A」のような印も許す */
    var ONLY_NUM = /^[\d\s@x×＠¥,.点個コ\-]*?(\d{1,3}(?:,\d{3})+|\d{2,6})\s*(?:[軽※*★☆外内]|\([軽内外]\))?$/i;
    var items = [], pend = "";
    for (var i = 0; i < stop; i++) {
      var l = lines[i];
      if (/割引|値引/.test(l)) {   /* 「割引 30% -60」のような行は、直前の品物の金額から引く */
        var dm = l.match(/[-−―ー一▲△]\s*(\d{1,3}(?:,\d{3})+|\d{1,6})\s*$/);
        if (dm && items.length) { var np = items[items.length - 1].price - num(dm[1]); if (np > 0) items[items.length - 1].price = np }
        pend = ""; continue;
      }
      if (DATE.test(l) || PHONE.test(l) || ADDR.test(l) || NG.test(l)) { pend = ""; continue }
      var s = strip(l), m = s.match(PRICE_END);
      if (m) {
        var nm = clean(m[1]), pr = num(m[2]);
        if (letters(nm) < 2 && pend) nm = clean(pend);
        if (letters(nm) >= 2 && pr >= 10 && pr <= 100000) items.push({ name: nm, price: pr, red: /[※軽]/.test(l) });
        pend = ""; continue;
      }
      var on = s.match(ONLY_NUM);
      if (on && pend) {
        var p2 = num(on[1]);
        if (p2 >= 10 && p2 <= 100000 && letters(pend) >= 2) items.push({ name: clean(pend), price: p2, red: /[※軽]/.test(l) });
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
    var sub = 0, tax = 0, r8 = false, r10 = false;
    lines.forEach(function (l) {
      var ns = l.match(/\d{1,3}(?:,\d{3})+|\d{1,6}/g) || [];
      if (!sub && /小計/.test(l) && ns.length) sub = num(ns[ns.length - 1]);
      if (/外税/.test(l) && !/対象/.test(l) && ns.length) { var v = num(ns[ns.length - 1]); if (v > 0 && v < 100000) { tax += v; if (/8\s*%/.test(l)) r8 = true; if (/10\s*%/.test(l)) r10 = true } }
    });
    var excl = tax > 0 && sub > 0;
    if (!total && excl) total = sub + tax;   /* 合計の行が読めなくても、小計+外税で求める */
    if (!total && items.length) total = items.reduce(function (a, x) { return a + x.price }, 0);
    return { total: total, items: items, excl: excl, only8: r8 && !r10, only10: r10 && !r8 };
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
    var s = rcItems.reduce(function (a, x) { return a + (x.price || 0) }, 0), t = parseYen($("rcTotal").value) || 0, h = "";
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
    if (t.dataset.p !== undefined) { rcItems[+t.dataset.p].price = parseYen(t.value, -MAXYEN) || 0; rcSumText() }
  });
  $("rcItems").addEventListener("click", function (e) {
    var b = e.target.closest("[data-rm]"); if (b) { rcItems.splice(+b.dataset.rm, 1); renderRc() }
  });
  $("rcTotal").addEventListener("input", rcSumText);
  $("rcFix").addEventListener("click", function (e) {
    var b = e.target.closest("[data-fix]"); if (!b) return;
    var s = rcItems.reduce(function (a, x) { return a + (x.price || 0) }, 0), t = parseYen($("rcTotal").value) || 0, k = b.dataset.fix;
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
    rcOrig = null; rcItems = []; $("rcTotal").value = ""; $("rcMemo").value = ""; $("rcDate").value = today; renderRc();
    $("rcRes").classList.remove("hidden"); $("rcMsg").textContent = "品物と合計を入力して、登録してください";
  });
  $("rcBtn").addEventListener("click", function () { warmAI(); $("rcFile").click() });
  var RC_SITE_KEY = "6LcriOwtAAAAADgESq50oXzRgD-Odtm-GmYm9DSN";   /* reCAPTCHA Enterprise のサイトキー(App Check用)。入れるとAI読み取りが使えます */
  var AI_MODEL = "gemini-3.5-flash";
  var AI_THINK = true, acDone = false, aiPs = {};   /* AI_THINK: 考える量を指定する(Gemini 3系は、少ないと速い) */
  function loadAI(level) {
    var ov = ""; try { ov = localStorage.getItem("ls_ai_level") || "" } catch (e) { }   /* ブラウザの localStorage に ls_ai_level(MINIMAL/LOW/MEDIUM)を入れると、考える量を、あとから試せる */
    level = AI_THINK ? (level || (["MINIMAL", "LOW", "MEDIUM", "HIGH"].indexOf(ov) >= 0 ? ov : "LOW")) : "plain";
    if (!aiPs[level]) aiPs[level] = Promise.all([import(BASE + "firebase-app.js"), import(BASE + "firebase-ai.js"), RC_SITE_KEY ? import(BASE + "firebase-app-check.js") : Promise.resolve(null)]).then(function (m) {
      var app = m[0].getApp(), Sc = m[1].Schema;
      if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) || location.protocol === "file:") self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;   /* パソコンで直接開いて試すときだけ、デバッグ用の合図を使う(コンソールに出る番号を、Firebaseに登録すると、試せる)。公開サイトでは、使わない */
      if (RC_SITE_KEY && m[2] && !acDone) { m[2].initializeAppCheck(app, { provider: new m[2].ReCaptchaEnterpriseProvider(RC_SITE_KEY), isTokenAutoRefreshEnabled: true }); acDone = true }
      var ai = m[1].getAI(app, { backend: new m[1].GoogleAIBackend() });
      var gc = {
        responseMimeType: "application/json",
        responseSchema: Sc.object({ properties: { store: Sc.string(), date: Sc.string(), total: Sc.number(), subtotal: Sc.number(), taxIncluded: Sc.boolean(), items: Sc.array({ items: Sc.object({ properties: { name: Sc.string(), price: Sc.number(), rate: Sc.number(), kind: Sc.string() } }) }) } })
      };
      if (level !== "plain") gc.thinkingConfig = { thinkingLevel: (m[1].ThinkingLevel && m[1].ThinkingLevel[level]) || level };
      return m[1].getGenerativeModel(ai, { model: AI_MODEL, generationConfig: gc });
    });
    return aiPs[level];
  }
  /* 写真を選ぶあいだに、AIの部品とApp Checkを、先に読み込んでおく(同意ずみのときだけ) */
  function warmAI() { var ok = false; try { ok = localStorage.getItem("ls_ai_ok") === "1" } catch (e) { } if (ok) loadAI("LOW").catch(function () { aiPs = {} }) }
  var AI_PROMPT = "これはレシートの写真です(斜め・遠い・ピンぼけ・指や背景が写っていることがあります)。買った品物だけを読み取り、JSONで返してください。\n" +
    "【含めるもの】食品に限らず、日用品・衣類・本・飲食店の料理・サービスなど、購入した品物の行すべて。\n" +
    "【含めないもの】店名、住所、電話番号、日付、時刻、レシート番号、お客様番号、レジ番号、担当者、登録番号(Tで始まる番号)、「イートイン」「テイクアウト」などの区分、小計、合計、内税・外税、税率ごとの対象額、お預り、お釣り、支払方法(現金・カード・交通系IC・QR決済・電子マネー)、残高、ポイント、クーポン、広告・アンケート・クイズなどの文章。\n" +
    "【金額】price は、その品物の金額(円の整数)です。商品名と金額の間に、数量だけ(「1」「2」など)が書かれている場合、その数字は price ではありません。数量が2以上なら、その行の合計金額を price にします。値引き・割引の行は、直前の品物の金額から引いた額にして、別の行にはしません。\n" +
    "【税】taxIncluded は、品物の金額が税込で印字されている(内税)なら true、税抜(外税)で印字され、税が最後にまとめて加算されているなら false です。rate は、その品物の消費税率(8 または 10)です。「軽」「※」などの軽減税率の印や、税率ごとの内訳から判断し、分からなければ 10 にします。\n" +
    "【種類】kind は、品物の種類です。「食材」(冷蔵庫に入れる食品)、「日用品」(シャンプー・洗剤・ティッシュなどの消耗品)、「その他」のどれかにします。\n" +
    "【合計】total はレシートの合計(支払う金額・税込)、subtotal は小計です。印字がなければ 0 にします。store は店名です。\n" +
    "【日付】date は、レシートに印字された購入日を、YYYY-MM-DD の形で入れます(例:2026-09-22)。和暦や省略は、西暦に直します。印字がない、または読めないときは、空文字にします。\n" +
    "【ルール】読み取れない行や、自信がない行は、推測で作らず、含めません。name は印字どおりの商品名にして、商品コードや余計な記号は除きます。レシートでない写真なら items を空にします。";
  function toB64(f) {
    return new Promise(function (ok, ng) {
      var u = URL.createObjectURL(f), im = new Image();
      im.onload = function () {
        URL.revokeObjectURL(u);
        var k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement("canvas");   /* 長い辺を1600pxまでにして、送る量を減らす */
        c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        try { c = cropPaper(c) } catch (e) { }
        ok(c.toDataURL("image/jpeg", 0.85).split(",")[1]);
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
  /* レシートの日付を、安全な形にする(今日より先・1年より前は、使わない) */
  function okRcDate(v) {
    var re = /(20\d{2})\D{1,3}(\d{1,2})\D{1,3}(\d{1,2})/g, m, pad = function (x) { return ("0" + x).slice(-2) };
    while ((m = re.exec(String(v || "")))) {
      var t = okDate(m[1] + "-" + pad(m[2]) + "-" + pad(m[3]));
      if (t && t <= today && t >= addDays(today, -366)) return t;
    }
    return "";
  }
  /* 税抜の金額を税込にするとき、端数の1円ずつを、小数点以下が大きい品物から順に割り振る */
  function allocTax(items, total) {
    if (!items.length || !total) return items;
    var sum = items.reduce(function (a, x) { return a + x.price }, 0), dlt = total - sum;
    if (dlt >= 0 && dlt <= items.length) {
      items.slice().sort(function (a, b) { return (b.ex - Math.floor(b.ex)) - (a.ex - Math.floor(a.ex)) }).slice(0, dlt).forEach(function (x) { x.price += 1 });
      return items;
    }
    return fitTotal(items, total);
  }
  function parseJSONLoose(txt) {
    var t = String(txt || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try { return JSON.parse(t) } catch (e) {
      var a = t.indexOf("{"), b = t.lastIndexOf("}");
      if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
      var er = new Error("AIの返事が、JSONの形ではありませんでした: " + t.slice(0, 60)); er.code = "bad-json"; throw er;
    }
  }
  function parseAI(txt) {
    var d = parseJSONLoose(txt), excl = d.taxIncluded === false;
    var items = (d.items || []).map(function (x) {
      var p = Math.round(Number(x.price)), rt = Number(x.rate) === 8 ? 8 : 10, ex = excl ? p * (100 + rt) / 100 : p;
      return { name: String(x.name || "").trim(), aiKind: String(x.kind || "").trim(), ex: ex, price: Math.floor(ex) };
    }).filter(function (x) { return x.name && x.price > 0 && x.price <= 1000000 });
    var total = Math.round(Number(d.total)) || 0, sub = Math.round(Number(d.subtotal)) || 0, note = "";
    if (excl) { note = "税抜の金額を税込に換算しました"; items = allocTax(items, total) }
    var sum = items.reduce(function (a, x) { return a + x.price }, 0), target = excl ? total : (sub || total);
    if (!total) total = sum;
    return { items: items, total: total, store: String(d.store || "").trim(), date: okRcDate(d.date), raw: txt, taxNote: note, gap: target ? sum - target : 0 };
  }
  /* ---- AIのエラーを、人にわかる形にする ---- */
  function aiWhy(err) {
    var code = String(err && err.code || ""), msg = String(err && err.message || err || ""), st = err && err.customErrorData && err.customErrorData.status;
    var m = msg.match(/\[(\d{3})\s*[^\]]*\]/); if (!st && m) st = +m[1];
    return { code: code, status: Number(st) || 0, msg: msg.slice(0, 400), kind: /PerDay|per day|daily/i.test(msg) ? "day" : (/PerMinute|per minute|retry in/i.test(msg) ? "minute" : "") };
  }
  function aiHuman(w) {
    if (w.status === 429) return w.kind === "day" ? "AIの1日の利用上限に、達したようです。日本時間の夕方(午後4〜5時ごろ)に、また使えます"
      : w.kind === "minute" ? "AIの短時間の利用上限に、達したようです。1分ほど待つと、また使えます" : "AIの利用回数の上限に、達した可能性があります。しばらく待ってから、もう一度お試しください";
    if ([500, 502, 503, 504].indexOf(w.status) >= 0) return "AIが混み合っています。少し待って、もう一度お試しください";
    if (w.status === 403) return "AIの利用が許可されていません(App Check や Firebase の設定の確認が必要です)";
    if (w.status === 404) return "AIのモデルが見つかりません(モデル名の更新が必要な可能性があります)";
    if (w.status === 400) return "AIに送った内容が、受け付けられませんでした";
    if (/Failed to fetch|NetworkError|Load failed/i.test(w.msg) || (w.code === "fetch-error" && !w.status)) return "AIと通信できませんでした。電波を確認するか、ブラウザの拡張機能(広告ブロックなど)をオフにして、もう一度お試しください";
    return "AIの読み取りに失敗しました(理由: " + (w.code || "不明") + (w.status ? " HTTP " + w.status : "") + (w.msg ? " / " + w.msg.slice(0, 90) : "") + ")";
  }
  /* 混雑・一時的な通信エラーのときだけ、少し待って、もう一度試す(1回だけ) */
  function callAI(model, parts) {
    return model.generateContent(parts).catch(function (err) {
      var w = aiWhy(err), temp = [500, 502, 503, 504].indexOf(w.status) >= 0 || (w.code === "fetch-error" && !w.status);   /* 429(上限)は、やり直さない */
      if (!temp) throw err;
      return new Promise(function (r) { setTimeout(r, 2500) }).then(function () { return model.generateContent(parts) });
    });
  }
  function readAI(f, stage) {
    var model, img; stage = stage || function () { };
    stage("写真を整えています");
    return Promise.all([loadAI("LOW"), toB64(f)]).then(function (a) {
      model = a[0]; img = { inlineData: { mimeType: "image/jpeg", data: a[1] } };
      stage("AIに送って、読み取っています");
      return callAI(model, [AI_PROMPT, img]).catch(function (err) {
        var w0 = aiWhy(err); if (!AI_THINK || !(w0.status === 400 || /thinking|INVALID_ARGUMENT/i.test(w0.msg))) throw err;
        AI_THINK = false; aiPs = {};   /* 「考える量」の指定が使えないときは、指定なしで、もう一度 */
        return loadAI().then(function (m2) { model = m2; return model.generateContent([AI_PROMPT, img]) });
      });
    }).then(function (r) {
      var read1 = function (x) { var t = x.response.text(); return { txt: t, p: parseAI(t) } }, a1;
      try { a1 = read1(r) } catch (e0) { a1 = null }
      if (a1) return a1;
      stage("AIの返事が読めなかったため、もう一度、読み取っています");   /* 返事が空・途中で切れた・形がちがう、など */
      return loadAI("MEDIUM").then(function (m4) { return callAI(m4, [AI_PROMPT, img]) }).then(read1);
    }).then(function (a1) {
      var txt = a1.txt, p = a1.p;
      if (!p.gap) return p;
      stage("合計が合わないため、丁寧に読み直しています");
      var q = "前回の読み取り結果:\n" + txt + "\n\n問題: 品物の金額の合計が、レシートの小計・合計より " + Math.abs(p.gap) + "円 " + (p.gap > 0 ? "多い" : "少ない") + "です。写真をもう一度よく見て、読み間違い・抜け・余計な行(合計や税の行を品物にしていないか)を直した結果を、同じ形式のJSONで返してください。";
      return loadAI("MEDIUM").then(function (m3) { return callAI(m3, [AI_PROMPT, img, q]) }).then(function (r2) {   /* 速い設定で合わなかったときだけ、丁寧な設定で読み直す */
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
      var p = parseReceipt(r.data.text); p.raw = r.data.text; p.store = ""; p.date = okRcDate(r.data.text);
      var mxp = p.items.reduce(function (a, x) { return Math.max(a, x.price) }, 0);
      if (p.total && p.items.length && p.total < mxp) { p.total = 0; p.suspect = true }   /* 合計が、品物の最高額より小さいのは、読み間違い */
      var sm = p.items.reduce(function (a, x) { return a + x.price }, 0), f = sm ? p.total / sm : 0, done = false;
      if (p.excl && p.total) {   /* 外税のレシート: 品物ごとの税率(※は8%)で税込にして、合計に合わせる */
        var it2 = p.items.map(function (x) { var rt = p.only8 ? 8 : p.only10 ? 10 : (x.red ? 8 : 10), ex = x.price * (100 + rt) / 100; return { name: x.name, price: Math.floor(ex), ex: ex } });
        var s2 = it2.reduce(function (a, x) { return a + x.price }, 0);
        if (p.total >= s2 && p.total - s2 <= it2.length) { p.items = allocTax(it2, p.total); p.taxNote = "税抜の金額を税込に換算しました"; done = true }
      }
      if (!done && /外税|税抜|税別/.test(r.data.text) && f > 1.03 && f < 1.11) {
        p.items = fitTotal(p.items.map(function (x) { return { name: x.name, price: Math.floor(x.price * f) } }), p.total);
        p.taxNote = "税抜の金額を、合計に合わせて税込に換算しました(概算)";
      }
      return p
    });
  }
  function showRc(p, ai, note) {
    rcItems = p.items.map(function (x) { return { name: x.name, price: x.price, kind: kindOf(x.name, x.aiKind) } });
    rcOrig = { ai: !!ai, retried: !!p.retried, total: p.total || 0, secs: 0, items: rcItems.map(function (x) { return x.name + "|" + x.price }) };   /* 読み取り直後の内容(あとで、どれだけ直したかを数える) */ $("rcRaw").textContent = (note ? "[" + note + "]\n" : "") + p.raw;
    $("rcTotal").value = p.total || ""; $("rcMemo").value = p.store || ""; $("rcDate").value = p.date || today;
    renderRc(); $("rcRes").classList.remove("hidden");
    $("rcMsg").textContent = !p.items.length ? (ai ? (p.total ? "AIで読み取りました。品物の一覧は、見つかりませんでした(支払い画面など、品物が載っていない画面では、合計と店名だけが入ります)。合計を確認して、登録してください" : "AIは、品物も合計も、見つけられませんでした。レシート全体が写るように、明るい場所で撮り直してください") : "品物を読み取れませんでした。レシート全体が写るように、明るい場所で撮り直してください")
      : (ai ? "AIで読み取りました。" : "簡易読み取りです(精度が低いため、必ず内容を確認してください)。") + (p.retried ? "合計が合わなかったため、AIが読み直しました。" : "") + (p.taxNote ? p.taxNote + "。" : "") + (p.date && p.date !== today ? "レシートの日付(" + (+p.date.slice(5, 7)) + "/" + (+p.date.slice(8)) + ")を、支出の日付に入れました。" : "") + (p.suspect ? "合計を読み取れませんでした。レシートの合計を、入力してください。" : "") + "内容を確認して登録してください";
  }
  /* ---- AIの利用上限(429)に達したとき: しばらくAIを呼ばず、すぐ簡易読み取りに切り替える ---- */
  function aiBlockUntil() { try { var t = +localStorage.getItem("ls_ai_block") || 0; return t > Date.now() ? t : 0 } catch (e) { return 0 } }
  function msToPacificMidnight() {   /* 1日の上限は、アメリカ太平洋時間の0時に、リセットされる(公式の説明) */
    try {
      var p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour12: false, hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(new Date()), g = function (t) { return +p.filter(function (x) { return x.type === t })[0].value % 24 };
      return (86400 - (g("hour") * 3600 + g("minute") * 60 + g("second"))) * 1000 + 60000;
    } catch (e) { return 6 * 3600 * 1000 }
  }
  function setAiBlock(w) {
    if (w.status !== 429) return;
    var ms = 60000, m = w.msg.match(/retry in\s*([\d.]+)\s*s/i) || w.msg.match(/retryDelay"?\s*:\s*"?(\d+)s/i);
    if (m) ms = Math.max(5000, Math.ceil(parseFloat(m[1]) * 1000) + 2000);
    if (w.kind === "day") ms = msToPacificMidnight();
    try { localStorage.setItem("ls_ai_block", String(Date.now() + Math.min(ms, 24 * 3600 * 1000))) } catch (e) { }
  }
  function blockText(t) {
    var min = Math.ceil((t - Date.now()) / 60000); if (min < 60) return "約" + Math.max(1, min) + "分後";
    var d = new Date(t); return d.getHours() + "時" + ("0" + d.getMinutes()).slice(-2) + "分ごろ";
  }
  function runRc(f, useAI) {
    var t0 = Date.now(), label = "", tick = null, sec = function () { return Math.round((Date.now() - t0) / 1000) };
    var bl = useAI ? aiBlockUntil() : 0, blNote = ""; if (bl) { useAI = false; blNote = "AIは、利用上限のため、" + blockText(bl) + "まで、お休み中です。簡易読み取りで読み取ります。" }
    function show() { $("rcMsg").textContent = label + "…(" + sec() + "秒)" }
    function stage(t) { label = t; show() }
    function stop() { clearInterval(tick) }
    if (useAI) { stage("準備しています"); tick = setInterval(show, 1000) } else $("rcMsg").textContent = "準備中…(初回は日本語データの読み込みで少し時間がかかります)";
    (useAI ? readAI(f, stage).then(function (p) { stop(); showRc(p, true); if (rcOrig) rcOrig.secs = sec(); $("rcMsg").textContent = $("rcMsg").textContent.replace("AIで読み取りました。", "AIで読み取りました(" + sec() + "秒)。") }, function (err) {
      stop();
      var w = aiWhy(err), human = aiHuman(w); setAiBlock(w);
      var why = "AI読み取りエラー: " + (w.code || "不明") + (w.status ? " (HTTP " + w.status + ")" : "") + " / " + w.msg;
      $("rcMsg").textContent = human + "。簡易読み取りに切り替えます…";
      return readTess(f).then(function (p) { showRc(p, false, why); $("rcMsg").textContent = human + "。" + $("rcMsg").textContent });
    }) : readTess(f).then(function (p) {
      showRc(p, false, blNote ? "AIの利用上限のため、簡易読み取りに切り替えました" : "");
      if (blNote) {
        $("rcMsg").textContent = blNote + $("rcMsg").textContent;
        var again = document.createElement("button"); again.type = "button"; again.className = "linkbtn"; again.textContent = "AIをもう一度、試す";
        again.addEventListener("click", function () { try { localStorage.removeItem("ls_ai_block") } catch (e) { } runRc(f, true) });
        $("rcMsg").appendChild(document.createTextNode(" ")); $("rcMsg").appendChild(again);
      }
    }))
      .catch(function () {
        stop(); rcWorker = null; rcOrig = null; rcItems = []; $("rcTotal").value = ""; $("rcMemo").value = ""; $("rcDate").value = today; renderRc(); $("rcRes").classList.remove("hidden");
        $("rcMsg").textContent = "読み取れませんでした。撮り直すか、下に手入力してください";
      });
  }
  $("rcFile").addEventListener("change", function (e) {
    var f = e.target.files[0]; if (!f) return; e.target.value = "";
    $("rcRes").classList.add("hidden");
    var ok = false; try { ok = localStorage.getItem("ls_ai_ok") === "1" } catch (x) { }
    if (ok) { runRc(f, true); return }
    openDialog({ title: "写真をAIに送ります", msg: "レシートの写真を、GoogleのAI(Gemini)に送って読み取ります。\nカード番号や会員番号などが写っている場合は、隠してから撮ってください。\n「送らない」を選ぶと、端末の中だけで読み取る簡易読み取りを使います(精度は低めです)。", noEsc: true,
      buttons: [{ label: "送らない(端末内で読み取る)", fn: function () { runRc(f, false) } }, { label: "送って読み取る", primary: true, fn: function () { try { localStorage.setItem("ls_ai_ok", "1") } catch (x) { } runRc(f, true) } }] });
  });
  /* ---- AIの読み取りの成績(この端末にだけ記録。写真や中身は、残さない) ---- */
  function logRc(total) {
    if (!rcOrig || !rcOrig.ai) { rcOrig = null; return }
    var cur = rcItems.map(function (x) { return x.name + "|" + x.price }), left = rcOrig.items.slice(), same = 0;
    cur.forEach(function (c) { var k = left.indexOf(c); if (k >= 0) { left.splice(k, 1); same++ } });
    var changed = Math.max(rcOrig.items.length, cur.length) - same, tEdit = total !== rcOrig.total;
    try {
      var L = JSON.parse(localStorage.getItem("ls_rc_log") || "[]");
      L.push({ d: today, s: rcOrig.secs, r: rcOrig.retried ? 1 : 0, n: rcOrig.items.length, c: changed, t: tEdit ? 1 : 0 }); localStorage.setItem("ls_rc_log", JSON.stringify(L.slice(-30)));
    } catch (e) { }
    rcOrig = null; renderRcStats();
  }
  function renderRcStats() {
    var el = $("rcStats"); if (!el) return; var L = [];
    try { L = JSON.parse(localStorage.getItem("ls_rc_log") || "[]") } catch (e) { }
    if (!L.length) { el.textContent = ""; return }
    var ok = L.filter(function (x) { return !x.c && !x.t }).length, sec = Math.round(L.reduce(function (a, x) { return a + (x.s || 0) }, 0) / L.length);
    el.textContent = "AIの読み取りの成績(この端末のみ・直近" + L.length + "回): 直さずに登録できたのは " + ok + "回、平均 " + sec + "秒";
  }
  function registerReceipt(a) {
    logRc(a);
    var d = $("rcDate").value || today, nf = 0, nd = 0, skip = 0;
    rcItems.forEach(function (x) {
      var nm = cleanStr(x.name, 50); if (!nm || x.price < 0) return;
      if (x.kind === "食材") { if (addFridge(nm, d, x.price)) nf++; else skip++ } else if (x.kind === "日用品") { addStock(nm, d); nd++ }
    });
    S.exp.push({ id: uid(), date: d, amt: a, memo: cleanStr($("rcMemo").value, 100) || "レシート", cat: $("rcCat").value });
    save(); renderAll(); $("rcRes").classList.add("hidden");
    $("rcMsg").textContent = (d === today ? "今日の支出に登録しました" : d + " の支出として登録しました") + (nf || nd ? "。冷蔵庫に" + nf + "品(賞味期限は目安)、日用品に" + nd + "品を入れました" : "") + (skip ? "。日付が古く、期限が過ぎる食材 " + skip + "品は、冷蔵庫に入れませんでした" : "");
  }
  renderRcStats();
  $("rcAdd").addEventListener("click", function () {
    var a = parseYen($("rcTotal").value); if (isNaN(a)) { $("rcMsg").textContent = "合計金額は、1〜100,000,000円の整数で入力してください"; return }
    var sm = rcItems.reduce(function (x, y) { return x + (y.price || 0) }, 0), d = $("rcDate").value || today, warns = [];
    if (rcItems.length && sm !== a) warns.push("品物の合計(" + yenTxt(sm) + ")と、登録する合計(" + yenTxt(a) + ")が、ちがいます。");
    var dup = S.exp.filter(function (e) { return e.date === d && e.amt === a })[0];
    if (dup) warns.push("同じ日(" + d + ")に、同じ金額(" + yenTxt(a) + ")の支出が、すでにあります(" + (dup.memo || "メモなし") + ")。同じレシートを、二重に登録していないか、確認してください。");
    if (!warns.length) { registerReceipt(a); return }
    openDialog({ title: "登録する前に、確認してください", msg: warns.join("\n"), buttons: [{ label: "戻って直す" }, { label: "このまま登録する", primary: true, fn: function () { registerReceipt(a) } }] });
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

  /* ---- 入力欄の名前を、欄の上に小さく残す ---- */
  function labelize() {
    document.querySelectorAll(".card .row > input:not([type=file]):not([type=checkbox]), .card .row > select").forEach(function (el) {
      if (el.parentNode.classList.contains("fld")) return;
      var cap = (el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").replace(/\(例[:：].*$/, "").replace(/を追加$/, "").trim(); if (!cap) return;
      var cs = getComputedStyle(el), w = document.createElement("label"), sp = document.createElement("span");
      w.className = "fld"; w.style.flex = cs.flex; w.style.minWidth = (cs.minWidth === "auto" ? "0" : cs.minWidth); sp.textContent = cap; w.appendChild(sp);
      el.parentNode.insertBefore(w, el); w.appendChild(el); el.style.flex = "none";
    });
  }
  /* ---- メモ・ゴミ出しは、ふだんは折りたたむ ---- */
  (function () {
    var st = null; try { st = JSON.parse(localStorage.getItem("ls_fold") || "null") } catch (e) { } st = st || { "h-memo": true, "h-trash": true };
    document.querySelectorAll(".card.fold").forEach(function (c) {
      var id = c.getAttribute("aria-labelledby"); c.classList.toggle("folded", st[id] !== false);
      c.querySelector(".card-head").addEventListener("click", function (e) {
        if (e.target.closest("button")) return; c.classList.toggle("folded"); st[id] = c.classList.contains("folded");
        try { localStorage.setItem("ls_fold", JSON.stringify(st)) } catch (x) { }
      });
    });
  })();
  /* ---- 追加したときの、短いお知らせ ---- */
  var ADDMSG = { expForm: "支出を記録しました", todoForm: "やることを追加しました", schForm: "予定を追加しました", frForm: "冷蔵庫に追加しました", stockForm: "日用品を追加しました", shopForm: "買い物リストに追加しました", fixForm: "固定費を追加しました" };
  document.addEventListener("submit", function (e) { e.target._snap = JSON.stringify(S) }, true);
  document.addEventListener("submit", function (e) { var f = e.target, m = ADDMSG[f.id]; if (m && f._snap !== JSON.stringify(S)) showToast(m, null) });
  $("homeRc").addEventListener("click", function () { warmAI(); document.querySelector('.tab[data-t="money"]').click(); $("rcFile").click() });
  $("mChart").addEventListener("click", function (e) {
    var b = e.target.closest("i[data-i]"); if (!b) return;
    $("mInfo").textContent = (+curMonth().slice(5)) + "月" + b.dataset.i + "日: " + (+b.dataset.v).toLocaleString("ja-JP") + "円";
  });
  [["todoIn", 100], ["schText", 100], ["expMemo", 100], ["frName", 50], ["shopIn", 50], ["stName", 50], ["fixName", 50], ["mealIn", 50], ["rcMemo", 100], ["scName", 80], ["memo", 5000]].forEach(function (p) { var el = $(p[0]); if (el) el.maxLength = p[1] });
  ["expAmt", "fixAmt", "rcTotal"].forEach(function (id) { var el = $(id); if (el) el.max = MAXYEN });
  labelize();

  /* ---- Firebase(ログイン+クラウド保存) ---- */
  var CFG = { apiKey: "AIzaSyCLdsMHrKRwEzyrB_HPiRitPErjIIHWdZ4", authDomain: "life-support-a2a21.firebaseapp.com", projectId: "life-support-a2a21", storageBucket: "life-support-a2a21.firebasestorage.app", messagingSenderId: "789058079447", appId: "1:789058079447:web:7a4e3113758af4d3f0fe92" };
  var BASE = "https://www.gstatic.com/firebasejs/12.19.0/", A = null, F = null, auth = null, db = null, cuid = null, timer = null;
  var show = function (id, on) { $(id).classList.toggle("hidden", !on) };
  function setSync(t) { $("sync").textContent = t }
  function withDef(o) { return Object.assign({ budget: 0, exp: [], todos: [], rec: [], meals: {}, sched: [], fridge: [], memo: "", shop: [], trash: {}, fixed: [], stock: [], codes: {} }, o) }
  var syncPaused = false, bannerFn = null;
  function showBanner(msg, fn, label) {
    $("banner").classList.toggle("hidden", !msg); $("bannerMsg").textContent = msg || ""; bannerFn = fn || null;
    $("bannerBtn").classList.toggle("hidden", !fn); $("bannerBtn").textContent = label || "もう一度保存";
  }
  $("bannerBtn").addEventListener("click", function () { if (bannerFn) bannerFn() });
  function push() { return F.setDoc(F.doc(db, "users", cuid), JSON.parse(JSON.stringify(S))) }
  function pushOk() { try { localStorage.setItem("ls_sync_uid", cuid); localStorage.setItem("ls_dirty", "0") } catch (e) { } setSync("クラウドに保存済み"); showBanner("") }
  function pushFail() {
    setSync("クラウドに保存できませんでした");
    showBanner("クラウドに保存できませんでした。データは、この端末には保存されています。通信を確認して、「もう一度保存」を押してください。", function () { setSync("同期中…"); push().then(pushOk).catch(pushFail) });
  }
  function cloudSave() {
    if (!cuid || syncPaused) return; try { localStorage.setItem("ls_dirty", "1") } catch (e) { } setSync("同期中…"); clearTimeout(timer);
    timer = setTimeout(function () { push().then(pushOk).catch(pushFail) }, 700);
  }
  var AUTHMSG = { "auth/invalid-credential": "メールアドレスまたはパスワードが違います。入力を確認してください", "auth/wrong-password": "パスワードが違います。入力を確認するか、「パスワードを忘れた」を使ってください", "auth/user-not-found": "このメールアドレスは登録されていません。「新規登録」を押してください",
    "auth/invalid-email": "メールアドレスの形式が正しくありません。(例:name@example.com)", "auth/email-already-in-use": "このメールアドレスは、すでに登録されています。「ログイン」を押してください", "auth/weak-password": "パスワードは、6文字以上にしてください",
    "auth/network-request-failed": "通信できません。電波の良い場所で、もう一度試してください", "auth/too-many-requests": "試した回数が多すぎます。しばらく待ってから、もう一度試してください", "auth/operation-not-allowed": "メールとパスワードでのログインが、まだ有効になっていません(管理者の設定が必要です)", "auth/user-disabled": "このアカウントは、使えない状態です", "auth/missing-password": "パスワードを入力してください" };
  function authErr(e) { $("authMsg").textContent = AUTHMSG[e && e.code] || ("うまくいきませんでした。通信を確認して、もう一度お試しください(コード: " + (e && (e.code || e.message) || "不明") + ")") }
  /* ---- ゲスト(この端末)のデータと、クラウドのデータが、ちがうときの扱い ---- */
  function hasData(x) { return !!(x.budget || x.memo || x.exp.length || x.todos.length || x.rec.length || x.sched.length || x.fridge.length || x.shop.length || x.fixed.length || x.stock.length || Object.keys(x.meals).length || Object.keys(x.trash).length || Object.keys(x.codes).length) }
  function sumTxt(x) { return "支出 " + x.exp.length + "件・ToDo " + x.todos.length + "件・冷蔵庫 " + x.fridge.length + "件・日用品 " + x.stock.length + "件" }
  function mergeStates(a, b) {   /* a = この端末、b = クラウド。同じ id は、クラウドを優先して、足りないものを足す */
    var m = sanitizeState(b).state, x = sanitizeState(a).state;
    ["exp", "todos", "rec", "sched", "fridge", "shop", "fixed"].forEach(function (k) { var ids = {}; m[k].forEach(function (i) { ids[i.id] = 1 }); x[k].forEach(function (i) { if (!ids[i.id]) m[k].push(i) }) });
    x.stock.forEach(function (k) {
      var same = m.stock.filter(function (y) { return y.name === k.name })[0];
      if (!same) { var ids = {}; m.stock.forEach(function (i) { ids[i.id] = 1 }); if (!ids[k.id]) m.stock.push(k); return }
      var h = same.hist.slice(); k.hist.forEach(function (d) { if (h.indexOf(d) < 0) h.push(d) }); h.sort(); same.hist = h; same.bought = h[h.length - 1];
    });
    var seen = {}, fk = function (e) { return e.d + "|" + e.n + "|" + e.k + "|" + e.p };
    (m.fl || []).forEach(function (e) { seen[fk(e)] = 1 }); (x.fl || []).forEach(function (e) { if (!seen[fk(e)]) { m.fl = m.fl || []; m.fl.push(e) } });
    if (!m.budget) m.budget = x.budget;
    if (x.memo && x.memo !== m.memo) m.memo = (m.memo ? m.memo + "\n---\n" : "") + x.memo; m.memo = m.memo.slice(0, 5000);
    ["meals", "trash", "codes"].forEach(function (k) { Object.keys(x[k]).forEach(function (i) { if (!(i in m[k])) m[k][i] = x[k][i] }) });
    return sanitizeState(m).state;
  }
  function useState(st, msg) { S = st; rollover(); $("memo").value = S.memo; renderAll(); setSync(msg) }
  function askMerge(localS, cloud) {
    var backup = JSON.stringify(localS); try { localStorage.setItem("ls_backup_login", backup) } catch (e) { }
    syncPaused = true;
    function adopt(st, msg) { syncPaused = false; useState(st, msg); showToast(msg, function () { S = withDef(JSON.parse(backup)); save(); renderAll(); $("memo").value = S.memo }) }
    openDialog({ title: "データの扱いを選んでください", noEsc: true,
      msg: "この端末のデータと、クラウドのデータが、ちがっています。\nこの端末:" + sumTxt(localS) + "\nクラウド:" + sumTxt(cloud) + "\nどれを使いますか?(選んだあとも、「元に戻す」で、この端末のデータに戻せます)",
      buttons: [{ label: "クラウドのデータを使う", fn: function () { adopt(cloud, "クラウドのデータを使いました") } }, { label: "この端末のデータを使う", fn: function () { adopt(localS, "この端末のデータを使いました") } }, { label: "両方を統合する(おすすめ)", primary: true, fn: function () { adopt(mergeStates(localS, cloud), "両方のデータを統合しました") } }] });
  }
  function loadCloud() {
    setSync("読み込み中…");
    return F.getDoc(F.doc(db, "users", cuid)).then(function (snap) {
      if (!snap.exists()) { save(); return }
      var cloud = sanitizeState(snap.data()).state, localS = sanitizeState(S).state, mine = false;
      try { mine = localStorage.getItem("ls_sync_uid") === cuid && localStorage.getItem("ls_dirty") !== "1" } catch (e) { }
      if (!hasData(localS) || mine || JSON.stringify(localS) === JSON.stringify(cloud)) useState(cloud, "クラウドと同期しました"); else askMerge(localS, cloud);
    }).then(function () { showBanner(""); maybeIntro() }).catch(function () {
      setSync("読み込めませんでした");
      showBanner("クラウドのデータを読み込めませんでした。通信やFirestoreのルールを確認して、「もう一度読み込む」を押してください。", loadCloud, "もう一度読み込む");
    });
  }

  /* ログイン画面のボタンは、Firebaseの読み込みを待たずに先に登録する */
  $("guestBtn").addEventListener("click", function () { setTimeout(maybeIntro, 300); show("login", false); show("loginBtn", true); setSync("ログインしていません(この端末にのみ保存)") });
  $("loginBtn").addEventListener("click", function () { if (!auth) { info("クラウドに接続できません。通信を確認して、もう一度お試しください。", "ログインできません"); return } show("login", true) });
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
    (cuid ? push() : Promise.resolve()).catch(function () { }).then(function () { return A.signOut(auth) }).then(function () { try { localStorage.removeItem(K); localStorage.removeItem("ls_sync_uid"); localStorage.removeItem("ls_dirty") } catch (x) { } location.reload() });
  });

  /* ログインを残すための工夫と、残らない原因のお知らせ */
  function keepLogin() {
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist() } catch (e) { }   /* ブラウザに、データを消さないよう頼む */
    var msg = "", ua = navigator.userAgent || "";
    try { localStorage.setItem("ls_t", "1"); localStorage.removeItem("ls_t") } catch (e) { msg = "このブラウザでは、データを保存できないため、ログインが残りません。プライベートモードをやめるか、SafariかChromeで開いてください" }
    if (!msg && !window.indexedDB) msg = "このブラウザでは、ログインを保存できません。SafariかChromeで開いてください";
    if (!msg && /Line\/|FBAN|FBAV|Instagram|Twitter|MicroMessenger|KAKAOTALK/i.test(ua)) msg = "アプリの中のブラウザでは、ログインが残らないことがあります。SafariかChromeで開いて、ホーム画面に追加すると安心です";
    if ($("authInfo")) $("authInfo").textContent = msg;
  }
  try { $("authMail").value = localStorage.getItem("ls_mail") || "" } catch (e) { }   /* メールアドレスは、覚えておく */
  Promise.all([import(BASE + "firebase-app.js"), import(BASE + "firebase-auth.js"), import(BASE + "firebase-firestore.js")]).then(function (m) {
    A = m[1]; F = m[2]; var app = m[0].initializeApp(CFG); auth = A.getAuth(app); db = F.getFirestore(app);
    A.setPersistence(auth, A.indexedDBLocalPersistence).catch(function () { return A.setPersistence(auth, A.browserLocalPersistence) }).catch(function () { });   /* ログインを、このブラウザに残す */
    A.onAuthStateChanged(auth, function (u) {
      if (!u) { cuid = null; show("login", true); show("logoutBtn", false); show("loginBtn", true); return }
      cuid = u.uid; try { localStorage.setItem("ls_mail", u.email || "") } catch (e) { } keepLogin(); show("login", false); show("logoutBtn", true); show("loginBtn", false); setSync("読み込み中…");
      loadCloud();
    });
  }).catch(function () { setSync("クラウドに接続できません(この端末にのみ保存中)"); setTimeout(maybeIntro, 300) });
})();

/* ---- あいさつの表示 ---- */
(function () {
  var h = new Date().getHours(), g = h < 5 ? "こんばんは" : h < 11 ? "おはようございます" : h < 17 ? "こんにちは" : "こんばんは";
  var t = document.querySelector(".tagline"); if (t) t.textContent = g + "。今日のことは、ここにぜんぶ。";

  /* ---- ホーム画面に追加できる・オフラインでも開ける(sw.js が担当) ---- */
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    var regSW = function () { navigator.serviceWorker.register("sw.js").catch(function () { }) };
    if (document.readyState === "complete") regSW(); else window.addEventListener("load", regSW);
  }
})();
