// ====== ユーティリティ ======
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const video = $('#video');
const videoFile = $('#videoFile');
const videoShell = $('.video-shell');
const videoColumn = $('.video-column');

const commentsInput = $('#commentsInput');
const parseBtn = $('#parseBtn');
const demoBtn = $('#demoBtn');

const stage = $('.stage');
const stageCaptureArea = $('.stage-layout') || stage;
const stageChip = $('.stage-chip');
const chatList = $('#chatList');
const chatStatus = $('.chat-status');
const autoScrollChk = $('#autoScroll');
const jumpLiveBtn = $('#jumpLive');
const chatShell = $('.chat-shell');
const pickupList = $('#pickupList');
const pickupEmpty = $('#pickupEmpty');
const pickupArea = $('.pickup-area');
const recordStartBtn = $('#recordStart');
const recordStopBtn = $('#recordStop');
const recordSaveBtn = $('#recordSave');
const recordStatus = $('#recordStatus');
const tabButtons = $$('.tab-button');
const tabPanels = $$('.tab-panel');
const videoTitleEl = $('#videoTitle');
const videoMetaEl = $('#videoMeta');

let comments = [];     // {t, text, color?, tag?, name?, avatar?}
let rendered = false;  // 一度DOMに並べたか
let userScrolling = false; // ユーザーが手でスクロールしているか
let recorder = null;
let recordingStream = null;
let displayStream = null;
let recordedChunks = [];
let recordingTimer = null;
let recordingStartedAt = null;
let lastRecordingBlob = null;
let manualCropCleanup = null;
let currentRecordingNote = '';
let activeTab = 'settings';
let currentVideoName = '';
let currentVideoSize = null;
let currentVideoURL = null;

function formatTime(t) {
  const s = Math.max(0, Math.floor(t));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatFileSize(bytes) {
  if (bytes === undefined || bytes === null) return '';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const precision = unitIndex === 0 ? 0 : (size < 10 ? 1 : 0);
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
}

function coerceFlag(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = String(value).trim();
  if (!text) return false;
  const lowered = text.toLowerCase();
  return ['1', 'true', 't', 'yes', 'y', 'on', 'pickup', 'highlight', 'featured', 'useful', '★', '◎'].includes(lowered);
}

function syncChatHeight() {
  if (!chatShell) return;

  if (window.matchMedia('(max-width: 1200px)').matches) {
    chatShell.style.removeProperty('height');
    chatShell.style.removeProperty('max-height');
    videoColumn?.style.removeProperty('min-height');
    return;
  }

  const referenceEl = videoColumn || videoShell;
  if (!referenceEl) return;
  const children = Array.from(referenceEl.children || []);
  let total = 0;
  children.forEach((child) => {
    total += child.getBoundingClientRect().height;
  });
  const styles = getComputedStyle(referenceEl);
  const gap = parseFloat(styles.rowGap || styles.gap || '0');
  if (gap && children.length > 1) {
    total += gap * (children.length - 1);
  }
  if (total > 0) {
    const targetHeight = `${total}px`;
    chatShell.style.height = targetHeight;
    chatShell.style.maxHeight = targetHeight;
    referenceEl.style.minHeight = targetHeight;
  } else {
    chatShell.style.removeProperty('height');
    chatShell.style.removeProperty('max-height');
    referenceEl.style.removeProperty('min-height');
  }
}

function activateTab(name, options = {}) {
  if (!name) return;
  const targetId = `tab-${name}`;
  if (!options.force && activeTab === name) return;
  activeTab = name;

  tabButtons.forEach((btn) => {
    const isActive = btn.dataset.tab === name;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    btn.setAttribute('tabindex', isActive ? '0' : '-1');
  });

  tabPanels.forEach((panel) => {
    const isActive = panel.id === targetId;
    panel.classList.toggle('active', isActive);
    panel.hidden = !isActive;
  });

  if (name === 'live') {
    requestAnimationFrame(() => {
      syncChatHeight();
      updateVisibility(video.currentTime);
      updatePickup(video.currentTime);
    });
  }

  if (options.focus) {
    const activeBtn = tabButtons.find((btn) => btn.dataset.tab === name);
    activeBtn?.focus();
  }
}

function updateVideoInfo({ loading = false } = {}) {
  if (videoTitleEl) {
    videoTitleEl.textContent = currentVideoName || '動画プレビュー';
  }
  if (!videoMetaEl) return;

  if (loading) {
    videoMetaEl.textContent = '読み込み中…';
    return;
  }

  if (!currentVideoName) {
    videoMetaEl.textContent = 'ファイルを選択するとタイトルが表示されます。';
    return;
  }

  const details = [];
  const { videoWidth, videoHeight, duration } = video;
  if (videoWidth && videoHeight) {
    details.push(`${videoWidth}×${videoHeight}`);
  }
  if (duration && isFinite(duration)) {
    details.push(formatDuration(duration * 1000));
  }
  if (currentVideoSize !== null) {
    details.push(formatFileSize(currentVideoSize));
  }

  videoMetaEl.textContent = details.length ? details.join(' ・ ') : '読み込み済み';
}

// ====== 入力：動画 ======
videoFile.addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) {
    if (currentVideoURL) {
      URL.revokeObjectURL(currentVideoURL);
      currentVideoURL = null;
    }
    currentVideoName = '';
    currentVideoSize = null;
    updateVideoInfo();
    video.removeAttribute('src');
    video.load();
    requestAnimationFrame(syncChatHeight);
    return;
  }

  if (currentVideoURL) {
    URL.revokeObjectURL(currentVideoURL);
    currentVideoURL = null;
  }

  currentVideoName = f.name || 'ローカル動画';
  currentVideoSize = typeof f.size === 'number' ? f.size : null;
  updateVideoInfo({ loading: true });

  currentVideoURL = URL.createObjectURL(f);
  video.src = currentVideoURL;
  await video.play().catch(() => { });
  requestAnimationFrame(syncChatHeight);
});

