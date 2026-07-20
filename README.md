# Token Usage Widget

**See Codex + Cursor quotas in your Windows corner — without opening five billing pages.**

Local always-on-top widget + browser dashboard for the AI harnesses you actually use. Runs on your machine. MIT. No account for this app.

[![License: MIT](https://img.shields.io/badge/License-MIT-teal.svg)](./LICENSE)
[![Node 18+](https://img.shields.io/badge/node-18%2B-brightgreen.svg)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/widget-Windows-0078D4.svg)](#windows-corner-widget)

**Repo:** [github.com/JYPersonal/token-usage-widget](https://github.com/JYPersonal/token-usage-widget)

---

## Why this exists

If you bounce between **Codex**, **Cursor**, and other harnesses, usage is scattered across dashboards, CLIs, and billing UIs. This puts the meters you care about in one place:

- **Corner widget** — always on top, tray icon, optional Startup
- **Full dashboard** — `http://127.0.0.1:4321`
- **Only enabled providers** — you choose what to poll; the rest stay off

Secrets stay in gitignored `config.json`. Default bind is localhost.

## Demo

<p align="center">
  <img src="docs/widget-corner-demo.png" alt="Windows corner widget showing Codex week remaining and Cursor billing usage" width="900" />
</p>

<p align="center"><em>Always-on-top Windows corner widget</em></p>

<p align="center">
  <img src="docs/dashboard-demo.png" alt="Browser dashboard with OpenAI Codex and Cursor usage meters" width="900" />
</p>

<p align="center"><em>Local browser dashboard</em></p>

## Quick start (≈2 minutes)

```bash
git clone https://github.com/JYPersonal/token-usage-widget.git
cd token-usage-widget
npm install
npm run setup:defaults   # OpenAI Codex + Cursor (local login)
npm run widget:bg        # Windows corner widget
```

Or open the full UI:

```bash
npm start
# → http://127.0.0.1:4321
```

**Requirements:** Node.js 18+. Windows for the Electron widget. `sqlite3` on `PATH` helps Cursor (and some OpenCode fallbacks).

Already logged into Codex CLI and Cursor desktop? `setup:defaults` is usually enough.

## Who it’s for

- Devs who hit **Codex week / 5h** or **Cursor API / first-party** limits mid-session  
- People running **several** AI CLIs and wanting one glanceable HUD  
- Anyone who wants **local-only** usage visibility (no SaaS signup for this tool)

## Features

| | |
| --- | --- |
| **Corner widget** | Frameless, always-on-top, bottom-right; auto-starts the local API; revives it if the server dies |
| **Dashboard** | Clean multi-provider meters with reset countdowns |
| **Setup Q&A** | `npm run setup` — enable providers, paste keys only when needed |
| **Fail-closed** | Missing creds → clear unavailable/error, not fake percentages |
| **Auto-refresh** | Every 60 seconds |

## Providers

| Provider | Auth | What you see |
| -------- | ---- | ------------ |
| **OpenAI Codex** | Logged-in Codex CLI | 5h / week / month **remaining** % |
| **Cursor** | Desktop login or `CURSOR_TOKEN` | Total / first-party / API % |
| **OpenCode Go** | Browser `auth` cookie (usage API not live yet) | Rolling / week / month used % |
| **Claude** | Claude Code OAuth / `CLAUDE_ACCESS_TOKEN` | 5h / week used % |
| **OpenRouter** | API key | Prepaid **USD** balance |
| **Kimi Code** | API key or local credentials | 5h / week used % |
| **Z.AI / GLM** | API key | Session / week used % |
| **Grok Build** | `grok login` or env token | Build credits (or period %) |

> **Reliability today:** Codex + Cursor are the strongest paths. Other adapters fail closed when credentials or upstream APIs are missing — see [Limitations](#limitations).

### Setup commands

| Command | What it does |
| ------- | ------------ |
| `npm run setup` | Interactive: enable providers + optional secrets |
| `npm run setup:defaults` | Enable **OpenAI + Cursor** only |
| `npm run setup:all` | Enable all provider flags (no secret prompts) |

Or copy [`config.example.json`](./config.example.json) → `config.json`.

Env vars override file secrets when set (`OPENROUTER_API_KEY`, `CLAUDE_ACCESS_TOKEN`, `OPENCODE_GO_AUTH_COOKIE`, …).

Cold start: every provider is **off** until setup (or you edit `providers` in config). Disabled providers are never polled.

### OpenCode Go note

Terminal API keys are tried against `GET /zen/go/v1/usage`, but that endpoint is **not live yet**. Live Go meters need a browser session cookie via setup / env / config. Helper: `node --import tsx scripts/save-opencode-cookie.ts`.

## Windows corner widget

```bash
npm run widget:bg       # detached — daily use
npm run widget          # attached — debug
npm run widget:startup  # Startup shortcut + launch
```

Tray: show / hide / open dashboard / quit.

**Never** leave `USAGE_FIXTURE=1` set for normal use (demo data only). Product launches strip fixture mode unless you pass Electron `--fixture` on purpose.

## Dashboard & API

```bash
npm run dev    # watch
npm start      # one-shot → http://127.0.0.1:4321
```

- `GET /api/health` → `{ status, fixture, time }`
- `GET /api/usage` → `{ fetchedAt, fixture, providers[] }`

Only **enabled** providers appear. Cursor may include `billing`; OpenRouter / Grok may include `balance`.

## Configuration

See [`config.example.json`](./config.example.json):

- `providers.<id>` — `true` to poll and show  
- Provider secrets under `opencode` / `openrouter` / `kimi` / `zai` / `grok` / `claude`  
- `server.host` / `server.port` (`PORT` env overrides)

`config.json` is **gitignored**. Do not commit secrets.

## Verify

```bash
npm run typecheck
npm test
npm run verify
```

Fixture demo (all eight providers):

```powershell
$env:USAGE_FIXTURE='1'; $env:USAGE_FIXTURE_ALL='1'; npm start
```

## Project layout

```
token-usage-widget/
├── src/           # HTTP server, setup CLI, adapters
├── public/        # dashboard + widget UI
├── desktop/       # Electron + server launch / revive
├── docs/          # demos + marketing drafts
├── scripts/       # widget launch, e2e evidence
└── tests/
```

## Security

- Binds to **localhost** by default  
- Adapters do not log tokens  
- `config.json` is gitignored  
- Treat undocumented provider endpoints as best-effort; rotate keys if you ever leak them  

## Limitations

- **OpenCode Go** — no official usage API yet (cookie scrape)  
- **Claude / Kimi / Z.AI / Grok** — community / undocumented endpoints; shapes can change  
- Widget launch scripts are **Windows-oriented**  
- Not a hosted SaaS — you run it locally  

## Share & contribute

- **Marketing drafts** (X, Reddit, Dev.to, daily.dev, HN): [`docs/marketing/`](./docs/marketing/)  
- Issues and PRs welcome. Run `npm run verify` before a PR. Prefer fail-closed over invented percentages.

## License

[MIT](./LICENSE) © 2026
