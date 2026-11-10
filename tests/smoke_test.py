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
  return {generateContent:function(parts){fb.calls.push('generate:'+(tc?tc.thinkingLevel:'plain'));if(fb.err){var e=new Error(fb.err.message);e.code=fb.err.code;if(fb.err.status)e.customErrorData={status:fb.err.status};return Promise.reject(e)}
    var rt=(fb.seq&&fb.seq.length)?fb.seq.shift():null;return Promise.resolve({response:{text:function(){if(rt!==null)return rt;return JSON.stringify(fb.resp||{store:'店',total:854,subtotal:854,taxIncluded:true,items:[{name:'牛乳 1L',price:198,rate:8,kind:'食材'},{name:'シャンプー',price:398,rate:10,kind:'日用品'},{name:'卵 10個',price:258,rate:8,kind:'食材'}]})}}})}}}"""
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
    # --- レシートの精度(本物のレシートと同じ形の、まいばす・外税8%の例) ---
    items9 = [("牛豚ミンチ(解凍)", 605), ("毎日のごはん(外国産米", 718), ("若どりもも肉角切り(解", 441), ("コクとキレのしょうゆヌ", 108), ("スパイシーカレーヌード", 108), ("たまご祭り 白", 199), ("シャウエッセン", 599), ("たまねぎ", 199), ("ごつ盛りソース焼そば", 139), ("カップヌードル", 159)]
    resp = {"store": "", "date": ago(23), "total": 3537, "subtotal": 3275, "taxIncluded": False, "items": [{"name": n, "price": v, "rate": 8, "kind": ""} for n, v in items9]}
    b, pg, errs = new(p, st(), ls={"ls_ai_ok": "1"}, fb={"user": None, "cloud": {}, "calls": [], "resp": resp})
    if pg.is_visible('#guestBtn'): pg.click('#guestBtn')
    pg.click('.tab[data-t="money"]'); pg.set_input_files('#rcFile', str(TMP / "r.png")); pg.wait_for_timeout(1500)
    prices = pg.evaluate("[...document.querySelectorAll('#rcItems input[data-p]')].map(i=>+i.value)")
    exact = [v * 1.08 for _, v in items9]
    check("精度: 外税8%のレシートで、税込の合計がレシートの合計(3,537円)と一致し、各品物のずれは1円未満", sum(prices) == 3537 and all(abs(a - b_) < 1 for a, b_ in zip(prices, exact)), prices)
    check("精度: レシートの日付を、支出の日付に入れ、画面で知らせる", pg.input_value('#rcDate') == ago(23) and "レシートの日付" in pg.inner_text('#rcMsg'), pg.input_value('#rcDate'))
    pg.click('#rcAdd'); pg.wait_for_timeout(300)
    s9 = S(pg)
    check("精度: 古い日付で期限が過ぎる食材は、冷蔵庫に入れず、そのことを知らせる(支出は、レシートの日付で登録)", s9["exp"][-1]["date"] == ago(23) and "冷蔵庫に入れませんでした" in pg.inner_text('#rcMsg'), pg.inner_text('#rcMsg')[:80]); b.close()
    OCR = "window.Tesseract={createWorker:function(){return Promise.resolve({setParameters:function(){return Promise.resolve()},recognize:function(){return Promise.resolve({data:{text:'%s'}})}})}};"
    d10 = d - datetime.timedelta(10); txt = "%d/%d/%d(土) 22:00\\n牛乳 598\\n卵 238\\n合計 53" % (d10.year, d10.month, d10.day)
    b, pg, errs = new(p, st()); pg.evaluate(OCR % txt); pg.click('.tab[data-t="money"]'); pg.set_input_files('#rcFile', str(TMP / "r.png")); pg.wait_for_timeout(500)
    dlgbtn(pg, "送らない"); pg.wait_for_timeout(1500)
    check("精度(簡易読み取り): 品物より小さい、おかしな合計は入れず、入力を求める", pg.input_value('#rcTotal') == "" and "合計を読み取れませんでした" in pg.inner_text('#rcMsg'), pg.input_value('#rcTotal'))
    check("精度(簡易読み取り): 文字から、レシートの日付を見つける", pg.input_value('#rcDate') == d10.isoformat(), pg.input_value('#rcDate')); b.close()
    # --- 端末内の簡易読み取り: まいばす(外税8%)の文字を、そのまま読ませる ---
    OCR2 = "window.Tesseract={createWorker:function(){return Promise.resolve({setParameters:function(){return Promise.resolve()},recognize:function(){return Promise.resolve({data:{text:%s}})}})}};"
    dd = d - datetime.timedelta(5); dstr = "%d/ %d/%d(土)" % (dd.year, dd.month, dd.day)
    T912 = "\n".join(["13:37 と 中", "登録番号 T10400091064592", "ルツ 0104 _ " + dstr + " 22:00", "取3398 責:1760924104", "1AEON会員:*ネネネネ****96644120", "マンゴー 598※", "しぼるだけホイップ 238※", "たまねぎ 199※", "シャウエッセン117g _ 259※", "にんじん 199※", "割引 30% -60", "ナッツベーコンのポテト _ 299※", "牛豚ミンチ (解凍) 322※", "豚肉ばらうす切り (解凍 227※", "こねぎカット 99※", "おろししょうが 105※", "かっぱえびぴぴせん 109※ A", "小計 ¥2594", "外税 8%対象額 ¥2,594", "外税 8% ¥207", "以下は従業員の指示に従って操作してください。"])
    b, pg, errs = new(p, st()); pg.evaluate(OCR2 % json.dumps(T912)); pg.click('.tab[data-t="money"]'); pg.set_input_files('#rcFile', str(TMP / "r.png")); pg.wait_for_timeout(500)
    dlgbtn(pg, "送らない"); pg.wait_for_timeout(1500)
    prices = pg.evaluate("[...document.querySelectorAll('#rcItems input[data-p]')].map(i=>+i.value)")
    base = [598, 238, 199, 259, 139, 299, 322, 227, 99, 105, 109]; exact = [v * 1.08 for v in base]
    check("簡易読み取り: 合計の行が読めなくても、小計+外税で合計(2,801円)を求める", pg.input_value('#rcTotal') == "2801", pg.input_value('#rcTotal'))
    check("簡易読み取り: 「割引」の行を、直前の品物から引き、税込に換算して、合計に合わせる", len(prices) == 11 and sum(prices) == 2801 and all(abs(a - b_) < 1 for a, b_ in zip(prices, exact)), prices)
    check("簡易読み取り: レシートの日付を、支出の日付に入れる", pg.input_value('#rcDate') == dd.isoformat(), pg.input_value('#rcDate')); b.close()
    T922 = "\n".join(["牛豚ミンチ (解凍) 605※", "毎日のごはん (外国産米 718※", "(2個 X 単359)", "若どりもも肉角切り (解 441※", "コクとキレのしょうゆヌ 108※", "スパイシーカレーヌード 108※", "たまご祭り 白 199※", "シャウエッセン 599※", "たまねぎ 199※", "ごつ盛りソース焼そば 139※", "カップヌードル 159※", "小計 ¥3,275", "外税 8%対象額 ¥3,275", "外税 8% ¥262", "合計 ¥3,537", "現金 ¥3,550", "お釣り ¥13"])
    b, pg, errs = new(p, st()); pg.evaluate(OCR2 % json.dumps(T922)); pg.click('.tab[data-t="money"]'); pg.set_input_files('#rcFile', str(TMP / "r.png")); pg.wait_for_timeout(500)
    dlgbtn(pg, "送らない"); pg.wait_for_timeout(1500)
    prices = pg.evaluate("[...document.querySelectorAll('#rcItems input[data-p]')].map(i=>+i.value)")
    check("簡易読み取り: 外税8%のレシート(10品)の、税込の合計が、3,537円に一致", pg.input_value('#rcTotal') == "3537" and sum(prices) == 3537 and len(prices) == 10, (pg.input_value('#rcTotal'), sum(prices), len(prices))); b.close()
    # --- 期限・買い時の通知(カレンダー用ファイル .ics) ---
    longname = "とても長い名前の食材" * 5   # 50文字(日本語は1文字3バイト → 折り返しが必要)
    s_cal = st(fridge=[{"id": "f1", "name": "牛乳", "exp": fut(6), "est": True}, {"id": "f2", "name": "卵", "exp": fut(2), "est": False}, {"id": "f3", "name": "ヨーグルト", "exp": ago(1), "est": True},
                       {"id": "f4", "name": "豆腐", "exp": "", "est": False}, {"id": "f5", "name": longname, "exp": fut(4), "est": False}],
               stock=[{"id": "k1", "name": "シャンプー", "bought": ago(30), "hist": [ago(30)], "base": 45, "cycle": 45, "manual": True},
                      {"id": "k2", "name": "洗剤", "bought": ago(60), "hist": [ago(60)], "base": 40, "cycle": 40, "manual": True}])
    b, pg, errs = new(p, s_cal); pg.click('.tab[data-t="meal"]'); pg.click('#remFr'); pg.wait_for_timeout(200)
    pg.select_option('#dlgBody [data-field="lead"]', "1"); pg.select_option('#dlgBody [data-field="hour"]', "8")
    only_fridge = pg.evaluate("[...document.querySelectorAll('#dlgBody .dlg-check input')].map(c=>c.checked)") == [True, False]   # 冷蔵庫のボタンからは、冷蔵庫だけが、最初に選ばれる
    pg.check('#dlgBody .dlg-check:nth-child(2) input')   # 日用品も、選ぶ
    with pg.expect_download() as di: dlgbtn(pg, "ファイルを作る")
    raw = pathlib.Path(di.value.path()).read_bytes(); ics = raw.decode("utf-8")   # 日本語が壊れていなければ、例外は出ない
    unfolded = ics.replace("\r\n ", ""); lines = unfolded.split("\r\n")
    uids = [l[4:] for l in lines if l.startswith("UID:")]; starts = sorted(l[8:] for l in lines if l.startswith("DTSTART:"))
    want = sorted(x.replace("-", "") + "T080000" for x in (fut(5), fut(1), fut(3), fut(14)))
    check("通知(.ics): 期限が先の食材と、買い時が先の日用品だけが、予定になる(4件)。期限切れ・期限なし・時刻が過ぎたものは、入らない", len(uids) == 4 and len(set(uids)) == 4 and starts == want and only_fridge, (len(uids), starts, only_fridge))
    check("通知(.ics): 1日前の8:00に通知される(DTSTART と、通知 VALARM がそろっている)", ics.count("BEGIN:VALARM") == 4 and ics.count("TRIGGER:PT0M") == 4 and ics.startswith("BEGIN:VCALENDAR") and ics.rstrip().endswith("END:VCALENDAR"))
    phys = ics.split("\r\n")
    check("通知(.ics): 改行が CRLF で、1行が75バイト以内、日本語の長い名前も、折り返して、元に戻る", "\n" not in ics.replace("\r\n", "") and all(len(l.encode("utf-8")) <= 75 for l in phys) and longname in unfolded)
    check("通知(.ics): 食材の予定には、「目安」と、実際の日付が入る", any(l.startswith("SUMMARY:【冷蔵庫】牛乳の賞味期限(目安)は ") for l in lines) and any(l.startswith("SUMMARY:【日用品】シャンプーの買い時(目安)は ") for l in lines))
    check("通知(.ics): 作ったあとの、お知らせに、時刻が過ぎて除いた件数が出る", "2件は、除きました" in pg.inner_text('#toastMsg'), pg.inner_text('#toastMsg')[:80]); b.close()
    b, pg, errs = new(p, st()); pg.click('.tab[data-t="shop"]'); pg.click('#remSt'); pg.wait_for_timeout(200); dlgbtn(pg, "ファイルを作る"); pg.wait_for_timeout(200)
    check("通知(.ics): 通知できるものがないときは、理由を出して、ファイルを作らない", pg.is_visible('#dlg') and "通知できるものが" in pg.inner_text('#dlgErr')); b.close()
    # --- カレンダー通知の手間を減らす: 前回の書き出しと比べて、更新をお知らせする ---
    kinds_of = lambda pg_: pg_.evaluate("[...document.querySelectorAll('#assistList li.as')].map(l=>l.dataset.k)")
    s_c2 = st(fridge=[{"id": "f1", "name": "牛乳", "exp": fut(6), "est": True}, {"id": "f2", "name": "卵", "exp": fut(2), "est": False}],
              stock=[{"id": "k1", "name": "シャンプー", "bought": ago(30), "hist": [ago(30)], "base": 45, "cycle": 45, "manual": True}])
    b, pg, errs = new(p, s_c2); k0 = kinds_of(pg)
    pg.click('.tab[data-t="meal"]'); pg.click('#remFr'); pg.wait_for_timeout(200); pg.check('#dlgBody .dlg-check:nth-child(2) input')
    with pg.expect_download() as di: dlgbtn(pg, "ファイルを作る")
    ics1 = pathlib.Path(di.value.path()).read_bytes().decode("utf-8"); pg.wait_for_timeout(300); k1 = kinds_of(pg)
    check("通知の更新: まだ書き出していないとき・書き出した直後は、「カレンダーの更新」を出さない", "calendar" not in k0 and "calendar" not in k1, (k0, k1))
    check("通知(.ics): 更新だと、カレンダーに伝わるように、SEQUENCE と LAST-MODIFIED が入る", ics1.count("SEQUENCE:") == 3 and ics1.count("LAST-MODIFIED:") == 3 and all(l[9:].isdigit() for l in ics1.split("\r\n") if l.startswith("SEQUENCE:")))
    pg.evaluate("(()=>{const s=JSON.parse(localStorage.getItem('ls2')); s.fridge=s.fridge.filter(f=>f.id!=='f2'); s.fridge.find(f=>f.id==='f1').exp='%s'; s.fridge.push({id:'f9',name:'パン',exp:'%s',est:true}); localStorage.setItem('ls2',JSON.stringify(s))})()" % (fut(9), fut(5)))
    pg.reload(); pg.wait_for_timeout(700); pg.click('.tab[data-t="home"]'); k2 = kinds_of(pg)
    why = pg.inner_text('#assistList li[data-k=calendar] .why') if "calendar" in k2 else ""
    check("通知の更新: 食材を変えると、「カレンダーの更新」が出て、日付が変わった・なくなった・増えた件数が分かる", "calendar" in k2 and "日付が変わったもの 1件" in why and "なくなったもの 1件" in why and "新しく増えたもの 1件" in why, why[:80])
    pg.click('#assistList li[data-k=calendar] button[data-run=calstale]'); pg.wait_for_timeout(200); stale = pg.inner_text('#dlgMsg'); dlgbtn(pg, "閉じる")
    check("通知の更新: 「消す予定を見る」で、カレンダーから消す食材の名前(卵・牛乳)が出る", "卵" in stale and "牛乳" in stale and "パン" not in stale, stale.replace("\n", " / ")[:80])
    with pg.expect_download() as di2: pg.click('#assistList li[data-k=calendar] button[data-run=calupdate]')
    ics2 = pathlib.Path(di2.value.path()).read_bytes().decode("utf-8").replace("\r\n ", ""); pg.wait_for_timeout(300)
    uids2 = sorted(l[4:] for l in ics2.split("\r\n") if l.startswith("UID:"))
    check("通知の更新: 「更新ファイルを作る」で、いまの内容(牛乳・パン・シャンプー)だけのファイルができ、古い卵は入らない", uids2 == sorted(["ls-fr-f1@life-support", "ls-fr-f9@life-support", "ls-st-k1@life-support"]), uids2)
    check("通知の更新: 更新ファイルを作ると、消す予定(卵など)を、案内する", pg.is_visible('#dlg') and "卵" in pg.inner_text('#dlgMsg'), pg.inner_text('#dlgMsg')[:60].replace("\n", " / ")); dlgbtn(pg, "閉じる")
    pg.reload(); pg.wait_for_timeout(700); pg.click('.tab[data-t="home"]')
    check("通知の更新: 更新したあとは、「カレンダーの更新」が、消える", "calendar" not in kinds_of(pg)); b.close()
    # --- 食品ロスの見える化(冷蔵庫の期限 × レシートの金額) ---
    fr_loss = lambda: [{"id": "f1", "name": "牛乳", "exp": ago(2), "est": True, "price": 198}, {"id": "f2", "name": "卵", "exp": fut(3), "est": False, "price": 258},
                       {"id": "f3", "name": "パン", "exp": ago(1), "est": True}, {"id": "f4", "name": "豆腐", "exp": "", "est": False}]
    b, pg, errs = new(p, st(fridge=fr_loss())); pg.click('.tab[data-t="meal"]')
    for nm in ("牛乳", "卵", "パン", "豆腐"): pg.click('#fridge button[aria-label="%s を削除"]' % nm if False else '#fridge button[aria-label="%sを削除"]' % nm); pg.wait_for_timeout(80)
    fl = S(pg)["fl"]
    check("食品ロス: 冷蔵庫から消すと、期限内(ok)・期限後(exp)・金額が記録される(期限なしの食材は、記録しない)", [(e["n"], e["k"], e["p"]) for e in fl] == [("牛乳", "exp", 198), ("卵", "ok", 258), ("パン", "exp", 0)], fl)
    pg.click('.tab[data-t="money"]'); pg.wait_for_timeout(150); loss = pg.inner_text('#mLoss').replace("\n", " ")
    check("食品ロス: 月ごとの家計に、使い切れた品数・期限後に消した品数・推定の金額・割合が出る", "期限内に使い切れた食材 1品" in loss and "を過ぎて、消した食材 2品" in loss and "約 198円" in loss and "ほかの 1品は、金額が不明" in loss and "33%" in loss, loss[:140]); b.close()
    b, pg, errs = new(p, st(fridge=fr_loss())); pg.click('.tab[data-t="meal"]'); pg.click('#fridge button[aria-label="牛乳を削除"]'); pg.wait_for_timeout(100); pg.click('#toastUndo'); pg.wait_for_timeout(150)
    check("食品ロス: 「元に戻す」で、記録も戻る(記録0件・牛乳が冷蔵庫に戻る)", len(S(pg)["fl"]) == 0 and any(f["name"] == "牛乳" for f in S(pg)["fridge"])); b.close()
    b, pg, errs = new(p, st(fridge=fr_loss())); pg.click('.tab[data-t="meal"]'); pg.click('#frSelBtn'); pg.click('#frExpired'); pg.click('#frDel'); pg.wait_for_timeout(150)
    check("食品ロス: 「期限切れをまとめて消す」でも、記録される(牛乳198円・パン金額なし)", sorted((e["n"], e["k"], e["p"]) for e in S(pg)["fl"]) == [("パン", "exp", 0), ("牛乳", "exp", 198)]); b.close()
    b, pg, errs = new(p, st(fridge=fr_loss()), ls={"ls_last_open": ago(10)})
    pg.click('#assistList li[data-k=resume] button[data-run=expired]'); pg.wait_for_timeout(200); dlgbtn(pg, "選んだものを消す"); pg.wait_for_timeout(200)
    check("食品ロス: 「期限切れの食材を整理する」(アシスト)でも、記録される", sorted(e["n"] for e in S(pg)["fl"]) == ["パン", "牛乳"], S(pg)["fl"]); b.close()
    pm = (d.replace(day=1) - datetime.timedelta(1)).replace(day=15).isoformat()
    b, pg, errs = new(p, st(fl=[{"d": pm, "n": "にんじん", "p": 100, "k": "exp"}, {"d": pm, "n": "卵", "p": 0, "k": "ok"}]))
    pg.click('.tab[data-t="money"]'); pg.click('#mPrev'); pg.wait_for_timeout(150); lp = pg.inner_text('#mLoss').replace("\n", " ")
    check("食品ロス: 前の月に切り替えると、その月の記録が出る(今月は、記録なしの案内)", "期限内に使い切れた食材 1品" in lp and "約 100円" in lp, lp[:100]); b.close()
    b, pg, errs = new(p, st(fridge=[{"id": "a", "name": "牛乳", "exp": fut(1), "est": True, "price": 198}, {"id": "b", "name": "卵", "exp": fut(2), "est": True, "price": 258}]))
    check("食品ロス: 期限が近い食材の提案に、金額が分かる分の合計が出る(約 456円)", "約 456円" in pg.inner_text('#assistList li[data-k=food] .why'), pg.inner_text('#assistList li[data-k=food] .why')[:80]); b.close()
    b, pg, errs = new(p, st(), ls={"ls_ai_ok": "1"}, fb={"user": None, "cloud": {}, "calls": []})
    if pg.is_visible('#guestBtn'): pg.click('#guestBtn')
    pg.click('.tab[data-t="money"]'); pg.set_input_files('#rcFile', str(TMP / "r.png")); pg.wait_for_timeout(1500); pg.click('#rcAdd'); pg.wait_for_timeout(300)
    frp = {f["name"]: f.get("price") for f in S(pg)["fridge"]}
    check("食品ロス: レシートから冷蔵庫に入れた食材には、レシートの金額(税込)が残る(牛乳198円・卵258円)", frp.get("牛乳 1L") == 198 and frp.get("卵 10個") == 258, frp); b.close()
    bad = {"todos": [], "fridge": [{"id": "f1", "name": "牛乳", "exp": fut(3), "est": True, "price": "abc"}, {"id": "f2", "name": "卵", "exp": fut(3), "est": True, "price": 258}, {"id": "f3", "name": "パン", "exp": fut(3), "price": -5}],
           "fl": [{"d": "2026-13-40", "n": "x", "p": 5, "k": "exp"}, {"d": T, "n": "ok1", "p": "abc", "k": "ok"}, {"d": T, "n": "bad", "p": 10, "k": "zzz"}, {"d": T, "n": "<img src=x onerror=alert(1)>", "p": 10, "k": "exp"}]}
    (TMP / "badfl.json").write_text(json.dumps(bad))
    b, pg, errs = new(p); pg.set_input_files('#importFile', str(TMP / "badfl.json")); pg.wait_for_timeout(400); dlgbtn(pg, "読み込む"); pg.wait_for_timeout(400); s_bad = S(pg)
    check("食品ロス(安全性): 不正な値(価格・日付・種類)の記録は、取り込み時に、除かれるか、安全な形に直される", [f.get("price") for f in s_bad["fridge"]] == [None, 258, None] and sorted((e["n"], e["k"]) for e in s_bad["fl"]) == [("<img src=x onerror=alert(1)>", "exp"), ("ok1", "ok")] and not pg.evaluate("window.__xss||0"), (s_bad["fridge"], s_bad["fl"])); b.close()
    # --- 期限が過ぎた食材: 勝手に消えず、「期限が○日過ぎています」とはっきり表示する ---
    b, pg, errs = new(p, st(fridge=[{"id": "o1", "name": "ヨーグルト", "exp": ago(3), "est": True, "price": 150}, {"id": "o2", "name": "豆腐", "exp": ago(1), "est": False}, {"id": "n1", "name": "牛乳", "exp": fut(5), "est": False}]))
    pg.click('.tab[data-t="meal"]'); pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); pg.wait_for_timeout(200)
    chips = pg.inner_text('#fridge').replace("\n", " "); note = pg.inner_text('#frExpNote').replace("\n", " ")
    check("期限が過ぎた食材: 日付が変わる処理のあとも、勝手には消えない(3品とも残る)", len(S(pg)["fridge"]) == 3 and "ヨーグルト" in chips and "豆腐" in chips)
    check("期限が過ぎた食材: 「⚠ 期限が3日過ぎています(目安)」のように、何日過ぎたかが分かる", "⚠ 期限が3日過ぎています(目安)" in chips and "⚠ 期限が1日過ぎています" in chips and "あと5日" in chips, chips[:120])
    check("期限が過ぎた食材: 冷蔵庫の上に、「○品あります。消すまで残ります」と、整理するボタンが出る", "期限が過ぎた食材が 2品あります" in note and "勝手には消えません" in note and pg.is_visible('#frExpNote button'), note)
    pg.click('#frExpNote button'); pg.wait_for_timeout(200)
    check("期限が過ぎた食材: 「整理する」で、整理の画面が開く(期限切れの2品が、最初から選ばれている)", pg.is_visible('#dlg') and pg.evaluate("[...document.querySelectorAll('#dlgBody .dlg-check input')].filter(c=>c.checked).length") == 2); dlgbtn(pg, "やめる")
    pg.click('.tab[data-t="home"]'); homet = pg.inner_text('#sum').replace("\n", " ")
    check("期限が過ぎた食材: ホームの「冷蔵庫の期限」にも、「期限が過ぎています」と出る", "期限が過ぎています" in homet, homet[:100])
    pg.click('.tab[data-t="money"]'); pg.wait_for_timeout(150); lo = pg.inner_text('#mLoss').replace("\n", " ")
    check("期限が過ぎた食材: 食品ロスの欄に、「いま冷蔵庫に残っている、期限が過ぎた食材 2品(約150円)」が出る", "いま冷蔵庫に残っている、期限が過ぎた食材 2品" in lo and "約 150円" in lo and "ありません。この調子です" not in lo, lo[:120]); b.close()
    # --- 今日使えるお金の高度化(1日平均・明日以降の1日あたり・使いすぎ・ペースの注意) ---
    FX = [{"id": "fx", "name": "家賃", "amt": 55200, "day": 27}]
    e_ = lambda i, dt, a, memo="", cat="食費": {"id": i, "date": dt, "amt": a, "memo": memo, "cat": cat}
    b, pg, errs = new(p, st(budget=90000, fixed=FX, exp=[e_("a", "2026-10-01", 3200), e_("b", "2026-10-05", 2000), e_("c", "2026-10-10", 1000)]), time="2026-10-10T10:00:00")
    mm = pg.inner_text('#moneyMore').replace("\n", " ")
    check("今日使えるお金(高度化): 今月の1日平均と、明日以降の1日あたり(今日の残りが回る)が、式どおり出る", "今月の1日平均の支出: 620円" in mm and "明日以降: 1日あたり 1,361円(今日の残り 345円が、明日以降に回ります)" in mm and "ペース" not in mm, mm); b.close()
    b, pg, errs = new(p, st(budget=90000, fixed=FX, exp=[e_("a", "2026-10-01", 3200), e_("b", "2026-10-05", 2000), e_("c", "2026-10-10", 3000)]), time="2026-10-10T10:00:00")
    mm = pg.inner_text('#moneyMore').replace("\n", " ")
    check("今日使えるお金(高度化): 今日の分をこえたとき、色だけでなく「⚠ こえています」と文字で出て、明日以降が減る", "⚠ 今日の分を、1,655円こえています" in mm and "明日以降: 1日あたり 1,266円(今日の超過を、明日以降でならします)" in mm, mm); b.close()
    b, pg, errs = new(p, st(budget=90000, fixed=FX, exp=[e_("a", "2026-10-01", 20000)]), time="2026-10-10T10:00:00")
    check("今日使えるお金(高度化): このペースだと予算をこえそうなとき、月末の不足の見込みを知らせる", "このペースが続くと、月末に約 27,200円、予算をこえそうです" in pg.inner_text('#moneyMore'), pg.inner_text('#moneyMore')); b.close()
    b, pg, errs = new(p, st(), time="2026-10-10T10:00:00")
    check("ホーム: 「今日使えるお金」が、いちばん上に出る", pg.evaluate("document.querySelector('.card[data-tab=home]').getAttribute('aria-labelledby')") == "h-money"); b.close()
    # --- 月ごとの家計: 先月との比較・予算の使用率・6か月の推移・支出の検索 ---
    s_m = st(budget=90000, fixed=FX, exp=[e_("p1", "2026-09-03", 3000, "スーパー"), e_("p2", "2026-09-20", 4000, "コンビニ"), e_("c1", "2026-10-02", 5000, "スーパー"), e_("c2", "2026-10-08", 1000, "ドラッグ", "日用品")])
    b, pg, errs = new(p, s_m, time="2026-10-10T10:00:00"); pg.click('.tab[data-t="money"]'); pg.wait_for_timeout(150)
    cmp_ = pg.inner_text('#mCmp').replace("\n", " ")
    check("月ごとの家計: 先月の「同じ日まで」と比べ、差と、いちばん変わったカテゴリが出る", "先月の同じ日までの支出 3,000円" in cmp_ and "+3,000円" in cmp_ and "食費が、先月より 2,000円 増えています" in cmp_, cmp_[:120])
    check("月ごとの家計: 予算の使用率(6,000 ÷ 34,800 = 17%)が出る", "17%" in cmp_, cmp_[:160])
    check("月ごとの家計: 6か月の推移の棒が6本出て、棒を押すと、その月に切り替わる", pg.evaluate("document.querySelectorAll('#mTrend i[data-m]').length") == 6 and (pg.click('#mTrend i[data-m]:nth-of-type(5)'), pg.wait_for_timeout(150), "2026年9月" in pg.inner_text('#mLabel'))[2])
    pg.click('#mNext'); pg.wait_for_timeout(150)   # 10月に戻る
    pg.fill('#mQ', 'スーパー'); pg.wait_for_timeout(100); f1 = pg.inner_text('#mFound'); n1 = pg.evaluate("document.querySelectorAll('#mList li .tx').length")
    pg.select_option('#mScope', 'all'); pg.wait_for_timeout(100); f2 = pg.inner_text('#mFound'); n2 = pg.evaluate("document.querySelectorAll('#mList li .tx').length")
    check("支出の検索: お店・メモで探せる(この月は1件、すべての月は2件)", n1 == 1 and "該当 1件・合計 5,000円" in f1 and n2 == 2 and "該当 2件・合計 8,000円" in f2, (f1, f2))
    pg.fill('#mQ', ''); pg.select_option('#mSort', 'big'); pg.wait_for_timeout(100); first = pg.inner_text('#mList li:first-child b')
    pg.select_option('#mScope', 'month'); pg.select_option('#mCat', '日用品'); pg.wait_for_timeout(100); fc = pg.inner_text('#mFound')
    check("支出の検索: 金額の大きい順に並べ替えられ、カテゴリでも絞り込める", first == "5,000円" and "該当 1件・合計 1,000円" in fc, (first, fc))
    pg.select_option('#mCat', ''); pg.fill('#mQ', '存在しない店'); pg.wait_for_timeout(100)
    check("支出の検索: 条件に合うものがないときは、そう知らせる", "条件に合う支出は、ありません" in pg.inner_text('#mList'), pg.inner_text('#mList')[:40]); b.close()
    # --- AIの利用上限(429)・混雑(503)のときの動き ---
    def ai_case(err, label):
        b, pg, errs = new(p, st(), ls={"ls_ai_ok": "1"}, fb={"user": None, "cloud": {}, "calls": [], "err": err})
        pg.evaluate(OCR % "牛乳 198\\n合計 198")
        if pg.is_visible('#guestBtn'): pg.click('#guestBtn')
        pg.click('.tab[data-t="money"]'); pg.set_input_files('#rcFile', str(TMP / "r.png")); pg.wait_for_timeout(5000)
        return b, pg, len([c for c in pg.evaluate("__fb.calls") if c.startswith("generate")])
    e429d = {"code": "fetch-error", "status": 429, "message": "Error fetching: [429 Too Many Requests] Quota exceeded for metric GenerateRequestsPerDayPerProjectPerModel-FreeTier. Please retry in 41s"}
    b, pg, n1 = ai_case(e429d, "429-day"); msg1 = pg.inner_text('#rcMsg'); blk = pg.evaluate("+localStorage.getItem('ls_ai_block')-Date.now()")
    pg.set_input_files('#rcFile', str(TMP / "r.png")); pg.wait_for_timeout(1500); n2 = len([c for c in pg.evaluate("__fb.calls") if c.startswith("generate")]); msg2 = pg.inner_text('#rcMsg')
    pg.evaluate("__fb.err=null"); pg.click('#rcMsg .linkbtn'); pg.wait_for_timeout(1500); n3 = len([c for c in pg.evaluate("__fb.calls") if c.startswith("generate")])
    check("上限(429): すぐにやり直さず(AI呼び出し1回)、1日の上限だと知らせて、しばらくAIを休む", n1 == 1 and "1日の利用上限" in msg1 and blk > 0, (n1, blk))
    check("上限(429): 休み中は、AIを呼ばず簡易読み取りに切り替え、「AIをもう一度、試す」で再開できる", n2 == 1 and "お休み中" in msg2 and n3 == 2, (n2, n3)); b.close()
    e429m = {"code": "fetch-error", "status": 429, "message": "Error fetching: [429 Too Many Requests] Please retry in 41.5s"}
    b, pg, n1 = ai_case(e429m, "429-minute"); blk = pg.evaluate("+localStorage.getItem('ls_ai_block')-Date.now()")
    check("上限(429): 「待つ時間」が、メッセージにあれば、その時間だけAIを休む(約43秒)", n1 == 1 and "短時間" in pg.inner_text('#rcMsg') and 30000 < blk < 50000, blk); b.close()
    e503 = {"code": "fetch-error", "status": 503, "message": "Error fetching: [503 Service Unavailable] overloaded"}
    b, pg, n1 = ai_case(e503, "503")
    check("混雑(503): 少し待って、1回だけ自動でやり直し、それでもだめなら簡易読み取りに切り替わる", n1 == 2 and "混み合って" in pg.inner_text('#rcMsg'), n1); b.close()
    # --- AIの返事が、おかしいとき / 原因が分からないエラーのとき ---
    good9 = {"store": "テスト店", "date": "", "total": 854, "subtotal": 854, "taxIncluded": True, "items": [{"name": "牛乳 1L", "price": 198, "rate": 8, "kind": "食材"}, {"name": "シャンプー", "price": 398, "rate": 10, "kind": "日用品"}, {"name": "卵 10個", "price": 258, "rate": 8, "kind": "食材"}]}
    def ai_run(fbx, wait=4000):
        b, pg, errs = new(p, st(), ls={"ls_ai_ok": "1"}, fb=dict({"user": None, "cloud": {}, "calls": []}, **fbx)); pg.evaluate(OCR % "牛乳 198\\n合計 198")
        if pg.is_visible('#guestBtn'): pg.click('#guestBtn')
        pg.click('.tab[data-t="money"]'); pg.set_input_files('#rcFile', str(TMP / "r.png")); pg.wait_for_timeout(wait)
        return b, pg, len([c for c in pg.evaluate("__fb.calls") if c.startswith("generate")])
    b, pg, n = ai_run({"err": {"code": "response-error", "message": "No candidates returned"}})
    check("AI失敗(原因不明のエラー): 画面に、エラーの名前が出る(理由: response-error)", n == 1 and "理由: response-error" in pg.inner_text('#rcMsg'), pg.inner_text('#rcMsg')[:70]); b.close()
    b, pg, n = ai_run({"seq": ["これはJSONではありません", json.dumps(good9)]})
    check("AIの返事が読めないとき: 丁寧な設定で、1回だけ読み直して、成功する(AI呼び出し2回)", n == 2 and "AIで読み取りました" in pg.inner_text('#rcMsg') and pg.input_value('#rcTotal') == "854", (n, pg.inner_text('#rcMsg')[:50])); b.close()
    b, pg, n = ai_run({"seq": ["```json\n" + json.dumps(good9) + "\n```"]}, 2500)
    check("AIの返事が ``` で囲まれていても、読み取れる(AI呼び出し1回)", n == 1 and pg.input_value('#rcTotal') == "854", n); b.close()
    b, pg, n = ai_run({"resp": {"store": "ミニストップ穴川店", "date": "", "total": 324, "subtotal": 0, "taxIncluded": True, "items": []}}, 2500)
    check("AIが合計だけ読めたとき(支払い画面など): 合計と店名が入り、品物がないことを、わかりやすく知らせる", pg.input_value('#rcTotal') == "324" and pg.input_value('#rcMemo') == "ミニストップ穴川店" and "品物の一覧は、見つかりませんでした" in pg.inner_text('#rcMsg'), pg.inner_text('#rcMsg')[:60]); b.close()
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