function handleLoadedMetadata() {
  updateVideoInfo();
  syncChatHeight();
}

video.addEventListener('loadedmetadata', handleLoadedMetadata);
video.addEventListener('loadeddata', () => requestAnimationFrame(syncChatHeight));
video.addEventListener('emptied', () => updateVideoInfo());

if (window.ResizeObserver) {
  const layoutObserver = new ResizeObserver(() => requestAnimationFrame(syncChatHeight));
  if (videoColumn) layoutObserver.observe(videoColumn);
  if (pickupList) layoutObserver.observe(pickupList);
  if (pickupArea) layoutObserver.observe(pickupArea);
  if (videoShell) layoutObserver.observe(videoShell);
}

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
  const pickupRaw = r.pickup ?? r.featured ?? r.highlight ?? r.pin ?? r.flag;
  r.pickup = coerceFlag(pickupRaw);
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
    // CSV or TSV: t, text, color?, tag?, name?, avatar?, pickup?
    const cells = l.split(/\s*,\s*|\t/);
    const row = {
      t: parseFloat(cells[0]),
      text: cells[1] ?? '',
      color: cells[2],
      tag: cells[3],
      name: cells[4],
      avatar: cells[5],
      pickup: cells[6]
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
  commentsInput.value = `# t, text, color, role, name, avatar, pickup
0.6, みなさん準備いいですか？ 今日は VChatSync の新機能を一緒に試しながら、どんな場面で活用できるかをライブで探ります。, #7dd3ff, Host, 司会 つな, 🎤,
2.4, この視点いいですね。コメントを整理しつつハイライトを拾ってくれるので、あとから見返すときの編集ポイントが一目でわかりそう。, #f6a8ff, Analyst, 藍子, 🧠, yes
4.8, うわその発想なかった！ピックアップ用のコメントが自動でまとまるの、イベントの要点メモとしても使えそう。, #ffd166, Viewer, 佐藤, 🙂
6.2, 今の解説助かる〜。タイムスタンプに合わせてスクロールするから見逃しが減りますね。特に長いセッションで効きそうです。, #9ef2c9, Support, リナ, 🍀, true
9.5, 次のステップいきましょう。これからは「カルーセル型の応答設計」について触れていくので要チェックです。, #86e1ff, Host, 司会 つな, 🎤,
12.4, ここ大事ポイントです。カルーセル型は複数候補を提示してユーザー選択を促すUIパターンで、SNSボットでも採用例が増えてます。, #ffb085, Coach, コウ, 🛠, highlight
15.8, なるほどね。複数候補を出すと回答の網羅性がぐっと上がるから、FAQ型のサポートにも転用できそうです。, #c3f0ff, Viewer, ジョン, 👀,
19.6, 今の説明、まとめると「選択肢は3件前後で簡潔に」「並び順に優先度をつける」がコツ、って理解で合ってるかな？, #95f5d8, Analyst, 藍子, 🧠,
23.2, その通りです！加えて、カルーセル上の CTA（Call To Action）は動詞から始めるとクリック率が上がります。, #f8a76b, Coach, コウ, 🛠, true
26.7, ここで用語メモ：「カルーセルUI」= 横スワイプや矢印操作で複数カードを切り替える表示形式のこと。SNS広告やチャットボットで多用。, #7dd3ff, Host, 司会 つな, 🎤, pickup
31.4, 参考リンク：Meta のメッセンジャーボットではカルーセルに商品カードを載せて、そのまま購入導線につなぐ改善が行われています。, #b48bff, Analyst, 藍子, 🧠,
35.8, 参加者の皆さんも、自分のプロジェクトだとどんな情報を並べると効果がありそうか考えてみてくださいね。, #86e1ff, Host, 司会 つな, 🎤,
38.9, 私のチームでは「注意喚起」「成功事例」「FAQリンク」をカルーセルの3枚にしてクリック率が1.4倍になったよ！, #f7cf6a, Support, リナ, 🍀, yes
41.5, それめっちゃ参考になる！重要度の高い情報を先頭に置くだけでも数字が変わるんですね。, #ffd166, Viewer, 佐藤, 🙂
44.7, 最後にお知らせ。今日はこのあと、ピックアップ解説をもとに短いまとめノートを配布する予定です！, #7dd3ff, Host, 司会 つな, 🎤,`;
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
  if (pickupList) pickupList.innerHTML = '';

  const pickupFragment = document.createDocumentFragment();
  let pickupCount = 0;

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

    if (c.pickup && pickupList) {
      const card = document.createElement('article');
      card.className = 'pickup-card';
      card.classList.add('hidden');
      card.dataset.t = c.t;
      card.style.borderColor = accentLine;
      card.style.setProperty('--accent-color', accent);
      card.style.setProperty('--accent-shadow', colorWithAlpha(accent, 0.35) || 'rgba(79, 180, 255, 0.25)');
      card.title = 'このコメントの時間へジャンプ';

      const meta = document.createElement('div');
      meta.className = 'pickup-meta';

      const timeEl = document.createElement('span');
      timeEl.className = 'pickup-time';
      timeEl.textContent = formatTime(c.t);
      timeEl.style.background = colorWithAlpha(accent, 0.28) || 'rgba(134,225,255,0.28)';
      meta.appendChild(timeEl);

      if (c.tag) {
        const role = document.createElement('span');
        role.className = 'pickup-role';
        role.textContent = c.tag;
        role.style.borderColor = accentLine;
        role.style.color = colorWithAlpha(accent, 0.9) || accent;
        meta.appendChild(role);
      }

      const text = document.createElement('p');
      text.className = 'pickup-text';
      text.textContent = c.text;

      const author = document.createElement('div');
      author.className = 'pickup-author';
      author.textContent = name;

      const hint = document.createElement('span');
      hint.className = 'pickup-hint';
      hint.textContent = 'クリックでジャンプ';
      author.appendChild(hint);

      card.appendChild(meta);
      card.appendChild(text);
      card.appendChild(author);

      const jumpTime = c.t;
      card.addEventListener('click', (ev) => {
        ev.preventDefault();
        video.currentTime = jumpTime + 0.01;
        video.play();
        scrollToCurrent(true);
      });

      pickupFragment.appendChild(card);
      pickupCount += 1;
    }
  });

  if (pickupList) {
    if (pickupCount) {
      pickupList.appendChild(pickupFragment);
      pickupEmpty?.classList.add('hidden');
    } else {
      pickupEmpty?.classList.remove('hidden');
    }
  }

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
  updatePickup(video.currentTime);
  syncChatHeight();
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

