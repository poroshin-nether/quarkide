let monacoReady = false;
let monacoEditor = null;
let pendingTab = null;
const openTabs = [];
let activeTab = null;

const tabsEl = $('tabs');
const editorEl = $('editor');
const noFileEl = $('no-file');
const statusFile = $('status-file');
const statusPos = $('status-pos');

on($('save-btn'), 'click', saveFile);

const extToLang = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', rb: 'ruby', rs: 'rust', go: 'go',
  java: 'java', c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp', cs: 'csharp', php: 'php',
  html: 'html', htm: 'html', xml: 'xml', svg: 'xml', vue: 'html',
  css: 'css', scss: 'scss', less: 'less',
  json: 'json', yaml: 'yaml', yml: 'yaml',
  md: 'markdown', sh: 'shell', bash: 'shell', bat: 'bat', ps1: 'powershell',
  sql: 'sql', dockerfile: 'dockerfile', toml: 'toml', ini: 'ini',
};

function initMonaco() {
  if (monacoReady) return Promise.resolve();
  return new Promise((resolve) => {
    const ready = () => {
      require.config({ paths: { vs: '/vs' } });
      require(['vs/editor/editor.main'], async () => {
        monacoReady = true;
        await applyTheme(settings.theme);
        if (pendingTab) activateTab(pendingTab);
        resolve();
      });
    };
    if (typeof window.require === 'function') {
      ready();
    } else {
      const s = el('script');
      s.src = '/vs/loader.js';
      s.onload = ready;
      document.head.appendChild(s);
    }
  });
}

const loadedThemes = new Map();
const builtinThemes = {
  'vs-dark': { base: 'vs-dark', colors: { 'editor.background': '#1e1e1e', 'editor.foreground': '#d4d4d4' } },
  'vs': { base: 'vs', colors: { 'editor.background': '#ffffff', 'editor.foreground': '#000000' } },
  'hc-black': { base: 'hc-black', colors: { 'editor.background': '#000000', 'editor.foreground': '#ffffff' } },
  'hc-light': { base: 'hc-light', colors: { 'editor.background': '#ffffff', 'editor.foreground': '#292929' } },
};

async function applyTheme(name) {
  if (!monacoReady) return;
  let data;
  if (builtinThemes[name]) {
    monaco.editor.setTheme(name);
    data = builtinThemes[name];
  } else {
    const id = name.replace(/\s+/g, '-').toLowerCase();
    if (!loadedThemes.has(id)) {
      const res = await fetch('/themes/' + encodeURIComponent(name) + '.json');
      if (!res.ok) { monaco.editor.setTheme('vs-dark'); return; }
      data = await res.json();
      monaco.editor.defineTheme(id, data);
      loadedThemes.set(id, data);
    } else {
      data = loadedThemes.get(id);
    }
    monaco.editor.setTheme(id);
  }
  applyUITheme(data);
  applyTerminalTheme(data);
}

function normHex(v) {
  if (!v || typeof v !== 'string') return null;
  if (v[0] !== '#') return null;
  return v.length === 9 ? v.slice(0, 7) : v;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6);
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

function rgbToHex(r, g, b) {
  const clamp = (x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
  return '#' + clamp(r) + clamp(g) + clamp(b);
}

function shade(hex, amount) {
  const [r, g, b] = hexToRgb(hex);
  const t = amount > 0 ? 255 : 0;
  const p = Math.abs(amount);
  return rgbToHex(r + (t - r) * p, g + (t - g) * p, b + (t - b) * p);
}

function mix(hex1, hex2, ratio) {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  return rgbToHex(r1 * (1 - ratio) + r2 * ratio, g1 * (1 - ratio) + g2 * ratio, b1 * (1 - ratio) + b2 * ratio);
}

function isDarkTheme(theme) {
  const base = theme.base || 'vs-dark';
  return base === 'vs-dark' || base === 'hc-black';
}

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function readableOn(bgHex) {
  return luminance(bgHex) > 0.55 ? '#1a1a1a' : '#f2f2f2';
}

function applyUITheme(theme) {
  const c = theme.colors || {};
  const dark = isDarkTheme(theme);
  const bg = normHex(c['editor.background']) || (dark ? '#1e1e1e' : '#ffffff');
  const fg = normHex(c['editor.foreground']) || (dark ? '#d4d4d4' : '#000000');
  const bg2 = normHex(c['sideBar.background']) || normHex(c['editorGroupHeader.tabsBackground']) || shade(bg, dark ? 0.04 : -0.04);
  const bg3 = normHex(c['list.hoverBackground']) || normHex(c['editor.lineHighlightBackground']) || shade(bg, dark ? 0.1 : -0.1);
  const border = normHex(c['panel.border']) || normHex(c['contrastBorder']) || shade(bg, dark ? 0.15 : -0.15);
  const textDim = normHex(c['descriptionForeground']) || normHex(c['editorLineNumber.foreground']) || mix(fg, bg, 0.5);
  const accent = normHex(c['focusBorder']) || normHex(c['editorCursor.foreground']) || (dark ? '#569cd6' : '#0066bf');
  const statusBg = normHex(c['statusBar.background']) || accent;
  const statusFg = normHex(c['statusBar.foreground']) || readableOn(statusBg);
  const statusDark = luminance(statusBg) < 0.55;
  const statusBtnBg = statusDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.10)';
  const statusBtnBgHover = statusDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.18)';
  const onAccent = readableOn(accent);

  cssVar('--bg', bg);
  cssVar('--bg2', bg2);
  cssVar('--bg3', bg3);
  cssVar('--border', border);
  cssVar('--text', fg);
  cssVar('--text-dim', textDim);
  cssVar('--accent', accent);
  cssVar('--on-accent', onAccent);
  cssVar('--status-bg', statusBg);
  cssVar('--status-fg', statusFg);
  cssVar('--status-btn-bg', statusBtnBg);
  cssVar('--status-btn-bg-hover', statusBtnBgHover);
}

