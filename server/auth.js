const crypto = require('crypto');

const sessions = new Set();

function make_token() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.add(token);
  return token;
}

function check_auth(req, parsed) {
  const token = parsed.searchParams.get('token') || req.headers['x-token'];
  return !!token && sessions.has(token);
}

function delete_token(token) {
  if (token) sessions.delete(token);
}

module.exports = { make_token, check_auth, delete_token };
