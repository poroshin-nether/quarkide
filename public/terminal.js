let ws = null;
let reconnectTimer = null;

const terminals = [];
let activeTerm = null;
let currentXtermTheme = null;

const termContainer = $('terminal');
const termTabs = $('term-tabs');
const termWrap = $('terminal-wrap');
const hResizer = $('h-resizer');

function wsSend(msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function syncTermVisibility() {
  const show = terminals.length > 0;
  termWrap.style.display = show ? '' : 'none';
  hResizer.style.display = show ? '' : 'none';
  const ctrlc = $('term-ctrlc-btn');
  if (ctrlc) ctrlc.style.display = show ? '' : 'none';
}

function createTermPanel(id) {
  if (terminals.find(t => t.id == id)) return;
  const div = el('div', 'term-panel');
  termContainer.appendChild(div);

  const fitAddon = new FitAddon.FitAddon();
  const term = new Terminal({
    fontFamily: fontFamily(settings.font),
    fontSize: settings.fontSize,
    theme: currentXtermTheme || { background: '#1e1e1e', foreground: '#d4d4d4', cursor: '#d4d4d4' },
    cursorBlink: true,
  });
  term.loadAddon(fitAddon);

  const entry = { id, term, fitAddon, el: div };
  terminals.push(entry);
  syncTermVisibility();
  div.style.display = 'block';

  term.open(div);
  term.onData((data) => wsSend({ type: 'input', id, data }));
  term.onResize(({ cols, rows }) => wsSend({ type: 'resize', id, cols, rows }));

  const viewport = div.querySelector('.xterm-viewport');
  if (viewport) {
    let startY = 0, startScroll = 0, dragging = false;
    div.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      startY = e.touches[0].clientY;
      startScroll = viewport.scrollTop;
      dragging = true;
    }, { passive: true });
    div.addEventListener('touchmove', (e) => {
      if (!dragging || e.touches.length !== 1) return;
      const dy = e.touches[0].clientY - startY;
      viewport.scrollTop = startScroll - dy;
      e.preventDefault();
    }, { passive: false });
    div.addEventListener('touchend', () => { dragging = false; });
    div.addEventListener('touchcancel', () => { dragging = false; });
  }

  switchTerm(entry);
  return entry;
}

function disposeAllTerms() {
  while (terminals.length) {
    const t = terminals.pop();
    t.term.dispose();
    t.el.remove();
  }
  activeTerm = null;
  syncTermVisibility();
  renderTermTabs();
}

function switchTerm(entry) {
  if (activeTerm) activeTerm.el.style.display = 'none';
  activeTerm = entry;
  entry.el.style.display = 'block';
  entry.fitAddon.fit();
  entry.term.focus();
  renderTermTabs();
}

function closeTerm(entry) {
  wsSend({ type: 'kill-shell', id: entry.id });
  removeTerm(entry);
}

function removeTerm(entry) {
  const idx = terminals.indexOf(entry);
  if (idx === -1) return;
  terminals.splice(idx, 1);
  entry.term.dispose();
  entry.el.remove();

  if (activeTerm === entry) {
    activeTerm = terminals[Math.min(idx, terminals.length - 1)] || null;
    if (activeTerm) {
      activeTerm.el.style.display = 'block';
      activeTerm.fitAddon.fit();
      activeTerm.term.focus();
    }
  }
  syncTermVisibility();
  renderTermTabs();
}

function renderTermTabs() {
  termTabs.innerHTML = '';
  for (const t of terminals) {
    const tab = el('div', 'ui-tab term' + (t === activeTerm ? ' active' : ''));
    tab.innerHTML = '<span class="name">shell ' + t.id + '</span><button class="ui-close">\u00d7</button>';
    tab.onclick = () => switchTerm(t);
    tab.querySelector('.ui-close').onclick = (e) => { e.stopPropagation(); closeTerm(t); };
    termTabs.appendChild(tab);
  }
  const addBtn = el('button', 'ui-ghost term-add');
  addBtn.textContent = '+';
  addBtn.onclick = requestNewShell;
  termTabs.appendChild(addBtn);
}

const MIN_TERM_TAB_WIDTH = 60;

function canOpenMoreTerms() {
  if (terminals.length === 0) return true;
  const addBtn = termTabs.querySelector('.term-add');
  let available = termTabs.clientWidth;
  if (addBtn) available -= addBtn.offsetWidth;
  const maxTabs = Math.floor(available / MIN_TERM_TAB_WIDTH);
  return terminals.length < maxTabs;
}

function flashTermTabsReject() {
  termTabs.classList.remove('reject');
  void termTabs.offsetWidth;
  termTabs.classList.add('reject');
  setTimeout(() => termTabs.classList.remove('reject'), 500);
}

function requestNewShell() {
  if (!canOpenMoreTerms()) {
    flashTermTabsReject();
    return;
  }
  const cwd = $('current-path') ? $('current-path').textContent : '';
  wsSend({ type: 'new-shell', cwd });
}

let firstOpenResolve = null;

function connect() {
  let cwd = '';
  try {
    const saved = localStorage.getItem('quarkide_session');
    if (saved) cwd = JSON.parse(saved).dir || '';
  } catch {}
  const url = 'ws://' + location.host + '?token=' + token + (cwd ? '&cwd=' + encodeURIComponent(cwd) : '');
  const socket = new WebSocket(url);
  ws = socket;

  socket.onopen = () => {
    disposeAllTerms();
    if (firstOpenResolve) { firstOpenResolve(); firstOpenResolve = null; }
  };
  socket.onclose = () => { if (ws === socket) reconnectTimer = setTimeout(connect, 2000); };

  socket.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }

    if (msg.type == 'shell-created') {
      createTermPanel(msg.id);
    } else if (msg.type == 'output') {
      const t = terminals.find(t => t.id == msg.id);
      if (t) t.term.write(msg.data);
    } else if (msg.type == 'shell-exit' || msg.type == 'shell-killed') {
      const t = terminals.find(t => t.id == msg.id);
      if (t) removeTerm(t);
    } else if (msg.type == 'dir-changed') {
      if (msg.path === currentPathEl.textContent) loadDir(currentPathEl.textContent);
    }
  };
}

let termInited = false;

function initTerminal() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
  disposeAllTerms();

  if (!termInited) {
    termInited = true;
    new ResizeObserver(() => { if (activeTerm) activeTerm.fitAddon.fit(); }).observe(termContainer);
    termWrap.addEventListener('click', () => { if (activeTerm) activeTerm.term.focus(); });
    termContainer.addEventListener('dragstart', (e) => e.preventDefault());
    on($('term-btn'), 'click', () => {
      requestNewShell();
      if (activeTerm) { activeTerm.fitAddon.fit(); activeTerm.term.focus(); }
    });
    on($('term-ctrlc-btn'), 'click', () => {
      if (!activeTerm) return;
      wsSend({ type: 'input', id: activeTerm.id, data: '\x03' });
      activeTerm.term.focus();
    });
  }

  return new Promise((resolve) => {
    firstOpenResolve = resolve;
    connect();
  });
}

