// 관리자 화면: 로그인한 관리자가 프로필·카드·좋아요·방명록을 고친다.
// 실제로 막는 것은 Supabase 규칙(resume.sql)이다. 관리자가 아니면 화면을 열어도 저장·삭제가 거절된다.

// Supabase 주소와 공개 키 (공개 키라서 화면 파일에 넣어도 된다. 비밀 키는 절대 넣지 않는다)
var SUPABASE_URL = 'https://tjcfqzggawvoocvwtois.supabase.co';
var SUPABASE_KEY = 'sb_publishable_EIw_nO7UbRAfxn2bVqRAcA_UoSl6aCm';

var BUCKET = 'resume';
var MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
var SESSION_KEY = 'resume_admin_session';

// 올릴 수 있는 파일 종류와 새 파일 이름에 붙일 확장자
var FILE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf'
};
var IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
var ALL_TYPES = Object.keys(FILE_TYPES);

var PROFILE_FIELDS = ['name', 'title', 'career_badge', 'email', 'phone', 'location',
  'headline', 'intro', 'education', 'skills', 'experience', 'quote'];

var session = null;        // 로그인 정보 { access_token, refresh_token, expires_at, user }
var refreshing = null;     // 토큰을 새로 받는 중이면 그 작업
var projects = [];         // 카드 목록 (순서대로)
var likeCounts = {};       // 카드 id → 좋아요 수
var editingId = null;      // 고치는 중인 카드 id (새 카드면 null)
var currentPhotoUrl = null;

// ---------- 도우미 ----------
function $(id) { return document.getElementById(id); }

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) { node.className = className; }
  if (text !== undefined && text !== null) { node.textContent = text; }
  return node;
}

function button(className, text, onClick) {
  var btn = el('button', className, text);
  btn.type = 'button';
  btn.addEventListener('click', onClick);
  return btn;
}

function isWebUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

function storageGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* 저장 못 해도 이번 화면은 동작 */ }
}
function storageRemove(key) {
  try { localStorage.removeItem(key); } catch (e) { /* 무시 */ }
}

