/* Synced Emotion 設定（モックアップ v0.3）
 * フロー：① 万博DROPSをスワイプして4件選ぶ → ② 似ている中之島（街）のDROPSと比べてリアクション
 *        → ③ 気分を自動判定し、おすすめのDROPSへ
 */
window.APP_CONFIG = {
  data: {
    expo: 'json/mart_action_drop_expo.json',       // 万博DROPS（仮）
    nakanoshima: 'json/mart_action_drop.json',     // みんまちDROP（中之島）（仮）
  },
  pickCount: 4,          // 万博DROPSで選ぶ件数
  recommendCount: 3,     // おすすめに出す街のDROPSの件数
  // フレーズ演出（WireComments P.60 の初期値）
  reel: { holdMs: 2000, inMs: 750, outMs: 500, risePx: 20 },
  // 気分判定の重み：選んだ万博DROPS／共感した街のDROPS
  weights: { pickedExpo: 1, reactedTown: 1.5 },
  dropUrl: 'https://drop.machiapps.com/nakanoshima/',
  excludePatterns: [/テスト/],

  // 気分（自動判定に使う。ユーザーが選ぶ画面はない）
  moods: [
    {
      id: 'shippori', name: 'しっぽり', color: '#7A6A9E',
      keywords: ['静けさ', '夜', '余白'],
      message: '静けさや灯りに、心がほどける気分。',
      match: ['夜', '静', '灯', '明かり', '照明', '余白', '落ち着', '歴史', '古', '文化財', 'レトロ', '昭和', '影', '和'],
      odai: '夜の川面に映る明かりを探す',
    },
    {
      id: 'wakuwaku', name: 'わくわく', color: '#E0873F',
      keywords: ['発見', '寄り道', '歩く'],
      message: '寄り道して、何かを見つけたい気分。',
      match: ['発見', '寄り道', '歩', '驚', 'わくわく', '楽し', '面白', '階段', '見つ', '探', '新作', '別世界', 'なんで', 'なぜ', '？', '！'],
      odai: '橋の下をくぐって寄り道する',
    },
    {
      id: 'kiritto', name: 'きりっと', color: '#5D7889',
      keywords: ['風', '音', '温度'],
      message: '風や光の変化に、感覚がとがっている気分。',
      match: ['風', '音', '温度', 'ガラス', '窓', '光', '空', '白', '技術', '素材', 'サッシ', '構造', 'デザイン', '文字', '線'],
      odai: '川を渡る風を感じる場所を探す',
    },
    {
      id: 'yuttari', name: 'ゆったり', color: '#6E9A6B',
      keywords: ['水辺', 'ベンチ', '眺め'],
      message: '座って、ぼーっと眺めていたい気分。',
      match: ['水', '川', 'ベンチ', '眺め', '景色', '緑', '木', '森', '庭', '休', 'くつろ', '開放', '吹き抜け', 'ひととき', '空間'],
      odai: '中之島の“座って眺めたい場所”へ',
    },
  ],
};
