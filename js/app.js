/* ペア比べギャラリー（みんまちLounge）モックアップ
 * 画面：S-01 ローディング / S-02 チュートリアル / S-03 テーマ選択 / S-04・S-05 ペア比較
 *       S-06 テーマ完了 / S-07 マイ結果 / S-08 持ち帰り / S-09 エラー
 */
(() => {
  'use strict';
  const C = window.APP_CONFIG;
  const THEMES = C.themes;
  const themeById = Object.fromEntries(THEMES.map(t => [t.id, t]));
  const $app = document.getElementById('app');
  const $tab = document.getElementById('tabbar');

  /* ---------- 端末内保存（9.2：ローカルストレージ） ---------- */
  const KEY = 'pairgallery.v1';
  const store = {
    load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } },
    save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* 保存不可でも動作継続 */ } },
    clear() { try { localStorage.removeItem(KEY); } catch {} },
  };
  if (new URLSearchParams(location.search).has('reset')) store.clear();
  const S = Object.assign({ tutorialDone: false, guideDone: false, likes: {}, viewed: {}, last: null, started: false }, store.load());

  /* ---------- 計測（9章：GAイベント相当のスタブ） ---------- */
  window.dataLayer = window.dataLayer || [];
  function track(event, params = {}) {
    window.dataLayer.push({ event, ...params });
    console.info('[track]', event, params);
  }

  /* ---------- ユーティリティ ---------- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
  const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); };
  function fallbackSrc(color) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 4"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#222"/></linearGradient></defs><rect width="3" height="4" fill="url(#g)"/></svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }
  const img = (src, color, cls = '') =>
    `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${fallbackSrc(color)}'">`;
  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = msg;
    document.getElementById('device').appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  /* ---------- データ：JSON → 16ペア ---------- */
  function splitLines(sentence) {
    const parts = String(sentence).split(/[\s　]+/).map(s => s.trim()).filter(Boolean);
    if (parts.length <= 5) return parts;
    return [...parts.slice(0, 4), parts.slice(4).join(' ')]; // 最大5行（8.2 word_jp_1〜5）
  }
  function clean(records) {
    const seen = new Set();
    return records.filter(r => {
      if (!r.image_file_path || !r.sentence) return false;
      if (C.excludePatterns.some(p => p.test(r.sentence))) return false;
      const k = r.sentence.replace(/\s/g, '');
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
  }
  const score = (r, t) => t.match.reduce((n, w) => n + (r.sentence.includes(w) ? 1 : 0), 0);

  // 仮のペア生成：キーワード一致度でテーマに振り分け（本番はキュレーション済みデータに差し替え）
  function buildPairs(expoRecs, nakaRecs) {
    const expo = clean(expoRecs), naka = clean(nakaRecs);
    const used = new Set();
    const pick = (pool, t) => {
      let best = null, bestScore = -1;
      for (const r of pool) {
        if (used.has(r.artwork_id)) continue;
        const s = score(r, t);
        if (s > bestScore) { best = r; bestScore = s; }
      }
      if (best) used.add(best.artwork_id);
      return best;
    };
    const toDrop = (r, side) => ({
      side, artwork_id: r.artwork_id,
      lines: splitLines(r.sentence),
      photo: r.image_file_path, thumb: r.image_file_path_thumbnail || r.image_file_path,
    });
    const byTheme = Object.fromEntries(THEMES.map(t => [t.id, []]));
    for (let i = 0; i < C.pairsPerTheme; i++) {
      for (const t of THEMES) {
        const e = pick(expo, t), n = pick(naka, t);
        if (!e || !n) continue;
        byTheme[t.id].push({ theme: t.id, idx: i, viewpoint: t.viewpoints[i].title, common: t.viewpoints[i].common, expo: toDrop(e, 'expo'), naka: toDrop(n, 'nakanoshima') });
      }
    }
    let no = 1;
    THEMES.forEach(t => byTheme[t.id].forEach(p => { p.id = 'P' + String(no++).padStart(2, '0'); }));
    return byTheme;
  }

  let PAIRS = null; // { themeId: [pair...] }
  const allPairs = () => THEMES.flatMap(t => PAIRS[t.id]);
  const themeViewed = id => PAIRS[id].filter(p => S.viewed[p.id]).length;
  const themeDone = id => PAIRS[id].length > 0 && themeViewed(id) === PAIRS[id].length;

  /* ---------- 画面切り替え ---------- */
  let current = null;
  function show(name, params = {}) {
    clearTimers();
    current = { name, ...params };
    const tabbed = ['home', 'pair', 'complete', 'result', 'takeaway'].includes(name);
    $tab.hidden = !tabbed;
    $app.classList.toggle('with-tab', tabbed);
    const dark = ['pair', 'complete', 'result'].includes(name);
    $tab.classList.toggle('dark', dark);
    document.querySelector('meta[name=theme-color]').content = dark ? '#0b0b0b' : '#ffffff';
    const active = { home: 'home', pair: 'pair', complete: 'pair', result: 'result', takeaway: 'result' }[name];
    $tab.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.tab === active));
    SCREENS[name](params);
  }
  $tab.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const t = b.dataset.tab;
    if (t === 'home') show('home');
    if (t === 'result') show('result');
    if (t === 'pair') {
      if (S.last) return show('pair', S.last);
      const next = THEMES.find(th => !themeDone(th.id)) || THEMES[0];
      show('pair', { theme: next.id, i: 0, step: 0 });
    }
  });

  const SCREENS = {};

  /* S-01 ローディング */
  SCREENS.loading = () => {
    $app.innerHTML = `<section class="screen light"><div class="loading">
      <div class="logo"><span class="l1">みんまちLounge</span><span class="l2">ペア比べ<br>ギャラリー</span></div>
      <div class="loadbar"><i></i></div></div></section>`;
  };

  /* S-09 エラー */
  SCREENS.error = ({ detail }) => {
    const isFile = location.protocol === 'file:';
    $app.innerHTML = `<section class="screen light"><div class="error">
      <h2>読み込めませんでした</h2>
      <p>${isFile
        ? 'ファイルを直接開くとデータを読み込めません。<br>フォルダで <code>python -m http.server</code> を実行し、<br><code>http://localhost:8000</code> を開いてください。'
        : '通信状況をご確認のうえ、もう一度お試しください。'}</p>
      <p style="font-size:11px;color:#aaa">${esc(detail || '')}</p>
      <button class="btn-round" id="reload">再読み込み</button></div></section>`;
    document.getElementById('reload').onclick = () => location.reload();
  };

  /* S-02 チュートリアル */
  SCREENS.tutorial = () => {
    const slides = [
      { h: '万博で生まれた<br>“まちのいい”', p: '2025年の万博で、たくさんの人が<br>「いいな」と感じた瞬間を、写真と言葉で残しました。', art: 'expo' },
      { h: '中之島にも、<br>きっとある。', p: '万博のDROPSと、中之島のDROPSを<br>ペアで見比べてみましょう。', art: 'pair' },
      { h: 'わかる！と思ったら、<br>ひとタップ。', p: '共感したペアから、あなたの<br>“まちの楽しみ方”が見えてきます。', art: 'wakaru' },
    ];
    const art = {
      expo: `<svg viewBox="0 0 210 210" width="210" height="210"><circle cx="105" cy="105" r="78" fill="none" stroke="#111" stroke-width="1"/><circle cx="105" cy="105" r="52" fill="none" stroke="#111" stroke-width="1" stroke-dasharray="2 6"/><circle cx="105" cy="27" r="7" fill="#E0873F"/><circle cx="183" cy="105" r="7" fill="#6E9A6B"/><circle cx="105" cy="183" r="7" fill="#5D7889"/><circle cx="27" cy="105" r="7" fill="#7A6A9E"/></svg>`,
      pair: `<svg viewBox="0 0 210 210" width="210" height="210"><rect x="14" y="40" width="80" height="110" rx="12" fill="#ECE7F4" stroke="#111"/><rect x="116" y="60" width="80" height="110" rx="12" fill="#E6F0E4" stroke="#111"/><text x="105" y="118" text-anchor="middle" font-size="22" font-family="serif">⇄</text></svg>`,
      wakaru: `<svg viewBox="0 0 210 210" width="210" height="210"><circle cx="105" cy="105" r="56" fill="#111"/><circle cx="105" cy="105" r="80" fill="none" stroke="#111" opacity=".25"/><circle cx="105" cy="105" r="98" fill="none" stroke="#111" opacity=".1"/><text x="105" y="113" text-anchor="middle" font-size="22" fill="#fff" font-family="'Shippori Mincho',serif" font-weight="700">わかる！</text></svg>`,
    };
    let i = 0;
    $app.innerHTML = `<section class="screen light"><div class="tutorial">
      <div class="pastel"><span style="background:#F3C9D6;left:-5%;top:0"></span><span style="background:#C9DDF3;right:-5%;top:20%"></span><span style="background:#F7E2C2;left:15%;bottom:0"></span><span style="background:#D3EBD0;right:5%;bottom:10%"></span></div>
      <button class="skip" id="skip">スキップ</button>
      <div class="slides" id="slides">${slides.map(s => `<div class="slide"><div class="art">${art[s.art]}</div><h2>${s.h}</h2><p>${s.p}</p></div>`).join('')}</div>
      <div class="bottom"><div class="dots" id="dots">${slides.map((_, k) => `<i class="${k ? '' : 'on'}"></i>`).join('')}</div>
      <button class="btn-round" id="go">つぎへ</button></div></div></section>`;
    const $s = document.getElementById('slides'), $go = document.getElementById('go');
    const finish = () => { S.tutorialDone = true; store.save(); show('home'); };
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

  /* S-03 テーマ選択 */
  SCREENS.home = () => {
    if (!S.started) { S.started = true; store.save(); track('start_experience'); }
    const total = allPairs().length, seen = allPairs().filter(p => S.viewed[p.id]).length;
    $app.innerHTML = `<section class="screen light"><div class="home">
      <header><div class="eyebrow">PAIR GALLERY</div>
        <h1>万博と中之島、<br>おなじ“いい”を探そう。</h1>
        <p class="lead">気になるテーマから見てみましょう。<br>4つのテーマを巡ると、あなたの傾向が見えてきます。</p></header>
      <div class="overall"><span>${seen} / ${total} ペア</span><div class="bar">${THEMES.map(t => `<i style="background:${t.color};width:${(themeViewed(t.id) / total) * 100}%"></i>`).join('')}</div></div>
      <div class="theme-grid">${THEMES.map(t => {
        const ps = PAIRS[t.id], v = themeViewed(t.id), done = themeDone(t.id);
        return `<button class="theme-card" data-theme="${t.id}" style="--c:${t.color};--soft:${t.soft}">
          ${done ? '<span class="done">✓</span>' : ''}
          <span class="name">${t.name}</span><span class="kw">${t.keywords.join('・')}</span>
          <span class="prog">${done ? '見終わりました' : v ? `${v} / ${ps.length} ペア` : `${ps.length} ペア`}</span>
          <span class="thumbs">${ps[0] ? img(ps[0].expo.thumb, t.color) + img(ps[0].naka.thumb, t.color) : ''}</span></button>`;
      }).join('')}</div>
      ${seen ? `<div class="to-result"><button class="btn-ghost" id="toResult">マイ結果を見る</button></div>` : ''}
    </div></section>`;
    $app.querySelectorAll('.theme-card').forEach(b => b.onclick = () => {
      const id = b.dataset.theme, ps = PAIRS[id];
      const firstUnseen = Math.max(0, ps.findIndex(p => !S.viewed[p.id]));
      show('pair', { theme: id, i: themeDone(id) ? 0 : firstUnseen, step: 0 });
    });
    const r = document.getElementById('toResult'); if (r) r.onclick = () => show('result');
  };

  /* S-04 / S-05 ペア比較 */
  SCREENS.pair = ({ theme, i, step }) => {
    const t = themeById[theme], ps = PAIRS[theme], p = ps[i];
    S.last = { theme, i, step }; store.save();
    const STEP_LABEL = ['万博のDROPS', '中之島のDROPS', '共通する“まちのいい”'];
    const top = `<div class="pair-top"><button class="back" id="back" aria-label="テーマ選択へ">←</button>
        <span class="tname">${t.name}</span><span class="count">${i + 1} / ${ps.length}</span></div>
      <div class="steps">${[0, 1, 2].map(k => `<i class="${k <= step ? 'on' : ''}"></i>`).join('')}</div>`;
    let body;
    if (step < 2) {
      const d = step === 0 ? p.expo : p.naka;
      const isExpo = step === 0;
      body = `<div class="drop" id="drop">
        <div class="photo">${img(d.photo, t.color)}</div>
        <div class="meta"><span class="badge" style="--bc:${isExpo ? '#fff' : t.color}"><b></b>${isExpo ? 'EXPO 2025 ／ 万博DROPS' : 'NAKANOSHIMA ／ 中之島DROPS'}</span>
          <div class="vp">視点 ${String(i + 1).padStart(2, '0')}　${esc(p.viewpoint)}</div></div>
        <div class="reel solo" id="reel" style="--in:${C.reel.inMs}ms;--out:${C.reel.outMs}ms;--rise:${C.reel.risePx}px">${d.lines.map(l => `<div class="line">${esc(l)}</div>`).join('')}</div>
        <div class="tap-hint" id="hint">タップで全文を表示</div>
        <div class="next-row"><button class="nav-arrow" id="prev" aria-label="前へ">‹</button>
          <button class="next-pill" id="next">${isExpo ? '中之島のDROPSへ ⇄' : '共通点を見る'}</button></div>
      </div>`;
    } else {
      const liked = !!S.likes[p.id];
      body = `<div class="common">
        <div class="duo">
          <figure>${img(p.expo.thumb, t.color)}<figcaption>万博</figcaption></figure>
          <span class="x">⇄</span>
          <figure>${img(p.naka.thumb, t.color)}<figcaption>中之島</figcaption></figure></div>
        <div class="vp">視点 ${String(i + 1).padStart(2, '0')}　${esc(p.viewpoint)}</div>
        <p class="phrase">${esc(p.common)}</p>
        <div class="actions">
          <button class="wakaru ${liked ? 'on' : ''}" id="wakaru" aria-pressed="${liked}">わかる！<small>${liked ? '押しました' : 'タップで共感'}</small></button>
          <div class="skip-note">押さなくても先へ進めます</div>
          <div class="next-row" style="position:static;width:100%;padding:0;margin-top:6px">
            <button class="nav-arrow" id="prev" aria-label="前へ">‹</button>
            <button class="next-pill" id="next">${i === ps.length - 1 ? 'このテーマを終える' : '次のペアへ'} ›</button></div>
        </div></div>`;
      if (!S.viewed[p.id]) { S.viewed[p.id] = true; store.save(); }
      track('view_pair', { pair_id: p.id, theme });
    }
    $app.innerHTML = `<section class="screen dark" style="--c:${t.color}"><div class="pair" id="pair">${top}${body}</div></section>`;

    const next = () => {
      if (step < 2) return show('pair', { theme, i, step: step + 1 });
      if (i < ps.length - 1) return show('pair', { theme, i: i + 1, step: 0 });
      S.last = null; store.save();
      show('complete', { theme });
    };
    const prev = () => {
      if (step > 0) return show('pair', { theme, i, step: step - 1 });
      if (i > 0) return show('pair', { theme, i: i - 1, step: 2 });
      show('home');
    };
    document.getElementById('back').onclick = () => show('home');
    document.getElementById('next').onclick = e => { e.stopPropagation(); next(); };
    document.getElementById('prev').onclick = e => { e.stopPropagation(); prev(); };
    swipe(document.getElementById('pair'), next, prev);
    current.next = next; current.prev = prev;

    if (step < 2) {
      const reel = runReel(document.getElementById('reel'));
      document.getElementById('drop').addEventListener('click', e => {
        if (e.target.closest('button')) return;
        reel.showAll();
      });
    } else {
      const $w = document.getElementById('wakaru');
      $w.onclick = () => {
        const on = !S.likes[p.id];
        if (on) S.likes[p.id] = true; else delete S.likes[p.id];
        store.save();
        $w.classList.toggle('on', on);
        $w.setAttribute('aria-pressed', on);
        $w.querySelector('small').textContent = on ? '押しました' : 'タップで共感';
        if (on) burst($w);
        track(on ? 'click_wakaru' : 'cancel_wakaru', { pair_id: p.id, theme });
      };
    }
    if (!S.guideDone) showGuide();
  };

  // F-23 / F-24：フレーズを1行ずつ表示、タップで全文
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
    for (let k = 0; k < 10; k++) {
      const s = document.createElement('i');
      s.className = 'spark';
      const a = (Math.PI * 2 * k) / 10, d = 70 + Math.random() * 20;
      s.style.left = r.left - hr.left + r.width / 2 - 4 + 'px';
      s.style.top = r.top - hr.top + r.height / 2 - 4 + 'px';
      s.style.setProperty('--dx', Math.cos(a) * d + 'px');
      s.style.setProperty('--dy', Math.sin(a) * d + 'px');
      host.style.position = 'relative';
      host.appendChild(s);
      setTimeout(() => s.remove(), 800);
    }
    if (navigator.vibrate) try { navigator.vibrate(15); } catch {}
  }

  // F-03：初回の操作ガイド
  function showGuide() {
    const g = document.createElement('div');
    g.className = 'guide';
    g.innerHTML = `<div class="hand">👆</div><p><b>左右にスワイプ</b>で進む・戻る<br>万博 → 中之島 → 共通点 の順に見ます</p>
      <p>共感したら <b>「わかる！」</b> をタップ</p><button class="btn-round">OK</button>`;
    document.querySelector('.pair').appendChild(g);
    g.onclick = () => { S.guideDone = true; store.save(); g.remove(); };
  }

  /* S-06 テーマ完了 */
  SCREENS.complete = ({ theme }) => {
    const t = themeById[theme];
    const liked = PAIRS[theme].filter(p => S.likes[p.id]).length;
    const rest = THEMES.filter(x => x.id !== theme);
    const allDone = THEMES.every(x => themeDone(x.id));
    track('complete_theme', { theme });
    $app.innerHTML = `<section class="screen dark" style="--c:${t.color}"><div class="complete">
      <div class="ring">${t.name}</div>
      <h2>${t.name}、見終わりました</h2>
      <p>「わかる！」は ${liked} / ${PAIRS[theme].length} ペア。<br>${allDone ? 'すべてのテーマを巡りました。' : 'ほかのテーマも見てみませんか？'}</p>
      ${allDone ? '' : `<div class="mini-themes">${rest.map(x => `<button style="--c:${x.color}" class="${themeDone(x.id) ? 'done' : ''}" data-theme="${x.id}">${x.name}</button>`).join('')}</div>`}
      <div class="btns"><button class="btn-round" id="toResult">マイ結果を見る</button>
        <button class="btn-ghost" id="toHome">テーマ一覧へ</button></div></div></section>`;
    $app.querySelectorAll('.mini-themes button').forEach(b => b.onclick = () => show('pair', { theme: b.dataset.theme, i: 0, step: 0 }));
    document.getElementById('toResult').onclick = () => show('result');
    document.getElementById('toHome').onclick = () => show('home');
  };

  /* S-07 マイ結果 */
  function computeResult() {
    const counts = Object.fromEntries(THEMES.map(t => [t.id, PAIRS[t.id].filter(p => S.likes[p.id]).length]));
    const max = Math.max(...Object.values(counts));
    const types = max > 0 ? THEMES.filter(t => counts[t.id] === max) : [];
    return { counts, max, types };
  }
  SCREENS.result = () => {
    const { counts, max, types } = computeResult();
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const resultType = types.map(t => t.id).join('+') || 'none';
    track('view_result', { result_type: resultType });
    // F-41：色のグラデーション（押下数で重み付け）
    let stops;
    if (total) {
      let acc = 0;
      stops = THEMES.filter(t => counts[t.id]).map(t => { const a = acc; acc += (counts[t.id] / total) * 360; return `${t.color} ${a}deg ${acc}deg`; }).join(',');
    } else stops = '#333 0deg 360deg';
    const typeLabel = types.length ? types.map(t => `${t.name}派`).join(' × ') : 'まだ見つかっていません';
    const msg = !types.length
      ? '「わかる！」はまだありません。<br>気になるテーマを、もう少し見てみませんか？'
      : types.length > 1
        ? `${types.map(t => t.keywords[0]).join('も、')}も。<br>いろんな“まちのいい”を楽しめるタイプです。`
        : `${types[0].keywords.join('・')}に心が動くタイプ。<br>中之島でも、きっと見つかります。`;
    const likedPairs = allPairs().filter(p => S.likes[p.id]);
    $app.innerHTML = `<section class="screen dark"><div class="result">
      <div class="eyebrow">MY RESULT</div>
      <div class="glow"><div class="bg" style="background:conic-gradient(${stops})"></div>
        <div class="txt"><div class="you">あなたは</div><div class="type ${types.length > 1 || !types.length ? 'small' : ''}">${typeLabel}</div></div></div>
      <p class="msg">${msg}</p>
      <h3>4テーマの傾向</h3>
      <div class="gradbar">${total ? THEMES.map(t => `<i style="flex:${counts[t.id]};background:${t.color}"></i>`).join('') : ''}</div>
      <div class="legend">${THEMES.map(t => `<div style="--c:${t.color}"><b>${counts[t.id]}</b>${t.name}</div>`).join('')}</div>
      <h3>「わかる！」したペア（${likedPairs.length}）</h3>
      ${likedPairs.length ? `<div class="liked">${likedPairs.map(p => {
        const t = themeById[p.theme];
        return `<button data-theme="${p.theme}" data-i="${p.idx}" style="--c:${t.color}"><div class="imgs">${img(p.expo.thumb, t.color)}${img(p.naka.thumb, t.color)}</div>
          <div class="cap"><b>${t.name}｜${esc(p.viewpoint)}</b>${esc(p.common)}</div></button>`;
      }).join('')}</div>` : `<div class="empty">まだありません</div>`}
      <div class="btns">
        ${types.length ? '<button class="btn-round" id="toTake">中之島で探してみる</button>' : '<button class="btn-round" id="toHome">テーマを見る</button>'}
        ${types.length ? '<button class="btn-ghost" id="share">結果をシェア</button>' : ''}
        <button class="btn-ghost" id="reset" style="border-color:#333;color:#777;font-size:12px">体験をリセット（デモ用）</button>
      </div></div></section>`;
    $app.querySelectorAll('.liked button').forEach(b => b.onclick = () => show('pair', { theme: b.dataset.theme, i: +b.dataset.i, step: 2 }));
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    on('toTake', () => show('takeaway'));
    on('toHome', () => show('home'));
    on('share', async () => {
      const text = `わたしは「${typeLabel}」でした。万博と中之島の“まちのいい”をペアで見比べる体験 #みんまちLounge`;
      track('share_result');
      try {
        if (navigator.share) await navigator.share({ text });
        else { await navigator.clipboard.writeText(text); toast('結果テキストをコピーしました'); }
      } catch { /* キャンセル */ }
    });
    on('reset', () => { store.clear(); Object.assign(S, { tutorialDone: false, guideDone: false, likes: {}, viewed: {}, last: null, started: false }); show('tutorial'); });
  };

  /* S-08 持ち帰り */
  SCREENS.takeaway = () => {
    const { types } = computeResult();
    const ts = types.length ? types : THEMES;
    const odai = ts.length === 1 ? ts[0].odai.map(o => [ts[0], o]) : ts.slice(0, 2).map(t => [t, t.odai[0]]);
    const heroPair = PAIRS[ts[0].id].find(p => S.likes[p.id]) || PAIRS[ts[0].id][0];
    $app.innerHTML = `<section class="screen light"><div class="takeaway">
      <div class="eyebrow">NEXT ／ 中之島へ</div>
      <div class="hero">${heroPair ? img(heroPair.naka.photo, ts[0].color) : ''}<div class="cap">川に囲まれた島で、<br>あなたの“いい”を。</div></div>
      <p class="intro">堂島川と土佐堀川にはさまれた中之島。水辺のベンチ、橋の上の風、夜の灯り。万博で見つけた“まちのいい”は、ここでも出会えます。</p>
      <h3>あなたへのお題</h3>
      <div class="odai">${odai.map(([t, o]) => `<div style="--c:${t.color};--soft:${t.soft}"><small>${t.name}派のあなたへ</small><p>${esc(o)}</p></div>`).join('')}</div>
      <div class="cta"><div class="t">見つけたら、DROPしよう。</div>
        <div class="s">みんまちDROP for 中之島</div>
        <a class="btn-round" id="dropLink" href="${C.dropUrl}" target="_blank" rel="noopener">みんまちDROPをひらく ↗</a></div>
      <div class="again"><button class="btn-ghost" id="again">ほかのペアも見る</button></div>
    </div></section>`;
    document.getElementById('dropLink').onclick = () => track('click_minmachi_drop');
    document.getElementById('again').onclick = () => show('home');
  };

  /* ---------- スワイプ ---------- */
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
    if (current?.name !== 'pair') return;
    if (e.key === 'ArrowRight') current.next();
    if (e.key === 'ArrowLeft') current.prev();
  });

  /* ---------- 起動 ---------- */
  async function boot() {
    show('loading');
    const t0 = Date.now();
    try {
      const get = async u => { const r = await fetch(u, { cache: 'no-cache' }); if (!r.ok) throw new Error(`${u}: ${r.status}`); return (await r.json()).records || []; };
      const [expo, naka] = await Promise.all([get(C.data.expo), get(C.data.nakanoshima)]);
      PAIRS = buildPairs(expo, naka);
      // 画像の先読み（非機能要件：会場の通信対策）
      allPairs().forEach(p => [p.expo.thumb, p.naka.thumb].forEach(src => { const im = new Image(); im.src = src; }));
      await new Promise(r => setTimeout(r, Math.max(0, 900 - (Date.now() - t0))));
      show(S.tutorialDone ? 'home' : 'tutorial');
    } catch (err) {
      console.error(err);
      show('error', { detail: err.message });
    }
  }
  boot();
})();