function updatePickup(now) {
  if (!pickupList) return;
  const cards = pickupList.querySelectorAll('.pickup-card');
  if (!cards.length) return;
  let latest = null;
  let upcoming = null;
  const threshold = now + 0.001;
  for (const card of cards) {
    card.classList.remove('active', 'up-next');
    card.classList.add('hidden');
    const tt = Number(card.dataset.t ?? 0);
    if (tt <= threshold) {
      if (!latest || tt >= Number(latest.dataset.t ?? 0)) latest = card;
    } else if (!upcoming || tt < Number(upcoming.dataset.t ?? 0)) {
      upcoming = card;
    }
  }
  if (latest) {
    latest.classList.remove('hidden');
    latest.classList.add('active');
  } else if (upcoming) {
    upcoming.classList.remove('hidden');
    upcoming.classList.add('up-next');
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
    updatePickup(video.currentTime);
    scrollToCurrent(false);
    ticking = false;
  });
}
video.addEventListener('timeupdate', onTimeUpdate);
video.addEventListener('seeked', () => { updateVisibility(video.currentTime); updatePickup(video.currentTime); scrollToCurrent(true); });
video.addEventListener('play', () => { if (autoScrollChk.checked) scrollToCurrent(true); updatePickup(video.currentTime); });

// ユーザースクロール検知
let scrollTimeout = null;
chatList.addEventListener('pointerdown', () => userScrolling = true);
chatList.addEventListener('wheel', () => { userScrolling = true; clearTimeout(scrollTimeout); scrollTimeout = setTimeout(() => userScrolling = false, 800); });
chatList.addEventListener('touchmove', () => { userScrolling = true; clearTimeout(scrollTimeout); scrollTimeout = setTimeout(() => userScrolling = false, 800); });