const DEFAULT_ANSI_DARK = {
  black: '#000000', red: '#cd3131', green: '#0dbc79', yellow: '#e5e510',
  blue: '#2472c8', magenta: '#bc3fbc', cyan: '#11a8cd', white: '#e5e5e5',
  brightBlack: '#666666', brightRed: '#f14c4c', brightGreen: '#23d18b', brightYellow: '#f5f543',
  brightBlue: '#3b8eea', brightMagenta: '#d670d6', brightCyan: '#29b8db', brightWhite: '#ffffff',
};

const ANSI_KEYS = {
  black: 'terminal.ansiBlack', red: 'terminal.ansiRed', green: 'terminal.ansiGreen',
  yellow: 'terminal.ansiYellow', blue: 'terminal.ansiBlue', magenta: 'terminal.ansiMagenta',
  cyan: 'terminal.ansiCyan', white: 'terminal.ansiWhite',
  brightBlack: 'terminal.ansiBrightBlack', brightRed: 'terminal.ansiBrightRed',
  brightGreen: 'terminal.ansiBrightGreen', brightYellow: 'terminal.ansiBrightYellow',
  brightBlue: 'terminal.ansiBrightBlue', brightMagenta: 'terminal.ansiBrightMagenta',
  brightCyan: 'terminal.ansiBrightCyan', brightWhite: 'terminal.ansiBrightWhite',
};

function applyTerminalTheme(theme) {
  const c = theme.colors || {};
  const dark = isDarkTheme(theme);
  const bg = normHex(c['editor.background']) || (dark ? '#1e1e1e' : '#ffffff');
  const fg = normHex(c['editor.foreground']) || (dark ? '#d4d4d4' : '#000000');
  const xt = Object.assign({}, DEFAULT_ANSI_DARK, {
    background: bg,
    foreground: fg,
    cursor: normHex(c['editorCursor.foreground']) || fg,
    cursorAccent: bg,
    selectionBackground: normHex(c['editor.selectionBackground']) || (dark ? '#444' : '#add6ff'),
  });
  for (const k in ANSI_KEYS) {
    const v = normHex(c[ANSI_KEYS[k]]);
    if (v) xt[k] = v;
  }
  currentXtermTheme = xt;
  for (const t of terminals) t.term.options.theme = xt;
}

function saveSession() {
  const sidebar = $('sidebar');
  const termWrap = $('terminal-wrap');
  localStorage.setItem('quarkide_session', JSON.stringify({
    tabs: openTabs.map(t => ({ path: t.path, name: t.name })),
    active: activeTab ? activeTab.path : null,
    dir: $('current-path').textContent || '',
    sidebarWidth: sidebar.style.width || '',
    termWidth: termWrap.style.width || '',
    termHeight: termWrap.style.height || '',
  }));
}

async function restoreSession() {
  const raw = localStorage.getItem('quarkide_session');
  if (!raw) return;
  const data = JSON.parse(raw);

  if (data.sidebarWidth) $('sidebar').style.width = data.sidebarWidth;
  if (data.termWidth) $('terminal-wrap').style.width = data.termWidth;
  if (data.termHeight) $('terminal-wrap').style.height = data.termHeight;

  for (const t of data.tabs) await openFile(t.path, t.name, { skipCheck: true });
  if (data.active) {
    const tab = openTabs.find(t => t.path == data.active);
    if (tab) activateTab(tab);
  }
}

