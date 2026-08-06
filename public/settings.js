const settings = Object.assign(
  { minimap: true, columnSelection: false, layout: 'bottom', font: 'Consolas', fontSize: 14, theme: 'vs-dark' },
  JSON.parse(localStorage.getItem('quarkide_settings') || '{}')
);

const THEMES = [
  'vs-dark', 'vs', 'hc-black', 'hc-light',
  'Active4D', 'All Hallows Eve', 'Amy', 'Birds of Paradise', 'Blackboard',
  'Brilliance Black', 'Brilliance Dull', 'Chrome DevTools', 'Clouds Midnight',
  'Clouds', 'Cobalt', 'Cobalt2', 'Dawn', 'Dominion Day', 'Dracula', 'Dreamweaver',
  'Eiffel', 'Espresso Libre', 'GitHub Dark', 'GitHub Light', 'GitHub',
  'IDLE', 'idleFingers', 'iPlastic', 'Katzenmilch', 'krTheme', 'Kuroir Theme',
  'LAZY', 'MagicWB (Amiga)', 'Merbivore Soft', 'Merbivore', 'monoindustrial',
  'Monokai Bright', 'Monokai', 'Night Owl', 'Nord', 'Oceanic Next',
  'Pastels on Dark', 'Slush and Poppies', 'Solarized-dark', 'Solarized-light',
  'SpaceCadet', 'Sunburst', 'Textmate (Mac Classic)', 'Tomorrow-Night-Blue',
  'Tomorrow-Night-Bright', 'Tomorrow-Night-Eighties', 'Tomorrow-Night',
  'Tomorrow', 'Twilight', 'Upstream Sunburst', 'Vibrant Ink', 'Xcode_default',
  'Zenburnesque',
];

function saveSettings() {
  localStorage.setItem('quarkide_settings', JSON.stringify(settings));
}

function fontFamily(name) {
  return "'" + name + "', monospace";
}

function applyFont(name) {
  const family = fontFamily(name);
  cssVar('--font', family);
  for (const t of terminals) t.term.options.fontFamily = family;
  if (monacoEditor) monacoEditor.updateOptions({ fontFamily: family });
}

function applyFontSize(size) {
  cssVar('--font-size', size + 'px');
  for (const t of terminals) t.term.options.fontSize = size;
  if (monacoEditor) monacoEditor.updateOptions({ fontSize: size });
}

let settingsInited = false;

function initSettings() {
  if (settingsInited) return;
  settingsInited = true;

  const popup = $('settings-popup');
  const overlay = $('settings-overlay');
  function openSettings() { popup.classList.add('open'); overlay.classList.add('open'); }
  function closeSettings() { popup.classList.remove('open'); overlay.classList.remove('open'); }
  on($('settings-btn'), 'click', () => popup.classList.contains('open') ? closeSettings() : openSettings());
  on($('settings-close'), 'click', closeSettings);
  on(overlay, 'click', closeSettings);

  function clampPopup() {
    if (popup.style.transform !== 'none') return;
    const w = popup.offsetWidth;
    const h = popup.offsetHeight;
    const maxX = Math.max(0, window.innerWidth - w);
    const maxY = Math.max(0, window.innerHeight - h);
    const rect = popup.getBoundingClientRect();
    const x = Math.max(0, Math.min(maxX, rect.left));
    const y = Math.max(0, Math.min(maxY, rect.top));
    popup.style.left = x + 'px';
    popup.style.top = y + 'px';
  }
  window.addEventListener('resize', clampPopup);
  new ResizeObserver(clampPopup).observe(popup);

  const header = popup.querySelector('.settings-popup-header');
  on(header, 'pointerdown', (e) => {
    if (e.target.closest('#settings-close')) return;
    if (e.button !== undefined && e.button !== 0) return;

    const rect = popup.getBoundingClientRect();
    popup.style.transform = 'none';
    popup.style.left = rect.left + 'px';
    popup.style.top = rect.top + 'px';

    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    header.setPointerCapture(e.pointerId);

    const onMove = (ev) => {
      const w = popup.offsetWidth;
      const h = popup.offsetHeight;
      let x = ev.clientX - offsetX;
      let y = ev.clientY - offsetY;
      x = Math.max(0, Math.min(window.innerWidth - w, x));
      y = Math.max(0, Math.min(window.innerHeight - h, y));
      popup.style.left = x + 'px';
      popup.style.top = y + 'px';
    };
    const onUp = () => {
      header.removeEventListener('pointermove', onMove);
      header.removeEventListener('pointerup', onUp);
      header.removeEventListener('pointercancel', onUp);
    };
    header.addEventListener('pointermove', onMove);
    header.addEventListener('pointerup', onUp);
    header.addEventListener('pointercancel', onUp);
  });

  const fontSelect = $('font-select');
  fontSelect.value = settings.font;
  applyFont(settings.font);

  on(fontSelect, 'change', () => {
    settings.font = fontSelect.value;
    saveSettings();
    applyFont(settings.font);
  });

  const sizeLabel = $('font-size-value');
  sizeLabel.textContent = settings.fontSize;
  applyFontSize(settings.fontSize);

  function changeSize(delta) {
    const size = Math.max(10, Math.min(24, settings.fontSize + delta));
    settings.fontSize = size;
    sizeLabel.textContent = size;
    saveSettings();
    applyFontSize(size);
  }

  on($('font-size-down'), 'click', () => changeSize(-1));
  on($('font-size-up'), 'click', () => changeSize(1));

  const themeSelect = $('theme-select');
  for (const name of THEMES) {
    const opt = el('option');
    opt.value = name;
    opt.textContent = name;
    themeSelect.appendChild(opt);
  }
  themeSelect.value = settings.theme;
  on(themeSelect, 'change', () => {
    settings.theme = themeSelect.value;
    saveSettings();
    applyTheme(settings.theme);
  });

  function bindToggle(ids, key, apply) {
    const btns = ids.map((id) => $(id)).filter(Boolean);
    const sync = () => btns.forEach((b) => b.classList.toggle('active', !!settings[key]));
    sync();
    for (const b of btns) {
      on(b, 'click', () => {
        settings[key] = !settings[key];
        saveSettings();
        sync();
        apply(settings[key]);
      });
    }
  }

  bindToggle(['btn-minimap', 'mini-minimap'], 'minimap', (v) => {
    if (monacoEditor) monacoEditor.updateOptions({ minimap: { enabled: v } });
  });
  bindToggle(['btn-column-select', 'mini-column-select'], 'columnSelection', (v) => {
    if (monacoEditor) monacoEditor.updateOptions({ columnSelection: v });
  });

  const mainEl = $('main');
  const btnBottom = $('layout-bottom');
  const btnRight = $('layout-right');
  const termWrap = $('terminal-wrap');

  function setLayout(mode, save) {
    const isRight = mode === 'right';
    mainEl.classList.toggle('layout-right', isRight);
    btnRight.classList.toggle('active', isRight);
    btnBottom.classList.toggle('active', !isRight);
    termWrap.style.height = isRight ? '' : '300px';
    termWrap.style.width = isRight ? '400px' : '';
    if (save !== false) { settings.layout = mode; saveSettings(); saveSession(); }
  }

  on(btnBottom, 'click', () => setLayout('bottom'));
  on(btnRight, 'click', () => setLayout('right'));
  if (settings.layout !== 'bottom') setLayout(settings.layout, false);
}