autoScrollChk.addEventListener('change', () => { if (autoScrollChk.checked) scrollToCurrent(true); });
jumpLiveBtn.addEventListener('click', () => scrollToCurrent(true));
window.addEventListener('resize', () => requestAnimationFrame(syncChatHeight));

// ====== 録画機能 ======
function getSupportedMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4;codecs=h264,aac'
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) || '';
}

function canUseManualCrop() {
  return typeof window !== 'undefined'
    && 'MediaStreamTrackProcessor' in window
    && 'MediaStreamTrackGenerator' in window
    && 'VideoFrame' in window
    && typeof TransformStream === 'function';
}

function createManualCropTrack(videoTrack) {
  if (!canUseManualCrop() || !stageCaptureArea) return null;
  const processor = new MediaStreamTrackProcessor({ track: videoTrack });
  const generator = new MediaStreamTrackGenerator({ kind: 'video' });
  const abortController = new AbortController();

  const transformer = new TransformStream({
    transform(frame, controller) {
      const enqueueFallback = () => {
        try {
          const duplicate = typeof frame.clone === 'function' ? frame.clone() : new VideoFrame(frame);
          controller.enqueue(duplicate);
        } catch (cloneErr) {
          console.error('failed to clone frame for fallback', cloneErr);
        }
      };

      try {
        if (!stageCaptureArea?.isConnected) {
          enqueueFallback();
          return;
        }
        const rect = stageCaptureArea.getBoundingClientRect();
        if (!rect || rect.width < 2 || rect.height < 2) {
          enqueueFallback();
          return;
        }

        const displayWidth = frame.displayWidth || frame.codedWidth || videoTrack.getSettings()?.width || 1;
        const displayHeight = frame.displayHeight || frame.codedHeight || videoTrack.getSettings()?.height || 1;
        const viewport = window.visualViewport;
        const viewportWidth = viewport?.width ?? window.innerWidth ?? 1;
        const viewportHeight = viewport?.height ?? window.innerHeight ?? 1;
        const viewportOffsetX = viewport?.offsetLeft ?? 0;
        const viewportOffsetY = viewport?.offsetTop ?? 0;
        const dpr = window.devicePixelRatio || 1;

        const approxTabWidth = Math.round(viewportWidth * dpr);
        const approxTabHeight = Math.round(viewportHeight * dpr);
        const looksLikeTabCapture =
          Math.abs(displayWidth - approxTabWidth) <= displayWidth * 0.12 &&
          Math.abs(displayHeight - approxTabHeight) <= displayHeight * 0.12;

        let baseWidth = window.screen?.width || viewportWidth;
        let baseHeight = window.screen?.height || viewportHeight;
        let originLeft = (window.screenX ?? window.screenLeft ?? 0) + rect.left;
        let originTop = (window.screenY ?? window.screenTop ?? 0) + rect.top;

        if (looksLikeTabCapture) {
          baseWidth = viewportWidth;
          baseHeight = viewportHeight;
          originLeft = rect.left + viewportOffsetX;
          originTop = rect.top + viewportOffsetY;
        }

        const ratioX = baseWidth > 0 ? displayWidth / baseWidth : 1;
        const ratioY = baseHeight > 0 ? displayHeight / baseHeight : 1;

        let cropX = Math.max(0, Math.floor(originLeft * ratioX));
        let cropY = Math.max(0, Math.floor(originTop * ratioY));
        let cropWidth = Math.max(1, Math.round(rect.width * ratioX));
        let cropHeight = Math.max(1, Math.round(rect.height * ratioY));

        if (cropX + cropWidth > displayWidth) cropWidth = displayWidth - cropX;
        if (cropY + cropHeight > displayHeight) cropHeight = displayHeight - cropY;

        if (cropWidth < 2 || cropHeight < 2) {
          enqueueFallback();
          return;
        }

        const cropped = new VideoFrame(frame, {
          visibleRect: { x: cropX, y: cropY, width: cropWidth, height: cropHeight },
          timestamp: frame.timestamp,
          duration: frame.duration
        });
        controller.enqueue(cropped);
      } catch (err) {
        console.warn('manual crop transform failed, outputting full frame', err);
        enqueueFallback();
      } finally {
        frame.close();
      }
    }
  });

  processor.readable
    .pipeThrough(transformer)
    .pipeTo(generator.writable, { signal: abortController.signal })
    .catch((err) => {
      if (err?.name !== 'AbortError') console.error('manual crop pipeline error', err);
    });

  const cleanup = () => {
    abortController.abort();
    try { generator.stop?.(); } catch (err) { if (err?.name !== 'InvalidStateError') console.warn('generator stop failed', err); }
  };

  return { track: generator, stop: cleanup };
}

