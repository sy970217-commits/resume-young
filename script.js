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
  if (options.token) { headers.Authorization = 'Bearer ' + options.token; } // 로그인한 사람으로 요청
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

  // 내가 쓴 글에만 지우기 버튼 (실제로 막는 것은 Supabase 규칙이다)
  if (visitor && entry.user_id && entry.user_id === visitor.user.id) {
    var del = el('button', 'danger-btn small', '지우기');
    del.type = 'button';
    del.addEventListener('click', function () { deleteMyEntry(entry, del); });
    li.appendChild(del);
  }
  return li;
}

function renderGuestbook(entries) {
  guestEntries = entries;
  guestLoaded = true;
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
    if (!visitor) {
      note.textContent = '글을 남기려면 먼저 구글로 로그인해 주세요.';
      return;
    }
    btn.disabled = true;
    getVisitorToken().then(function (token) {
      return api('resume_guestbook', {
        method: 'POST',
        token: token,
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ nickname: nickname, message: message }) // 글쓴이(user_id)는 Supabase가 채운다
      });
    }).then(function (res) {
      if (res.status === 401) { throw new Error('auth'); }
      if (!res.ok) { throw new Error('저장 실패'); }
      return res.json();
    }).then(function (rows) {
      renderGuestbook([rows[0]].concat(guestEntries));
      msg.value = '';
    }).catch(function (err) {
      if (err.message === 'auth') {
        signOutHere('로그인이 끝났어요. 다시 로그인해 주세요.');
      } else {
        note.textContent = '글을 남기지 못했어요. 잠시 뒤에 다시 해 주세요.';
      }
    }).then(function () { btn.disabled = false; });
  });
}

function deleteMyEntry(entry, del) {
  if (!window.confirm('이 글을 지울까요?\n"' + entry.message.slice(0, 40) + '"\n되돌릴 수 없어요.')) { return; }
  var note = document.getElementById('gb-msg');
  note.textContent = '';
  del.disabled = true;
  getVisitorToken().then(function (token) {
    return api('resume_guestbook?id=eq.' + entry.id, {
      method: 'DELETE',
      token: token,
      headers: { Prefer: 'return=representation' }
    });
  }).then(function (res) {
    if (!res.ok) { throw new Error('지우기 실패'); }
    return res.json();
  }).then(function (rows) {
    // 규칙에 막히면 오류 없이 0줄이 돌아온다
    if (!rows.length) { throw new Error('0줄'); }
    renderGuestbook(guestEntries.filter(function (e) { return e.id !== entry.id; }));
  }).catch(function () {
    note.textContent = '글을 지우지 못했어요. 내 글이 맞는지, 로그인이 되어 있는지 확인해 주세요.';
    del.disabled = false;
  });
}

// ---------- 구글 로그인 (Supabase Auth를 fetch로 직접 부른다) ----------
var VISITOR_KEY = 'resume_visitor_session';
var visitor = null;        // 로그인한 방문자 { access_token, refresh_token, expires_at(ms), user: { id, name } }
var refreshingVisitor = null;
var guestEntries = [];     // 화면에 보이는 방명록 글
var guestLoaded = false;

function authFetch(path, options) {
  options = options || {};
  var headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
  if (options.token) { headers.Authorization = 'Bearer ' + options.token; }
  return fetch(SUPABASE_URL + '/auth/v1/' + path, {
    method: options.method || 'GET',
    headers: headers,
    body: options.body
  });
}

function saveVisitor(v) {
  visitor = v;
  if (v) { storageSet(VISITOR_KEY, JSON.stringify(v)); }
  else { try { localStorage.removeItem(VISITOR_KEY); } catch (e) { /* 무시 */ } }
}

function googleName(user) {
  var meta = user.user_metadata || {};
  return meta.full_name || meta.name || user.email || '방문자';
}

function fetchUser(token) {
  return authFetch('user', { token: token }).then(function (res) {
    if (!res.ok) { throw new Error('auth'); }
    return res.json();
  }).then(function (user) {
    return { id: user.id, name: googleName(user) };
  });
}

