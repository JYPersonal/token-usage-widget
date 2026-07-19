# Token Usage Dashboard

Local **dashboard** and **Windows corner widget** that show how much of your AI harness quotas you’ve used — only for the providers you enable.

Supports: **OpenAI Codex**, **OpenCode Go**, **Cursor**, **Claude**, **OpenRouter**, **Kimi Code**, **Z.AI / GLM**, and **Grok Build**.

> Early public beta. Codex and Cursor are the most reliable paths today. Other adapters fail closed when credentials or upstream APIs are missing. See [Limitations](#limitations).

## Features

- Compact always-on-top **corner widget** (system tray, optional Windows startup)
- Full browser dashboard at `http://127.0.0.1:4321`
- Interactive **`npm run setup`** Q&A — pick providers, paste keys (or use env / local login files)
- **Only enabled providers are shown** (`config.json` → `providers`)
- Auto-refresh every 60 seconds
- Local-only by default (`127.0.0.1`); secrets stay in gitignored `config.json`

## Quick start

```bash
git clone <this-repo>
cd token-usage-dashboard
npm install
npm run setup          # enable the harnesses you use
npm run widget:bg      # Windows corner widget (detached)
# or:
npm start              # then open http://127.0.0.1:4321
```

**Requirements:** Node.js 18+, Windows recommended for the Electron widget. `sqlite3` on `PATH` helps Cursor (and some OpenCode fallbacks) read local DBs.

## Setup

| Command | What it does |
| -------- | ------------- |
| `npm run setup` | Interactive Q&A: enable/disable each provider; optional secrets |
| `npm run setup:defaults` | Enable **OpenAI + Cursor** only (local login; no prompts) |
| `npm run setup:all` | Enable **all** provider flags (no secret prompts) |

Or copy the example and edit:

```bash
cp config.example.json config.json
```

Environment variables override file secrets when set (e.g. `OPENROUTER_API_KEY`, `CLAUDE_ACCESS_TOKEN`, `OPENCODE_GO_AUTH_COOKIE`).

Cold start: every provider is **off** until you run setup or set `providers` in `config.json`. Disabled providers are never polled or displayed.

## Providers

| Provider | How you authenticate | What you see |
| -------- | -------------------- | ------------ |
| **OpenAI Codex** | Logged-in Codex CLI (`codex-status-mcp`) | 5h / week / month **remaining** % |
| **Cursor** | Cursor desktop login (`state.vscdb`) or `CURSOR_TOKEN` | Billing cycle: total / first-party / API % |
| **OpenCode Go** | Website `auth` cookie (+ workspace id) until a usage API ships | Rolling / week / month **used** % |
| **Claude** | Claude Code OAuth file or `CLAUDE_ACCESS_TOKEN` | 5h / week used % |
| **OpenRouter** | Credits / management API key | Prepaid **USD** balance |
| **Kimi Code** | `KIMI_CODE_API_KEY` or `~/.kimi/credentials/…` | 5h / week used % |
| **Z.AI / GLM** | `ZAI_API_KEY` / `GLM_API_KEY` | Session / week used % |
| **Grok Build** | `grok login` → `~/.grok/auth.json` or env token | Build credits (or period %) |

### OpenCode Go

Your terminal API key is tried against `GET /zen/go/v1/usage`, but that endpoint is **not live yet**. Until OpenCode ships it, live Go plan meters need a browser session cookie:

1. Open your Go workspace page and sign in  
2. DevTools → Application → Cookies → `auth`  
3. Save via `npm run setup`, or `OPENCODE_GO_AUTH_COOKIE`, or `config.json` → `opencode.go.authCookie`

Helper: `node --import tsx scripts/save-opencode-cookie.ts` (see script header).

## Windows corner widget

```bash
npm run widget:bg       # detached — normal use
npm run widget          # attached — debug
npm run widget:startup  # install Startup shortcut + launch
```

Frameless, always-on-top, bottom-right. Starts the local API if needed. Tray icon: show / hide / quit / open full dashboard.

**Never** leave `USAGE_FIXTURE=1` set for normal use (that is demo data). Product launches strip fixture mode unless you pass Electron `--fixture` on purpose.

## Dashboard server

```bash
npm run dev    # watch mode
npm start      # one-shot
```

Open [http://127.0.0.1:4321](http://127.0.0.1:4321).

### HTTP API

**`GET /api/health`** — `{ status, fixture, time }`

**`GET /api/usage`** — `{ fetchedAt, fixture, providers[] }`

Each provider includes `windows` (`five_hour` / `week` / `month`). Cursor may add `billing`; OpenRouter / Grok may add `balance`. Only **enabled** providers appear in the array.

## Configuration

See [`config.example.json`](./config.example.json). Important keys:

- `providers.<id>` — `true` to poll and display  
- `opencode.go.workspaceId` / `authCookie` — OpenCode Go scrape  
- `openrouter.apiKey`, `kimi.apiKey`, `zai.apiKey`, `grok.oauthToken`, `claude.accessToken`  
- `server.host` / `server.port` (`PORT` env overrides port)

`config.json` is **gitignored**. Do not commit secrets.

## Verify

```bash
npm run typecheck
npm test
npm run verify
```

Fixture demos with all eight providers:

```bash
# Unix
USAGE_FIXTURE=1 USAGE_FIXTURE_ALL=1 npm start

# PowerShell
$env:USAGE_FIXTURE='1'; $env:USAGE_FIXTURE_ALL='1'; npm start
```

## Project layout

```
token-usage-dashboard/
├── src/
│   ├── server.ts              # HTTP + static UI
│   ├── cli/setup.ts           # setup Q&A
│   ├── providers/registry.ts  # enable → fetch
│   └── adapters/              # per-provider fetchers
├── public/                    # dashboard + widget HTML/JS/CSS
├── desktop/                   # Electron main / preload / server launch
├── scripts/                   # widget launch, e2e evidence, cookie helper
└── tests/
```

## Security

- Binds to **localhost** by default  
- Tokens are not logged by adapters  
- `config.json` is ignored by git  
- Treat undocumented provider endpoints as **best-effort**; rotate keys if you ever commit them by mistake  

## Limitations

- **OpenCode Go** has no official usage API yet (cookie scrape only)  
- **Claude / Kimi / Z.AI / Grok** use community or undocumented endpoints — shapes can change  
- Widget scripts are **Windows-oriented** (`widget:bg`, Startup shortcut)  
- Not a hosted SaaS; you run it locally  

## Contributing

Issues and PRs welcome. Please:

1. Run `npm run verify` before opening a PR  
2. Keep secrets out of the repo  
3. Prefer fail-closed (`unavailable` / clear error) over invented percentages  

## License

[MIT](./LICENSE) © 2026 token-usage-dashboard contributors
