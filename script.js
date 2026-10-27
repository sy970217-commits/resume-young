// =========================================================
// 방문자 화면: Supabase에서 데이터를 읽어 와 화면을 채운다.
// =========================================================

// Supabase 연결 정보 (공개 키라서 파일에 넣어도 괜찮다. 비밀 키는 절대 넣지 않는다.)
const SUPABASE_URL = 'https://tjcfqzggawvoocvwtois.supabase.co';
const SUPABASE_KEY = 'sb_publishable_EIw_nO7UbRAfxn2bVqRAcA_UoSl6aCm';

// 브라우저에 저장해 두는 값의 이름
const CLIENT_ID_KEY = 'resume_client_id'; // 이 브라우저의 좋아요용 번호
const LIKED_KEY = 'resume_liked';         // 이 브라우저가 좋아요를 누른 카드 번호들

const HEART_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8 3.6 4.5 7.1 4.5c2 0 3.6 1.1 4.9 2.8 1.3-1.7 2.9-2.8 4.9-2.8 3.5 0 5.6 3.5 4.4 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/></svg>';

const state = {
  clientId: '',
  counts: {},       // 카드 id → 좋아요 수
  liked: new Set(), // 이 브라우저가 이미 좋아요한 카드 id
};


// ---------------------------------------------------------
// Supabase 부르기 (브라우저 fetch로 직접)
// ---------------------------------------------------------
async function api(path, options = {}) {
  const headers = { apikey: SUPABASE_KEY, ...options.headers };
  if (options.body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const error = new Error(`Supabase 요청 실패 (${res.status})`);
    error.status = res.status;
    throw error;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}


// ---------------------------------------------------------
// 작은 도우미들
// ---------------------------------------------------------
const $ = (id) => document.getElementById(id);

// 태그를 만들고 글자를 넣는다. (글자는 textContent로 넣어서 HTML로 해석되지 않게 한다)
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

// http/https 주소만 쓴다
function safeUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url, location.href);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : '';
  } catch {
    return '';
  }
}

// 글자 수 (한글·이모지도 한 글자로 센다)
const charLength = (text) => Array.from(text).length;

function readStorage(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeStorage(key, value) {
  try { localStorage.setItem(key, value); } catch { /* 저장이 막힌 브라우저면 넘어간다 */ }
}

let toastTimer;
function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
}

// 줄바꿈이나 쉼표로 나눠 목록으로 만든다
function splitLines(text, alsoComma) {
  const pattern = alsoComma ? /[\n,]/ : /\n/;
  return (text || '').split(pattern).map((s) => s.trim()).filter(Boolean);
}

function fillList(listId, items) {
  const list = $(listId);
  list.textContent = '';
  items.forEach((item) => list.append(el('li', '', item)));
  list.closest('.fact').hidden = items.length === 0;
}

function formatDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}


// ---------------------------------------------------------
// 이 브라우저의 좋아요용 번호(client_id)
// ---------------------------------------------------------
function getClientId() {
  let id = readStorage(CLIENT_ID_KEY);
  if (!id || id.length < 8 || id.length > 64) {
    id = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    writeStorage(CLIENT_ID_KEY, id);
  }
  return id;
}

function loadLikedFromStorage() {
  try {
    const saved = JSON.parse(readStorage(LIKED_KEY) || '[]');
    if (Array.isArray(saved)) saved.forEach((id) => state.liked.add(Number(id)));
  } catch { /* 망가진 값이면 무시 */ }
}

function saveLiked() {
  writeStorage(LIKED_KEY, JSON.stringify([...state.liked]));
}


// ---------------------------------------------------------
// 1. 프로필
// ---------------------------------------------------------
async function loadProfile() {
  try {
    const rows = await api('profile?select=*&id=eq.1');
    const profile = rows && rows[0];
    if (!profile) {
      $('name').textContent = '프로필이 아직 없습니다';
      return;
    }
    renderProfile(profile);
  } catch (error) {
    console.error(error);
    $('name').textContent = '프로필을 불러오지 못했습니다';
  }
}