const MIN_TAB_WIDTH = 60;

function canOpenMoreTabs() {
  let available = tabsEl.clientWidth;
  const sbOpen = tabsEl.querySelector('#sidebar-open');
  if (sbOpen && sbOpen.offsetParent !== null) available -= sbOpen.offsetWidth;
  const maxTabs = Math.floor(available / MIN_TAB_WIDTH);
  return openTabs.length < maxTabs;
}

function flashTabsReject() {
  tabsEl.classList.remove('reject');
  void tabsEl.offsetWidth;
  tabsEl.classList.add('reject');
  setTimeout(() => tabsEl.classList.remove('reject'), 500);
}

async function openFile(filePath, name, opts = {}) {
  const existing = openTabs.find(t => t.path == filePath);
  if (existing) { activateTab(existing); return; }

  if (!opts.skipCheck && !canOpenMoreTabs()) {
    flashTabsReject();
    return;
  }

  const res = await authFetch('/api/read?path=' + encodeURIComponent(filePath));
  if (!res.ok) return;
  const data = await res.json();

  const ext = name.split('.').pop().toLowerCase();
  const tab = { path: filePath, name, content: data.content, lang: extToLang[ext] || 'plaintext', modified: false, model: null };
  openTabs.push(tab);
  activateTab(tab);
}

function createEditor() {
  monacoEditor = monaco.editor.create(editorEl, {
    fontFamily: fontFamily(settings.font),
    fontSize: settings.fontSize,
    minimap: { enabled: settings.minimap },
    columnSelection: settings.columnSelection,
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: 2,
    lineNumbersMinChars: 2,
    lineDecorationsWidth: 8,
    padding: { top: 4, bottom: 4 },
    scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
    glyphMargin: false,
    folding: false,
  });
  monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveFile());
  monaco.editor.addKeybindingRules([
    { keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyR, command: null },
  ]);
  monacoEditor.onDidChangeCursorPosition((e) => {
    statusPos.textContent = 'Ln ' + e.position.lineNumber + ', Col ' + e.position.column;
  });
}

function activateTab(tab) {
  if (!monacoReady) { pendingTab = tab; return; }
  pendingTab = null;
  activeTab = tab;
  renderTabs();

  noFileEl.style.display = 'none';
  editorEl.style.display = 'block';

  if (!monacoEditor) createEditor();

  if (!tab.model) {
    tab.model = monaco.editor.createModel(tab.content, tab.lang);
    tab.model.onDidChangeContent(() => { if (!tab.modified) { tab.modified = true; renderTabs(); } });
  }

  monacoEditor.setModel(tab.model);
  monacoEditor.updateOptions({ lineNumbersMinChars: String(tab.model.getLineCount()).length + 1 });
  statusFile.textContent = tab.path;
  statusPos.textContent = 'Ln 1, Col 1';
  saveSession();
}

function closeTab(tab) {
  const idx = openTabs.indexOf(tab);
  openTabs.splice(idx, 1);
  if (tab.model) tab.model.dispose();

  if (activeTab === tab) activeTab = openTabs[Math.min(idx, openTabs.length - 1)] || null;
  renderTabs();
  if (activeTab) {
    activateTab(activeTab);
  } else {
    editorEl.style.display = 'none';
    noFileEl.style.display = 'flex';
    statusFile.textContent = '';
    statusPos.textContent = '';
  }
  saveSession();
}

function renderTabs() {
  const sidebarBtn = tabsEl.querySelector('#sidebar-open');
  tabsEl.innerHTML = '';
  if (sidebarBtn) tabsEl.appendChild(sidebarBtn);
  for (const tab of openTabs) {
    const t = el('div', 'ui-tab' + (tab === activeTab ? ' active' : '') + (tab.modified ? ' modified' : ''));
    t.title = tab.path;
    t.innerHTML = '<span class="name">' + tab.name.replace(/</g, '&lt;') + '</span><button class="ui-close">\u00d7</button>';
    t.onclick = () => activateTab(tab);
    t.querySelector('.ui-close').onclick = (e) => { e.stopPropagation(); closeTab(tab); };
    tabsEl.appendChild(t);
  }
}

async function saveFile() {
  if (!activeTab) return;
  const content = activeTab.model.getValue();
  const res = await authPost('/api/write', { path: activeTab.path, content });
  if (res.ok) {
    activeTab.modified = false;
    renderTabs();
    const btn = $('save-btn');
    btn.classList.remove('flash');
    void btn.offsetWidth;
    btn.classList.add('flash');
  }
}
