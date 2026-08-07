const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'quarkide-pack-install-'));

const packOutput = execFileSync('npm', ['pack', '--json', repoRoot], { cwd: scratch, encoding: 'utf8', shell: true });
const [{ filename }] = JSON.parse(packOutput);
const tarballPath = path.join(scratch, filename);

const projectDir = path.join(scratch, 'consumer');
fs.mkdirSync(projectDir);
fs.writeFileSync(
  path.join(projectDir, 'package.json'),
  JSON.stringify({ name: 'quarkide-pack-install-check', version: '0.0.0', dependencies: { quarkide: `file:${tarballPath}` } }),
);

execFileSync('npm', ['install'], { cwd: projectDir, stdio: 'inherit', shell: true });

const mainPath = path.join(projectDir, 'node_modules', 'quarkide', 'server', 'main.js');
if (!fs.existsSync(mainPath)) {
  console.error('pack-install: expected file not found: ' + mainPath);
  process.exit(1);
}

console.log(mainPath);
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `path=${mainPath}\n`);
}
