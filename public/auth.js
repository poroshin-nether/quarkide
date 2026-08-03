let token = localStorage.getItem('quarkide_token');

function authFetch(url, opts = {}) {
  const sep = url.includes('?') ? '&' : '?';
  return fetch(url + sep + 'token=' + token, opts);
}

function authPost(url, body) {
  return authFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

function dismissSplash() {
  const splash = $('splash');
  if (!splash) return;
  splash.style.display = 'none';
}

function showLogin() {
  $('login-box').style.display = 'flex';
  $('login-pass').focus();
}

function hideLogin() {
  $('login-box').style.display = 'none';
}

async function doLogin() {
  const pass = $('login-pass');
  const err = $('login-error');
  if (!pass.value) return;
  const passValue = pass.value;
  pass.value = '';
  const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: passValue }) });
  const data = await res.json();
  if (!data.ok) {
    err.style.display = 'block';
    pass.focus();
    return;
  }
  token = data.token;
  localStorage.setItem('quarkide_token', token);
  err.style.display = 'none';
  hideLogin();
  dismissSplash();
  await bootAuthed();
}

async function tryResume() {
  await bootCommon();

  let authed = false;
  if (token) {
    try { authed = (await authFetch('/api/ls?path=')).ok; } catch {}
    if (!authed) {
      token = null;
      localStorage.removeItem('quarkide_token');
    }
  }

  if (!authed) {
    showLogin();
    return;
  }

  await bootAuthed();
}

on($('login-btn'), 'click', doLogin);
on($('login-pass'), 'keydown', (e) => { if (e.key === 'Enter') doLogin(); });
on($('logout'), 'click', async () => {
  await authFetch('/api/logout', { method: 'POST' });
  token = null;
  localStorage.removeItem('quarkide_token');
  $('app').style.display = 'none';
  $('splash').style.display = 'flex';
  showLogin();
});
