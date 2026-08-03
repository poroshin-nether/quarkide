// PTY shell management + WebSocket transport
const fs = require('fs');
const pty = require('node-pty');
const { WebSocketServer } = require('ws');
const { IS_WIN, ROOT, SCROLLBACK_SIZE } = require('./config');
const { check_auth } = require('./auth');

function safe_cwd(requested) {
  if (!requested) return null;
  try {
    if (fs.statSync(requested).isDirectory()) return requested;
  } catch {}
  return null;
}

const WATCH_DEBOUNCE = 300;

function watch_dir(conn, requested) {
  if (conn.watcher) { conn.watcher.close(); conn.watcher = null; }
  if (conn.watchTimer) { clearTimeout(conn.watchTimer); conn.watchTimer = null; }

  const dir = safe_cwd(requested);
  if (!dir) return;

  try {
    conn.watcher = fs.watch(dir, () => {
      if (conn.watchTimer) clearTimeout(conn.watchTimer);
      conn.watchTimer = setTimeout(() => {
        if (conn.ws && conn.ws.readyState === 1) {
          conn.ws.send(JSON.stringify({ type: 'dir-changed', path: dir }));
        }
      }, WATCH_DEBOUNCE);
    });
  } catch {}
}

function unwatch_dir(conn) {
  if (conn.watcher) { conn.watcher.close(); conn.watcher = null; }
  if (conn.watchTimer) { clearTimeout(conn.watchTimer); conn.watchTimer = null; }
}

const connections = new Map();

function create_shell(conn, id, cwd) {
  const shell = pty.spawn(IS_WIN ? 'cmd.exe' : '/bin/bash', [], {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd: cwd || ROOT,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    useConpty: true,
    useConptyDll: true,
  });

  const entry = { shell, scrollback: '', mute: false };
  conn.shells.set(id, entry);

  shell.onData((data) => {
    if (entry.mute) return;
    entry.scrollback += data;
    if (entry.scrollback.length > SCROLLBACK_SIZE) {
      entry.scrollback = entry.scrollback.slice(-SCROLLBACK_SIZE);
    }
    if (conn.ws && conn.ws.readyState === 1) {
      conn.ws.send(JSON.stringify({ type: 'output', id, data }));
    }
  });

  shell.onExit(({ exitCode }) => {
    conn.shells.delete(id);
    if (conn.ws && conn.ws.readyState === 1) {
      conn.ws.send(JSON.stringify({ type: 'shell-exit', id, code: exitCode }));
    }
    console.log(`[shell] ${id} exited (code ${exitCode})`);
  });

  console.log(`[shell] ${id} new (pid ${shell.pid})`);
  return entry;
}

function kill_shell(conn, id) {
  const entry = conn.shells.get(id);
  if (!entry) return;
  conn.shells.delete(id);
  if (IS_WIN) {
    try { require('child_process').execSync(`taskkill /PID ${entry.shell.pid} /T /F`, { stdio: 'ignore' }); } catch {}
  } else {
    entry.shell.kill();
  }
}

function kill_by_token(token) {
  const conn = connections.get(token);
  if (!conn) return;
  for (const id of [...conn.shells.keys()]) kill_shell(conn, id);
  unwatch_dir(conn);
  if (conn.ws) try { conn.ws.close(); } catch {}
  connections.delete(token);
}

function kill_all() {
  console.log(`[shutdown] killing shells...`);
  for (const token of [...connections.keys()]) kill_by_token(token);
  process.exit(0);
}

function handle_message(conn, ws, msg) {
  if (msg.type == 'watch-dir') {
    watch_dir(conn, msg.path);
    return;
  }

  if (msg.type == 'new-shell') {
    const id = conn.nextId++;
    create_shell(conn, id, safe_cwd(msg.cwd));
    ws.send(JSON.stringify({ type: 'shell-created', id }));
    return;
  }

  if (msg.type == 'kill-shell') {
    kill_shell(conn, msg.id);
    ws.send(JSON.stringify({ type: 'shell-killed', id: msg.id }));
    return;
  }

  const entry = conn.shells.get(msg.id);
  if (!entry) return;

  if (msg.type == 'input') {
    entry.shell.write(msg.data);
  } else if (msg.type == 'resize') {
    entry.mute = true;
    entry.shell.resize(msg.cols, msg.rows);
    setTimeout(() => { entry.mute = false; }, 50);
  }
}

function handle_ws(ws, req) {
  const parsed = new URL(req.url, 'http://localhost');
  const token = parsed.searchParams.get('token');
  const initial_cwd = safe_cwd(parsed.searchParams.get('cwd'));

  if (!check_auth(req, parsed)) {
    ws.close(4001, 'unauthorized');
    return;
  }

  let conn = connections.get(token);
  if (!conn) {
    conn = { ws: null, shells: new Map(), nextId: 0, watcher: null, watchTimer: null };
    connections.set(token, conn);
  }

  if (conn.ws) try { conn.ws.close(); } catch {}
  conn.ws = ws;

  ws.send(JSON.stringify({ type: 'platform', isWindows: IS_WIN }));

  // Send all existing shells for this token (may be zero). Server no longer
  // auto-creates a shell on empty — that's the client's decision.
  for (const [id, entry] of conn.shells) {
    ws.send(JSON.stringify({ type: 'shell-created', id }));
    if (entry.scrollback) {
      ws.send(JSON.stringify({ type: 'output', id, data: entry.scrollback }));
    }
  }

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    handle_message(conn, ws, msg);
  });

  ws.on('close', () => {
    if (conn.ws === ws) conn.ws = null;
  });
}

function attach(server) {
  const wss = new WebSocketServer({ server });
  wss.on('connection', handle_ws);
}

module.exports = { attach, kill_all, kill_by_token };
