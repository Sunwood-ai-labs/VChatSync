// ====== ユーティリティ ======
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const video = $('#video');
const videoFile = $('#videoFile');
const videoShell = $('.video-shell');

const commentsInput = $('#commentsInput');
const parseBtn = $('#parseBtn');
const demoBtn = $('#demoBtn');

const chatList = $('#chatList');
const chatStatus = $('.chat-status');
const autoScrollChk = $('#autoScroll');
const jumpLiveBtn = $('#jumpLive');
const chatShell = $('.chat-shell');

let comments = [];     // {t, text, color?, tag?, name?, avatar?}
let rendered = false;  // 一度DOMに並べたか
let userScrolling = false; // ユーザーが手でスクロールしているか

function formatTime(t) {
  const s = Math.max(0, Math.floor(t));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function syncChatHeight() {
  if (!videoShell || !chatShell) return;

  if (window.matchMedia('(max-width: 1200px)').matches) {
    chatShell.style.removeProperty('height');
    chatShell.style.removeProperty('max-height');
    return;
  }

  const rect = videoShell.getBoundingClientRect();
  if (rect.height > 0) {
    const targetHeight = `${rect.height}px`;
    chatShell.style.height = targetHeight;
    chatShell.style.maxHeight = targetHeight;
  }
}

// ====== 入力：動画 ======
videoFile.addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  const url = URL.createObjectURL(f);
  video.src = url;
  await video.play().catch(() => { });
  requestAnimationFrame(syncChatHeight);
});

video.addEventListener('loadedmetadata', syncChatHeight);
video.addEventListener('loadeddata', syncChatHeight);
video.addEventListener('resize', syncChatHeight);

// ====== コメントのパース ======
function normalizeRow(row) {
  const r = { ...row };
  r.t = Number(r.t ?? r.time ?? 0);
  r.text = String(r.text ?? r.comment ?? '');
  if (!r.text) return null;
  if (isNaN(r.t)) r.t = 0;
  if (r.color === undefined || r.color === null || r.color === '') r.color = '#e5e7eb';
  if (r.role && !r.tag) r.tag = r.role;
  if (r.tag) r.tag = String(r.tag);
  if (r.user && !r.name) r.name = r.user;
  if (r.speaker && !r.name) r.name = r.speaker;
  if (r.name) r.name = String(r.name);
  if (r.avatar) r.avatar = String(r.avatar);
  return r;
}

function parseComments(txt) {
  txt = (txt || '').trim();
  if (!txt) return [];
  if (txt.startsWith('[') || txt.startsWith('{')) {
    const arr = JSON.parse(txt);
    return arr.map(normalizeRow).filter(Boolean);
  }
  const lines = txt.split(/\n+/).filter(l => !l.trim().startsWith('#') && l.trim());
  return lines.map(l => {
    // CSV or TSV: t, text, color?, tag?
    const cells = l.split(/\s*,\s*|\t/);
    const row = {
      t: parseFloat(cells[0]),
      text: cells[1] ?? '',
      color: cells[2],
      tag: cells[3],
      name: cells[4],
      avatar: cells[5]
    };
    return normalizeRow(row);
  }).filter(Boolean);
}

parseBtn.addEventListener('click', () => {
  try {
    comments = parseComments(commentsInput.value).sort((a, b) => a.t - b.t);
    renderChat();
    alert(`コメント ${comments.length} 件を読み込みました`);
  } catch (e) {
    console.error(e);
    alert('コメントのパースに失敗しました（JSON/CSV/TSV対応）。');
  }
});

demoBtn.addEventListener('click', () => {
  commentsInput.value = `# t, text, color, role, name, avatar
0.6, みなさん準備いいですか？, #7dd3ff, Host, 司会 つな, 🎤
2.4, この視点いいですね, #f6a8ff, Analyst, 藍子, 🧠
4.8, うわその発想なかった, #ffd166, Viewer, 佐藤, 🙂
6.2, 今の解説助かる〜, #9ef2c9, Support, リナ, 🍀
9.5, 次のステップいきましょう, #86e1ff, Host, 司会 つな, 🎤
12.4, ここ大事ポイントです, #ffb085, Coach, コウ, 🛠
15.8, なるほどね, #c3f0ff, Viewer, ジョン, 👀`;
});

// ====== チャットDOMの構築 ======
const colorProbe = document.createElement('span');
colorProbe.style.position = 'absolute';
colorProbe.style.visibility = 'hidden';
colorProbe.style.pointerEvents = 'none';
document.body.appendChild(colorProbe);
const colorCache = new Map();

function colorWithAlpha(color, alpha) {
  if (!color) return null;
  const key = `${color}|${alpha}`;
  if (colorCache.has(key)) return colorCache.get(key);
  colorProbe.style.color = color;
  const computed = getComputedStyle(colorProbe).color; // rgb(...) or rgba(...)
  const parts = computed.match(/[\d.]+/g)?.map(Number);
  if (!parts || parts.length < 3) return null;
  const [r, g, b] = parts;
  const result = `rgba(${r}, ${g}, ${b}, ${alpha})`;
  colorCache.set(key, result);
  return result;
}