function formatDate(iso) {
  var d = new Date(iso);
  if (isNaN(d)) { return ''; }
  var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
  return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

// 안내 문구 (kind: 'ok' 초록, 'error' 빨강, 'wait' 회색)
function setMsg(id, text, kind) {
  var node = $(id);
  node.textContent = text || '';
  node.classList.toggle('ok', kind === 'ok');
  node.style.color = kind === 'wait' ? 'var(--muted)' : '';
}

function makeError(message, status) {
  var err = new Error(message);
  err.status = status;
  return err;
}

async function readError(res) {
  var data = {};
  try { data = await res.json(); } catch (e) { /* 내용 없음 */ }
  var status = Number(data.statusCode) || res.status; // 보관함은 400 안에 403을 담아 보내기도 한다
  return makeError(data.message || data.msg || data.error_description || data.error || ('요청 실패 ' + res.status), status);
}

function friendly(err) {
  if (err.status === 401 || err.status === 403) { return '권한이 없어요. 관리자 계정으로 로그인했는지 확인해 주세요.'; }
  if (err.status === 413) { return '파일이 너무 커요. 10MB 이하로 골라 주세요.'; }
  return '처리하지 못했어요. 잠시 뒤에 다시 해 주세요. (' + err.message + ')';
}

// ---------- 화면 바꾸기 ----------
function show(view) {
  $('loading-view').hidden = view !== 'loading';
  $('login-view').hidden = view !== 'login';
  $('denied-view').hidden = view !== 'denied';
  $('app').hidden = view !== 'app';
}

// ---------- 로그인 (Supabase Auth) ----------
function saveSession(data) {
  session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
    user: data.user
  };
  storageSet(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  session = null;
  storageRemove(SESSION_KEY);
}

async function authToken(grantType, body) {
  var res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=' + grantType, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  var data = {};
  try { data = await res.json(); } catch (e) { /* 내용 없음 */ }
  if (!res.ok) {
    var err = makeError(data.msg || data.error_description || data.message || '로그인 실패', res.status);
    err.code = data.error_code || data.error;
    throw err;
  }
  saveSession(data);
}

// 요청에 쓸 토큰. 곧 끝나면 새로 받아 온다.
async function getToken() {
  if (!session) { throw makeError('로그인이 필요해요.', 401); }
  if (session.expires_at - 60 > Date.now() / 1000) { return session.access_token; }

  if (!refreshing) {
    refreshing = authToken('refresh_token', { refresh_token: session.refresh_token })
      .finally(function () { refreshing = null; });
  }
  try {
    await refreshing;
  } catch (err) {
    clearSession();
    showLogin('로그인이 끝났어요. 다시 로그인해 주세요.');
    throw makeError('로그인이 끝났어요.', 401);
  }
  return session.access_token;
}

function showLogin(message) {
  show('login');
  setMsg('login-msg', message || '');
}

async function login() {
  var email = $('login-email').value.trim();
  var password = $('login-password').value;
  if (!email || !password) {
    setMsg('login-msg', '이메일과 비밀번호를 모두 적어 주세요.');
    return;
  }
  $('login-btn').disabled = true;
  setMsg('login-msg', '로그인하는 중…', 'wait');
  try {
    await authToken('password', { email: email, password: password });
    $('login-password').value = '';
    setMsg('login-msg', '');
    await enter();
  } catch (err) {
    if (err.code === 'email_not_confirmed') {
      setMsg('login-msg', '이메일 인증이 끝나지 않은 계정이에요. Supabase에서 확인해 주세요.');
    } else if (err.status === 400) {
      setMsg('login-msg', '이메일이나 비밀번호가 맞지 않아요.');
    } else {
      setMsg('login-msg', '로그인하지 못했어요. 잠시 뒤에 다시 해 주세요.');
    }
  } finally {
    $('login-btn').disabled = false;
  }
}

async function logout() {
  var token = session && session.access_token;
  clearSession();
  resetProjectForm();
  ['pf-msg', 'pj-msg', 'project-list-msg', 'like-msg', 'guest-msg'].forEach(function (id) { setMsg(id, ''); });
  showLogin('로그아웃했어요.');
  if (token) {
    fetch(SUPABASE_URL + '/auth/v1/logout', {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token }
    }).catch(function () { /* 이미 화면에서는 나갔으니 무시 */ });
  }
}

// 로그인 뒤: 관리자인지 확인하고 화면을 채운다
async function enter() {
  show('loading');
  try {
    var rows = await api('admins?select=user_id&user_id=eq.' + encodeURIComponent(session.user.id));
    if (!rows.length) {
      $('denied-who').textContent = (session.user.email || '이') + ' 계정은 관리자로 등록되어 있지 않아요.';
      show('denied');
      return;
    }
    $('who').textContent = session.user.email || '';
    show('app');
    await Promise.all([loadProfile(), loadProjects(), loadGuestbook()]);
  } catch (err) {
    if (!session) { return; } // 로그인이 끝나서 이미 로그인 화면으로 갔다
    clearSession();
    showLogin('정보를 불러오지 못했어요. 다시 로그인해 주세요. (' + err.message + ')');
  }
}

// ---------- 데이터 요청 (받은 토큰으로) ----------
async function api(path, options) {
  options = options || {};
  var token = await getToken();
  var headers = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token };
  if (options.body !== undefined) { headers['Content-Type'] = 'application/json'; }
  for (var k in options.headers) { headers[k] = options.headers[k]; }

  var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method: options.method || 'GET',
    headers: headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });
  if (!res.ok) { throw await readError(res); }
  var text = await res.text();
  return text ? JSON.parse(text) : null;
}

// 고치기·지우기: 규칙에 막히면 오류 없이 "0줄"이 돌아오므로 직접 확인한다
async function changeRows(path, method, body) {
  var rows = await api(path, { method: method, headers: { Prefer: 'return=representation' }, body: body });
  if (!rows || !rows.length) { throw makeError('바뀐 것이 없어요.', 403); }
  return rows;
}