function clearRecordingTimer() {
  if (recordingTimer) {
    clearInterval(recordingTimer);
    recordingTimer = null;
  }
}

function updateRecordingUI(state, message) {
  if (!recordStatus) return;
  if (typeof message === 'string') recordStatus.textContent = message;
  recordStatus.classList.toggle('recording', state === 'recording');
}

function setStageChipRecording(active) {
  if (!stageChip) return;
  if (active) {
    stageChip.textContent = 'REC';
    stageChip.classList.add('recording');
  } else {
    stageChip.textContent = 'CHAT READY';
    stageChip.classList.remove('recording');
  }
}

function cleanupRecordingStreams() {
  if (typeof manualCropCleanup === 'function') {
    try { manualCropCleanup(); } catch (err) { console.warn('manual crop cleanup failed', err); }
  }
  manualCropCleanup = null;
  displayStream?.getTracks().forEach((track) => track.stop());
  recordingStream?.getTracks().forEach((track) => track.stop());
  displayStream = null;
  recordingStream = null;
  if (!recorder) currentRecordingNote = '';
}

async function startRecording() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    alert('このブラウザでは画面録画に対応していません。Chrome / Edge の最新バージョンを利用してください。');
    return;
  }
  if (recorder) return;

  activateTab('live');

  if (recordStartBtn) recordStartBtn.disabled = true;
  if (recordStopBtn) recordStopBtn.disabled = true;
  recordSaveBtn?.classList.add('hidden');
  recordSaveBtn?.setAttribute('disabled', 'true');
  lastRecordingBlob = null;
  recordedChunks = [];

  let localDisplayStream = null;
  try {
    localDisplayStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: 30,
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        logicalSurface: true,
        displaySurface: 'browser'
      },
      audio: false
    });
  } catch (err) {
    console.warn('display capture cancelled or failed', err);
    updateRecordingUI('idle', '録画は開始されませんでした（キャンセルされました）。');
    if (recordStartBtn) recordStartBtn.disabled = false;
    return;
  }

  const videoTrack = localDisplayStream.getVideoTracks()[0];
  if (!videoTrack) {
    localDisplayStream.getTracks().forEach((track) => track.stop());
    updateRecordingUI('idle', '画面の映像トラックを取得できませんでした。');
    if (recordStartBtn) recordStartBtn.disabled = false;
    return;
  }

  let cropApplied = false;
  const cropSource = stageCaptureArea || stage;
  if (typeof videoTrack.cropTo === 'function' && window.CropTarget?.fromElement && cropSource) {
    try {
      const target = await window.CropTarget.fromElement(cropSource);
      await videoTrack.cropTo(target);
      cropApplied = true;
    } catch (cropErr) {
      console.warn('cropTo is not available or failed', cropErr);
    }
  }

  let finalVideoTrack = videoTrack;
  if (!cropApplied) {
    const manual = createManualCropTrack(videoTrack);
    if (manual?.track) {
      finalVideoTrack = manual.track;
      manualCropCleanup = manual.stop;
      cropApplied = true;
    }
  }

  currentRecordingNote = cropApplied ? '（ライブビュー領域のみ）' : '（共有した映像全体）';

  displayStream = localDisplayStream;
  recordingStream = new MediaStream([finalVideoTrack]);

  const displayAudio = localDisplayStream.getAudioTracks();
  if (displayAudio.length) {
    displayAudio.forEach((track) => recordingStream.addTrack(track));
  } else if (typeof video.captureStream === 'function') {
    try {
      const videoStream = video.captureStream();
      videoStream.getAudioTracks().forEach((track) => recordingStream.addTrack(track));
    } catch (audioErr) {
      console.warn('failed to attach video audio track', audioErr);
    }
  }

  const options = {};
  const supported = getSupportedMimeType();
  if (supported) options.mimeType = supported;

  try {
    recorder = new MediaRecorder(recordingStream, options);
  } catch (err) {
    console.error('Failed to create MediaRecorder with options, retrying without options', err);
    try {
      recorder = new MediaRecorder(recordingStream);
    } catch (fatal) {
      console.error('MediaRecorder creation failed', fatal);
      cleanupRecordingStreams();
      updateRecordingUI('idle', 'MediaRecorder を初期化できませんでした。');
      if (recordStartBtn) recordStartBtn.disabled = false;
      return;
    }
  }

  recorder.addEventListener('dataavailable', (ev) => {
    if (ev.data && ev.data.size > 0) recordedChunks.push(ev.data);
  });
  recorder.addEventListener('stop', handleRecorderStop, { once: true });
  recorder.addEventListener('error', (ev) => {
    console.error('MediaRecorder error', ev.error ?? ev);
    stopRecording(true);
  }, { once: true });

  try {
    recorder.start(1000);
  } catch (err) {
    console.error('MediaRecorder failed to start', err);
    cleanupRecordingStreams();
    recorder = null;
    updateRecordingUI('idle', '録画を開始できませんでした。');
    if (recordStartBtn) recordStartBtn.disabled = false;
    return;
  }

  recordingStartedAt = Date.now();
  const recordingSuffix = currentRecordingNote ?? '';
  updateRecordingUI('recording', `録画中 00:00…${recordingSuffix}`);
  clearRecordingTimer();
  recordingTimer = setInterval(() => {
    if (!recordingStartedAt) return;
    const elapsed = Date.now() - recordingStartedAt;
    updateRecordingUI('recording', `録画中 ${formatDuration(elapsed)}…${recordingSuffix}`);
  }, 500);

  if (recordStopBtn) recordStopBtn.disabled = false;
  setStageChipRecording(true);

  videoTrack.addEventListener('ended', () => stopRecording(true), { once: true });
  if (finalVideoTrack !== videoTrack) {
    finalVideoTrack.addEventListener('ended', () => stopRecording(true), { once: true });
  }
}

