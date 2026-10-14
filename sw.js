/* Life Support: オフラインでも開けるようにするための、サービスワーカー
   考え方: ネットがあるときは、いつも最新のファイルを取りに行く(古い版が残らない)。
           ネットがないときだけ、前に保存したファイルを使う。
   Firebase・フォント・AIなど、外部の通信には、いっさい触らない。 */
const CACHE = "life-support-v1";   /* 保存するファイルの一覧を変えたときは、この番号を上げる */
const SHELL = ["./", "index.html", "style.css", "script.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"];
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
