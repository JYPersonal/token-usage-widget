# Token Usage Dashboard

Local dashboard + Windows corner widget for **multi-harness** token / plan usage:

OpenAI Codex · OpenCode Go · Cursor · Claude · OpenRouter · Kimi Code · Z.AI / GLM · Grok Build

- TypeScript Node server + static HTML/CSS/JS UI (no React, no Vite, minimal deps).
- Serves the UI and a single `GET /api/usage` endpoint.
- Interactive setup CLI (`npm run setup`) writes `config.json` (providers + secrets).
- Offline fixture mode returns all 8 providers for demos / verification.
- Never logs or prints auth tokens. `config.json` is git-ignored; only `config.example.json` is committed.

## Requirements

- Node.js 18+ (developed on Node 23).
- `sqlite3` CLI on `PATH` for Cursor auth reads from `state.vscdb` and optional OpenCode local-DB fallback.
- Per-provider auth (see table below). OpenCode Go still needs a website session cookie until OpenCode ships a usage API.

## Install

```bash
npm install
```

## Setup

Preferred path — interactive Q&A (enable providers, paste keys or press Enter to use env/file):

```bash
npm run setup
```

Noninteractive defaults (built-in trio on; new harnesses off):

```bash
npm run setup:defaults
# or: npm run setup -- --defaults
```

Enable every provider flag without prompting for secrets:

```bash
npm run setup:all
# or: npm run setup -- --defaults --all
```

Or copy and edit manually:

```bash
cp config.example.json config.json
```

Secrets may also live in env vars (`OPENROUTER_API_KEY`, `KIMI_CODE_API_KEY`, `ZAI_API_KEY` / `GLM_API_KEY`, `GROK_CLI_OAUTH_TOKEN`, `CLAUDE_ACCESS_TOKEN`, `OPENCODE_GO_AUTH_COOKIE`, …) — `loadConfig` prefers env over `config.json`.

### Providers

| Provider | Auth source | Metrics shown |
|---|---|---|
| **OpenAI Codex** | Logged-in `codex` / `codex-status-mcp` | 5h / week / month remaining % (as reported) |
| **OpenCode Go** | Website `auth` cookie (+ optional workspace id) until API ships; API key alone is not enough yet | Rolling / week / month used % |
| **Cursor** | Desktop `state.vscdb` token (or `CURSOR_TOKEN`) | Billing cycle: total / first-party / API % |
| **Claude** | `~/.claude/.credentials.json` OAuth or `CLAUDE_ACCESS_TOKEN` | 5h / week used % |
| **OpenRouter** | `OPENROUTER_API_KEY` / `openrouter.apiKey` (credits key) | Prepaid USD balance remaining |
| **Kimi Code** | `KIMI_CODE_API_KEY` or `~/.kimi/credentials/kimi-code.json` | 5h / week used % |
| **Z.AI / GLM** | `ZAI_API_KEY` or `GLM_API_KEY` | Session / week used % |
| **Grok Build** | `grok login` → `~/.grok/auth.json` or `GROK_CLI_OAUTH_TOKEN` | Credits remaining (or month %) |

**OpenCode note:** your terminal API key is already tried against `GET /zen/go/v1/usage`, but that endpoint is still not live. Until OpenCode ships it, live Go meters need the website session cookie (`opencode.go.authCookie` / `OPENCODE_GO_AUTH_COOKIE`).

## Configure (manual)

`config.example.json` documents `providers{}`, OpenCode Go, OpenRouter, Kimi, Z.AI, Grok, Claude, and `server`.

- `providers.<id>`: poll toggle (defaults: openai/opencode/cursor on; others off).
- `opencode.go.authCookie`: required for live OpenCode Go meters today.
- `server.port` / `server.host`: bind address (`PORT` env overrides port).

## Run

```bash
npm run dev     # tsx watch (auto-restart on edits)
npm start       # one-shot run
```

Then open <http://127.0.0.1:4321>. The UI auto-refreshes every 60 seconds.

## Windows corner widget

Always-on-top frameless window anchored to the bottom-right of the primary display work area. Starts the usage server if it is not already running. Lives in the system tray (click to show/hide).

```bash
npm run widget:bg          # detached (normal use)
npm run widget             # attached (debug)
npm run widget:startup     # log in at Windows startup
```

Fixture mode is **test/demo only**:

```powershell
$env:USAGE_FIXTURE=1; npm start
npx electron . --fixture
```

## Verify

```bash
npm run typecheck
npm test
npm run verify
```

## API

### `GET /api/usage`

Returns `{ fetchedAt, fixture, providers[] }`. Each provider has `windows` (5h/week/month). Cursor may include `billing`; OpenRouter / Grok may include `balance`.

### `GET /api/health`

```json
{ "status": "ok", "fixture": false, "time": "…" }
```

## Project layout

```
token-usage-dashboard/
├── package.json
├── config.example.json
├── src/
│   ├── types.ts
│   ├── config.ts
│   ├── fixtures.ts
│   ├── server.ts
│   ├── cli/setup.ts
│   ├── providers/registry.ts
│   └── adapters/          # openai, opencode, cursor, claude, openrouter, kimi, zai, grok
├── public/                # dashboard + widget
├── desktop/               # Electron corner widget
└── tests/
```

## Security

- `config.json` is git-ignored.
- Adapters never log tokens.
- The server binds to `127.0.0.1` by default.
