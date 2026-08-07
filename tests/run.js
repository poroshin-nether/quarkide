const { spawn, spawnSync } = require('child_process');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');
const { chromium } = require('playwright');

const PORT = 19080;
const PASSWORD = 'test-pass-' + Math.random().toString(36).slice(2, 8);
const BASE = `http://127.0.0.1:${PORT}`;
const WS_BASE = `ws://127.0.0.1:${PORT}`;
const SAVE_KEY = process.platform === 'darwin' ? 'Meta+s' : 'Control+s';

const target = process.argv[2];
const execPath = target && !target.endsWith('.js') ? target : process.execPath;
const scriptArgs = !target ? ['server/main.js'] : target.endsWith('.js') ? [target] : [];
const baseArgs = ['-p', String(PORT), '-a', PASSWORD];
const cmd = [execPath, [...scriptArgs, ...baseArgs]];

function runCli(extraArgs) {
  return spawnSync(execPath, [...scriptArgs, ...extraArgs], { encoding: 'utf8' });
}

let passed = 0;
let failed = 0;

async function step(name, fn) {
  process.stdout.write(`- ${name} ... `);
  try {
    await fn();
    console.log('ok');
    passed++;
  } catch (err) {
    console.log('FAIL');
    console.error('  ' + (err && err.stack ? err.stack : err));
    failed++;
  }
}

function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd[0], cmd[1], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const onData = (d) => {
      out += d.toString();
      if (out.includes('LISTEN:')) {
        proc.stdout.off('data', onData);
        resolve(proc);
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', (d) => process.stderr.write(d));
    proc.on('exit', (code) => reject(new Error(`server exited early (code ${code})\n${out}`)));
    setTimeout(() => reject(new Error('server did not print LISTEN: within 10s\n' + out)), 10000);
  });
}

async function api(pathAndQuery, opts = {}) {
  const res = await fetch(BASE + pathAndQuery, opts);
  return res;
}

async function assert_eventually(check, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('condition never became true within ' + timeoutMs + 'ms');
}

