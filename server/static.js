const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

function resolve_pkg_dir(name) {
  for (const dir of require.resolve.paths(name)) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`cannot locate package: ${name}`);
}

const vendor_map = {
  '/xterm.css': path.join(resolve_pkg_dir('@xterm/xterm'), 'css', 'xterm.css'),
  '/xterm.js': path.join(resolve_pkg_dir('@xterm/xterm'), 'lib', 'xterm.js'),
  '/xterm-addon-fit.js': path.join(resolve_pkg_dir('@xterm/addon-fit'), 'lib', 'addon-fit.js'),
};

const project_root = path.join(__dirname, '..');
const monaco_base = path.join(resolve_pkg_dir('monaco-editor'), 'min');
const themes_base = path.join(resolve_pkg_dir('monaco-themes'), 'themes');

function serve_static(req, res) {
  const url_path = req.url.split('?')[0];
  let file_path;

  if (vendor_map[url_path]) {
    file_path = vendor_map[url_path];
  } else if (url_path.startsWith('/vs/')) {
    file_path = path.join(monaco_base, url_path);
    if (!file_path.startsWith(monaco_base + path.sep)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
  } else if (url_path.startsWith('/themes/')) {
    file_path = path.join(themes_base, decodeURIComponent(url_path.slice('/themes/'.length)));
    if (!file_path.startsWith(themes_base + path.sep)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
  } else {
    const public_dir = path.join(project_root, 'public');
    file_path = path.join(public_dir, url_path === '/' ? 'index.html' : url_path);
    if (!file_path.startsWith(public_dir + path.sep) && file_path !== public_dir) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
  }

  const ext = path.extname(file_path);
  let size = 0;
  try { size = fs.statSync(file_path).size; } catch {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const stream = fs.createReadStream(file_path);
  stream.on('open', () => {
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': size,
      'Cache-Control': 'private, max-age=3600',
    });
    stream.pipe(res);
  });
  stream.on('error', () => {
    res.writeHead(404);
    res.end('Not found');
  });
}

module.exports = { serve_static };
