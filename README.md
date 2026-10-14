# Life Support

「めんどくさいを、ちょっと減らす。」
一人暮らしの予定・ToDo・食事・お金・日用品を、ひとつにまとめる生活支援アプリ(進級制作)です。

公開URL: https://kurashi-support.github.io/life-support/

## 主な機能

- **ホーム**: 今日のやること・予定・今夜のご飯・ゴミ出し・冷蔵庫の期限・日用品の買い時・今日使えるお金を、1画面で確認
- **今日の生活アシスト**: 保存したデータにもとづいて、今日やるとよいことを提案(「あとで」「表示しない」も選べる)
- **レシート読み取り**: 写真から品物と金額を読み取り(AI。使えないときは、簡易読み取り・手入力)。支出・冷蔵庫・日用品に自動で反映
- **冷蔵庫**: 賞味期限の目安を自動で入力。期限が近いものをお知らせ。まとめて消す
- **日用品**: 買った日を記録し、季節・使う量・買った間隔から、買い時を計算
- **家計**: 今日使えるお金、月ごとの一覧・グラフ・CSV、固定費・サブスク
- **データ**: ログイン、クラウド保存、バックアップ、ダークモード、ホーム画面に追加(オフラインでも開ける)

## 使っている技術

HTML / CSS / JavaScript(ブラウザだけで動く)、Firebase(Authentication、Cloud Firestore)、GitHub Pages、
外部API(Open Food Facts、Gemini)

## ファイル構成

| ファイル | 役割 |
|---|---|
| `index.html` | 画面の骨組み |
| `style.css` | 見た目 |
| `script.js` | 動き・処理 |
| `sw.js`、`manifest.webmanifest`、`icon-*.png`、`apple-touch-icon.png` | ホーム画面に追加・オフライン起動 |
| `tests/` | 自動テスト(使い方は `tests/README.md`) |

## 設定が必要なもの(Firebase)

- Authentication(メール/パスワード)、Cloud Firestore のセキュリティルール
- AI読み取り: Firebase AI Logic と、App Check(reCAPTCHA Enterprise のサイトキーを、`script.js` の `RC_SITE_KEY` に設定)

## 注意

- 賞味期限・買い時は、目安(推定)です。実際の期限は、パッケージの表示を優先してください。
- AIの読み取りは、間違えることがあります。登録の前に、必ず内容を確認してください。
