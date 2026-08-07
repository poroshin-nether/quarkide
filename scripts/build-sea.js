
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const pkg = require(path.join(ROOT, 'package.json'));

const SKIP_DIRS = new Set(['.bin']);

function collect(dir, base, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    const rel = base + '/' + entry.name;
    if (entry.isDirectory()) collect(abs, rel, out);
    else if (entry.isFile()) out.push({ abs, rel });
  }
}

function collectIfExists(dir, base, out) {
  if (fs.existsSync(dir)) collect(dir, base, out);
}

const nm = (p) => path.join(ROOT, 'node_modules', p);
const NODE_PTY_PLATFORM = `${process.platform}-${process.arch}`;

const files = [{ abs: path.join(ROOT, 'package.json'), rel: 'package.json' }];
collect(path.join(ROOT, 'server'), 'server', files);
collect(path.join(ROOT, 'public'), 'public', files);

// only embed the subset of node_modules actually touched at runtime
// (server/static.js serves @xterm, monaco-editor/min, monaco-themes/themes;
// server/shell.js requires node-pty and ws directly)
collect(nm('@xterm/xterm'), 'node_modules/@xterm/xterm', files);
collect(nm('@xterm/addon-fit'), 'node_modules/@xterm/addon-fit', files);
collect(nm('monaco-editor/min'), 'node_modules/monaco-editor/min', files);
collect(nm('monaco-themes/themes'), 'node_modules/monaco-themes/themes', files);
collect(nm('ws'), 'node_modules/ws', files);

files.push({ abs: nm('node-pty/package.json'), rel: 'node_modules/node-pty/package.json' });
collect(nm('node-pty/lib'), 'node_modules/node-pty/lib', files);
// loadNativeModule() checks build/Release, build/Debug, then prebuilds/<platform>-<arch>
// (in that order) -- node-pty ships prebuilds for win32/darwin only; on Linux it's
// compiled from source at npm-install time into build/Release. Embed whichever exists.
collectIfExists(nm('node-pty/build/Release'), 'node_modules/node-pty/build/Release', files);
collectIfExists(nm('node-pty/build/Debug'), 'node_modules/node-pty/build/Debug', files);
collectIfExists(
  nm(`node-pty/prebuilds/${NODE_PTY_PLATFORM}`),
  `node_modules/node-pty/prebuilds/${NODE_PTY_PLATFORM}`,
  files
);

console.log(`[build-sea] embedding ${files.length} files`);

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const manifestPath = path.join(DIST, 'manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify(files.map((f) => f.rel)));

const assets = { 'manifest.json': manifestPath };
for (const f of files) assets[f.rel] = f.abs;

const entryPath = path.join(DIST, 'sea-entry.js');
fs.writeFileSync(entryPath, `
const sea = require('node:sea');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createRequire } = require('node:module');

if (process.argv.includes('-v') || process.argv.includes('--version')) {
  console.log(${JSON.stringify(pkg.version)});
  process.exit(0);
}

const extractDir = path.join(os.tmpdir(), 'quarkide-${pkg.version}');
const marker = path.join(extractDir, '.extracted');

if (!fs.existsSync(marker)) {
  const manifest = JSON.parse(Buffer.from(sea.getAsset('manifest.json')).toString('utf8'));
  for (const rel of manifest) {
    const dest = path.join(extractDir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, Buffer.from(sea.getAsset(rel)));
    if (process.platform !== 'win32') { try { fs.chmodSync(dest, 0o755); } catch {} }
  }
  fs.writeFileSync(marker, '');
}

const mainPath = path.join(extractDir, 'server', 'main.js');
createRequire(mainPath)(mainPath);
`.trimStart());

const seaConfigPath = path.join(DIST, 'sea-config.json');
fs.writeFileSync(seaConfigPath, JSON.stringify({
  main: entryPath,
  output: path.join(DIST, 'sea-blob.blob'),
  disableExperimentalSEAWarning: true,
  assets,
}, null, 2));

console.log('[build-sea] node --experimental-sea-config ...');
execSync(`node --experimental-sea-config "${seaConfigPath}"`, { stdio: 'inherit' });

const outName = process.platform === 'win32' ? 'quarkide.exe' : 'quarkide';
const outPath = path.join(DIST, outName);
fs.copyFileSync(process.execPath, outPath);

if (process.platform === 'win32') {
  try { execSync(`signtool remove /s "${outPath}"`, { stdio: 'ignore' }); } catch {}
}

console.log('[build-sea] postject ...');
const postject = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'postject.cmd' : 'postject');
const sentinel = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
execSync(
  `"${postject}" "${outPath}" NODE_SEA_BLOB "${path.join(DIST, 'sea-blob.blob')}" --sentinel-fuse ${sentinel}` +
  (process.platform === 'win32' ? ' --overwrite' : '') +
  (process.platform === 'darwin' ? ' --macho-segment-name NODE_SEA' : ''),
  { stdio: 'inherit' }
);

if (process.platform === 'darwin') {
  console.log('[build-sea] codesign ...');
  execSync(`codesign --sign - --force "${outPath}"`, { stdio: 'inherit' });
}

console.log('[build-sea] done:', outPath);
