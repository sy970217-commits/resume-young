// Supabase 주소와 공개 키 (공개 키라서 화면 파일에 넣어도 된다)
var SUPABASE_URL = 'https://tjcfqzggawvoocvwtois.supabase.co';
var SUPABASE_KEY = 'sb_publishable_EIw_nO7UbRAfxn2bVqRAcA_UoSl6aCm';

var MAX_BYTES = 10 * 1024 * 1024;
var EXT_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf'
};

var PROFILE_FIELDS = [
  ['name', '이름', 'text'],
  ['title', '직함', 'text'],
  ['career_badge', '경력 배지', 'text'],
  ['email', '이메일', 'text'],
  ['phone', '연락처', 'text'],
  ['location', '위치', 'text'],
  ['headline', '한 줄 소개 제목 (마지막 쉼표 뒤부터 이름까지가 파란 밑줄)', 'area'],
  ['intro', '소개 글', 'area'],
  ['education', 'EDUCATION (줄마다 한 줄, 첫 줄은 굵게)', 'area'],
  ['skills', 'SKILLS & TOOLS (쉼표나 줄바꿈으로 나누기)', 'area'],
  ['experience', 'EXPERIENCE (줄마다 한 줄, 첫 줄은 굵게)', 'area'],
  ['quote', '맨 아래 인용 문장', 'area']
];

var session = null;
var profileInputs = {};
var profileHasRow = true;
var currentPhotoUrl = null;
var projects = [];
var likeCounts = {};
var editingId = null;
var projectInputs = {};

// ---------- 도우미 ----------
function $(id) { return document.getElementById(id); }

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) { node.className = className; }
  if (text !== undefined && text !== null) { node.textContent = text; }
  return node;
}

function button(label, className, onClick) {
  var b = el('button', className, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function show(id, visible) { $(id).hidden = !visible; }

function setMsg(node, text, ok) {
  node.textContent = text || '';
  node.classList.toggle('ok', !!ok);
}

function isWebUrl(url) { return typeof url === 'string' && /^https?:\/\//i.test(url); }

function formatDate(iso) {
  var d = new Date(iso);
  if (isNaN(d)) { return ''; }
  var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
  return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function publicUrl(path) {
  return SUPABASE_URL + '/storage/v1/object/public/resume/' + path;
}

// ---------- 로그인 정보 ----------
function loadSession() {
  try { return JSON.parse(localStorage.getItem('resume_admin_session') || 'null'); } catch (e) { return null; }
}
function saveSession(s) {
  session = s;
  try {
    if (s) { localStorage.setItem('resume_admin_session', JSON.stringify(s)); }
    else { localStorage.removeItem('resume_admin_session'); }
  } catch (e) { /* 저장 못 해도 이번 방문 동안은 동작 */ }
}

function authRequest(path, bodyObj, token) {
  var headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
  if (token) { headers.Authorization = 'Bearer ' + token; }
  return fetch(SUPABASE_URL + '/auth/v1/' + path, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(bodyObj || {})
  });
}

function storeTokenResponse(data) {
  saveSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in || 3600) * 1000,
    email: (data.user && data.user.email) || (session && session.email) || ''
  });
}

function refreshSession() {
  if (!session || !session.refresh_token) { return Promise.reject(new Error('auth')); }
  return authRequest('token?grant_type=refresh_token', { refresh_token: session.refresh_token })
    .then(function (res) {
      if (!res.ok) { throw new Error('auth'); }
      return res.json();
    })
    .then(storeTokenResponse);
}

function ensureFresh() {
  if (session && session.expires_at - Date.now() < 60000) { return refreshSession(); }
  return Promise.resolve();
}

// 로그인한 토큰을 붙여서 요청한다. 토큰이 만료돼 401이 오면 한 번 갱신해서 다시 시도한다.
function call(url, options, retried) {
  return ensureFresh().then(function () {
    var headers = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + session.access_token };
    for (var k in options.headers) { headers[k] = options.headers[k]; }
    return fetch(url, { method: options.method || 'GET', headers: headers, body: options.body });
  }).then(function (res) {
    if (res.status === 401 && !retried) {
      return refreshSession().then(function () { return call(url, options, true); });
    }
    return res;
  });
}