// ---------- 파일 올리기 (resume 보관함) ----------
function checkFile(file, allowedTypes) {
  if (!file) { return ''; }
  if (allowedTypes.indexOf(file.type) === -1) {
    return allowedTypes === IMAGE_TYPES
      ? '이미지 파일(PNG·JPG·WEBP·GIF)만 올릴 수 있어요.'
      : '이미지(PNG·JPG·WEBP·GIF)나 PDF 파일만 올릴 수 있어요.';
  }
  if (file.size > MAX_FILE_SIZE) { return '파일이 10MB를 넘어요. 더 작은 파일을 골라 주세요.'; }
  return '';
}

// 새 파일 이름: 날짜-시각-무작위.확장자 (영어·숫자만)
function makeFileName(type) {
  var d = new Date();
  var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
  var stamp = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  var random = Math.random().toString(36).slice(2, 8);
  return stamp + '-' + random + '.' + FILE_TYPES[type];
}

async function uploadFile(file, folder) {
  var token = await getToken();
  var path = folder + '/' + makeFileName(file.type);
  var res = await fetch(SUPABASE_URL + '/storage/v1/object/' + BUCKET + '/' + path, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + token,
      'Content-Type': file.type,
      'x-upsert': 'false'
    },
    body: file
  });
  if (!res.ok) { throw await readError(res); }
  return SUPABASE_URL + '/storage/v1/object/public/' + BUCKET + '/' + path;
}

// 파일을 고르자마자 종류·크기를 확인해 안내한다
function watchFileInput(inputId, allowedTypes, msgId) {
  $(inputId).addEventListener('change', function () {
    var problem = checkFile(this.files[0], allowedTypes);
    setMsg(msgId, problem);
  });
}

function showCurrentFile(nodeId, url, label) {
  var node = $(nodeId);
  node.textContent = '';
  if (!isWebUrl(url)) {
    node.textContent = '지금은 ' + label + '이(가) 없어요.';
    return;
  }
  var link = el('a', '', '지금 ' + label + ' 보기');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener';
  node.appendChild(link);
}

// ---------- 프로필 ----------
async function loadProfile() {
  var rows = await api('profile?select=*&id=eq.1');
  var p = rows[0] || {};
  PROFILE_FIELDS.forEach(function (field) { $('pf-' + field).value = p[field] || ''; });
  currentPhotoUrl = p.photo_url || null;
  renderPhotoPreview();
}

function renderPhotoPreview() {
  var box = $('pf-photo-preview');
  box.textContent = '';
  if (isWebUrl(currentPhotoUrl)) {
    var img = document.createElement('img');
    img.src = currentPhotoUrl;
    img.alt = '지금 프로필 사진';
    box.appendChild(img);
  }
  showCurrentFile('pf-photo-current', currentPhotoUrl, '사진');
  $('pf-photo').value = '';
  $('pf-photo-remove').checked = false;
}

async function saveProfile() {
  var file = $('pf-photo').files[0];
  var problem = checkFile(file, IMAGE_TYPES);
  if (problem) { setMsg('pf-msg', problem); return; }

  $('pf-save').disabled = true;
  setMsg('pf-msg', '저장하는 중…', 'wait');
  try {
    var photoUrl = $('pf-photo-remove').checked ? null : currentPhotoUrl;
    if (file) { photoUrl = await uploadFile(file, 'profile'); }

    var body = { id: 1, photo_url: photoUrl, updated_at: new Date().toISOString() };
    PROFILE_FIELDS.forEach(function (field) { body[field] = $('pf-' + field).value.trim(); });

    // 줄이 없으면 만들고, 있으면 고친다
    var rows = await api('profile?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: body
    });
    if (!rows || !rows.length) { throw makeError('바뀐 것이 없어요.', 403); }
    currentPhotoUrl = rows[0].photo_url;
    renderPhotoPreview();
    setMsg('pf-msg', '저장했어요. 방문자 화면을 새로고침하면 보여요.', 'ok');
  } catch (err) {
    setMsg('pf-msg', friendly(err));
  } finally {
    $('pf-save').disabled = false;
  }
}

