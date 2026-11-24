/* 夕方17時の通知の、文面をつくる。
   items: アプリが保存した一覧 [{k:"f"(冷蔵庫)|"s"(日用品), id, n:名前, d:期限か買い時の日付}]
   notified: すでに通知したもの { キー: 通知した日 }
   ルール: 「明日が期限」(前日)になったものを、1回だけ、まとめて1通で知らせる。
           前日の通知が飛んだときのために、「今日が期限」のものも、まだ知らせていなければ知らせる。 */
export function ymdJst(d) { return new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10) }
export const keyOf = it => (it.k + ":" + it.id + ":" + it.d).replace(/[.~*\/\[\]]/g, "_");   // Firestoreの項目名に使える形
export function buildMessage(items, notified = {}, now = new Date()) {
  const today = ymdJst(now), tomorrow = ymdJst(new Date(now.getTime() + 864e5));
  const fresh = (items || []).filter(it => it && it.n && it.d && (it.d === today || it.d === tomorrow) && !notified[keyOf(it)]);
  const names = a => { const n = a.map(i => i.n); return n.slice(0, 3).join("・") + (n.length > 3 ? " ほか" + (n.length - 3) + "件" : "") };
  const pick = (k, d) => fresh.filter(i => i.k === k && i.d === d);
  const rows = [];
  const add = (label, arr) => { if (arr.length) rows.push({ text: label + names(arr), arr }) };
  add("明日期限の商品があります:", pick("f", tomorrow));
  add("今日期限の商品があります:", pick("f", today));
  add("日用品の買い時は明日です:", pick("s", tomorrow));
  add("日用品の買い時は今日です:", pick("s", today));
  if (!rows.length) return null;
  const shown = rows.slice(0, 3);   // 通知は、最大3行。4行目以降は、見せていないので、「通知ずみ」にはしない(次の日に回る)
  return { msg: { title: "Life Support", body: shown.map(r => r.text).join("\n"), tag: "expiry-" + today, url: "./" }, keys: shown.flatMap(r => r.arr).map(keyOf) };
}