function api(path, options) {
  options = options || {};
  var headers = { 'Content-Type': 'application/json' };
  for (var k in options.headers) { headers[k] = options.headers[k]; }
  return call(SUPABASE_URL + '/rest/v1/' + path, { method: options.method, headers: headers, body: options.body })
    .then(function (res) {
      if (!res.ok) { throw new Error('요청 실패 ' + res.status); }
      return res.status === 204 || res.headers.get('content-length') === '0' ? null : res.text().then(function (t) { return t ? JSON.parse(t) : null; });
    });
}

// ---------- 파일 올리기 ----------
function checkFile(file, allowPdf) {
  var okTypes = allowPdf
    ? ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
    : ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (okTypes.indexOf(file.type) === -1) {
    return allowPdf
      ? '이미지(png, jpg, webp, gif)나 PDF만 올릴 수 있어요.'
      : '이미지(png, jpg, webp, gif)만 올릴 수 있어요.';
  }
  if (file.size > MAX_BYTES) { return '파일이 10MB보다 커요. 더 작은 파일을 골라 주세요.'; }
  return '';
}

// 파일 이름은 영어·숫자로 새로 짓는다
function uploadFile(file, folder, kind) {
  var path = folder + '/' + kind + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) + '.' + EXT_BY_TYPE[file.type];
  return call(SUPABASE_URL + '/storage/v1/object/resume/' + path, {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file
  }).then(function (res) {
    if (!res.ok) { throw new Error('올리기 실패'); }
    return publicUrl(path);
  });
}

// ---------- 로그인·로그아웃 ----------
function doLogin() {
  var email = $('login-email').value.trim();
  var password = $('login-password').value;
  var msg = $('login-msg');
  setMsg(msg, '');
  if (!email || !password) { setMsg(msg, '이메일과 비밀번호를 입력해 주세요.'); return; }
  $('login-btn').disabled = true;
  authRequest('token?grant_type=password', { email: email, password: password })
    .then(function (res) {
      if (!res.ok) { throw new Error('login'); }
      return res.json();
    })
    .then(function (data) {
      storeTokenResponse(data);
      $('login-password').value = '';
      return enterApp();
    })
    .catch(function () { setMsg(msg, '로그인하지 못했어요. 이메일과 비밀번호를 확인해 주세요.'); })
    .then(function () { $('login-btn').disabled = false; });
}

function doLogout() {
  var token = session && session.access_token;
  saveSession(null);
  if (token) { authRequest('logout', {}, token).catch(function () { /* 이미 로컬 정보는 지웠다 */ }); }
  showLogin();
}

function showLogin() {
  show('app', false);
  show('denied-card', false);
  show('loading', false);
  show('login-card', true);
}

// ---------- 관리자 확인 후 화면 열기 ----------
function enterApp() {
  show('login-card', false);
  show('loading', true);
  return api('admins?select=user_id').then(function (rows) {
    show('loading', false);
    if (!rows || !rows.length) {
      show('denied-card', true);
      return;
    }
    show('denied-card', false);
    $('who').textContent = session.email || '';
    show('app', true);
    return loadAll();
  }).catch(function (err) {
    show('loading', false);
    if (err && err.message === 'auth') { saveSession(null); }
    showLogin();
    setMsg($('login-msg'), '다시 로그인해 주세요.');
  });
}

function loadAll() {
  return Promise.all([loadProfile(), loadProjects(), loadGuestbook()]).catch(function () {
    setMsg($('project-msg'), '내용을 불러오지 못했어요. 새로고침해 주세요.');
  });
}

