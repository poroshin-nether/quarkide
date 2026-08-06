<img src="https://raw.githubusercontent.com/quarkide/quarkide/main/assets/banner.svg" alt="quarkide" width="600">

[![npm version](https://img.shields.io/npm/v/quarkide.svg)](https://www.npmjs.com/package/quarkide)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Terminal, file manager, and a full code editor — compiled into one binary you run from anywhere.
Full control over your own LAN — no container, no install, no config wizard.

## Install

**npx / npm**
```bash
npx quarkide
npm i -g quarkide
```

**download**
```bash
curl -fsSL https://quarkide.com/install.sh | sh
```
```powershell
irm https://quarkide.com/install.ps1 | iex
```

**macos**
```bash
brew install quarkide/quarkide/quarkide
```

**from source**
```bash
git clone https://github.com/quarkide/quarkide.git
cd quarkide
npm install
npm start
```

Open `http://<host-ip>:1980`.

## CLI

```bash
node server/main.js [-p <port>] [-a <password>]
```

| Flag | Long form | Default | Description |
|---|---|---|---|
| `-p` | `--port` | `1980` | Port to listen on |
| `-a` | `--auth` | generated fresh each run and printed once | Access password |
| `-v` | `--version` | — | Print version and exit |

Without `-a`, a password is generated fresh and printed once each run; pass `-a` yourself for a stable one.

## License

[MIT](./LICENSE)
