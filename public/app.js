// --- File Tree ---
const treeEl = $('tree');
const currentPathEl = $('current-path');
const driveSelectEl = $('drive-select');

async function initDrives() {
  const res = await authFetch('/api/drives');
  const data = await res.json();
  if (data.drives.length < 2) return;
  driveSelectEl.innerHTML = data.drives.map(d => '<option value="' + d + '">' + d.slice(0, 2) + '</option>').join('');
  driveSelectEl.style.display = '';
  on(driveSelectEl, 'change', () => loadDir(driveSelectEl.value));
  syncDriveSelect(currentPathEl.textContent);
}

// Path text stays plain, selectable/copyable. The select is icon-only (its
// own text is transparent) — clicking it just opens the drive list.
function syncDriveSelect(dirPath) {
  const drive = /^[A-Za-z]:\\/.exec(dirPath);
  if (drive) driveSelectEl.value = drive[0];
}

async function loadDir(dirPath) {
  const res = await authFetch('/api/ls?path=' + encodeURIComponent(dirPath));
  const data = await res.json();
  currentPathEl.textContent = data.path;
  syncDriveSelect(data.path);
  treeEl.innerHTML = '';
  saveSession();
  wsSend({ type: 'watch-dir', path: data.path });

  if (data.parent) {
    const d = el('div', 'tree-item dir');
    d.innerHTML = '<span class="icon">\u{1F4C1}</span><span class="name">..</span>';
    d.onclick = () => loadDir(data.parent);
    treeEl.appendChild(d);
  }

  for (const item of data.items) {
    const d = el('div', 'tree-item ' + (item.dir ? 'dir' : 'file'));
    d.dataset.path = data.path + '/' + item.name;
    d.dataset.name = item.name;
    d.innerHTML = '<span class="icon">' + (item.dir ? '\u{1F4C1}' : '\u{1F4C4}') + '</span><span class="name">' +
      item.name.replace(/</g, '&lt;') + '</span>';
    d.onclick = item.dir
      ? () => loadDir(data.path + '/' + item.name)
      : () => openFile(data.path + '/' + item.name, item.name);
    treeEl.appendChild(d);
  }
}

// --- Resizers ---
function setupResizer(handle, dirFn, target, invert) {
  function begin(startX, startY) {
    const isH = dirFn() === 'h';
    const start = isH ? startY : startX;
    const startSize = target.getBoundingClientRect()[isH ? 'height' : 'width'];
    const prop = isH ? 'height' : 'width';
    return (x, y) => {
      const delta = (isH ? y : x) - start;
      target.style[prop] = Math.max(150, startSize + (invert ? -delta : delta)) + 'px';
    };
  }

  // Desktop — mouse
  on(handle, 'mousedown', (e) => {
    e.preventDefault();
    const move = begin(e.clientX, e.clientY);
    const onMove = (e) => move(e.clientX, e.clientY);
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      saveSession();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  // Mobile — touch
  on(handle, 'touchstart', (e) => {
    const t = e.touches[0];
    if (!t) return;
    e.preventDefault();
    const move = begin(t.clientX, t.clientY);
    const onMove = (e) => {
      const t = e.touches[0];
      if (!t) return;
      e.preventDefault();
      move(t.clientX, t.clientY);
    };
    const onEnd = () => {
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
      saveSession();
    };
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
  }, { passive: false });
}

// --- Start app ---
let appInited = false;

async function bootCommon() {
  initSettings();
  await initMonaco();
}

async function bootAuthed() {
  $('app').style.display = 'flex';

  await initTerminal();

  const saved = localStorage.getItem('quarkide_session');
  await loadDir(saved ? JSON.parse(saved).dir || '' : '');
  await restoreSession();

  if (!appInited) {
    appInited = true;

    initDrives();

    on(treeEl, 'contextmenu', openTreeContextMenu);
    on($('terminal'), 'contextmenu', (e) => e.preventDefault());

    on($('sidebar-toggle'), 'click', () => { $('app').classList.add('sidebar-hidden'); });
    on($('sidebar-open'), 'click', () => { $('app').classList.remove('sidebar-hidden'); });

    const mainEl = $('main');
    setupResizer($('h-resizer'), () => mainEl.classList.contains('layout-right') ? 'v' : 'h', $('terminal-wrap'), true);
    setupResizer($('v-resizer'), () => 'v', $('sidebar'), false);
  }

  if (window.innerWidth < 768) $('app').classList.add('sidebar-hidden');

  dismissSplash();
}