// ---------- 프로필 ----------
function buildProfileForm() {
  var box = $('profile-form');
  box.textContent = '';
  PROFILE_FIELDS.forEach(function (f) {
    var label = el('label', 'field' + (f[2] === 'area' ? ' wide' : ''));
    label.appendChild(el('span', '', f[1]));
    var input = f[2] === 'area' ? document.createElement('textarea') : document.createElement('input');
    if (f[2] === 'area') { input.rows = 3; } else { input.type = 'text'; }
    label.appendChild(input);
    box.appendChild(label);
    profileInputs[f[0]] = input;
  });
}

function showPhotoPreview(url) {
  var box = $('photo-preview');
  box.textContent = '';
  if (url) {
    var img = document.createElement('img');
    img.src = url;
    img.alt = '프로필 사진 미리보기';
    box.appendChild(img);
  }
}

function loadProfile() {
  return api('profile?select=*&id=eq.1').then(function (rows) {
    var p = rows && rows[0];
    profileHasRow = !!p;
    p = p || {};
    PROFILE_FIELDS.forEach(function (f) { profileInputs[f[0]].value = p[f[0]] || ''; });
    currentPhotoUrl = p.photo_url || null;
    showPhotoPreview(isWebUrl(currentPhotoUrl) ? currentPhotoUrl : null);
    $('photo-file').value = '';
  });
}

function saveProfile() {
  var msg = $('profile-msg');
  var btn = $('profile-save');
  var file = $('photo-file').files[0];
  setMsg(msg, '');
  if (file) {
    var problem = checkFile(file, false);
    if (problem) { setMsg(msg, problem); return; }
  }
  btn.disabled = true;
  setMsg(msg, '저장하는 중…');

  var photoStep = file ? uploadFile(file, 'profile', 'photo') : Promise.resolve(currentPhotoUrl);
  photoStep.then(function (photoUrl) {
    var data = { photo_url: photoUrl || null, updated_at: new Date().toISOString() };
    PROFILE_FIELDS.forEach(function (f) { data[f[0]] = profileInputs[f[0]].value.trim(); });
    if (profileHasRow) {
      return api('profile?id=eq.1', { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(data) })
        .then(function (rows) {
          if (rows && rows.length) { return; }
          data.id = 1;
          return api('profile', { method: 'POST', body: JSON.stringify(data) });
        });
    }
    data.id = 1;
    return api('profile', { method: 'POST', body: JSON.stringify(data) });
  }).then(function () {
    setMsg(msg, '저장했어요.', true);
    return loadProfile();
  }).catch(function () {
    setMsg(msg, '저장하지 못했어요. 잠시 뒤에 다시 해 주세요.');
  }).then(function () { btn.disabled = false; });
}

// ---------- 포트폴리오 카드 ----------
function buildProjectForm() {
  var box = $('project-form');
  box.textContent = '';
  var defs = [
    ['number', '번호 (예: 01)', 'text', false],
    ['category', '분류', 'text', false],
    ['title', '제목 (꼭 필요)', 'text', false],
    ['tags', '태그 (쉼표로 나누기)', 'text', false],
    ['description', '설명', 'area', true]
  ];
  defs.forEach(function (d) {
    var label = el('label', 'field' + (d[3] ? ' wide' : ''));
    label.appendChild(el('span', '', d[1]));
    var input = d[2] === 'area' ? document.createElement('textarea') : document.createElement('input');
    if (d[2] === 'area') { input.rows = 3; } else { input.type = 'text'; }
    label.appendChild(input);
    box.appendChild(label);
    projectInputs[d[0]] = input;
  });

  var thumbLabel = el('label', 'field');
  thumbLabel.appendChild(el('span', '', '썸네일 이미지 (10MB까지)'));
  var thumb = document.createElement('input');
  thumb.type = 'file';
  thumb.accept = 'image/png,image/jpeg,image/webp,image/gif';
  thumbLabel.appendChild(thumb);
  thumbLabel.appendChild(el('small', 'current-file', ''));
  box.appendChild(thumbLabel);
  projectInputs.thumb = thumb;
  projectInputs.thumbNote = thumbLabel.lastChild;

  var fileLabel = el('label', 'field');
  fileLabel.appendChild(el('span', '', '첨부 파일 (이미지나 PDF, 10MB까지)'));
  var attach = document.createElement('input');
  attach.type = 'file';
  attach.accept = 'image/png,image/jpeg,image/webp,image/gif,application/pdf';
  fileLabel.appendChild(attach);
  fileLabel.appendChild(el('small', 'current-file', ''));
  box.appendChild(fileLabel);
  projectInputs.attach = attach;
  projectInputs.attachNote = fileLabel.lastChild;

  var clearThumb = el('label', 'check');
  var ct = document.createElement('input');
  ct.type = 'checkbox';
  clearThumb.appendChild(ct);
  clearThumb.appendChild(document.createTextNode(' 지금 있는 썸네일 지우기'));
  box.appendChild(clearThumb);
  projectInputs.clearThumb = ct;
  projectInputs.clearThumbRow = clearThumb;

  var clearFile = el('label', 'check');
  var cf = document.createElement('input');
  cf.type = 'checkbox';
  clearFile.appendChild(cf);
  clearFile.appendChild(document.createTextNode(' 지금 있는 첨부 파일 지우기'));
  box.appendChild(clearFile);
  projectInputs.clearFile = cf;
  projectInputs.clearFileRow = clearFile;

  resetProjectForm();
}