function renderProfile(p) {
  if (p.name) document.title = `${p.name} 포트폴리오`;

  // 사진: 있으면 보여 주고, 없으면 회색 자리
  const photoUrl = safeUrl(p.photo_url);
  const img = $('photo-img');
  if (photoUrl) {
    img.src = photoUrl;
    img.hidden = false;
    $('photo-empty').hidden = true;
    img.onerror = () => { img.hidden = true; $('photo-empty').hidden = false; };
  }

  $('name').textContent = p.name;
  $('job').textContent = p.title;
  $('badge-text').textContent = p.career_badge;
  $('badge').hidden = !p.career_badge;

  $('c-name').textContent = p.name;
  $('c-email').textContent = p.email;
  $('c-phone').textContent = p.phone;
  $('c-location').textContent = p.location;

  renderHeadline(p.headline, p.name);
  $('intro').textContent = p.intro;

  fillList('education', splitLines(p.education));
  fillList('skills', splitLines(p.skills, true));
  fillList('experience', splitLines(p.experience));

  $('quote').textContent = p.quote;
  $('quote').hidden = !p.quote;
}

// 한 줄 소개: 첫 쉼표 뒤에서 줄을 바꾸고, 그 줄의 이름까지 파란 글씨 + 밑줄
function renderHeadline(headline, name) {
  const node = $('headline');
  node.textContent = '';
  if (!headline) return;

  const comma = headline.indexOf(',');
  const first = comma >= 0 ? headline.slice(0, comma + 1) : '';
  const second = comma >= 0 ? headline.slice(comma + 1).trim() : headline;
  if (first) node.append(first, document.createElement('br'));

  const at = name ? second.indexOf(name) : -1;
  if (at >= 0) {
    const end = at + name.length;
    node.append(el('span', 'accent', second.slice(0, end)), second.slice(end));
  } else {
    node.append(second);
  }
}


// ---------------------------------------------------------
// 2. 포트폴리오 카드 + 좋아요
// ---------------------------------------------------------
async function loadProjects() {
  const box = $('cards');
  let projects;
  try {
    projects = await api('projects?select=*&order=sort_order.asc,id.asc');
  } catch (error) {
    console.error(error);
    box.textContent = '';
    box.append(el('p', 'empty', '프로젝트를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.'));
    return;
  }

  // 좋아요 수와 "내가 누른 카드"는 실패해도 카드는 보여 준다
  try {
    const [allLikes, myLikes] = await Promise.all([
      api('likes?select=project_id'),
      api(`likes?select=project_id&client_id=eq.${encodeURIComponent(state.clientId)}`),
    ]);
    allLikes.forEach((row) => {
      state.counts[row.project_id] = (state.counts[row.project_id] || 0) + 1;
    });
    myLikes.forEach((row) => state.liked.add(row.project_id));
    saveLiked();
  } catch (error) {
    console.error(error);
  }

  box.textContent = '';
  if (!projects.length) {
    box.append(el('p', 'empty', '아직 등록된 프로젝트가 없습니다.'));
    return;
  }
  projects.forEach((project) => box.append(makeCard(project)));
}

function makeCard(project) {
  const card = el('article', 'card');

  // 누르는 부분: 썸네일 + 글
  const open = el('button', 'card-open');
  open.type = 'button';
  const target = safeUrl(project.file_url) || safeUrl(project.thumbnail_url);
  if (target) {
    open.setAttribute('aria-label', `${project.title} 자료를 새 탭에서 열기`);
    open.addEventListener('click', () => window.open(target, '_blank', 'noopener'));
  } else {
    open.disabled = true;
  }

  // 점 세 개가 있는 브라우저 창 모양 썸네일
  const browser = el('div', 'browser');
  const bar = el('div', 'browser-bar');
  bar.append(el('i'), el('i'), el('i'));
  const view = el('div', 'browser-view');
  const thumb = safeUrl(project.thumbnail_url);
  if (thumb) {
    const img = el('img');
    img.src = thumb;
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = () => img.remove();
    view.append(img);
  }
  browser.append(bar, view);

  const body = el('div', 'card-body');
  const kicker = [project.number && `${project.number}.`, project.category].filter(Boolean).join(' ');
  if (kicker) body.append(el('p', 'card-kicker', kicker));
  body.append(el('h4', 'card-title', project.title));
  body.append(el('p', 'card-desc', project.description));

  open.append(browser, body);

  // 아래쪽: 회색 태그 + 하트
  const foot = el('div', 'card-foot');
  const tags = el('div', 'tags');
  (project.tags || []).forEach((text) => {
    const tag = el('span', 'tag', text);
    tag.title = text; // 글자가 잘리면 마우스를 올려 전체를 본다
    tags.append(tag);
  });
  foot.append(tags, makeLikeButton(project));

  card.append(open, foot);
  return card;
}