// 구글 로그인 화면으로 갔다가 이 페이지로 돌아온다
function googleLogin() {
  var back = location.origin + location.pathname;
  location.href = SUPABASE_URL + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(back);
}

// 구글에서 돌아오면 주소 뒤(#)에 로그인 정보가 붙어 온다. 읽고 나서 주소창에서 지운다.
function readLoginFromUrl() {
  var hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  var query = new URLSearchParams(location.search);
  var error = hash.get('error_description') || query.get('error_description');
  var token = hash.get('access_token');
  if (!token && !error) { return null; }
  history.replaceState(null, '', location.pathname);
  if (error) { return { error: error.replace(/\+/g, ' ') }; }
  var expiresIn = Number(hash.get('expires_in')) || 3600;
  return {
    access_token: token,
    refresh_token: hash.get('refresh_token'),
    expires_at: Date.now() + expiresIn * 1000
  };
}

// 요청에 쓸 토큰. 곧 끝나면 새로 받아 온다.
function getVisitorToken() {
  if (!visitor) { return Promise.reject(new Error('auth')); }
  if (visitor.expires_at - Date.now() > 60000) { return Promise.resolve(visitor.access_token); }
  if (!refreshingVisitor) {
    refreshingVisitor = authFetch('token?grant_type=refresh_token', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: visitor.refresh_token })
    }).then(function (res) {
      if (!res.ok) { throw new Error('auth'); }
      return res.json();
    }).then(function (data) {
      saveVisitor({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + (data.expires_in || 3600) * 1000,
        user: visitor.user
      });
      return data.access_token;
    }).then(function (token) {
      refreshingVisitor = null;
      return token;
    }, function (err) {
      refreshingVisitor = null;
      throw err;
    });
  }
  return refreshingVisitor;
}

function googleLogout() {
  var token = visitor && visitor.access_token;
  signOutHere('로그아웃했어요.');
  if (token) {
    authFetch('logout?scope=local', { method: 'POST', token: token }).catch(function () { /* 화면에서는 이미 나갔다 */ });
  }
}

function signOutHere(message) {
  saveVisitor(null);
  document.getElementById('gb-auth-msg').textContent = message || '';
  updateAuthUI();
}

function updateAuthUI() {
  var text = document.getElementById('gb-auth-text');
  var nick = document.getElementById('gb-nickname');
  text.textContent = '';
  if (visitor) {
    text.appendChild(el('strong', '', visitor.user.name));
    text.appendChild(document.createTextNode(' 님으로 로그인했어요.'));
    if (!nick.value) { nick.value = visitor.user.name.slice(0, 20); }
  } else {
    text.textContent = '글을 남기려면 구글로 로그인해 주세요.';
  }
  document.getElementById('google-login').hidden = !!visitor;
  document.getElementById('google-logout').hidden = !visitor;
  document.getElementById('gb-form').hidden = !visitor;
  if (guestLoaded) { renderGuestbook(guestEntries); } // 내 글의 지우기 버튼을 다시 그린다
}

function setupGoogleLogin() {
  document.getElementById('google-login').addEventListener('click', googleLogin);
  document.getElementById('google-logout').addEventListener('click', googleLogout);

  var fromUrl = readLoginFromUrl();
  var step;
  if (fromUrl && fromUrl.error) {
    document.getElementById('gb-auth-msg').textContent = '구글 로그인을 하지 못했어요: ' + fromUrl.error;
    step = Promise.resolve();
  } else if (fromUrl) {
    step = fetchUser(fromUrl.access_token).then(function (user) {
      fromUrl.user = user;
      saveVisitor(fromUrl);
    });
  } else {
    try { visitor = JSON.parse(storageGet(VISITOR_KEY) || 'null'); } catch (e) { visitor = null; }
    step = visitor
      ? getVisitorToken().then(fetchUser).then(function (user) { visitor.user = user; saveVisitor(visitor); })
      : Promise.resolve();
  }
  step.catch(function () {
    saveVisitor(null);
    document.getElementById('gb-auth-msg').textContent = '로그인이 끝났어요. 다시 로그인해 주세요.';
  }).then(updateAuthUI);
}

// ---------- 시작 ----------
function start() {
  setupGuestForm();
  setupGoogleLogin();

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