function renderChat() {
  chatList.innerHTML = '';
  comments.forEach((c, idx) => {
    const accent = c.color || '#86e1ff';
    const accentSoft = colorWithAlpha(accent, 0.2) || 'rgba(134,225,255,0.2)';
    const accentLine = colorWithAlpha(accent, 0.45) || 'rgba(134,225,255,0.45)';

    const name = (c.name && c.name.trim()) || `Viewer #${idx + 1}`;
    const avatarToken = (c.avatar && c.avatar.trim()) || '';

    const item = document.createElement('div');
    item.className = 'item';
    item.dataset.t = c.t;
    item.style.borderColor = accentLine;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    if (/^https?:\/\//i.test(avatarToken) || avatarToken.startsWith('data:')) {
      avatar.classList.add('img');
      const img = document.createElement('img');
      img.src = avatarToken;
      img.alt = name;
      avatar.appendChild(img);
    } else if (avatarToken) {
      avatar.textContent = avatarToken.slice(0, 2);
    } else {
      avatar.textContent = name.slice(0, 2).toUpperCase();
    }

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    const head = document.createElement('div');
    head.className = 'bubble-head';

    const headLeft = document.createElement('div');
    headLeft.className = 'head-left';

    const nameEl = document.createElement('span');
    nameEl.className = 'name';
    nameEl.textContent = name;
    headLeft.appendChild(nameEl);

    if (c.tag) {
      const role = document.createElement('span');
      role.className = 'role';
      role.textContent = c.tag;
      role.style.background = accentSoft;
      role.style.color = colorWithAlpha(accent, 0.9) || accent;
      headLeft.appendChild(role);
    }

    head.appendChild(headLeft);

    const jump = document.createElement('button');
    jump.type = 'button';
    jump.className = 'jump';
    jump.textContent = formatTime(c.t);
    jump.title = 'この時刻へジャンプ';
    jump.style.background = accentSoft;
    jump.style.color = colorWithAlpha(accent, 0.8) || accent;
    jump.addEventListener('click', (ev) => {
      ev.preventDefault();
      video.currentTime = c.t + 0.01;
      video.play();
      scrollToCurrent(true);
    });
    head.appendChild(jump);

    const message = document.createElement('p');
    message.className = 'message';
    message.textContent = c.text;
    if (c.color) message.style.color = colorWithAlpha(accent, 0.92) || accent;

    bubble.appendChild(head);
    bubble.appendChild(message);

    item.appendChild(avatar);
    item.appendChild(bubble);

    chatList.appendChild(item);
  });

  if (chatStatus) {
    const participantSet = new Set();
    comments.forEach((c, idx) => {
      const n = (c.name && c.name.trim()) || `Viewer #${idx + 1}`;
      participantSet.add(n);
    });
    chatStatus.textContent = `参加者 ${participantSet.size} 人`;
  }

  rendered = true;
  updateVisibility(video.currentTime);
  if (autoScrollChk.checked) scrollToCurrent(true);
}

// ====== 同期：可視/強調＆スクロール ======
function updateVisibility(now) {
  // 出現時刻を過ぎたものに .visible を付与
  const items = $$('#chatList .item');
  for (const el of items) {
    const tt = Number(el.dataset.t);
    if (now + 0.001 >= tt) el.classList.add('visible');
    else el.classList.remove('visible');
  }
}

function scrollToCurrent(force = false) {
  if (!rendered) return;
  if (!force && (!autoScrollChk.checked || userScrolling)) return;

  const items = $$('#chatList .item.visible');
  if (items.length === 0) { chatList.scrollTop = 0; return; }
  const last = items[items.length - 1];
  const offset = last.offsetTop;
  const target = Math.max(0, offset - chatList.clientHeight + last.offsetHeight + 12);
  chatList.scrollTo({ top: force ? Math.max(0, offset - 12) : target, behavior: force ? 'auto' : 'smooth' });
}

// 動画時間に合わせて更新
let ticking = false;
function onTimeUpdate() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    updateVisibility(video.currentTime);
    scrollToCurrent(false);
    ticking = false;
  });
}
video.addEventListener('timeupdate', onTimeUpdate);
video.addEventListener('seeked', () => { updateVisibility(video.currentTime); scrollToCurrent(true); });
video.addEventListener('play', () => { if (autoScrollChk.checked) scrollToCurrent(true); });

// ユーザースクロール検知
let scrollTimeout = null;
chatList.addEventListener('pointerdown', () => userScrolling = true);
chatList.addEventListener('wheel', () => { userScrolling = true; clearTimeout(scrollTimeout); scrollTimeout = setTimeout(() => userScrolling = false, 800); });
chatList.addEventListener('touchmove', () => { userScrolling = true; clearTimeout(scrollTimeout); scrollTimeout = setTimeout(() => userScrolling = false, 800); });

autoScrollChk.addEventListener('change', () => { if (autoScrollChk.checked) scrollToCurrent(true); });
jumpLiveBtn.addEventListener('click', () => scrollToCurrent(true));
window.addEventListener('resize', () => requestAnimationFrame(syncChatHeight));

// 初期：空チャットを出しておく
renderChat();
syncChatHeight();
