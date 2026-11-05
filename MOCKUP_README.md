# Synced Emotion（みんまちLounge）モックアップ v0.4

`要件案_ペア比べギャラリー_みんまちLounge.md`（v0.1）をもとに、体験フローを次のように変更したモックアップです。

## 体験フロー

| STEP | 画面 | 内容 |
|---|---|---|
| — | チュートリアル | 初回のみ。スライド3枚 |
| 1 Find | 万博DROPSのスワイプ | 万博DROPSを左右にスワイプして見ていき、いいなと思う投稿に「Pick」。4件そろうと「Compare」が出る。選んだ投稿は上部のサムネイルから見直し・取り消しできる |
| 2 Compare | 似ている街のDROPS | 選んだ4件それぞれに、似ている中之島（街）のDROPSを1件ずつ上下に並べる。共感したら「Sync」（押すと「Synced」。押さなくても進める） |
| — | 判定中 | 気分を判定する演出（約2秒） |
| 3 In Tune | 気分の判定とおすすめ | 気分（しっぽり／わくわく／きりっと／ゆったり）を自動判定。内訳、おすすめのDROPS 3件、お題、みんまちDROPへのリンクを表示 |

「気分（テーマ）を選ぶ」画面はありません。

## 起動方法

JSONを `fetch` で読み込むため、ローカルサーバー経由で開いてください。

```bash
cd BCB_comeback
python -m http.server 8000
# → http://localhost:8000 （スマホ幅推奨 / DevToolsのデバイスモード）
```

`?reset` を付けて開くと体験の記録（localStorage）を初期化します。PCでは ← → キーでも移動できます。

## ファイル構成

| ファイル | 内容 |
|---|---|
| `index.html` | エントリ |
| `css/style.css` | スタイル（BCBのトーン：黒＝メイン機能、明朝のフレーズ、丸ボタン） |
| `js/config.js` | 選ぶ件数、気分の定義（キーワード・色・メッセージ・お題）、判定の重み、演出タイミング |
| `js/app.js` | 画面ロジック |
| `json/mart_action_drop_expo.json` | 万博DROPS（仮） |
| `json/mart_action_drop.json` | みんまちDROP（中之島）（仮） |

## ロジック（仮）

- **万博DROPSの並び順：** 来場者ごとにランダム（端末に保存して再訪時も維持）。
- **似ている街のDROPS：** 本文の文字バイグラムのコサイン類似度（70%）と、気分キーワードの近さ（30%）で、最も近い1件を選ぶ。4ペアで同じ投稿は使わない。
- **気分の判定：** 各投稿の本文を `config.js` の気分キーワードで採点し、選んだ万博DROPS（重み1）と「Synced」にした街のDROPS（重み1.5）を合計。最も高い気分を表示し、同点なら併記。
- **おすすめのDROPS：** まだ見ていない街のDROPSから、判定した気分のスコアと、共感した投稿との類似度が高い順に3件。リンク先は現状すべて `https://drop.machiapps.com/nakanoshima/`（投稿ごとのURLがわかれば差し替え）。
- 「テスト」を含む投稿と、本文が重複する投稿は除外。2つのJSONは現在中身が同じため、同じ投稿が万博側と街側に重複しないようにしている。

## 計測イベント（`window.dataLayer` に送信し、コンソールにも出力）

`start_experience` / `pick_expo` / `cancel_pick_expo` / `view_pair` / `click_wakaru` / `cancel_wakaru` / `view_result` / `click_minmachi_drop`（from: cta / recommend） / `share_result`
