const ctxMenu = $('context-menu');
let ctxDir = '';
let ctxItem = null;
let ctxTargetRow = null;

const CTX_ICONS = {
  file: '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M9 15h6"/><path d="M12 18v-6"/>',
  folder: '<path d="M12 10v6"/><path d="M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  trash: '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
};

function ctxIcon(name) {
  return '<svg class="ctx-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + CTX_ICONS[name] + '</svg>';
}

function showCtx(x, y, items) {
  ctxMenu.innerHTML = items.map(i =>
    '<div class="ctx-item' + (i.cls ? ' ' + i.cls : '') + '">' +
      (i.icon ? ctxIcon(i.icon) : '') +
      '<span class="ctx-label">' + i.label + '</span>' +
    '</div>'
  ).join('');
  ctxMenu.style.left = x + 'px';
  ctxMenu.style.top = y + 'px';
  ctxMenu.style.display = 'block';
  const r = ctxMenu.getBoundingClientRect();
  if (r.right > window.innerWidth) ctxMenu.style.left = (x - r.width) + 'px';
  if (r.bottom > window.innerHeight) ctxMenu.style.top = (y - r.height) + 'px';
  const divs = ctxMenu.querySelectorAll('.ctx-item');
  items.forEach((item, idx) => {
    divs[idx].onclick = () => { hideCtx(); item.action(); };
  });
}

function hideCtx() {
  ctxMenu.style.display = 'none';
  if (ctxTargetRow) {
    ctxTargetRow.classList.remove('ctx-target');
    ctxTargetRow = null;
  }
}

on(document, 'pointerdown', (e) => { if (!ctxMenu.contains(e.target)) hideCtx(); });
on(document, 'keydown', (e) => { if (e.key === 'Escape') hideCtx(); });

async function ctxNewFile() {
  const name = prompt('File name:');
  if (!name) return;
  await authPost('/api/write', { path: ctxDir + '/' + name, content: '' });
  loadDir(ctxDir);
}

async function ctxNewFolder() {
  const name = prompt('Folder name:');
  if (!name) return;
  await authPost('/api/mkdir', { path: ctxDir + '/' + name });
  loadDir(ctxDir);
}

async function ctxRename() {
  if (!ctxItem) return;
  const name = prompt('New name:', ctxItem.name);
  if (!name || name === ctxItem.name) return;
  const dir = ctxItem.path.substring(0, ctxItem.path.length - ctxItem.name.length);
  await authPost('/api/rename', { oldPath: ctxItem.path, newPath: dir + name });
  loadDir(currentPathEl.textContent);
}

async function ctxDelete() {
  if (!ctxItem) return;
  if (!confirm('Delete ' + ctxItem.name + '?')) return;
  await authPost('/api/rm', { path: ctxItem.path });
  loadDir(currentPathEl.textContent);
}

function ctxDownload() {
  if (!ctxItem) return;
  const a = el('a');
  a.href = '/api/download?path=' + encodeURIComponent(ctxItem.path) + '&token=' + token;
  a.download = ctxItem.dir ? ctxItem.name + '.zip' : ctxItem.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function openTreeContextMenu(e) {
  e.preventDefault();
  ctxDir = currentPathEl.textContent;
  const row = e.target.closest('.tree-item');
  if (row && row.dataset.path) {
    ctxTargetRow = row;
    row.classList.add('ctx-target');
    ctxItem = { name: row.dataset.name, dir: row.classList.contains('dir'), path: row.dataset.path };
    if (ctxItem.dir) ctxDir = ctxItem.path;
    const items = ctxItem.dir
      ? [
          { label: 'New file', icon: 'file', action: ctxNewFile },
          { label: 'New folder', icon: 'folder', action: ctxNewFolder },
          { label: 'Download', icon: 'download', action: ctxDownload },
          { label: 'Rename', icon: 'pencil', action: ctxRename },
          { label: 'Delete', icon: 'trash', cls: 'danger', action: ctxDelete },
        ]
      : [
          { label: 'Download', icon: 'download', action: ctxDownload },
          { label: 'Rename', icon: 'pencil', action: ctxRename },
          { label: 'Delete', icon: 'trash', cls: 'danger', action: ctxDelete },
        ];
    showCtx(e.clientX, e.clientY, items);
  } else {
    ctxItem = null;
    showCtx(e.clientX, e.clientY, [
      { label: 'New file', icon: 'file', action: ctxNewFile },
      { label: 'New folder', icon: 'folder', action: ctxNewFolder },
    ]);
  }
}