// ---------- 포트폴리오 카드 + 좋아요 수 ----------
async function loadProjects() {
  var data = await Promise.all([
    api('projects?select=*&order=sort_order.asc,id.asc'),
    api('likes?select=project_id')
  ]);
  projects = data[0];
  likeCounts = {};
  data[1].forEach(function (row) {
    likeCounts[row.project_id] = (likeCounts[row.project_id] || 0) + 1;
  });
  renderProjects();
  renderLikes();
}

function projectLabel(p) {
  return (p.number ? p.number + '. ' : '') + (p.category || '');
}

function renderProjects() {
  var list = $('project-list');
  list.textContent = '';
  if (!projects.length) {
    list.appendChild(el('li', 'empty-row', '아직 카드가 없어요. 아래에서 추가해 주세요.'));
    return;
  }
  projects.forEach(function (p, i) {
    var row = el('li', 'row');
    var info = el('div', 'row-info');
    info.appendChild(el('p', 'row-cat', projectLabel(p)));
    info.appendChild(el('p', 'row-title', p.title));
    info.appendChild(el('p', 'row-meta',
      '좋아요 ' + (likeCounts[p.id] || 0) + '개 · 썸네일 ' + (p.thumbnail_url ? '있음' : '없음') +
      ' · 첨부 파일 ' + (p.file_url ? '있음' : '없음')));

    var actions = el('div', 'row-actions');
    var up = button('ghost-btn small', '▲ 올리기', function () { moveProject(i, -1); });
    up.disabled = i === 0;
    var down = button('ghost-btn small', '▼ 내리기', function () { moveProject(i, 1); });
    down.disabled = i === projects.length - 1;
    actions.appendChild(up);
    actions.appendChild(down);
    actions.appendChild(button('ghost-btn small', '수정', function () { startEdit(p); }));
    actions.appendChild(button('danger-btn small', '삭제', function () { deleteProject(p); }));

    row.appendChild(info);
    row.appendChild(actions);
    list.appendChild(row);
  });
}

function setListBusy(listId, busy) {
  $(listId).querySelectorAll('button').forEach(function (btn) {
    if (busy) {
      btn.dataset.wasDisabled = btn.disabled ? '1' : '';
      btn.disabled = true;
    } else {
      btn.disabled = btn.dataset.wasDisabled === '1';
    }
  });
}

// 순서 바꾸기: 바뀐 뒤 순서대로 1, 2, 3… 을 다시 매긴다
async function moveProject(index, step) {
  var target = index + step;
  if (target < 0 || target >= projects.length) { return; }
  var order = projects.slice();
  var moved = order[index];
  order[index] = order[target];
  order[target] = moved;

  setListBusy('project-list', true);
  setMsg('project-list-msg', '순서를 바꾸는 중…', 'wait');
  try {
    await Promise.all(order
      .map(function (p, i) { return { p: p, order: i + 1 }; })
      .filter(function (item) { return item.p.sort_order !== item.order; })
      .map(function (item) {
        return changeRows('projects?id=eq.' + item.p.id, 'PATCH', { sort_order: item.order });
      }));
    setMsg('project-list-msg', '');
  } catch (err) {
    setMsg('project-list-msg', friendly(err));
  }
  try { await loadProjects(); } catch (err) { setMsg('project-list-msg', friendly(err)); }
}

async function deleteProject(p) {
  var ok = window.confirm('"' + p.title + '" 카드를 지울까요?\n이 카드의 좋아요 기록도 함께 지워지고, 되돌릴 수 없어요.');
  if (!ok) { return; }
  setListBusy('project-list', true);
  try {
    await changeRows('projects?id=eq.' + p.id, 'DELETE');
    if (editingId === p.id) { resetProjectForm(); }
    setMsg('project-list-msg', '"' + p.title + '" 카드를 지웠어요.', 'ok');
  } catch (err) {
    setMsg('project-list-msg', friendly(err));
  }
  try { await loadProjects(); } catch (err) { setMsg('project-list-msg', friendly(err)); }
}

