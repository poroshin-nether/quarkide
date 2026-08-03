const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parse_args } = require('./cli');

const IS_WIN = os.platform() === 'win32';
const ROOT = os.homedir();
const SCROLLBACK_SIZE = 100 * 1024;

function fail(msg) {
  console.error(`[config] ${msg}`);
  process.exit(1);
}

const args = parse_args(process.argv.slice(2));

if (args.version) {
  console.log(require('../package.json').version);
  process.exit(0);
}

function resolve_config_path(arg) {
  if (!arg) return path.join(__dirname, '..', 'quarkide.json');
  const abs = path.resolve(arg);
  try {
    return fs.statSync(abs).isDirectory() ? path.join(abs, 'config.json') : abs;
  } catch {}
  return path.extname(abs) ? abs : path.join(abs, 'config.json');
}

const CONFIG_PATH = resolve_config_path(args.config);

function read_config() {
  let raw;
  try {
    raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    fail(`can't read ${CONFIG_PATH}: ${e.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    fail(`invalid JSON in ${CONFIG_PATH}: ${e.message}`);
  }
}

function write_config(data) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    fail(`can't write ${CONFIG_PATH}: ${e.message}`);
  }
}

function parse_port(raw, source) {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    fail(`invalid port in ${source}: ${JSON.stringify(raw)} (must be an integer 1-65535)`);
  }
  return n;
}

if (args.auth !== null && args.auth.trim() === '') {
  fail('-a/--auth cannot be empty');
}

const stored = read_config();

const PORT = parse_port(args.port, 'CLI (-p)') || parse_port(stored.port, CONFIG_PATH) || 1980;

let password = stored.password;

if (args.auth) {
  if (stored.password && stored.password !== args.auth) {
    console.log(`[config] WARN: password in ${CONFIG_PATH} overwritten by -a`);
  }
  password = args.auth;
  write_config({ ...stored, password });
} else if (!password) {
  password = crypto.randomBytes(12).toString('hex');
  write_config({ ...stored, password });
  console.log(`[config] generated password: ${password}`);
  console.log(`[config] saved to ${CONFIG_PATH} — change it with -a or edit the file`);
}

const PASSWORD = password;

module.exports = { PORT, ROOT, PASSWORD, IS_WIN, SCROLLBACK_SIZE, CONFIG_PATH };