function makeLikeButton(project) {
  const button = el('button', 'like');
  button.type = 'button';
  button.innerHTML = HEART_SVG;
  const count = el('span', 'like-count');
  button.append(count);

  const update = () => {
    const liked = state.liked.has(project.id);
    count.textContent = state.counts[project.id] || 0;
    button.classList.toggle('is-liked', liked);
    button.setAttribute('aria-pressed', liked ? 'true' : 'false');
    button.setAttribute('aria-label', liked ? `좋아요 ${count.textContent}개 (이미 눌렀어요)` : `좋아요 ${count.textContent}개, 누르면 좋아요`);
  };
  update();

  button.addEventListener('click', async () => {
    if (state.liked.has(project.id) || button.disabled) return;
    button.disabled = true;
    try {
      await api('likes', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: { project_id: project.id, client_id: state.clientId },
      });
      state.counts[project.id] = (state.counts[project.id] || 0) + 1;
      state.liked.add(project.id);
    } catch (error) {
      if (error.status === 409) {
        // 이미 이 브라우저로 누른 카드 (숫자에는 이미 들어 있다)
        state.liked.add(project.id);
      } else {
        console.error(error);
        showToast('좋아요를 남기지 못했습니다. 잠시 후 다시 눌러 주세요.');
      }
    }
    saveLiked();
    button.disabled = false;
    update();
  });

  return button;
}


// ---------------------------------------------------------
// 3. 방명록
// ---------------------------------------------------------
async function loadGuestbook() {
  const list = $('gb-list');
  try {
    const rows = await api('resume_guestbook?select=id,nickname,message,created_at&order=created_at.desc,id.desc');
    list.textContent = '';
    if (!rows.length) {
      list.append(el('li', 'empty', '아직 남겨진 글이 없습니다. 첫 글을 남겨 주세요!'));
      return;
    }
    rows.forEach((row) => list.append(makeGuestbookItem(row)));
  } catch (error) {
    console.error(error);
    list.textContent = '';
    list.append(el('li', 'empty', '방명록을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.'));
  }
}

function makeGuestbookItem(row) {
  const item = el('li', 'gb-item');
  const meta = el('div', 'gb-meta');
  meta.append(el('span', 'gb-nick', row.nickname), el('span', 'gb-date', formatDate(row.created_at)));
  item.append(meta, el('p', 'gb-text', row.message));
  return item;
}

function setGuestbookStatus(message, isError) {
  const status = $('gb-status');
  status.textContent = message;
  status.classList.toggle('is-error', Boolean(isError));
}

async function submitGuestbook() {
  const nickname = $('gb-nick').value.trim();
  const message = $('gb-msg').value.trim();

  if (!nickname || charLength(nickname) > 20) {
    setGuestbookStatus('별명을 1~20자로 적어 주세요.', true);
    $('gb-nick').focus();
    return;
  }
  if (!message || charLength(message) > 200) {
    setGuestbookStatus('한마디를 1~200자로 적어 주세요.', true);
    $('gb-msg').focus();
    return;
  }

  const button = $('gb-submit');
  button.disabled = true;
  setGuestbookStatus('남기는 중…');
  try {
    const rows = await api('resume_guestbook?select=id,nickname,message,created_at', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: { nickname, message },
    });
    const list = $('gb-list');
    list.querySelectorAll('.empty').forEach((node) => node.remove());
    list.prepend(makeGuestbookItem(rows[0]));
    $('gb-msg').value = '';
    updateCount();
    setGuestbookStatus('');
    showToast('방명록을 남겼습니다. 고맙습니다!');
  } catch (error) {
    console.error(error);
    setGuestbookStatus('남기지 못했습니다. 잠시 후 다시 시도해 주세요.', true);
  } finally {
    button.disabled = false;
  }
}

function updateCount() {
  $('gb-count').textContent = `${charLength($('gb-msg').value)} / 200`;
}


// ---------------------------------------------------------
// 시작
// ---------------------------------------------------------
state.clientId = getClientId();
loadLikedFromStorage();

$('gb-submit').addEventListener('click', submitGuestbook);
$('gb-msg').addEventListener('input', updateCount);

loadProfile();
loadProjects();
loadGuestbook();