function resetProjectForm() {
  editingId = null;
  ['number', 'category', 'title', 'tags', 'description'].forEach(function (k) { projectInputs[k].value = ''; });
  projectInputs.thumb.value = '';
  projectInputs.attach.value = '';
  projectInputs.clearThumb.checked = false;
  projectInputs.clearFile.checked = false;
  projectInputs.clearThumbRow.hidden = true;
  projectInputs.clearFileRow.hidden = true;
  projectInputs.thumbNote.textContent = '';
  projectInputs.attachNote.textContent = '';
  $('project-form-title').textContent = '카드 추가';
  $('project-cancel').hidden = true;
}

function editProject(p) {
  resetProjectForm();
  editingId = p.id;
  projectInputs.number.value = p.number || '';
  projectInputs.category.value = p.category || '';
  projectInputs.title.value = p.title || '';
  projectInputs.tags.value = (p.tags || []).join(', ');
  projectInputs.description.value = p.description || '';
  projectInputs.thumbNote.textContent = p.thumbnail_url ? '지금 올라가 있는 썸네일이 있어요. 새 파일을 고르면 바뀌어요.' : '';
  projectInputs.attachNote.textContent = p.file_url ? '지금 올라가 있는 첨부 파일이 있어요. 새 파일을 고르면 바뀌어요.' : '';
  projectInputs.clearThumbRow.hidden = !p.thumbnail_url;
  projectInputs.clearFileRow.hidden = !p.file_url;
  $('project-form-title').textContent = '카드 수정 (' + (p.title || '') + ')';
  $('project-cancel').hidden = false;
  setMsg($('project-msg'), '');
  $('project-form-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function loadProjects() {
  return Promise.all([
    api('projects?select=*&order=sort_order.asc,id.asc'),
    api('likes?select=project_id')
  ]).then(function (data) {
    projects = data[0] || [];
    likeCounts = {};
    (data[1] || []).forEach(function (row) {
      likeCounts[row.project_id] = (likeCounts[row.project_id] || 0) + 1;
    });
    renderProjectList();
  });
}

function renderProjectList() {
  var list = $('project-list');
  list.textContent = '';
  if (!projects.length) {
    list.appendChild(el('li', 'empty-row', '아직 카드가 없어요. 아래에서 추가해 주세요.'));
    return;
  }
  projects.forEach(function (p, i) {
    var li = el('li', 'row');
    var info = el('div', 'row-info');
    info.appendChild(el('p', 'row-cat', (p.number ? p.number + '. ' : '') + (p.category || '')));
    info.appendChild(el('p', 'row-title', p.title));
    info.appendChild(el('p', 'row-meta', '좋아요 ' + (likeCounts[p.id] || 0) + '개'));
    li.appendChild(info);

    var actions = el('div', 'row-actions');
    var up = button('▲ 위로', 'ghost-btn small', function () { moveProject(i, -1); });
    up.disabled = i === 0;
    var down = button('▼ 아래로', 'ghost-btn small', function () { moveProject(i, 1); });
    down.disabled = i === projects.length - 1;
    actions.appendChild(up);
    actions.appendChild(down);
    actions.appendChild(button('수정', 'ghost-btn small', function () { editProject(p); }));
    actions.appendChild(button('좋아요 초기화', 'ghost-btn small', function () { resetLikes(p); }));
    actions.appendChild(button('삭제', 'danger-btn small', function () { deleteProject(p); }));
    li.appendChild(actions);
    list.appendChild(li);
  });
}

function moveProject(index, step) {
  var target = index + step;
  if (target < 0 || target >= projects.length) { return; }
  var msg = $('project-msg');
  var order = projects.slice();
  var moved = order.splice(index, 1)[0];
  order.splice(target, 0, moved);
  setMsg(msg, '순서를 바꾸는 중…');
  var jobs = [];
  order.forEach(function (p, i) {
    if (p.sort_order !== i + 1) {
      jobs.push(api('projects?id=eq.' + p.id, { method: 'PATCH', body: JSON.stringify({ sort_order: i + 1 }) }));
    }
  });
  Promise.all(jobs).then(function () {
    setMsg(msg, '순서를 바꿨어요.', true);
    return loadProjects();
  }).catch(function () {
    setMsg(msg, '순서를 바꾸지 못했어요.');
    return loadProjects();
  });
}

function deleteProject(p) {
  if (!window.confirm('"' + p.title + '" 카드를 지울까요? 이 카드의 좋아요도 함께 지워져요.')) { return; }
  var msg = $('project-msg');
  api('projects?id=eq.' + p.id, { method: 'DELETE' }).then(function () {
    if (editingId === p.id) { resetProjectForm(); }
    setMsg(msg, '카드를 지웠어요.', true);
    return loadProjects();
  }).catch(function () { setMsg(msg, '지우지 못했어요.'); });
}

function resetLikes(p) {
  var count = likeCounts[p.id] || 0;
  var msg = $('project-msg');
  if (!count) { setMsg(msg, '초기화할 좋아요가 없어요.'); return; }
  if (!window.confirm('"' + p.title + '" 카드의 좋아요 ' + count + '개를 모두 지울까요?')) { return; }
  api('likes?project_id=eq.' + p.id, { method: 'DELETE' }).then(function () {
    setMsg(msg, '좋아요를 초기화했어요.', true);
    return loadProjects();
  }).catch(function () { setMsg(msg, '초기화하지 못했어요.'); });
}

function saveProject() {
  var msg = $('project-msg');
  var btn = $('project-save');
  var title = projectInputs.title.value.trim();
  var thumbFile = projectInputs.thumb.files[0];
  var attachFile = projectInputs.attach.files[0];
  setMsg(msg, '');
  if (!title) { setMsg(msg, '제목을 입력해 주세요.'); return; }
  if (thumbFile) {
    var p1 = checkFile(thumbFile, false);
    if (p1) { setMsg(msg, '썸네일: ' + p1); return; }
  }
  if (attachFile) {
    var p2 = checkFile(attachFile, true);
    if (p2) { setMsg(msg, '첨부 파일: ' + p2); return; }
  }

  var existing = null;
  projects.forEach(function (p) { if (p.id === editingId) { existing = p; } });

  btn.disabled = true;
  setMsg(msg, '저장하는 중…');

  var thumbStep = thumbFile
    ? uploadFile(thumbFile, 'projects', 'thumb')
    : Promise.resolve(existing && !projectInputs.clearThumb.checked ? existing.thumbnail_url : null);

  thumbStep.then(function (thumbUrl) {
    var attachStep = attachFile
      ? uploadFile(attachFile, 'projects', 'file')
      : Promise.resolve(existing && !projectInputs.clearFile.checked ? existing.file_url : null);
    return attachStep.then(function (fileUrl) {
      var data = {
        number: projectInputs.number.value.trim(),
        category: projectInputs.category.value.trim(),
        title: title,
        description: projectInputs.description.value.trim(),
        tags: projectInputs.tags.value.split(',').map(function (t) { return t.trim(); }).filter(Boolean),
        thumbnail_url: thumbUrl || null,
        file_url: fileUrl || null
      };
      if (existing) {
        return api('projects?id=eq.' + existing.id, { method: 'PATCH', body: JSON.stringify(data) });
      }
      var max = 0;
      projects.forEach(function (p) { if (p.sort_order > max) { max = p.sort_order; } });
      data.sort_order = max + 1;
      return api('projects', { method: 'POST', body: JSON.stringify(data) });
    });
  }).then(function () {
    var wasEdit = !!existing;
    resetProjectForm();
    setMsg(msg, wasEdit ? '카드를 고쳤어요.' : '카드를 추가했어요.', true);
    return loadProjects();
  }).catch(function () {
    setMsg(msg, '저장하지 못했어요. 잠시 뒤에 다시 해 주세요.');
  }).then(function () { btn.disabled = false; });
}

// ---------- 방명록 ----------
function loadGuestbook() {
  return api('resume_guestbook?select=*&order=created_at.desc').then(function (rows) {
    var list = $('gb-admin-list');
    list.textContent = '';
    if (!rows || !rows.length) {
      list.appendChild(el('li', 'empty-row', '남겨진 글이 없어요.'));
      return;
    }
    rows.forEach(function (entry) {
      var li = el('li', 'row');
      var info = el('div', 'row-info');
      info.appendChild(el('p', 'row-title', entry.nickname));
      info.appendChild(el('p', 'row-text', entry.message));
      info.appendChild(el('p', 'row-meta', formatDate(entry.created_at)));
      li.appendChild(info);
      var actions = el('div', 'row-actions');
      actions.appendChild(button('삭제', 'danger-btn small', function () { deleteGuest(entry); }));
      li.appendChild(actions);
      list.appendChild(li);
    });
  });
}

function deleteGuest(entry) {
  if (!window.confirm(entry.nickname + ' 님의 글을 지울까요?')) { return; }
  var msg = $('gb-admin-msg');
  api('resume_guestbook?id=eq.' + entry.id, { method: 'DELETE' }).then(function () {
    setMsg(msg, '글을 지웠어요.', true);
    return loadGuestbook();
  }).catch(function () { setMsg(msg, '지우지 못했어요.'); });
}

// ---------- 시작 ----------
function start() {
  buildProfileForm();
  buildProjectForm();

  $('login-btn').addEventListener('click', doLogin);
  $('login-password').addEventListener('keydown', function (e) { if (e.key === 'Enter') { doLogin(); } });
  $('logout-btn').addEventListener('click', doLogout);
  $('denied-logout').addEventListener('click', doLogout);
  $('profile-save').addEventListener('click', saveProfile);
  $('project-save').addEventListener('click', saveProject);
  $('project-cancel').addEventListener('click', function () { resetProjectForm(); setMsg($('project-msg'), ''); });
  $('photo-file').addEventListener('change', function () {
    var file = $('photo-file').files[0];
    var msg = $('profile-msg');
    setMsg(msg, '');
    if (!file) { showPhotoPreview(isWebUrl(currentPhotoUrl) ? currentPhotoUrl : null); return; }
    var problem = checkFile(file, false);
    if (problem) { setMsg(msg, problem); $('photo-file').value = ''; return; }
    showPhotoPreview(URL.createObjectURL(file));
  });

  session = loadSession();
  if (!session) { showLogin(); return; }
  show('loading', true);
  ensureFresh().then(enterApp).catch(function () {
    saveSession(null);
    showLogin();
  });
}

start();
