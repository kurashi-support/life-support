/* 毎日17時ごろ、GitHub Actions から動く。期限の前日の分を、1人につき1通にまとめて、Web Push で送る。
   必要な環境変数: FIREBASE_SERVICE_ACCOUNT(JSON)、VAPID_PUBLIC_KEY、VAPID_PRIVATE_KEY
   DRY_RUN=1 のときは、送らずに、文面だけを表示する。 */
import admin from "firebase-admin";
import webpush from "web-push";
import { buildMessage } from "./message.js";

const dry = process.env.DRY_RUN === "1";
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
webpush.setVapidDetails("https://kurashi-support.github.io/life-support/", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
const db = admin.firestore();
let sent = 0, skipped = 0, failed = 0, removed = 0;

const snaps = await db.collection("pushSubs").get();
for (const doc of snaps.docs) {
  const uid = doc.id, d = doc.data() || {}, subs = d.subs || {}, notified = d.notified || {};
  const built = buildMessage(d.items || [], notified);
  if (!built || !Object.keys(subs).length) { skipped++; continue; }
  const msg = built.msg; let ok = 0;
  for (const [id, s] of Object.entries(subs)) {
    if (dry) { console.log("[DRY]", uid.slice(0, 6), id, JSON.stringify(msg)); sent++; ok++; continue; }
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(msg), { TTL: 6 * 3600, urgency: "normal" });
      sent++; ok++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {   // 端末側で通知が解除された → 宛先を消す
        await doc.ref.update({ ["subs." + id]: admin.firestore.FieldValue.delete() }); removed++;
      } else { failed++; console.error("送信できませんでした:", uid.slice(0, 6), id, e.statusCode || "", String(e.body || e.message).slice(0, 200)); }
    }
  }
  if (ok > 0 && !dry) {   // 1回でも届けられたら、「通知ずみ」にする(同じものは、もう送らない)。30日より古い記録は消す
    const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), upd = {};
    for (const k of built.keys) upd["notified." + k] = today;
    for (const [k, v] of Object.entries(notified)) if (v < new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)) upd["notified." + k] = admin.firestore.FieldValue.delete();
    await doc.ref.update(upd);
  }
}
console.log(JSON.stringify({ users: snaps.size, sent, skipped_no_content: skipped, removed_dead: removed, failed }));
if (failed > 0) process.exitCode = 1;
