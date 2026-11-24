/* Life Support: オフラインでも開けるようにするための、サービスワーカー
   考え方: ネットがあるときは、いつも最新のファイルを取りに行く(古い版が残らない)。
           ネットがないときだけ、前に保存したファイルを使う。
   Firebase・フォント・AIなど、外部の通信には、いっさい触らない。
   通知(Web Push)は、下の push と notificationclick で、受け取って表示する。 */
const CACHE = "life-support-v2";   /* 保存するファイルの一覧を変えたときは、この番号を上げる */
const SHELL = ["./", "index.html", "style.css", "script.js", "push.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"];
function key(url) { const u = new URL(url); return u.origin + u.pathname }   /* ?v=○ の違いを、同じものとして扱う */
self.addEventListener("install", e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(
    fetch(r).then(res => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(key(r.url), cp)) } return res })
      .catch(() => caches.match(key(r.url)).then(m => m || (r.mode === "navigate" ? caches.match(key(new URL("index.html", location).href)) : Response.error())))
  );
});

/* ---- 通知(毎朝、GitHub Actions から届く) ---- */
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {} } catch (_) { d = { body: e.data ? e.data.text() : "" } }
  e.waitUntil(self.registration.showNotification(d.title || "Life Support", {   /* 届いたら、必ず表示する(iPhoneの決まり) */
    body: d.body || "", icon: "icon-192.png", badge: "icon-192.png", tag: d.tag || "life-support", data: { url: d.url || "./" }
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url.startsWith(self.registration.scope) && "focus" in c) return c.focus();
    return clients.openWindow(url);
  }));
});