function stopRecording(triggeredByTrackEnd = false) {
  if (!recorder) {
    cleanupRecordingStreams();
    return;
  }
  if (recordStopBtn) recordStopBtn.disabled = true;
  clearRecordingTimer();
  updateRecordingUI('idle', triggeredByTrackEnd ? '録画を終了しました。' : '録画を停止中…');
  try {
    recorder.stop();
  } catch (err) {
    console.error('MediaRecorder stop failed', err);
  }
  cleanupRecordingStreams();
}

function handleRecorderStop() {
  const chunks = recordedChunks.slice();
  recorder = null;
  clearRecordingTimer();
  setStageChipRecording(false);
  if (recordStopBtn) recordStopBtn.disabled = true;

  if (chunks.length) {
    const mimeType = chunks[0]?.type || getSupportedMimeType() || 'video/webm';
    lastRecordingBlob = new Blob(chunks, { type: mimeType });
    recordSaveBtn?.classList.remove('hidden');
    recordSaveBtn?.removeAttribute('disabled');
    const duration = recordingStartedAt ? Date.now() - recordingStartedAt : 0;
    const note = currentRecordingNote ? ` ${currentRecordingNote}` : '';
    updateRecordingUI('ready', `録画が完了しました（${formatDuration(duration)}）。「録画を保存」でダウンロードできます。${note}`);
  } else {
    lastRecordingBlob = null;
    recordSaveBtn?.classList.add('hidden');
    recordSaveBtn?.setAttribute('disabled', 'true');
    updateRecordingUI('idle', '録画データは保存されませんでした。');
  }

  recordingStartedAt = null;
  recordedChunks = [];
  currentRecordingNote = '';
  if (recordStartBtn) recordStartBtn.disabled = false;
}

function saveRecording() {
  if (!lastRecordingBlob) return;
  const url = URL.createObjectURL(lastRecordingBlob);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const a = document.createElement('a');
  a.href = url;
  a.download = `VChatSync-${stamp}.webm`;
  document.body.appendChild(a);
  a.click();
  requestAnimationFrame(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
  updateRecordingUI('ready', '録画ファイルを保存しました。必要であれば再度ダウンロードできます。');
}

recordStartBtn?.addEventListener('click', startRecording);
recordStopBtn?.addEventListener('click', () => stopRecording(false));
recordSaveBtn?.addEventListener('click', saveRecording);

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => activateTab(btn.dataset.tab, { focus: false }));
});

tabPanels.forEach((panel) => {
  panel.hidden = panel.id !== 'tab-settings';
});
activateTab('settings', { force: true });

// 初期：空チャットを出しておく
renderChat();
syncChatHeight();
updateVideoInfo();
