// Supabase 주소와 공개 키 (공개 키라서 화면 파일에 넣어도 된다)
var SUPABASE_URL = 'https://tjcfqzggawvoocvwtois.supabase.co';
var SUPABASE_KEY = 'sb_publishable_EIw_nO7UbRAfxn2bVqRAcA_UoSl6aCm';

var ICONS = {
  person: 'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4 0-8 2-8 5v3h16v-3c0-3-4-5-8-5z',
  mail: 'M2 5h20v14H2V5zm2 2v.5l8 5 8-5V7H4z',
  phone: 'M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11 11 0 0 0 3.6.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.6 3.6a1 1 0 0 1-.25 1l-2.25 2.2z',
  pin: 'M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.500A2.5 2.5 0 1 1 12 6.500a2.5 2.5 0 0 1 0 5z'
};

// ---------- 도우미 ----------
function api(path, options) {
  options = options || {};
  var headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
  for (var k in options.headers) { headers[k] = options.headers[k]; }
  return fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method: options.method || 'GET',
    headers: headers,
    body: options.body
  });
}

function getJson(path) {
  return api(path).then(function (res) {
    if (!res.ok) { throw new Error('불러오기 실패: ' + path); }
    return res.json();
  });
}

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) { node.className = className; }
  if (text !== undefined && text !== null) { node.textContent = text; }
  return node;
}

function svgIcon(pathData) {
  var ns = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  var path = document.createElementNS(ns, 'path');
  path.setAttribute('d', pathData);
  svg.appendChild(path);
  return svg;
}

function isWebUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

function storageGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* 저장 못 해도 화면은 동작 */ }
}

