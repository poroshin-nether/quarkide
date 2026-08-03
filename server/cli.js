// CLI flag parsing — GNU-style, short + long forms
const FLAGS = {
  '-p': 'port', '--port': 'port',
  '-a': 'auth', '--auth': 'auth',
  '-c': 'config', '--config': 'config',
};
const BOOL_FLAGS = { '-v': 'version', '--version': 'version' };

function fail(msg) {
  console.error(`[cli] ${msg}`);
  process.exit(1);
}

function parse_args(argv) {
  const args = { port: null, auth: null, config: null, version: false };

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

module.exports = { parse_args };
