// REST API — all HTTP endpoints: auth + file operations
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { ROOT, PASSWORD, IS_WIN } = require('./cli');
const { make_token, check_auth, delete_token } = require('./auth');
const { kill_by_token } = require('./shell');
const { stream_zip } = require('./zip');

const JSON_HEADER = { 'Content-Type': 'application/json' };
const MAX_FILE_SIZE = 2 * 1024 * 1024;

function ok(res, data = { ok: true }) {
  res.writeHead(200, JSON_HEADER);
  res.end(JSON.stringify(data));
}

function fail(res, msg, code = 400) {
  res.writeHead(code, JSON_HEADER);
  res.end(JSON.stringify({ error: msg }));
}

function parse_body(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => body += chunk);
    req.on('end', () => resolve(JSON.parse(body)));
  });
}

function handle_api(req, res) {
  const parsed = new URL(req.url, 'http://localhost');
  const p = parsed.pathname;
  const m = req.method;

  if (p == '/api/login' && m == 'POST') return handle_login(req, res);
  if (!check_auth(req, parsed)) return fail(res, 'unauthorized', 401);

  if (p == '/api/logout' && m == 'POST') {
    const token = parsed.searchParams.get('token') || req.headers['x-token'];
    kill_by_token(token);
    delete_token(token);
    return ok(res);
  }

  const abs = path.resolve(parsed.searchParams.get('path') || ROOT);

  if (p == '/api/drives') return handle_drives(res);
  if (p == '/api/ls') return handle_ls(abs, res);
  if (p == '/api/read') return handle_read(abs, res);
  if (p == '/api/download') return handle_download(abs, res);
  if (p == '/api/write' && m == 'POST') return handle_write(req, res);
  if (p == '/api/mkdir' && m == 'POST') return handle_mkdir(req, res);
  if (p == '/api/rm' && m == 'POST') return handle_rm(req, res);
  if (p == '/api/rename' && m == 'POST') return handle_rename(req, res);

  fail(res, 'not found', 404);
}

async function handle_login(req, res) {
  const { password } = await parse_body(req);
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  if (password == PASSWORD) {
    console.log(`[auth] ${ip} - login ok`);
    ok(res, { ok: true, token: make_token() });
  } else {
    console.log(`[auth] ${ip} - login failed`);
    fail(res, 'denied', 401);
  }
}

async function handle_drives(res) {
  if (!IS_WIN) return ok(res, { drives: [] });
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const checks = await Promise.allSettled(letters.map((l) => fs.stat(`${l}:\\`)));
  const drives = letters.filter((_, i) => checks[i].status === 'fulfilled').map((l) => `${l}:\\`);
  ok(res, { drives });
}

async function handle_ls(abs, res) {
  try {
    const entries = await fs.readdir(abs, { withFileTypes: true });
    const items = entries
      .map(e => ({ name: e.name, dir: e.isDirectory() }))
      .sort((a, b) => b.dir - a.dir || a.name.localeCompare(b.name));
    const parent = path.dirname(abs);
    ok(res, { path: abs, parent: parent != abs ? parent : null, items });
  } catch (e) { fail(res, e.message); }
}

async function handle_read(abs, res) {
  try {
    const stat = await fs.stat(abs);
    if (stat.size > MAX_FILE_SIZE) return fail(res, 'File too large');
    const data = await fs.readFile(abs, 'utf-8');
    ok(res, { path: abs, content: data });
  } catch (e) { fail(res, e.message); }
}

async function handle_download(abs, res) {
  let stat;
  try {
    stat = await fs.stat(abs);
  } catch (e) { return fail(res, e.message, 404); }

  const name = path.basename(abs);

  if (stat.isDirectory()) {
    const zipName = name + '.zip';
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipName.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(zipName)}`,
    });
    return stream_zip(abs, name, res);
  }

  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': stat.size,
    'Content-Disposition': `attachment; filename="${name.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
  });
  fsSync.createReadStream(abs).pipe(res);
}

async function handle_write(req, res) {
  try {
    const { path: p, content } = await parse_body(req);
    await fs.writeFile(path.resolve(p), content, 'utf-8');
    ok(res);
  } catch (e) { fail(res, e.message); }
}

async function handle_mkdir(req, res) {
  try {
    const { path: p } = await parse_body(req);
    await fs.mkdir(path.resolve(p), { recursive: true });
    ok(res);
  } catch (e) { fail(res, e.message); }
}

async function handle_rm(req, res) {
  try {
    const { path: p } = await parse_body(req);
    await fs.rm(path.resolve(p), { recursive: true });
    ok(res);
  } catch (e) { fail(res, e.message); }
}

async function handle_rename(req, res) {
  try {
    const { oldPath, newPath } = await parse_body(req);
    await fs.rename(path.resolve(oldPath), path.resolve(newPath));
    ok(res);
  } catch (e) { fail(res, e.message); }
}

module.exports = { handle_api };