function lines(text) {
  return (text || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
}

function formatDate(iso) {
  var d = new Date(iso);
  if (isNaN(d)) { return ''; }
  var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
  return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

// 이 브라우저를 구분하는 값 (좋아요 한 번만 누르기용)
function getClientId() {
  var id = storageGet('resume_client_id');
  if (!id) {
    id = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
    storageSet('resume_client_id', id);
  }
  return id;
}

function getLikedIds() {
  try { return JSON.parse(storageGet('resume_liked') || '[]'); } catch (e) { return []; }
}
function rememberLiked(projectId) {
  var list = getLikedIds();
  if (list.indexOf(projectId) === -1) { list.push(projectId); }
  storageSet('resume_liked', JSON.stringify(list));
}

// ---------- 프로필 ----------
function renderProfile(p) {
  var photo = document.getElementById('photo');
  photo.textContent = '';
  if (isWebUrl(p.photo_url)) {
    var img = document.createElement('img');
    img.src = p.photo_url;
    img.alt = p.name + ' 프로필 사진';
    photo.appendChild(img);
  }

  document.getElementById('name').textContent = p.name;
  document.getElementById('title').textContent = p.title;
  document.getElementById('badge').textContent = p.career_badge;
  document.getElementById('badge').parentNode.hidden = !p.career_badge;
  document.title = p.name ? p.name + ' 포트폴리오' : '포트폴리오';

  var contacts = document.getElementById('contacts');
  contacts.textContent = '';
  [
    ['person', '이름', p.name],
    ['mail', '이메일', p.email],
    ['phone', '연락처', p.phone],
    ['pin', '위치', p.location]
  ].forEach(function (row) {
    if (!row[2]) { return; }
    var li = el('li');
    var icon = el('span', 'contact-icon');
    icon.appendChild(svgIcon(ICONS[row[0]]));
    var box = el('span');
    box.appendChild(el('span', 'contact-label', row[1]));
    box.appendChild(el('span', 'contact-value', row[2]));
    li.appendChild(icon);
    li.appendChild(box);
    contacts.appendChild(li);
  });

  renderHeadline(p.headline || '', p.name || '');
  document.getElementById('intro').textContent = p.intro || '';
  renderInfo('education', p.education);
  renderSkills(p.skills);
  renderInfo('experience', p.experience);
  document.getElementById('quote').textContent = p.quote ? '“' + p.quote + '”' : '';
}

// 한 줄 소개: 마지막 쉼표 뒤부터 이름까지를 파란 밑줄로 보여 준다
function renderHeadline(text, name) {
  var box = document.getElementById('headline');
  box.textContent = '';
  var nameAt = name ? text.indexOf(name) : -1;
  if (nameAt === -1) { box.textContent = text; return; }

  var end = nameAt + name.length;
  var comma = Math.max(text.lastIndexOf(',', nameAt), text.lastIndexOf('，', nameAt));
  var start = comma === -1 ? 0 : comma + 1;

  if (comma !== -1) {
    box.appendChild(document.createTextNode(text.slice(0, comma + 1)));
    box.appendChild(document.createElement('br'));
  } else if (start > 0) {
    box.appendChild(document.createTextNode(text.slice(0, start)));
  }
  box.appendChild(el('span', 'em', text.slice(start, end).trim()));
  box.appendChild(document.createTextNode(text.slice(end)));
}

function renderInfo(id, text) {
  var box = document.getElementById(id);
  box.textContent = '';
  lines(text).forEach(function (line, i) {
    box.appendChild(el('p', i === 0 ? 'first' : '', line));
  });
}

function renderSkills(text) {
  var box = document.getElementById('skills');
  box.textContent = '';
  var items = (text || '').split(/[,\n]/).map(function (s) { return s.trim(); }).filter(Boolean);
  var ul = el('ul', 'skill-list');
  items.forEach(function (item) { ul.appendChild(el('li', '', item)); });
  box.appendChild(ul);
}

// ---------- 포트폴리오 카드 ----------
function renderProjects(projects, likeCounts) {
  var grid = document.getElementById('projects');
  grid.textContent = '';
  if (!projects.length) {
    grid.appendChild(el('p', 'status', '아직 등록된 포트폴리오가 없어요.'));
    return;
  }
  var liked = getLikedIds();
  projects.forEach(function (project) {
    grid.appendChild(buildCard(project, likeCounts[project.id] || 0, liked.indexOf(project.id) !== -1));
  });
}

function buildCard(project, count, alreadyLiked) {
  var link = isWebUrl(project.file_url) ? project.file_url : (isWebUrl(project.thumbnail_url) ? project.thumbnail_url : null);

  var card = el('article', 'project' + (link ? ' clickable' : ''));
  if (link) {
    card.tabIndex = 0;
    card.setAttribute('role', 'link');
    card.setAttribute('aria-label', project.title + ' 상세 보기');
    var open = function () { window.open(link, '_blank', 'noopener'); };
    card.addEventListener('click', open);
    card.addEventListener('keydown', function (e) {
      if (e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(); }
    });
  }

  var thumb = el('div', 'thumb');
  var bar = el('div', 'thumb-bar');
  bar.appendChild(el('i'));
  bar.appendChild(el('i'));
  bar.appendChild(el('i'));
  var imgBox = el('div', 'thumb-img');
  if (isWebUrl(project.thumbnail_url)) {
    var img = document.createElement('img');
    img.src = project.thumbnail_url;
    img.alt = project.title + ' 썸네일';
    img.loading = 'lazy';
    imgBox.appendChild(img);
  }
  thumb.appendChild(bar);
  thumb.appendChild(imgBox);
  card.appendChild(thumb);

  var cat = (project.number ? project.number + '. ' : '') + (project.category || '');
  card.appendChild(el('p', 'p-cat', cat));
  card.appendChild(el('h4', 'p-title', project.title));
  card.appendChild(el('p', 'p-desc', project.description));

  var foot = el('div', 'p-foot');
  var tags = el('div', 'tags');
  (project.tags || []).forEach(function (t) { tags.appendChild(el('span', 'tag', t)); });
  foot.appendChild(tags);
  foot.appendChild(buildLikeButton(project.id, count, alreadyLiked));
  card.appendChild(foot);

  return card;
}

function buildLikeButton(projectId, count, alreadyLiked) {
  var btn = el('button', 'like-btn');
  btn.type = 'button';
  btn.setAttribute('aria-label', '좋아요');
  btn.appendChild(svgIcon('M12 21s-8-5.3-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.700-8 11-8 11z'));
  var num = el('span', '', String(count));
  btn.appendChild(num);

  function markLiked() {
    btn.classList.add('liked');
    btn.disabled = true;
    rememberLiked(projectId);
  }
  if (alreadyLiked) { markLiked(); }

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (btn.disabled) { return; }
    btn.disabled = true;
    api('likes', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ project_id: projectId, client_id: getClientId() })
    }).then(function (res) {
      if (res.ok) {
        num.textContent = String(Number(num.textContent) + 1);
        markLiked();
      } else if (res.status === 409) {
        markLiked();   // 이미 눌렀던 카드
      } else {
        btn.disabled = false;
      }
    }).catch(function () { btn.disabled = false; });
  });

  return btn;
}

