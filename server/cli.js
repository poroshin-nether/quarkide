const os = require('os');
const crypto = require('crypto');

const IS_WIN = os.platform() === 'win32';
const ROOT = os.homedir();
const SCROLLBACK_SIZE = 100 * 1024;

const FLAGS = {
  '-p': 'port', '--port': 'port',
  '-a': 'auth', '--auth': 'auth',
};
const BOOL_FLAGS = { '-v': 'version', '--version': 'version' };

function fail(msg) {
  console.error(`[cli] ${msg}`);
  process.exit(1);
}

function parse_args(argv) {
  const args = { port: null, auth: null, version: false };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    if (BOOL_FLAGS[token]) { args[BOOL_FLAGS[token]] = true; continue; }

    const key = FLAGS[token];
    if (!key) fail(token.startsWith('-') ? `unknown flag: ${token}` : `unexpected argument: ${token}`);

    const value = argv[++i];
    if (value === undefined) fail(`${token} requires a value`);
    args[key] = value;
  }

  return args;
}

function parse_port(raw) {
  if (raw === null) return 1980;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    fail(`invalid port: ${JSON.stringify(raw)} (must be an integer 1-65535)`);
  }
  return n;
}

const args = parse_args(process.argv.slice(2));

if (args.version) {
  console.log(require('../package.json').version);
  process.exit(0);
}

if (args.auth !== null && args.auth.trim() === '') {
  fail('-a/--auth cannot be empty');
}

const PORT = parse_port(args.port);

let PASSWORD = args.auth;
if (!PASSWORD) {
  PASSWORD = crypto.randomBytes(12).toString('hex');
  console.log(`[cli] generated password: ${PASSWORD}`);
  console.log('[cli] not saved anywhere — pass -a to set your own, or bake this flag into how you (re)start the server');
}

module.exports = { PORT, ROOT, PASSWORD, IS_WIN, SCROLLBACK_SIZE };
