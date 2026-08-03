<img src="https://raw.githubusercontent.com/poroshin-nether/quarkide/main/assets/banner.svg" alt="quarkide" width="600">

[![npm version](https://img.shields.io/npm/v/quarkide.svg)](https://www.npmjs.com/package/quarkide)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Terminal, file manager, and a full code editor — compiled into one binary you run from anywhere.
Full control over your own LAN — no container, no install, no config wizard.

## Install

**npx / npm**
```bash
npx quarkide -a your-password
npm i -g quarkide
```

**windows**
```powershell
winget install quarkide
```

**macos**
```bash
brew install quarkide
```

**download**
```bash
curl -fsSL https://quarkide.com/install.sh | sh
```
```powershell
irm https://quarkide.com/install.ps1 | iex
```

**from source**
```bash
git clone https://github.com/poroshin-nether/quarkide.git
cd quarkide
npm install
npm start
```

Open `http://<host-ip>:1980`.

## CLI

```bash
node server/main.js [-p <port>] [-a <password>] [-c <config>]
```

| Flag | Long form | Default | Description |
|---|---|---|---|
| `-p` | `--port` | `1980` | Port to listen on |
| `-a` | `--auth` | *auto-generated on first run* | Access password |
| `-c` | `--config` | `quarkide.json` next to the project | Path to a config file or directory |
| `-v` | `--version` | — | Print version and exit |

First run with no password saved anywhere generates one and prints it once. If you pass `-a` explicitly, it overwrites whatever password is already saved in the config file, automatically.

## License

[MIT](./LICENSE)

## Support

[Sponsoring](https://github.com/sponsors/poroshin-nether) helps keep it going — sponsors get a slot on [quarkide.com](https://quarkide.com).
