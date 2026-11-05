/* ペア比べギャラリー 設定（モックアップ）
 * 要件案 v0.1 の 5.2 / 8.1 / 5.5 / F-23 に対応
 * 本番では pairs をキュレーション済みJSON（8.2のデータ項目）に差し替える想定
 */
window.APP_CONFIG = {
  data: {
    expo: 'json/mart_action_drop_expo.json',       // 万博DROPS（仮）
    nakanoshima: 'json/mart_action_drop.json',     // みんまちDROP（中之島）（仮）
  },
  // フレーズ演出（WireComments P.60 の初期値）
  reel: { holdMs: 2000, inMs: 750, outMs: 500, risePx: 20 },
  pairsPerTheme: 4,
  dropUrl: 'https://drop.machiapps.com/nakanoshima/',
  // 表示から除外する投稿（テスト投稿など）
  excludePatterns: [/テスト/],

  themes: [
    {
      id: 'shippori', name: 'しっぽり', color: '#7A6A9E', soft: '#ECE7F4',
      keywords: ['静けさ', '夜', '余白'],
      viewpoints: [
        { title: '静けさを味わう', common: '音が少ないと、まちの声が聞こえる。' },
        { title: '夜の明かりを見る', common: '灯りがともると、まちがやさしくなる。' },
        { title: '水辺の余白に浸る', common: '何もない場所が、いちばん落ち着く。' },
        { title: '人の気配を感じる', common: '誰かがいた跡に、ほっとする。' },
      ],
      match: ['夜', '静', '灯', '明かり', '照明', '余白', '落ち着', '歴史', '古', '文化財', 'レトロ', '昭和', '影', '和'],
      odai: ['夜の川面に映る明かりを探す', '音が少なくなる路地を見つける'],
    },
    {
      id: 'wakuwaku', name: 'わくわく', color: '#E0873F', soft: '#FBEBDD',
      keywords: ['発見', '寄り道', '歩く'],
      viewpoints: [
        { title: '寄り道してみる', common: '寄り道の先に、いつも何かがある。' },
        { title: '足元の発見', common: '足元をみると、まちはもっと面白い。' },
        { title: '歩く途中を楽しむ', common: '目的地より、途中が楽しい。' },
        { title: '意外な風景に出会う', common: 'えっ、と思う景色に出会えた。' },
      ],
      match: ['発見', '寄り道', '歩', '驚', 'わくわく', '楽し', '面白', '階段', '見つ', '探', '新作', '別世界', 'なんで', 'なぜ', '？', '！'],
      odai: ['橋の下をくぐって寄り道する', '足元のタイルや銘板を探す'],
    },
    {
      id: 'kiritto', name: 'きりっと', color: '#5D7889', soft: '#E3EAEE',
      keywords: ['風', '音', '温度'],
      viewpoints: [
        { title: '風の音を聴く', common: '風の音で、季節がわかる。' },
        { title: '温度に気づく', common: 'ひんやりした空気に、背すじがのびる。' },
        { title: '今この瞬間を見る', common: '光が差したその一瞬を、見逃さない。' },
        { title: '自然の変化を捉える', common: '同じ場所も、毎日ちがう顔をしている。' },
      ],
      match: ['風', '音', '温度', 'ガラス', '窓', '光', '空', '白', '技術', '素材', 'サッシ', '構造', 'デザイン', '文字', '線'],
      odai: ['川を渡る風を感じる場所', '建物のガラスに映る空を見上げる'],
    },
    {
      id: 'yuttari', name: 'ゆったり', color: '#6E9A6B', soft: '#E6F0E4',
      keywords: ['水辺', 'ベンチ', '眺め'],
      viewpoints: [
        { title: 'ベンチで休む', common: '座ってみると、まちの見え方が変わる。' },
        { title: '水辺を眺める', common: '水辺の風って、気持ちいい。' },
        { title: '風を感じる', common: 'ひらけた場所で、深呼吸したくなる。' },
        { title: '何もしない時間', common: 'ぼーっとする時間も、まちの楽しみ。' },
      ],
      match: ['水', '川', 'ベンチ', '眺め', '景色', '緑', '木', '森', '庭', '休', 'くつろ', '開放', '吹き抜け', 'ひととき', '空間'],
      odai: ['中之島の“座って眺めたい場所”へ', '川沿いのベンチで5分だけ休む'],
    },
  ],
};
