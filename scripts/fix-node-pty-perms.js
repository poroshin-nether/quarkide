const fs = require('fs');
const path = require('path');

if (process.platform === 'win32') process.exit(0);

const dirs = ['darwin-arm64', 'darwin-x64'];
for (const dir of dirs) {
  const helper = path.join(__dirname, '..', 'node_modules', 'node-pty', 'prebuilds', dir, 'spawn-helper');
  try { fs.chmodSync(helper, 0o755); } catch {}
}
