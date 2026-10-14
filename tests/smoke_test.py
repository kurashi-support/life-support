"""Life Support の自動テスト(簡易版)

使い方:  python tests/smoke_test.py      (準備は tests/README.md を見てください)
結果:    「合格」「不合格」を1項目ずつ表示します。不合格が1つでもあると、終了コードが1になります。
注意:    Firebase と AI は、「本物のように動く代用品(スタブ)」で試します。
         本物の Firebase・本物のAIでの確認では、ありません。
"""
import json, pathlib, datetime, calendar, threading, socketserver, http.server, shutil, tempfile, sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = (ROOT / "index.html").as_uri()
TMP = pathlib.Path(tempfile.mkdtemp())
EMPTY = {"budget": 0, "exp": [], "todos": [], "rec": [], "meals": {}, "sched": [], "fridge": [], "memo": "", "shop": [], "trash": {}, "fixed": [], "stock": [], "codes": {}}
results = []

def check(name, ok, detail=""):
    results.append((name, bool(ok)))
    print(("合格  " if ok else "不合格") + " - " + name + ("  [" + str(detail) + "]" if detail != "" else ""))

def st(**kw):
    s = json.loads(json.dumps(EMPTY)); s.update(kw); return s

# ---- Firebase・AI の代用品(スタブ) ----
STUB_APP = "export function initializeApp(c){return {c:c}} export function getApp(){return {}}"
STUB_AUTH = """const fb=globalThis.__fb;
export function getAuth(){return {}} export const indexedDBLocalPersistence={}, browserLocalPersistence={};
export function setPersistence(){return Promise.resolve()}
export function onAuthStateChanged(a,cb){fb.cb=cb;setTimeout(function(){cb(fb.user)},0);return function(){}}
export function signInWithEmailAndPassword(){return Promise.resolve({})} export function createUserWithEmailAndPassword(){return Promise.resolve({})}
export function signOut(){return Promise.resolve()} export function sendPasswordResetEmail(){return Promise.resolve()}"""
STUB_FS = """const fb=globalThis.__fb;
export function getFirestore(){return {}} export function doc(db,col,id){return {col:col,id:id}}
export function getDoc(ref){if(fb.failLoad)return Promise.reject(new Error('load'));var d=fb.cloud[ref.id];return Promise.resolve({exists:function(){return d!==undefined},data:function(){return d}})}
export function setDoc(ref,data){if(fb.failSave)return Promise.reject(new Error('save'));fb.cloud[ref.id]=JSON.parse(JSON.stringify(data));fb.saves=(fb.saves||0)+1;return Promise.resolve()}"""
STUB_AI = """const fb=globalThis.__fb;
export class Schema{static object(){return {}} static string(){return {}} static number(){return {}} static boolean(){return {}} static array(){return {}}}
export class GoogleAIBackend{} export const ThinkingLevel={LOW:'LOW',MEDIUM:'MEDIUM',MINIMAL:'MINIMAL'};
export function getAI(){fb.calls.push('getAI');return {}}
export function getGenerativeModel(ai,o){var tc=o.generationConfig.thinkingConfig||null;
  return {generateContent:function(parts){fb.calls.push('generate:'+(tc?tc.thinkingLevel:'plain'));
    return Promise.resolve({response:{text:function(){return JSON.stringify({store:'店',total:854,subtotal:854,taxIncluded:true,items:[{name:'牛乳 1L',price:198,rate:8,kind:'食材'},{name:'シャンプー',price:398,rate:10,kind:'日用品'},{name:'卵 10個',price:258,rate:8,kind:'食材'}]})}}})}}}"""
STUB_AC = """const fb=globalThis.__fb;
export class ReCaptchaEnterpriseProvider{constructor(k){fb.calls.push('provider')}}
export function initializeAppCheck(){fb.calls.push('appcheck');return {}}"""
STUBS = (("firebase-app.js", STUB_APP), ("firebase-auth.js", STUB_AUTH), ("firebase-firestore.js", STUB_FS), ("firebase-ai.js", STUB_AI), ("firebase-app-check.js", STUB_AC))

