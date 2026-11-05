/* Synced Emotion（みんまちLounge）モックアップ v0.4
 * 画面：ローディング → チュートリアル（初回）
 *   → STEP1 選ぶ：万博DROPSをスワイプし、いいなと思う4件にアクション
 *   → STEP2 比べる：選んだ4件それぞれに似ている街（中之島）のDROPSを並べ、共感したらリアクション
 *   → STEP3 見つける：気分を自動判定し、おすすめのDROPSとみんまちDROPへのリンクを表示
 */
(() => {
  'use strict';
  const C = window.APP_CONFIG;
  const MOODS = C.moods;
  const $app = document.getElementById('app');

  /* ---------- 端末内保存 ---------- */
  const KEY = 'pairgallery.v3';
  const store = {
    load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } },
    save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} },
    clear() { try { localStorage.removeItem(KEY); } catch {} },
  };
  if (new URLSearchParams(location.search).has('reset')) store.clear();
  const fresh = () => ({ tutorialDone: false, guideDone: false, order: null, pos: 0, picks: [], reactions: {}, comparePos: 0, stage: 'pick' });
  const S = Object.assign(fresh(), store.load());

  /* ---------- 計測（GAイベント相当のスタブ） ---------- */
  window.dataLayer = window.dataLayer || [];
  const track = (event, params = {}) => { window.dataLayer.push({ event, ...params }); console.info('[track]', event, params); };

  /* ---------- ユーティリティ ---------- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
  const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); };
  const fallbackSrc = color => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 4"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#222"/></linearGradient></defs><rect width="3" height="4" fill="url(#g)"/></svg>`);
  const img = (src, color = '#555') => `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${fallbackSrc(color)}'">`;
  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = msg;
    document.getElementById('device').appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  /* ---------- データ ---------- */
  function splitLines(sentence) {
    const parts = String(sentence).split(/[\s　]+/).map(s => s.trim()).filter(Boolean);
    return parts.length <= 5 ? parts : [...parts.slice(0, 4), parts.slice(4).join(' ')];
  }
  function prepare(records, side) {
    const seen = new Set();
    return records.filter(r => {
      if (!r.image_file_path || !r.sentence) return false;
      if (C.excludePatterns.some(p => p.test(r.sentence))) return false;
      const k = r.sentence.replace(/\s/g, '');
      if (seen.has(k)) return false;
      seen.add(k); return true;
    }).map(r => {
      const text = r.sentence.replace(/[\s　]+/g, '');
      const mood = Object.fromEntries(MOODS.map(m => [m.id, m.match.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0)]));
      return {
        id: r.artwork_id, side, text, mood,
        lines: splitLines(r.sentence),
        photo: r.image_file_path, thumb: r.image_file_path_thumbnail || r.image_file_path,
        grams: bigrams(text),
      };
    });
  }
  // 文の類似度：文字バイグラムのコサイン類似度 ＋ 気分ベクトルの近さ
  function bigrams(t) {
    const m = new Map(), s = t.replace(/[、。！？!?.,「」『』（）()…・〜ー\-]/g, '');
    for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); }
    return m;
  }
  function cosMap(a, b) {
    let dot = 0, na = 0, nb = 0;
    a.forEach((v, k) => { na += v * v; if (b.has(k)) dot += v * b.get(k); });
    b.forEach(v => { nb += v * v; });
    return na && nb ? dot / Math.sqrt(na * nb) : 0;
  }
  function cosMood(a, b) {
    let dot = 0, na = 0, nb = 0;
    MOODS.forEach(m => { dot += a[m.id] * b[m.id]; na += a[m.id] ** 2; nb += b[m.id] ** 2; });
    return na && nb ? dot / Math.sqrt(na * nb) : 0;
  }
  const similarity = (a, b) => cosMap(a.grams, b.grams) * 0.7 + cosMood(a.mood, b.mood) * 0.3;

  let EXPO = [], TOWN = [], byId = {};

  // 選んだ万博DROPSごとに、最も似ている街のDROPSを1件ずつ（重複なし）
  function buildPairs() {
    const used = new Set(S.picks);
    return S.picks.map(id => {
      const e = byId[id];
      let best = null, bestS = -1;
      for (const t of TOWN) {
        if (used.has(t.id) || t.text === e.text) continue;
        const s = similarity(e, t);
        if (s > bestS) { best = t; bestS = s; }
      }
      used.add(best.id);
      return { expo: e, town: best, score: bestS };
    });
  }

  // 気分の自動判定：選んだ万博DROPSと、共感した街のDROPSのキーワードから集計
  function judgeMood(pairs) {
    const total = Object.fromEntries(MOODS.map(m => [m.id, 0]));
    const add = (vec, w) => {
      const sum = Object.values(vec).reduce((a, b) => a + b, 0);
      if (!sum) return;
      MOODS.forEach(m => { total[m.id] += (vec[m.id] / sum) * w; });
    };
    pairs.forEach(p => {
      add(p.expo.mood, C.weights.pickedExpo);
      if (S.reactions[p.expo.id]) add(p.town.mood, C.weights.reactedTown);
    });
    const max = Math.max(...Object.values(total));
    const top = max > 0 ? MOODS.filter(m => Math.abs(total[m.id] - max) < 1e-9) : [MOODS[MOODS.length - 1]];
    return { total, top };
  }

  // おすすめ：判定した気分に近く、まだ見ていない街のDROPS
  function recommend(pairs, top) {
    const shown = new Set(pairs.flatMap(p => [p.expo.id, p.town.id]));
    const liked = pairs.filter(p => S.reactions[p.expo.id]).map(p => p.town);
    const ref = liked.length ? liked : pairs.map(p => p.town);
    return TOWN.filter(t => !shown.has(t.id) && !pairs.some(p => p.expo.text === t.text))
      .map(t => ({ t, s: top.reduce((n, m) => n + t.mood[m.id], 0) + Math.max(...ref.map(r => similarity(r, t))) }))
      .sort((a, b) => b.s - a.s).slice(0, C.recommendCount).map(x => x.t);
  }

  /* ---------- 画面切り替え ---------- */
  let current = null;
  function show(name, params = {}) {
    clearTimers();
    current = { name, ...params };
    document.querySelector('meta[name=theme-color]').content = ['loading', 'tutorial', 'error'].includes(name) ? '#ffffff' : '#0b0b0b';
    SCREENS[name](params);
  }
  const SCREENS = {};
  const stepBar = n => `<div class="stepbar">${['Find', 'Compare', 'In Tune'].map((l, k) =>
    `<span class="${k + 1 === n ? 'on' : k + 1 < n ? 'done' : ''}"><b>${k + 1}</b>${l}</span>`).join('<i></i>')}</div>`;

  /* ローディング */
  SCREENS.loading = () => {
    $app.innerHTML = `<section class="screen light"><div class="loading">
      <div class="logo"><span class="l1">みんまちLounge</span><span class="l2 en">Synced<br>Emotion</span></div>
      <div class="loadbar"><i></i></div></div></section>`;
  };

  /* エラー */
  SCREENS.error = ({ detail }) => {
    const isFile = location.protocol === 'file:';
    $app.innerHTML = `<section class="screen light"><div class="error">
      <h2>読み込めませんでした</h2>
      <p>${isFile ? 'ファイルを直接開くとデータを読み込めません。<br>フォルダで <code>python -m http.server</code> を実行し、<br><code>http://localhost:8000</code> を開いてください。' : '通信状況をご確認のうえ、もう一度お試しください。'}</p>
      <p style="font-size:11px;color:#aaa">${esc(detail || '')}</p>
      <button class="btn-round" id="reload">再読み込み</button></div></section>`;
    document.getElementById('reload').onclick = () => location.reload();
  };

  /* チュートリアル */
  SCREENS.tutorial = () => {
    const slides = [
      { h: '万博で生まれた<br>“まちのいい”', p: `万博のDROPSをスワイプして、<br>いいなと思うものを${C.pickCount}つ選んでください。`, art: 'expo' },
      { h: '中之島にも、<br>きっとある。', p: '選んだDROPSに似ている、中之島のDROPSと<br>見比べます。共感したら「Synced」。', art: 'pair' },
      { h: 'いまの気分から、<br>次の“いい”へ。', p: 'あなたの気分を判定して、<br>おすすめのDROPSをお届けします。', art: 'mood' },
    ];
    const art = {
      expo: `<svg viewBox="0 0 210 210" width="210" height="210"><rect x="38" y="44" width="100" height="150" rx="14" fill="none" stroke="#111" opacity=".25"/><rect x="58" y="28" width="100" height="150" rx="14" fill="#fff" stroke="#111"/><circle cx="140" cy="158" r="13" fill="#111"/><path d="M140 150c2 3 4 5 4 7.5a4 4 0 0 1-8 0c0-2.5 2-4.5 4-7.5z" fill="#fff"/></svg>`,
      pair: `<svg viewBox="0 0 210 210" width="210" height="210"><rect x="14" y="40" width="80" height="110" rx="12" fill="#ECE7F4" stroke="#111"/><rect x="116" y="60" width="80" height="110" rx="12" fill="#E6F0E4" stroke="#111"/><text x="105" y="118" text-anchor="middle" font-size="22" font-family="serif">⇄</text></svg>`,
      mood: `<svg viewBox="0 0 210 210" width="210" height="210"><defs><linearGradient id="mg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7A6A9E"/><stop offset=".35" stop-color="#E0873F"/><stop offset=".7" stop-color="#5D7889"/><stop offset="1" stop-color="#6E9A6B"/></linearGradient></defs><circle cx="105" cy="105" r="70" fill="url(#mg)" opacity=".85"/><circle cx="105" cy="105" r="92" fill="none" stroke="#111" opacity=".2"/></svg>`,
    };
    let i = 0;
    $app.innerHTML = `<section class="screen light"><div class="tutorial">
      <div class="pastel"><span style="background:#F3C9D6;left:-5%;top:0"></span><span style="background:#C9DDF3;right:-5%;top:20%"></span><span style="background:#F7E2C2;left:15%;bottom:0"></span><span style="background:#D3EBD0;right:5%;bottom:10%"></span></div>
      <button class="skip" id="skip">スキップ</button>
      <div class="slides" id="slides">${slides.map(s => `<div class="slide"><div class="art">${art[s.art]}</div><h2>${s.h}</h2><p>${s.p}</p></div>`).join('')}</div>
      <div class="bottom"><div class="dots" id="dots">${slides.map((_, k) => `<i class="${k ? '' : 'on'}"></i>`).join('')}</div>
      <button class="btn-round" id="go">つぎへ</button></div></div></section>`;
    const $s = document.getElementById('slides'), $go = document.getElementById('go');
    const finish = () => { S.tutorialDone = true; store.save(); track('start_experience'); show('pick'); };
    const go = k => {
      i = Math.max(0, Math.min(slides.length - 1, k));
      $s.style.transform = `translateX(${-100 * i}%)`;
      document.querySelectorAll('#dots i').forEach((d, j) => d.classList.toggle('on', j === i));
      $go.textContent = i === slides.length - 1 ? 'はじめる' : 'つぎへ';
    };
    $go.onclick = () => (i === slides.length - 1 ? finish() : go(i + 1));
    document.getElementById('skip').onclick = finish;
    swipe($s, () => go(i + 1), () => go(i - 1));
  };

  /* STEP1 選ぶ：万博DROPSをスワイプ */
  let sheetMin = false;
  SCREENS.pick = () => {
    S.stage = 'pick';
    const list = S.order.map(id => byId[id]).filter(Boolean);
    S.pos = Math.max(0, Math.min(list.length - 1, S.pos));
    store.save();
    const d = list[S.pos];
    const picked = S.picks.includes(d.id);
    const full = S.picks.length >= C.pickCount;
    if (!full) sheetMin = false;
    $app.innerHTML = `<section class="screen dark"><div class="pair" id="pair">
      <div class="pair-top col">${stepBar(1)}
        <div class="slots" aria-label="選んだ数">${Array.from({ length: C.pickCount }, (_, k) => {
          const p = byId[S.picks[k]];
          return `<button class="slot ${p ? 'filled' : ''}" data-k="${k}" ${p ? '' : 'disabled'}>${p ? img(p.thumb) : ''}</button>`;
        }).join('')}<span class="slot-count">${S.picks.length} / ${C.pickCount} 選択</span></div></div>
      <div class="drop" id="drop">
        <div class="photo">${img(d.photo)}</div>
        <div class="meta"><span class="badge" style="--bc:#fff"><b></b>EXPO 2025 ／ 万博DROPS</span>
          <div class="vp">${S.pos + 1} / ${list.length}</div></div>
        <div class="reel solo" id="reel" style="--in:${C.reel.inMs}ms;--out:${C.reel.outMs}ms;--rise:${C.reel.risePx}px">${d.lines.map(l => `<div class="line">${esc(l)}</div>`).join('')}</div>
        <div class="tap-hint" id="hint">タップで全文を表示</div>
        <div class="pick-row">
          <button class="nav-arrow" id="prev" aria-label="前へ" ${S.pos ? '' : 'disabled'}>‹</button>
          <button class="pick-btn ${picked ? 'on' : ''}" id="pickBtn" aria-pressed="${picked}">
            <svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 3c3 4.2 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 3-6.8 6-11z" fill="${picked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.6"/></svg>
            <span>${picked ? 'Picked' : 'Pick'}</span></button>
          <button class="nav-arrow" id="next" aria-label="次へ" ${S.pos < list.length - 1 ? '' : 'disabled'}>›</button>
        </div>
      </div>
      ${full ? `<div class="sheet ${sheetMin ? 'min' : ''}" id="sheet"><div class="sheet-t">${C.pickCount}つ選びました</div>
        <div class="sheet-s">中之島の、似ているDROPSと比べてみましょう。</div>
        <button class="btn-round" id="toCompare">Compare ⇄</button>
        <button class="sheet-sub" id="keep">選びなおす</button></div>` : ''}
    </div></section>`;

    const next = () => { if (S.pos < list.length - 1) { S.pos++; show('pick'); } };
    const prev = () => { if (S.pos > 0) { S.pos--; show('pick'); } };
    current.next = next; current.prev = prev;
    document.getElementById('next').onclick = e => { e.stopPropagation(); next(); };
    document.getElementById('prev').onclick = e => { e.stopPropagation(); prev(); };
    swipe(document.getElementById('drop'), next, prev);
    const reel = runReel(document.getElementById('reel'));
    document.getElementById('drop').addEventListener('click', e => { if (!e.target.closest('button')) reel.showAll(); });

    const $b = document.getElementById('pickBtn');
    $b.onclick = e => {
      e.stopPropagation();
      if (picked) {
        S.picks = S.picks.filter(x => x !== d.id);
        track('cancel_pick_expo', { artwork_id: d.id });
        S.reactions = {}; S.comparePos = 0; store.save();
        return show('pick');
      }
      if (full) return toast(`${C.pickCount}つまで選べます。外してから選んでください`);
      S.picks.push(d.id);
      S.reactions = {}; S.comparePos = 0;
      store.save();
      burst($b);
      $b.classList.add('on');
      $b.querySelector('span').textContent = 'Picked';
      $b.querySelector('path').setAttribute('fill', 'currentColor');
      track('pick_expo', { artwork_id: d.id, count: S.picks.length });
      // 選んだら次の投稿へ（ザッピング感覚を保つ）。4件そろったらその場で比べる案内を出す
      later(() => {
        if (S.picks.length < C.pickCount && S.pos < list.length - 1) S.pos++;
        show('pick');
      }, 450);
    };
    const tc = document.getElementById('toCompare');
    if (tc) {
      tc.onclick = () => { S.comparePos = 0; S.stage = 'compare'; store.save(); show('compare'); };
      document.getElementById('keep').onclick = () => { sheetMin = true; document.getElementById('sheet').classList.add('min'); };
      document.getElementById('sheet').onclick = e => { if (sheetMin && !e.target.closest('button')) { sheetMin = false; e.currentTarget.classList.remove('min'); } };
    }
    $app.querySelectorAll('.slot.filled').forEach(el => el.onclick = () => {
      const idx = list.findIndex(x => x.id === S.picks[+el.dataset.k]);
      if (idx >= 0) { S.pos = idx; show('pick'); }
    });
    if (!S.guideDone) showGuide();
  };

  /* STEP2 比べる：選んだ4件 × 似ている街のDROPS */
  let PAIRS = [];
  SCREENS.compare = () => {
    PAIRS = buildPairs();
    const i = S.comparePos = Math.max(0, Math.min(PAIRS.length - 1, S.comparePos));
    store.save();
    const p = PAIRS[i], on = !!S.reactions[p.expo.id];
    const last = i === PAIRS.length - 1;
    track('view_pair', { expo_id: p.expo.id, town_id: p.town.id, similarity: +p.score.toFixed(3) });
    const card = (d, label, cls) => `<div class="cmp ${cls}"><div class="cmp-ph">${img(d.photo)}</div>
      <div class="cmp-txt"><span class="badge" style="--bc:${cls === 'town' ? '#9fd39b' : '#fff'}"><b></b>${label}</span>
      <div class="cmp-lines">${d.lines.map(l => `<div>${esc(l)}</div>`).join('')}</div></div></div>`;
    $app.innerHTML = `<section class="screen dark"><div class="pair compare" id="pair">
      <div class="pair-top col">${stepBar(2)}
        <div class="cmp-head"><button class="back" id="back" aria-label="選びなおす">←</button>
          <span>似ている街のDROPS</span><span class="count">${i + 1} / ${PAIRS.length}</span></div></div>
      <div class="cmp-wrap">
        ${card(p.expo, 'あなたが選んだ 万博', 'expo')}
        ${card(p.town, '似ている 中之島', 'town')}
        <span class="cmp-x">⇄</span>
      </div>
      <div class="cmp-actions">
        <button class="nav-arrow" id="prev" aria-label="前へ">‹</button>
        <button class="wakaru ${on ? 'on' : ''}" id="wakaru" aria-pressed="${on}"><span class="wk-en">${on ? 'Synced' : 'Sync'}</span><small>${on ? '共感しました' : 'タップで共感'}</small></button>
        <button class="nav-arrow ${last ? 'go' : ''}" id="next" aria-label="${last ? '気分を判定する' : '次へ'}">${last ? 'In Tune →' : '›'}</button>
      </div>
      <div class="skip-note center">押さなくても先へ進めます</div>
    </div></section>`;
    const next = () => {
      if (!last) { S.comparePos++; return show('compare'); }
      S.stage = 'result'; store.save(); show('judging');
    };
    const prev = () => {
      if (i > 0) { S.comparePos--; return show('compare'); }
      S.stage = 'pick'; store.save(); show('pick');
    };
    current.next = next; current.prev = prev;
    document.getElementById('next').onclick = next;
    document.getElementById('prev').onclick = prev;
    document.getElementById('back').onclick = () => { S.stage = 'pick'; store.save(); show('pick'); };
    swipe(document.getElementById('pair'), next, prev);
    const $w = document.getElementById('wakaru');
    $w.onclick = () => {
      const v = !S.reactions[p.expo.id];
      if (v) S.reactions[p.expo.id] = true; else delete S.reactions[p.expo.id];
      store.save();
      $w.classList.toggle('on', v);
      $w.setAttribute('aria-pressed', v);
      $w.querySelector('small').textContent = v ? '共感しました' : 'タップで共感';
      $w.querySelector('.wk-en').textContent = v ? 'Synced' : 'Sync';
      if (v) burst($w);
      track(v ? 'click_wakaru' : 'cancel_wakaru', { expo_id: p.expo.id, town_id: p.town.id });
    };
  };

  /* 判定中の演出 */
  SCREENS.judging = () => {
    $app.innerHTML = `<section class="screen dark"><div class="judging">
      <div class="orb">${MOODS.map((m, k) => `<i style="--c:${m.color};--k:${k}"></i>`).join('')}</div>
      <p>あなたの気分を<br>読み取っています…</p></div></section>`;
    later(() => show('result'), 2200);
  };

  /* STEP3 見つける：気分判定 → おすすめDROPS */
  SCREENS.result = () => {
    PAIRS = buildPairs();
    const { total, top } = judgeMood(PAIRS);
    const recs = recommend(PAIRS, top);
    const sum = Object.values(total).reduce((a, b) => a + b, 0) || 1;
    const reacted = PAIRS.filter(p => S.reactions[p.expo.id]).length;
    track('view_result', { result_type: top.map(m => m.id).join('+'), reacted });
    let acc = 0;
    const stops = MOODS.filter(m => total[m.id] > 0).map(m => { const a = acc; acc += (total[m.id] / sum) * 360; return `${m.color} ${a}deg ${acc}deg`; }).join(',') || `${top[0].color} 0deg 360deg`;
    const label = top.map(m => m.name).join(' × ');
    const color = top[0].color;
    $app.innerHTML = `<section class="screen dark"><div class="result">
      ${stepBar(3)}
      <div class="glow"><div class="bg" style="background:conic-gradient(${stops})"></div>
        <div class="txt"><div class="you">いまのあなたは</div><div class="type ${top.length > 1 ? 'small' : ''}">${label}<span class="ki">気分</span></div></div></div>
      <p class="msg">${top.map(m => esc(m.message)).join('<br>')}</p>
      <div class="gradbar">${MOODS.map(m => `<i style="flex:${total[m.id]};background:${m.color}"></i>`).join('')}</div>
      <div class="legend">${MOODS.map(m => `<div style="--c:${m.color}"><b>${Math.round((total[m.id] / sum) * 100)}%</b>${m.name}</div>`).join('')}</div>
      <div class="basis">選んだ万博DROPS ${PAIRS.length}件と、共感した中之島DROPS ${reacted}件から判定しました</div>

      <h3>${esc(label)}気分のあなたに、おすすめのDROPS</h3>
      <div class="recs">${recs.map(r => `<a class="rec" href="${C.dropUrl}" target="_blank" rel="noopener" data-id="${r.id}" style="--c:${color}">
        <span class="rec-ph">${img(r.thumb, color)}</span>
        <span class="rec-txt">${r.lines.slice(0, 3).map(esc).join('<br>')}</span><span class="rec-go">↗</span></a>`).join('')}</div>

      <div class="odai-box" style="--c:${color}"><small>中之島で探すお題</small><p>${esc(top[0].odai)}</p></div>
      <div class="btns">
        <a class="btn-round" id="dropLink" href="${C.dropUrl}" target="_blank" rel="noopener">Go to みんまちDROP ↗</a>
        <button class="btn-ghost" id="share">結果をシェア</button>
        <button class="btn-ghost" id="again">もう一度選ぶ</button>
      </div></div></section>`;
    document.getElementById('dropLink').onclick = () => track('click_minmachi_drop', { from: 'cta' });
    $app.querySelectorAll('.rec').forEach(a => a.onclick = () => track('click_minmachi_drop', { from: 'recommend', artwork_id: a.dataset.id }));
    document.getElementById('share').onclick = async () => {
      const text = `いまのわたしは「${label}」気分。万博と中之島の“まちのいい”を見比べる体験 Synced Emotion #みんまちLounge`;
      track('share_result');
      try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast('結果テキストをコピーしました'); } } catch {}
    };
    document.getElementById('again').onclick = () => {
      Object.assign(S, { picks: [], reactions: {}, comparePos: 0, pos: 0, stage: 'pick', order: shuffle(EXPO.map(e => e.id)) });
      store.save(); show('pick');
    };
  };

  /* ---------- 演出 ---------- */
  function runReel($reel) {
    const lines = [...$reel.querySelectorAll('.line')];
    const hint = document.getElementById('hint');
    const { holdMs, outMs } = C.reel;
    let done = false;
    const showAll = () => {
      if (done) return; done = true;
      clearTimers();
      $reel.classList.remove('solo'); $reel.classList.add('all');
      lines.forEach(l => l.classList.remove('in', 'out'));
      if (hint) hint.style.visibility = 'hidden';
    };
    const step = k => {
      if (done) return;
      if (k >= lines.length) return showAll();
      const l = lines[k];
      requestAnimationFrame(() => l.classList.add('in'));
      later(() => { l.classList.remove('in'); l.classList.add('out'); later(() => step(k + 1), outMs); }, holdMs);
    };
    later(() => step(0), 300);
    return { showAll };
  }
  function burst(el) {
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    const r = el.getBoundingClientRect(), host = el.parentElement, hr = host.getBoundingClientRect();
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    for (let k = 0; k < 10; k++) {
      const s = document.createElement('i');
      s.className = 'spark';
      const a = (Math.PI * 2 * k) / 10, d = 60 + Math.random() * 20;
      s.style.left = r.left - hr.left + r.width / 2 - 4 + 'px';
      s.style.top = r.top - hr.top + r.height / 2 - 4 + 'px';
      s.style.setProperty('--dx', Math.cos(a) * d + 'px');
      s.style.setProperty('--dy', Math.sin(a) * d + 'px');
      host.appendChild(s);
      setTimeout(() => s.remove(), 800);
    }
    if (navigator.vibrate) try { navigator.vibrate(15); } catch {}
  }
  function showGuide() {
    const g = document.createElement('div');
    g.className = 'guide';
    g.innerHTML = `<div class="hand">👆</div><p><b>左右にスワイプ</b>で万博のDROPSを見ていきます</p>
      <p>いいなと思ったら <b>「Pick」</b>。<br>${C.pickCount}つ選んだら、中之島と比べます</p><button class="btn-round">OK</button>`;
    document.querySelector('.pair').appendChild(g);
    g.onclick = () => { S.guideDone = true; store.save(); g.remove(); };
  }

  /* ---------- 操作 ---------- */
  function swipe(el, onLeft, onRight) {
    let x0 = null, y0 = 0;
    el.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    el.addEventListener('touchend', e => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) (dx < 0 ? onLeft : onRight)();
    });
  }
  document.addEventListener('keydown', e => {
    if (!current?.next) return;
    if (e.key === 'ArrowRight') current.next();
    if (e.key === 'ArrowLeft') current.prev();
  });
  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  /* ---------- 起動 ---------- */
  async function boot() {
    show('loading');
    const t0 = Date.now();
    try {
      const get = async u => { const r = await fetch(u, { cache: 'no-cache' }); if (!r.ok) throw new Error(`${u}: ${r.status}`); return (await r.json()).records || []; };
      const [expo, town] = await Promise.all([get(C.data.expo), get(C.data.nakanoshima)]);
      EXPO = prepare(expo, 'expo');
      TOWN = prepare(town, 'nakanoshima');
      byId = Object.fromEntries([...TOWN, ...EXPO].map(d => [d.id, d]));
      // 並び順は来場者ごとにランダム（保存して再訪時も維持）
      if (!Array.isArray(S.order) || S.order.length !== EXPO.length || S.order.some(id => !byId[id])) S.order = shuffle(EXPO.map(e => e.id));
      S.picks = (S.picks || []).filter(id => byId[id]).slice(0, C.pickCount);
      store.save();
      S.order.slice(0, 6).forEach(id => { const im = new Image(); im.src = byId[id].photo; });
      await new Promise(r => setTimeout(r, Math.max(0, 900 - (Date.now() - t0))));
      if (!S.tutorialDone) return show('tutorial');
      if (S.stage === 'result' && S.picks.length === C.pickCount) return show('result');
      if (S.stage === 'compare' && S.picks.length === C.pickCount) return show('compare');
      show('pick');
    } catch (err) {
      console.error(err);
      show('error', { detail: err.message });
    }
  }
  boot();
})();
