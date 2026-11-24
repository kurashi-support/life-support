/* 通知(Web Push)の、オン・オフ。ログイン中の人だけが使える。
   宛先は、Firestore の pushSubs/{uid} に保存する。毎朝の送信は、GitHub Actions(push/send.js)。 */
(function () {
  var VAPID = "BMSY0LASP11YGfpS5BHW8PgqARnbFut27zA5wi72fLnZ1IFeHZR5uDCKO5g2eVt1CNFKOVO3W_fQmO4saKdREgs";
  var BASE = "https://www.gstatic.com/firebasejs/12.19.0/";
  var foot = document.querySelector(".foot"), out = document.getElementById("logoutBtn");
  if (!foot || !out) return;
  var box = document.createElement("div"); box.id = "pushBox"; box.style.marginTop = "12px";
  box.innerHTML = '<p class="label" id="pushMsg"></p>' +
    '<button class="btn b-gh" id="pushBtn" type="button">通知をオンにする</button> ' +
    '<button class="btn b-gh" id="pushTest" type="button">通知のテスト</button>';
  out.parentNode.insertBefore(box, out.nextSibling);
  var msg = document.getElementById("pushMsg"), btn = document.getElementById("pushBtn"), tst = document.getElementById("pushTest");
  var ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  function say(t) { msg.textContent = t }
  if (!ok) {
    btn.classList.add("hidden"); tst.classList.add("hidden");
    say(/iPhone|iPad/.test(navigator.userAgent) ? "通知を使うには、Safariの共有ボタンから「ホーム画面に追加」して、そのアイコンから開いてください(iOS 16.4以上)" : "このブラウザでは、通知を使えません");
    return;
  }
  function b64(s) { var p = "=".repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")), u = new Uint8Array(r.length); for (var i = 0; i < r.length; i++) u[i] = r.charCodeAt(i); return u }
  function fb() {
    return Promise.all([import(BASE + "firebase-app.js"), import(BASE + "firebase-auth.js"), import(BASE + "firebase-firestore.js")]).then(function (m) {
      var app = m[0].getApp(); return { auth: m[1].getAuth(app), F: m[2], db: m[2].getFirestore(app) };
    });
  }
  function idOf(endpoint) {
    return crypto.subtle.digest("SHA-1", new TextEncoder().encode(endpoint)).then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ("0" + x.toString(16)).slice(-2) }).join("").slice(0, 16) });
  }
  function current() { return navigator.serviceWorker.ready.then(function (r) { return r.pushManager.getSubscription() }) }
  function refresh() {
    current().then(function (s) {
      var on = !!s && Notification.permission === "granted";
      btn.textContent = on ? "通知をオフにする" : "通知をオンにする"; btn.dataset.on = on ? "1" : "";
      say(Notification.permission === "denied" ? "通知がブロックされています。端末の設定で、このアプリの通知を許可してください" : on ? "通知はオンです。期限の前日の夕方(17時ごろ)に、1回だけお知らせします" : "通知はオフです(オンにすると、期限の前日の夕方に、1回だけお知らせします)");
    }).catch(function () { say("通知の状態を確認できませんでした") });
  }
  btn.addEventListener("click", function () {
    if (btn.dataset.on) {   // オフにする
      var sub; btn.disabled = true;
      current().then(function (s) { sub = s; return s ? idOf(s.endpoint) : null })
        .then(function (id) { return Promise.all([fb(), id]) })
        .then(function (r) { var u = r[0].auth.currentUser, id = r[1]; if (u && id) { var o = {}; o["subs." + id] = r[0].F.deleteField(); return r[0].F.updateDoc(r[0].F.doc(r[0].db, "pushSubs", u.uid), o).catch(function () { }) } })
        .then(function () { return sub && sub.unsubscribe() }).then(refresh).catch(function () { say("オフにできませんでした") }).then(function () { btn.disabled = false });
      return;
    }
    btn.disabled = true; say("確認しています…");
    Notification.requestPermission().then(function (p) {       // 許可の確認は、ボタンを押した直後に出す(iPhoneの決まり)
      if (p !== "granted") { say("通知が許可されませんでした"); return }
      return fb().then(function (f) {
        var u = f.auth.currentUser; if (!u) { say("通知を使うには、先にログインしてください(クラウド保存)"); return }
        return navigator.serviceWorker.ready.then(function (r) { return r.pushManager.getSubscription().then(function (s) { return s || r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(VAPID) }) }) })
          .then(function (s) {
            var j = s.toJSON();
            return idOf(s.endpoint).then(function (id) {
              var o = { subs: {} }; o.subs[id] = { endpoint: j.endpoint, keys: j.keys, ua: navigator.userAgent.slice(0, 120), at: new Date().toISOString() };
              return f.F.setDoc(f.F.doc(f.db, "pushSubs", u.uid), o, { merge: true });
            });
          }).then(function () { syncItems(); refresh() });
      });
    }).catch(function (e) { say("オンにできませんでした(" + (e && (e.code || e.message) || "不明") + ")") }).then(function () { btn.disabled = false });
  });
  tst.addEventListener("click", function () {   // サーバーを通さずに、この端末で、通知が出るかだけを試す
    Notification.requestPermission().then(function (p) {
      if (p !== "granted") { say("通知が許可されていません"); return }
      return navigator.serviceWorker.ready.then(function (r) { return r.showNotification("Life Support", { body: "明日期限の商品があります:牛乳・鶏肉\n日用品の買い時は明日です:シャンプー", icon: "icon-192.png", tag: "life-support-test" }) });
    }).catch(function () { say("テスト通知を出せませんでした") });
  });
  /* 期限・買い時の一覧(日付つき)を、クラウドに置く。送信側は、この日付だけを見る。通知がオンの端末があるときだけ、保存のたびに更新する */
  var syncT = null;
  function syncItems() {
    clearTimeout(syncT);
    syncT = setTimeout(function () {
      if (!window.lsNotifyItems || Notification.permission !== "granted") return;
      current().then(function (s) {
        if (!s) return;
        return fb().then(function (f) {
          var u = f.auth.currentUser; if (!u) return;
          return f.F.setDoc(f.F.doc(f.db, "pushSubs", u.uid), { items: window.lsNotifyItems(), itemsAt: new Date().toISOString() }, { merge: true });
        });
      }).catch(function () { });
    }, 3000);
  }
  window.lsOnSave = syncItems;
  navigator.serviceWorker.ready.then(function () { refresh(); syncItems() });
})();