async function main() {
  console.log(`[run] target: ${cmd.join(' ')}`);

  // ---- CLI ----
  await step('-v prints the version and exits 0', () => {
    const res = runCli(['-v']);
    assert.strictEqual(res.status, 0);
    assert.match(res.stdout.trim(), /^\d+\.\d+\.\d+$/);
  });

  await step('invalid port is rejected with a non-zero exit', () => {
    const res = runCli(['-p', 'not-a-port', '-a', 'x']);
    assert.notStrictEqual(res.status, 0);
    assert.match(res.stderr, /invalid port/);
  });

  await step('empty --auth is rejected', () => {
    const res = runCli(['-a', '']);
    assert.notStrictEqual(res.status, 0);
  });

  const server = await startServer();
  let token = null;
  const scratch = path.join(os.tmpdir(), 'quarkide-test-' + Date.now());
  fs.mkdirSync(scratch, { recursive: true });
  const testFile = path.join(scratch, 'note.txt');
  const testFileRenamed = path.join(scratch, 'note-renamed.txt');
  const testDir = path.join(scratch, 'subdir');

  // ---- HTTP / API ----
  await step('login rejects wrong password', async () => {
    const res = await api('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'nope' }),
    });
    assert.strictEqual(res.status, 401);
  });

  await step('login accepts correct password', async () => {
    const res = await api('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: PASSWORD }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.token);
    token = data.token;
  });

  await step('api rejects requests without token', async () => {
    const res = await api('/api/ls?path=' + encodeURIComponent(scratch));
    assert.strictEqual(res.status, 401);
  });

  await step('mkdir creates a directory', async () => {
    const res = await api('/api/mkdir?token=' + token, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: testDir }),
    });
    assert.strictEqual(res.status, 200);
    assert.ok(fs.existsSync(testDir));
  });

  await step('write creates a file', async () => {
    const res = await api('/api/write?token=' + token, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: testFile, content: 'hello from run.js' }),
    });
    assert.strictEqual(res.status, 200);
  });

  await step('read returns written content', async () => {
    const res = await api('/api/read?path=' + encodeURIComponent(testFile) + '&token=' + token);
    const data = await res.json();
    assert.strictEqual(data.content, 'hello from run.js');
  });

  await step('ls lists the scratch dir', async () => {
    const res = await api('/api/ls?path=' + encodeURIComponent(scratch) + '&token=' + token);
    const data = await res.json();
    const names = data.items.map((i) => i.name);
    assert.ok(names.includes('note.txt'));
    assert.ok(names.includes('subdir'));
  });

  await step('rename moves the file', async () => {
    const res = await api('/api/rename?token=' + token, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath: testFile, newPath: testFileRenamed }),
    });
    assert.strictEqual(res.status, 200);
    assert.ok(!fs.existsSync(testFile));
    assert.ok(fs.existsSync(testFileRenamed));
  });

  await step('download returns the file content', async () => {
    const res = await api('/api/download?path=' + encodeURIComponent(testFileRenamed) + '&token=' + token);
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.strictEqual(text, 'hello from run.js');
  });

  await step('download of a directory returns a zip', async () => {
    const res = await api('/api/download?path=' + encodeURIComponent(scratch) + '&token=' + token);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'application/zip');
  });

  await step('rm deletes the file', async () => {
    const res = await api('/api/rm?token=' + token, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: testFileRenamed }),
    });
    assert.strictEqual(res.status, 200);
    assert.ok(!fs.existsSync(testFileRenamed));
  });

  await step('read of a nonexistent file fails', async () => {
    const res = await api('/api/read?path=' + encodeURIComponent(testFileRenamed) + '&token=' + token);
    assert.notStrictEqual(res.status, 200);
  });

  await step('rm of a nonexistent path fails', async () => {
    const res = await api('/api/rm?token=' + token, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: testFileRenamed }),
    });
    assert.notStrictEqual(res.status, 200);
  });

  await step('read rejects a file over the 2MB limit', async () => {
    const bigFile = path.join(scratch, 'big.bin');
    fs.writeFileSync(bigFile, Buffer.alloc(2 * 1024 * 1024 + 1));
    const res = await api('/api/read?path=' + encodeURIComponent(bigFile) + '&token=' + token);
    assert.notStrictEqual(res.status, 200);
    const data = await res.json();
    assert.match(data.error, /too large/i);
    fs.unlinkSync(bigFile);
  });

  await step('logout invalidates the token', async () => {
    const res = await api('/api/logout?token=' + token, { method: 'POST' });
    assert.strictEqual(res.status, 200);
    const after = await api('/api/ls?path=' + encodeURIComponent(scratch) + '&token=' + token);
    assert.strictEqual(after.status, 401);
    const relogin = await api('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: PASSWORD }),
    });
    token = (await relogin.json()).token;
  });

  // ---- WebSocket terminal protocol ----
  await step('websocket: new-shell -> output round trip', async () => {
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(`${WS_BASE}?token=${token}`);
      const timer = setTimeout(() => reject(new Error('timed out waiting for shell output')), 8000);
      let shellId = null;
      ws.on('open', () => ws.send(JSON.stringify({ type: 'new-shell', cwd: scratch })));
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw);
        if (msg.type === 'shell-created') {
          shellId = msg.id;
          ws.send(JSON.stringify({ type: 'resize', id: shellId, cols: 80, rows: 24 }));
          const marker = 'PROBE_' + Math.random().toString(36).slice(2, 8);
          setTimeout(() => {
            ws.send(JSON.stringify({ type: 'input', id: shellId, data: `echo ${marker}\r` }));
          }, 300);
          ws.probeMarker = marker;
        } else if (msg.type === 'output' && ws.probeMarker && msg.data.includes(ws.probeMarker)) {
          clearTimeout(timer);
          ws.send(JSON.stringify({ type: 'kill-shell', id: shellId }));
          ws.close();
          resolve();
        }
      });
      ws.on('error', (e) => { clearTimeout(timer); reject(e); });
    });
  });

  // ---- Headless UI ----
  // The sidebar always starts at the real home directory and has no address
  // bar, so a blind right-click on #tree can land on an existing real folder
  // there. We make our own empty folder under the home dir, right-click that
  // folder's own row specifically (never the ambiguous container center) to
  // create the first file, which navigates the tree into it — from then on
  // the tree is scoped to our empty folder and further right-clicks are safe.
  const uiRoot = path.join(os.homedir(), '.quarkide-ui-test-' + Date.now());
  fs.mkdirSync(uiRoot, { recursive: true });
  const uiRootName = path.basename(uiRoot);

  await step('ui: full pass in headless chromium', async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
      await page.goto(BASE + '/');
      await page.fill('#login-pass', PASSWORD);
      await page.click('#login-btn');

      await page.waitForSelector('#app[style*="flex"]', { timeout: 10000 }).catch(() => {});
      await page.waitForSelector(`.tree-item[data-name="${uiRootName}"]`, { timeout: 10000 });

      page.once('dialog', (dialog) => dialog.accept('run-ui-check.txt'));
      await page.click(`.tree-item[data-name="${uiRootName}"]`, { button: 'right' });
      await page.waitForSelector('.ctx-item', { timeout: 5000 });
      await page.click('.ctx-item >> text=New file');

      await page.waitForSelector('.tree-item[data-name="run-ui-check.txt"]', { timeout: 5000 });
      await page.click('.tree-item[data-name="run-ui-check.txt"]');

      await page.waitForSelector('#tabs .ui-tab .name', { timeout: 5000 });
      const tabName = await page.textContent('#tabs .ui-tab .name');
      assert.strictEqual(tabName, 'run-ui-check.txt');

      await page.click('.monaco-editor');
      await page.keyboard.type('typed by headless test');
      await page.keyboard.press(SAVE_KEY);
      await page.waitForSelector('#save-btn.flash', { timeout: 5000 });

      await page.waitForSelector('.view-line >> text=typed by headless test', { timeout: 5000 });

      // tabs + terminal survive a reload
      await page.click('#term-btn');
      await page.waitForSelector('.term-panel', { timeout: 5000 });
      await page.reload();
      await page.waitForSelector('#tabs .ui-tab .name', { timeout: 10000 });
      const tabNameAfterReload = await page.textContent('#tabs .ui-tab .name');
      assert.strictEqual(tabNameAfterReload, 'run-ui-check.txt');
      await page.waitForSelector('.term-panel', { timeout: 10000 });

      // second tab: open, edit unsaved, modified indicator, close
      page.once('dialog', (dialog) => dialog.accept('second.txt'));
      await page.click('#tree', { button: 'right' });
      await page.waitForSelector('.ctx-item', { timeout: 5000 });
      await page.click('.ctx-item >> text=New file');
      await page.waitForSelector('.tree-item[data-name="second.txt"]', { timeout: 5000 });
      await page.click('.tree-item[data-name="second.txt"]');

      await page.waitForFunction(() => document.querySelectorAll('#tabs .ui-tab .name').length === 2);

      await page.click('.monaco-editor');
      await page.keyboard.type('unsaved edit');
      const secondTab = page.locator('#tabs .ui-tab:has-text("second.txt")');
      await assert_eventually(async () => (await secondTab.getAttribute('class')).includes('modified'));

      await page.keyboard.press(SAVE_KEY);
      await assert_eventually(async () => !(await secondTab.getAttribute('class')).includes('modified'));

      await secondTab.locator('.ui-close').click();
      await page.waitForFunction(() => document.querySelectorAll('#tabs .ui-tab .name').length === 1);

      // context menu: rename then delete
      page.once('dialog', (dialog) => dialog.accept('renamed-check.txt'));
      await page.click('.tree-item[data-name="run-ui-check.txt"]', { button: 'right' });
      await page.waitForSelector('.ctx-item', { timeout: 5000 });
      await page.click('.ctx-item >> text=Rename');
      await page.waitForSelector('.tree-item[data-name="renamed-check.txt"]', { timeout: 5000 });

      page.once('dialog', (dialog) => dialog.accept());
      await page.click('.tree-item[data-name="renamed-check.txt"]', { button: 'right' });
      await page.waitForSelector('.ctx-item', { timeout: 5000 });
      await page.click('.ctx-item >> text=Delete');
      await page.waitForFunction(() => !document.querySelector('.tree-item[data-name="renamed-check.txt"]'));

      // sidebar resizer actually resizes
      const sidebarBefore = await page.locator('#sidebar').boundingBox();
      const resizer = await page.locator('#v-resizer').boundingBox();
      await page.mouse.move(resizer.x + resizer.width / 2, resizer.y + resizer.height / 2);
      await page.mouse.down();
      await page.mouse.move(resizer.x + 80, resizer.y + resizer.height / 2);
      await page.mouse.up();
      const sidebarAfter = await page.locator('#sidebar').boundingBox();
      assert.notStrictEqual(Math.round(sidebarBefore.width), Math.round(sidebarAfter.width));

      // theme switch actually changes rendered colors, then a toggle applies
      await page.click('#settings-btn');
      await page.waitForSelector('#settings-popup.open', { timeout: 5000 });
      const bgBefore = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      await page.selectOption('#theme-select', 'vs');
      await assert_eventually(async () => {
        const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        return bg !== bgBefore;
      });

      await page.click('#btn-wordwrap');
      const wrapActive = await page.locator('#btn-wordwrap').evaluate((el) => el.classList.contains('active'));
      assert.strictEqual(wrapActive, true);
      await page.click('#settings-close');

      // logout returns to the login screen
      await page.click('#logout');
      await page.waitForSelector('#login-box', { state: 'visible', timeout: 5000 });
    } finally {
      await browser.close();
    }
  });

  server.kill();
  fs.rmSync(scratch, { recursive: true, force: true });
  for (let attempt = 0; attempt < 5; attempt++) {
    try { fs.rmSync(uiRoot, { recursive: true, force: true }); break; }
    catch (e) { if (attempt === 4) throw e; await new Promise((r) => setTimeout(r, 300)); }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('[run] fatal:', err);
  process.exit(1);
});