def new(p, state=None, ls=None, fb=None, time=None, w=390, h=844, dark=False, src=SRC, local=True):
    b = p.chromium.launch(); c = b.new_context(viewport={"width": w, "height": h}, color_scheme="dark" if dark else "light"); pg = c.new_page()
    def route(r):
        u = r.request.url
        if u.startswith("file:") or u.startswith("http://127.0.0.1"): return r.continue_()
        for name, body in STUBS:
            if fb is not None and u.endswith(name): return r.fulfill(content_type="application/javascript", body=body)
        return r.abort()
    pg.route("**/*", route)
    if time: pg.clock.install(time=time)
    init = "localStorage.setItem('ls_intro','1');"
    if state is not None: init += "localStorage.setItem('ls2',%s);" % json.dumps(json.dumps(state))
    for k, v in (ls or {}).items(): init += "localStorage.setItem(%s,%s);" % (json.dumps(k), json.dumps(v))
    if fb is not None: init += "globalThis.__fb=%s;" % json.dumps(fb)
    pg.add_init_script("if(!localStorage.getItem('ls_boot')){localStorage.setItem('ls_boot','1');" + init + "}")
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:120]))
    pg.goto(src); pg.wait_for_timeout(600)
    return b, pg, errs

def S(pg): return pg.evaluate("JSON.parse(localStorage.getItem('ls2'))")
def today(pg): return pg.evaluate("(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')})()")
def dlgfill(pg, f, v): pg.fill('#dlgBody [data-field="%s"]' % f, str(v))
def dlgbtn(pg, label): pg.click('#dlgBtns button:has-text("%s")' % label)
def add_exp(pg, v):
    pg.fill('#expAmt', v); pg.click('#expForm button.btn'); pg.wait_for_timeout(80)

