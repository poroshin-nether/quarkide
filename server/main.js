#!/usr/bin/env node
const http = require('http');
const os = require('os');
const { PORT, IS_WIN } = require('./cli');
const { handle_api } = require('./api');
const { serve_static } = require('./static');
const { attach, kill_all } = require('./shell');

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) return handle_api(req, res);
  serve_static(req, res);
});

attach(server);

process.on('SIGINT', kill_all);
process.on('SIGTERM', kill_all);
if (IS_WIN) process.on('SIGHUP', kill_all);

const ifaces = os.networkInterfaces();
const local_ip = Object.values(ifaces).flat().find(i => i.family === 'IPv4' && !i.internal)?.address || 'localhost';

server.listen(PORT, '0.0.0.0', () => {
  console.log(`LISTEN: ${local_ip}:${PORT}`);
});