// ---------- 방명록 ----------
function buildGuestItem(entry) {
  var li = el('li', 'guest-item');
  var top = el('div', 'guest-top');
  top.appendChild(el('span', 'guest-nick', entry.nickname));
  top.appendChild(el('span', 'guest-date', formatDate(entry.created_at)));
  li.appendChild(top);
  li.appendChild(el('p', 'guest-text', entry.message));
  return li;
}

function renderGuestbook(entries) {
  var list = document.getElementById('gb-list');
  list.textContent = '';
  if (!entries.length) {
    list.appendChild(el('li', 'guest-empty', '아직 남겨진 글이 없어요. 첫 글을 남겨 주세요!'));
    return;
  }
  entries.forEach(function (entry) { list.appendChild(buildGuestItem(entry)); });
}

function setupGuestForm() {
  var nick = document.getElementById('gb-nickname');
  var msg = document.getElementById('gb-message');
  var btn = document.getElementById('gb-submit');
  var note = document.getElementById('gb-msg');

  btn.addEventListener('click', function () {
    var nickname = nick.value.trim();
    var message = msg.value.trim();
    note.textContent = '';
    if (!nickname || !message) {
      note.textContent = '별명과 한마디를 모두 적어 주세요.';
      return;
    }
    btn.disabled = true;
    api('resume_guestbook', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ nickname: nickname, message: message })
    }).then(function (res) {
      if (!res.ok) { throw new Error('저장 실패'); }
      return res.json();
    }).then(function (rows) {
      var list = document.getElementById('gb-list');
      var empty = list.querySelector('.guest-empty');
      if (empty) { list.removeChild(empty); }
      list.insertBefore(buildGuestItem(rows[0]), list.firstChild);
      msg.value = '';
    }).catch(function () {
      note.textContent = '글을 남기지 못했어요. 잠시 뒤에 다시 해 주세요.';
    }).then(function () { btn.disabled = false; });
  });
}

// ---------- 시작 ----------
function start() {
  setupGuestForm();

  Promise.all([
    getJson('profile?select=*&id=eq.1'),
    getJson('projects?select=*&order=sort_order.asc,id.asc'),
    getJson('likes?select=project_id'),
    getJson('resume_guestbook?select=*&order=created_at.desc&limit=50')
  ]).then(function (data) {
    var likeCounts = {};
    data[2].forEach(function (row) {
      likeCounts[row.project_id] = (likeCounts[row.project_id] || 0) + 1;
    });
    if (data[0][0]) { renderProfile(data[0][0]); }
    renderProjects(data[1], likeCounts);
    renderGuestbook(data[3]);
  }).catch(function () {
    var grid = document.getElementById('projects');
    grid.textContent = '';
    grid.appendChild(el('p', 'status', '내용을 불러오지 못했어요. 새로고침해 주세요.'));
  });
}

start();