function findProject(id) {
  for (var i = 0; i < projects.length; i++) {
    if (projects[i].id === id) { return projects[i]; }
  }
  return null;
}

function startEdit(p) {
  editingId = p.id;
  $('pj-number').value = p.number || '';
  $('pj-category').value = p.category || '';
  $('pj-title').value = p.title || '';
  $('pj-description').value = p.description || '';
  $('pj-tags').value = (p.tags || []).join(', ');
  $('pj-thumb').value = '';
  $('pj-file').value = '';
  $('pj-thumb-remove').checked = false;
  $('pj-file-remove').checked = false;
  showCurrentFile('pj-thumb-current', p.thumbnail_url, '썸네일');
  showCurrentFile('pj-file-current', p.file_url, '첨부 파일');
  $('pj-thumb-remove-wrap').hidden = !p.thumbnail_url;
  $('pj-file-remove-wrap').hidden = !p.file_url;

  $('pj-form-title').textContent = '카드 수정: ' + p.title;
  $('pj-save').textContent = '수정 저장';
  $('pj-cancel').hidden = false;
  setMsg('pj-msg', '');
  $('pj-form-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetProjectForm() {
  editingId = null;
  ['pj-number', 'pj-category', 'pj-title', 'pj-description', 'pj-tags', 'pj-thumb', 'pj-file']
    .forEach(function (id) { $(id).value = ''; });
  $('pj-thumb-remove').checked = false;
  $('pj-file-remove').checked = false;
  $('pj-thumb-remove-wrap').hidden = true;
  $('pj-file-remove-wrap').hidden = true;
  $('pj-thumb-current').textContent = '';
  $('pj-file-current').textContent = '';
  $('pj-form-title').textContent = '새 카드 추가';
  $('pj-save').textContent = '카드 추가';
  $('pj-cancel').hidden = true;
}

async function saveProject() {
  var title = $('pj-title').value.trim();
  if (!title) { setMsg('pj-msg', '제목을 적어 주세요.'); $('pj-title').focus(); return; }

  var thumbFile = $('pj-thumb').files[0];
  var attachFile = $('pj-file').files[0];
  var problem = checkFile(thumbFile, IMAGE_TYPES) || checkFile(attachFile, ALL_TYPES);
  if (problem) { setMsg('pj-msg', problem); return; }

  var editing = editingId ? findProject(editingId) : null;
  $('pj-save').disabled = true;
  setMsg('pj-msg', '저장하는 중…', 'wait');
  try {
    var thumbUrl = editing && !$('pj-thumb-remove').checked ? editing.thumbnail_url : null;
    var fileUrl = editing && !$('pj-file-remove').checked ? editing.file_url : null;
    if (thumbFile) { thumbUrl = await uploadFile(thumbFile, 'projects'); }
    if (attachFile) { fileUrl = await uploadFile(attachFile, 'projects'); }

    var body = {
      number: $('pj-number').value.trim(),
      category: $('pj-category').value.trim(),
      title: title,
      description: $('pj-description').value.trim(),
      tags: $('pj-tags').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean),
      thumbnail_url: thumbUrl,
      file_url: fileUrl
    };

    if (editing) {
      await changeRows('projects?id=eq.' + editing.id, 'PATCH', body);
    } else {
      var maxOrder = projects.reduce(function (max, p) { return Math.max(max, p.sort_order); }, 0);
      body.sort_order = maxOrder + 1; // 새 카드는 맨 뒤에
      await changeRows('projects', 'POST', body);
    }
    resetProjectForm();
    setMsg('pj-msg', editing ? '고쳤어요.' : '카드를 추가했어요.', 'ok');
    await loadProjects();
  } catch (err) {
    setMsg('pj-msg', friendly(err));
  } finally {
    $('pj-save').disabled = false;
  }
}