def run(p):
    b, pg, errs = new(p); T = today(pg)
    d = datetime.date.fromisoformat(T); ago = lambda n: (d - datetime.timedelta(n)).isoformat(); fut = lambda n: (d + datetime.timedelta(n)).isoformat()
    check("起動: 画面が出て、JSエラーがない", pg.title() == "Life Support" and pg.is_visible('#sum') and not errs, errs[:1] or "")
    # --- 安全性 ---
    PAY = '<img src=x onerror="window.__xss=(window.__xss||0)+1">'
    pg.fill('#todoIn', PAY); pg.click('#todoForm button.btn'); pg.fill('#expAmt', '100'); pg.fill('#expMemo', PAY); pg.click('#expForm button.btn')
    pg.click('.tab[data-t="meal"]'); pg.fill('#frName', PAY); pg.click('#frForm button.btn'); pg.wait_for_timeout(100)
    check("安全性: 入力した HTML 文字列は、実行されず、文字として扱われる", not pg.evaluate("window.__xss||0") and pg.evaluate("document.querySelectorAll('img[src=x]').length") == 0)
    b.close()
    evil = st(todos=[{"id": "t\" autofocus onfocus=\"window.__xss=7\" x=\"", "text": "a", "done": False, "date": T}])
    (TMP / "evil.json").write_text(json.dumps(evil))
    b, pg, errs = new(p); pg.set_input_files('#importFile', str(TMP / "evil.json")); pg.wait_for_timeout(400)
    if pg.is_visible('#dlg'): dlgbtn(pg, "読み込む"); pg.wait_for_timeout(400)
    check("安全性: 改ざんした id のバックアップで、スクリプトが実行されない", pg.evaluate("document.querySelectorAll('[onfocus]').length") == 0 and not pg.evaluate("window.__xss||0"))
    b.close()
    for label, obj in (("exp が文字列", {"todos": [], "exp": "x"}), ("fridge が null", {"todos": [], "fridge": None})):
        b, pg, errs = new(p); (TMP / "bad.json").write_text(json.dumps(obj))
        pg.set_input_files('#importFile', str(TMP / "bad.json")); pg.wait_for_timeout(400)
        if pg.is_visible('#dlg') and pg.is_visible('#dlgBtns button:has-text("読み込む")'): dlgbtn(pg, "読み込む"); pg.wait_for_timeout(300)
        pg.click('.tab[data-t="meal"]'); pg.fill('#frName', '卵'); pg.click('#frForm button.btn'); add_exp(pg, '100') if False else None
        s = S(pg); check("データ保護: 壊れたバックアップ(%s)でも、データが壊れない" % label, isinstance(s["exp"], list) and isinstance(s["fridge"], list) and not errs, errs[:1] or "")
        b.close()
    # --- 入力の検証 ---
    b, pg, errs = new(p); res = {}
    for v in ["", "0", "-5", "1.5", "1e3", "99999999999999999999", "0012", "100000000", "100000001"]:
        n0 = len(S(pg)["exp"]); add_exp(pg, v); res[v or "(空欄)"] = (S(pg)["exp"][-1]["amt"] if len(S(pg)["exp"]) > n0 else None)
    ok = all(res[k] is None for k in ["(空欄)", "0", "-5", "1.5", "1e3", "99999999999999999999", "100000001"]) and res["0012"] == 12 and res["100000000"] == 100000000
    check("入力の検証: 金額(空欄・0・負数・小数・1e3・巨大・上限ちょうど・上限超過)", ok, res if not ok else "")
    check("入力の検証: 文字数の上限(ToDo は100字)", pg.evaluate("document.getElementById('todoIn').maxLength") == 100)
    b.close()
    # --- バックアップの往復 ---
    b, pg, errs = new(p); pg.fill('#todoIn', '往復'); pg.click('#todoForm button.btn'); add_exp(pg, '777'); pg.click('.tab[data-t="meal"]'); pg.fill('#frName', '卵'); pg.click('#frForm button.btn'); pg.wait_for_timeout(150)
    with pg.expect_download() as di: pg.click('#exportBtn')
    shutil.copy(di.value.path(), TMP / "bk.json"); data = json.load(open(TMP / "bk.json")); b.close()
    b, pg, errs = new(p); pg.set_input_files('#importFile', str(TMP / "bk.json")); pg.wait_for_timeout(400); dlgbtn(pg, "読み込む"); pg.wait_for_timeout(400); s2 = S(pg)
    check("バックアップ: 書き出して、別の環境で読み込める", len(s2["exp"]) == len(data["exp"]) and [t["text"] for t in s2["todos"]] == [t["text"] for t in data["todos"]] and [f["name"] for f in s2["fridge"]] == [f["name"] for f in data["fridge"]], errs[:1] or "")
    b.close()
    # --- 支出の編集ダイアログ・キーボード ---
    b, pg, errs = new(p, st(exp=[{"id": "e1", "date": T, "amt": 680, "memo": "コンビニ", "cat": "食費"}]))
    pg.click('.tab[data-t="money"]'); pg.focus('#mList button[data-a="eedit"]'); pg.keyboard.press("Enter"); pg.wait_for_timeout(150)
    inside = pg.evaluate("document.getElementById('dlg').contains(document.activeElement)")
    dlgfill(pg, "amt", "1e3"); dlgbtn(pg, "保存"); bad_kept = pg.is_visible('#dlg') and "金額" in pg.inner_text('#dlgErr')
    dlgfill(pg, "amt", "1,200"); dlgbtn(pg, "保存"); pg.wait_for_timeout(150)
    check("ダイアログ: 支出の編集(不正な金額は開いたまま、正しければ保存)", inside and bad_kept and S(pg)["exp"][0]["amt"] == 1200)
    pg.focus('#mList button[data-a="eedit"]'); pg.keyboard.press("Enter"); pg.wait_for_timeout(100); pg.keyboard.press("Escape"); pg.wait_for_timeout(100)
    check("キーボード: Esc でダイアログが閉じ、フォーカスが元のボタンに戻る", not pg.is_visible('#dlg') and pg.evaluate("document.activeElement.dataset.a") == "eedit")
    b.close()
    # --- 今日使えるお金 ---
    for iso in ("2026-10-01T10:00:00", "2026-10-31T10:00:00", "2028-02-29T10:00:00"):
        dd = datetime.date.fromisoformat(iso[:10]); e = [{"id": "a", "date": iso[:8] + "01", "amt": 3200, "memo": "", "cat": "食費"}, {"id": "b", "date": iso[:10], "amt": 1960, "memo": "", "cat": "食費"}]
        b, pg, errs = new(p, st(budget=90000, exp=e, fixed=[{"id": "f", "name": "家賃", "amt": 55200, "day": 27}]), time=iso)
        left = calendar.monthrange(dd.year, dd.month)[1] - dd.day + 1; before = sum(x["amt"] for x in e if x["date"] != iso[:10]); spent_today = sum(x["amt"] for x in e if x["date"] == iso[:10]); exp_ = (90000 - 55200 - before) // left - spent_today
        shown = pg.inner_text('#moneyAmt').replace("\n", "").replace(",", "").replace("円", "").strip()
        check("計算: 今日使えるお金(%s)が、式どおり" % iso[:10], shown == str(exp_), "画面 %s / 期待 %s" % (shown, exp_)); b.close()
    # --- 冷蔵庫 ---
    b, pg, errs = new(p, st(fridge=[{"id": "o1", "name": "ヨーグルト", "exp": ago(3), "est": True}, {"id": "o2", "name": "豆腐", "exp": ago(3), "est": True}, {"id": "n1", "name": "牛乳", "exp": fut(5), "est": False}]))
    pg.click('.tab[data-t="meal"]'); pg.fill('#frName', '牛乳 1L'); pg.click('#frForm button.btn'); pg.wait_for_timeout(100)
    added = [f for f in S(pg)["fridge"] if f["name"] == "牛乳 1L"][0]
    check("冷蔵庫: 賞味期限が空なら、食材から目安を自動で入れる(牛乳=7日)", added["est"] is True and added["exp"] == fut(7), added)
    pg.click('#frSelBtn'); pg.click('#frExpired'); n_sel = pg.inner_text('#frDel'); pg.click('#frDel'); pg.wait_for_timeout(150); left_names = [f["name"] for f in S(pg)["fridge"]]
    pg.click('#toastUndo'); pg.wait_for_timeout(150)
    check("冷蔵庫: 期限切れをまとめて消せて、「元に戻す」で戻る", "(2)" in n_sel and "ヨーグルト" not in left_names and len(S(pg)["fridge"]) == 4, n_sel); b.close()
    # --- 日用品: 季節 ---
    for iso, days in (("2026-08-15T10:00:00", 38), ("2027-01-15T10:00:00", 50)):
        b, pg, errs = new(p, st(), time=iso); pg.click('.tab[data-t="shop"]'); pg.fill('#stName', 'シャンプー'); pg.click('#stockForm button.btn'); pg.wait_for_timeout(100)
        check("日用品: 季節による目安(%s → %d日)" % (iso[:10], days), ("目安 %d日" % days) in pg.inner_text('#stockList'), pg.inner_text('#stockList').replace("\n", " ")[:60]); b.close()
    # --- 今日の生活アシスト ---
    b, pg, errs = new(p, st(fridge=[{"id": "f1", "name": "卵", "exp": fut(1), "est": True}], stock=[{"id": "k", "name": "洗剤", "bought": ago(60), "hist": [ago(60)], "base": 40, "cycle": 40}]))
    kinds = pg.evaluate("[...document.querySelectorAll('#assistList li.as')].map(l=>l.dataset.k)")
    pg.click('#assistList li[data-k=food] button[data-as=later]'); pg.wait_for_timeout(150); kinds2 = pg.evaluate("[...document.querySelectorAll('#assistList li.as')].map(l=>l.dataset.k)")
    check("アシスト: 期限が近い食材・買い時の日用品が出て、「あとで」で消える", kinds[:2] == ["food", "stock"] and "food" not in kinds2, (kinds, kinds2)); b.close()
    b, pg, errs = new(p, st()); check("アシスト: データがないとき、作り話をしない(予算の案内だけ)", pg.evaluate("[...document.querySelectorAll('#assistList li.as')].map(l=>l.dataset.k)") == ["setup"]); b.close()
    # --- レシートの二重登録 ---
    b, pg, errs = new(p, st(exp=[{"id": "e1", "date": T, "amt": 680, "memo": "コンビニ", "cat": "食費"}]))
    pg.click('.tab[data-t="money"]'); pg.click('#rcManual'); pg.click('#rcNew'); pg.fill('input[data-n="0"]', '牛乳'); pg.fill('input[data-p="0"]', '680'); pg.fill('#rcTotal', '680'); pg.click('#rcAdd'); pg.wait_for_timeout(150)
    warn = pg.is_visible('#dlg') and "すでにあります" in pg.inner_text('#dlgMsg'); n0 = len(S(pg)["exp"]); dlgbtn(pg, "戻って直す"); stayed = len(S(pg)["exp"]) == n0
    check("レシート: 同じ日・同じ金額の二重登録を、警告する", warn and stayed); b.close()
    b, pg, errs = new(p)
    cur0 = pg.evaluate("document.querySelector('.tab[aria-current=page]').dataset.t"); pg.click('.tab[data-t="shop"]'); cur1 = pg.evaluate("document.querySelector('.tab[aria-current=page]').dataset.t")
    check("読み上げ対応: メニューは、「いま開いているページ」(aria-current)を伝える", cur0 == "home" and cur1 == "shop" and pg.evaluate("document.querySelectorAll('[role=tab]').length") == 0); b.close()
    # --- 画面幅 ---
    s = st(budget=100000, todos=[{"id": "t%d" % i, "text": "や%d" % i, "done": False, "date": ago(i)} for i in range(6)], fridge=[{"id": "f", "name": "卵", "exp": ago(1), "est": True}])
    bad = []
    for w in (320, 390, 768, 1280):
        b, pg, errs = new(p, s, w=w)
        for t in ("home", "meal", "shop", "money", "help"):
            pg.click('.tab[data-t="%s"]' % t); pg.wait_for_timeout(60)
            if pg.evaluate("document.documentElement.scrollWidth") > w: bad.append((w, t))
        b.close()
    check("表示: 画面幅 320・390・768・1280px で、横にはみ出さない(全5タブ)", not bad, bad)
    # --- ログイン関連(代用品) ---
    local = st(todos=[{"id": "L1", "text": "この端末のToDo", "done": False, "date": T}], memo="端末のメモ")
    cloud = st(todos=[{"id": "C1", "text": "クラウドのToDo", "done": False, "date": T}], memo="クラウドのメモ")
    FB = lambda **kw: dict({"user": {"uid": "u_a", "email": "a@x.com"}, "cloud": {"u_a": cloud}, "saves": 0, "calls": []}, **kw)
    b, pg, errs = new(p, local, fb=FB())
    shown = pg.is_visible('#dlg') and pg.inner_text('#dlgT') == "データの扱いを選んでください"; saves0 = pg.evaluate("__fb.saves")
    dlgbtn(pg, "両方を統合する"); pg.wait_for_timeout(1500); s2 = S(pg)
    check("ログイン(代用品): ゲストとクラウドのデータがちがうとき、選択画面が出て、選ぶまで上書きしない", shown and saves0 == 0)
    check("ログイン(代用品): 「統合」で、両方のデータが残り、クラウドにも保存される", {t["text"] for t in s2["todos"]} == {"この端末のToDo", "クラウドのToDo"} and pg.evaluate("__fb.saves") >= 1)
    pg.click('#toastUndo'); pg.wait_for_timeout(1200); check("ログイン(代用品): 「元に戻す」で、この端末のデータに戻る", [t["text"] for t in S(pg)["todos"]] == ["この端末のToDo"]); b.close()
    b, pg, errs = new(p, st(), fb=FB(cloud={"u_a": st()}, failSave=True)); pg.fill('#todoIn', 'x'); pg.click('#todoForm button.btn'); pg.wait_for_timeout(1500)
    shown = pg.is_visible('#banner'); pg.evaluate("__fb.failSave=false"); pg.click('#bannerBtn'); pg.wait_for_timeout(600)
    check("保存失敗(代用品): 目立つ通知が出て、再試行で成功すると消える", shown and not pg.is_visible('#banner') and len(pg.evaluate("__fb.cloud.u_a.todos")) == 1); b.close()
    # --- AI読み取り(代用品) ---
    (TMP / "r.png").write_bytes(bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cfc0f01f0005000201a5f645400000000049454e44ae426082"))
    b, pg, errs = new(p, st(), ls={"ls_ai_ok": "1"}, fb={"user": None, "cloud": {}, "calls": []})
    if pg.is_visible('#guestBtn'): pg.click('#guestBtn')
    pg.click('.tab[data-t="money"]')
    with pg.expect_file_chooser() as fc: pg.click('#rcBtn')
    pg.wait_for_timeout(300); warmed = pg.evaluate("__fb.calls.slice()")
    fc.value.set_files(str(TMP / "r.png")); pg.wait_for_timeout(1500); calls = pg.evaluate("__fb.calls")
    items = pg.evaluate("[...document.querySelectorAll('#rcItems input[data-n]')].map(i=>i.value)")
    check("AI(代用品): 写真を選ぶ前に準備が始まり、App Check が AI より先に動く", "getAI" in warmed and calls.index("appcheck") < calls.index("getAI"), calls)
    check("AI(代用品): 読み取り結果が、画面に出る(品物3つ・入れ先つき)", items == ["牛乳 1L", "シャンプー", "卵 10個"] and pg.input_value('#rcTotal') == "854", items); b.close()
    # --- アプリ化(PWA) ---
    man = json.load(open(ROOT / "manifest.webmanifest", encoding="utf-8"))
    check("アプリ化: manifest とアイコンのファイルがそろっている", all((ROOT / i["src"]).exists() for i in man["icons"]) and (ROOT / "sw.js").exists() and man["display"] == "standalone")
    class Q(http.server.SimpleHTTPRequestHandler):
        def __init__(s, *a, **k): super().__init__(*a, directory=str(ROOT), **k)
        def log_message(s, *a): pass
    srv = socketserver.TCPServer(("127.0.0.1", 0), Q); threading.Thread(target=srv.serve_forever, daemon=True).start(); url = "http://127.0.0.1:%d/index.html" % srv.server_address[1]
    try:
        b, pg, errs = new(p, st(todos=[{"id": "o", "text": "オフラインでも残る", "done": False, "date": T}]), src=url)
        pg.evaluate("navigator.serviceWorker.ready.then(()=>1)"); pg.wait_for_timeout(1500); pg.reload(); pg.wait_for_timeout(800)
        pg.context.set_offline(True); pg.reload(); pg.wait_for_timeout(1000)
        check("アプリ化: ネットがなくても、アプリが開いて、データが見える", pg.title() == "Life Support" and "オフラインでも残る" in pg.inner_text("body"))
        b.close()
    finally: srv.shutdown()

with sync_playwright() as p: run(p)
ng = [n for n, ok in results if not ok]
print("\n合計 %d項目: 合格 %d / 不合格 %d" % (len(results), len(results) - len(ng), len(ng)))
sys.exit(1 if ng else 0)