// ---------- 좋아요 ----------
function renderLikes() {
  var list = $('like-list');
  list.textContent = '';
  if (!projects.length) {
    list.appendChild(el('li', 'empty-row', '카드가 없어요.'));
    return;
  }
  projects.forEach(function (p) {
    var count = likeCounts[p.id] || 0;
    var row = el('li', 'row');
    var info = el('div', 'row-info');
    info.appendChild(el('p', 'row-cat', projectLabel(p)));
    info.appendChild(el('p', 'row-title', p.title));
    info.appendChild(el('p', 'row-meta', '좋아요 ' + count + '개'));

    var actions = el('div', 'row-actions');
    var reset = button('danger-btn small', '좋아요 초기화', function () { resetLikes(p, count); });
    reset.disabled = count === 0;
    actions.appendChild(reset);

    row.appendChild(info);
    row.appendChild(actions);
    list.appendChild(row);
  });
}

async function resetLikes(p, count) {
  var ok = window.confirm('"' + p.title + '" 카드의 좋아요 ' + count + '개를 모두 지울까요?\n되돌릴 수 없어요.');
  if (!ok) { return; }
  setListBusy('like-list', true);
  try {
    await changeRows('likes?project_id=eq.' + p.id + '&select=id', 'DELETE');
    setMsg('like-msg', '"' + p.title + '" 카드의 좋아요를 0으로 만들었어요.', 'ok');
  } catch (err) {
    setMsg('like-msg', friendly(err));
  }
  try { await loadProjects(); } catch (err) { setMsg('like-msg', friendly(err)); }
}

// ---------- 방명록 ----------
async function loadGuestbook() {
  var entries = await api('resume_guestbook?select=*&order=created_at.desc,id.desc');
  var list = $('guest-list');
  list.textContent = '';
  if (!entries.length) {
    list.appendChild(el('li', 'empty-row', '아직 남겨진 글이 없어요.'));
    return;
  }
  entries.forEach(function (entry) {
    var row = el('li', 'row');
    var info = el('div', 'row-info');
    info.appendChild(el('p', 'row-meta', entry.nickname + ' · ' + formatDate(entry.created_at)));
    info.appendChild(el('p', 'row-text', entry.message));
    var actions = el('div', 'row-actions');
    actions.appendChild(button('danger-btn small', '삭제', function () { deleteGuest(entry); }));
    row.appendChild(info);
    row.appendChild(actions);
    list.appendChild(row);
  });
}

async function deleteGuest(entry) {
  var ok = window.confirm(entry.nickname + '님의 글을 지울까요?\n"' + entry.message.slice(0, 40) + '"\n되돌릴 수 없어요.');
  if (!ok) { return; }
  setListBusy('guest-list', true);
  try {
    await changeRows('resume_guestbook?id=eq.' + entry.id, 'DELETE');
    setMsg('guest-msg', '글을 지웠어요.', 'ok');
  } catch (err) {
    setMsg('guest-msg', friendly(err));
  }
  try { await loadGuestbook(); } catch (err) { setMsg('guest-msg', friendly(err)); }
}

// ---------- 시작 ----------
function start() {
  $('login-btn').addEventListener('click', login);
  ['login-email', 'login-password'].forEach(function (id) {
    $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') { login(); } });
  });
  $('logout-btn').addEventListener('click', logout);
  $('denied-logout').addEventListener('click', logout);
  $('pf-save').addEventListener('click', saveProfile);
  $('pj-save').addEventListener('click', saveProject);
  $('pj-cancel').addEventListener('click', function () { resetProjectForm(); setMsg('pj-msg', ''); });
  watchFileInput('pf-photo', IMAGE_TYPES, 'pf-msg');
  watchFileInput('pj-thumb', IMAGE_TYPES, 'pj-msg');
  watchFileInput('pj-file', ALL_TYPES, 'pj-msg');

  // 전에 로그인해 둔 것이 있으면 이어서 쓴다
  try { session = JSON.parse(storageGet(SESSION_KEY) || 'null'); } catch (e) { session = null; }
  if (session && session.access_token && session.user) {
    enter();
  } else {
    session = null;
    showLogin('');
  }
}

start();
