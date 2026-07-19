# Token Usage Dashboard

A small local dashboard that visualizes **OpenAI (Codex)** and **OpenCode** token usage and the percentage remaining across three windows: **5-hour**, **weekly**, and **monthly**.

- TypeScript Node server + static HTML/CSS/JS UI (no React, no Vite, minimal deps).
- Serves the UI and a single `GET /api/usage` endpoint.
- Offline fixture mode for verification without Codex or the OpenCode DB.
- Never logs or prints auth tokens. `config.json` is git-ignored; only `config.example.json` is committed.

## Requirements

- Node.js 18+ (developed on Node 23).
- `sqlite3` CLI on `PATH` for OpenCode DB reads (e.g. `winget install SQLite.SQLite` or `scoop install sqlite`). The adapter gives a clear error if it is missing.
- The `codex` CLI installed and logged in if you want live OpenAI numbers (the OpenAI adapter calls `getCodexStatus()` from `codex-status-mcp`, which talks to Codex's local app-server).

## Install

```bash
npm install
```

## Configure

Copy the example config and edit caps as desired:

```bash
cp config.example.json config.json
```

`config.json` (optional — defaults work without it):

```json
{
  "opencode": {
    "dbPath": null,
    "caps": {
      "five_hour": 250000,
      "week": 3000000,
      "month": 12000000
    }
  },
  "server": {
    "port": 4321,
    "host": "127.0.0.1"
  }
}
```

- `opencode.dbPath`: override the OpenCode SQLite path. Defaults to `%USERPROFILE%\.local\share\opencode\opencode.db`. Can also be set via `OPENCODE_DB_PATH`.
- `opencode.caps.*`: soft token caps per window, used to compute `remainingPercent`. `null` means "uncapped" — the dashboard still shows used tokens but reports remaining as `uncapped`.
- `server.port` / `server.host`: bind for the HTTP server. `PORT` env var overrides the port.

## Run

```bash
npm run dev     # tsx watch (auto-restart on edits)
npm start       # one-shot run
```

Then open <http://127.0.0.1:4321>.

The UI auto-refreshes every 60 seconds.

## Offline / fixture mode

```bash
USAGE_FIXTURE=1 npm start
```

Returns realistic fixture payloads for both providers without contacting Codex or the OpenCode DB. Useful for screenshots, demos, and CI.

## Verify

```bash
npm run typecheck                 # tsc --noEmit, exits 0
npm test                          # node:test suite
USAGE_FIXTURE=1 npm test           # tests pass in fixture mode too
USAGE_FIXTURE=1 node --import tsx src/server.ts   # serve fixtures
curl http://127.0.0.1:4321/api/usage
curl http://127.0.0.1:4321/api/health
```

## API

### `GET /api/usage`

Returns:

```json
{
  "fetchedAt": "2026-07-19T05:44:00.000Z",
  "fixture": false,
  "providers": [
    {
      "provider": "openai",
      "label": "OpenAI Codex",
      "fetchedAt": "2026-07-19T05:44:00.000Z",
      "windows": {
        "five_hour": {
          "usedPercent": 45,
          "remainingPercent": 55,
          "resetsAtIso": "2026-07-19T10:00:00.000Z",
          "status": "ok"
        },
        "week": { "usedPercent": 12, "remainingPercent": 88, "resetsAtIso": "...", "status": "ok" },
        "month": { "usedPercent": null, "remainingPercent": null, "status": "unavailable", "reason": "..." }
      }
    },
    {
      "provider": "opencode",
      "label": "OpenCode",
      "fetchedAt": "...",
      "windows": {
        "five_hour": { "usedPercent": 73.8, "remainingPercent": 26.2, "usedTokens": 184500, "status": "ok" },
        "week":     { "usedPercent": 64.0, "remainingPercent": 36.0, "usedTokens": 1920000, "status": "ok" },
        "month":    { "usedPercent": 61.75, "remainingPercent": 38.25, "usedTokens": 7410000, "status": "ok" }
      }
    }
  ]
}
```

`WindowUsage` shape:

- `usedPercent`: number | null
- `remainingPercent`: number | null (null when uncapped or unavailable)
- `usedTokens`: number | null (OpenCode only)
- `resetsAtIso`: ISO string | null
- `status`: `"ok"` | `"unavailable"` | `"error"`
- `reason`: optional human-readable note when not `ok`

### `GET /api/health`

```json
{ "status": "ok", "fixture": false, "time": "2026-07-19T05:44:00.000Z" }
```

## How it works

- **OpenAI**: calls `getCodexStatus()` from `codex-status-mcp`. Prefers `rateLimitsByLimitId["codex"]` (the plan-level limit) over model-specific spark limits. Each reported window is mapped to `five_hour` / `week` / `month` by `windowDurationMins` (≈300 / 10080 / 43200, 25% tolerance). Windows Codex did not report are returned as `status: "unavailable"` with a reason — never a fake percentage.
- **OpenCode**: reads `message.data` JSON from the OpenCode SQLite DB via `sqlite3 -json` (no native bindings). Sums `tokens.total` when present, otherwise `input + output + reasoning + cache.read + cache.write`, for messages whose timestamp falls in each window. Timestamps are auto-detected as seconds or milliseconds. Soft caps from `config.json` produce `remainingPercent`; without a cap, `remainingPercent` is `null` but `usedTokens` is still shown.

## Project layout

```
token-usage-dashboard/
├── package.json
├── tsconfig.json
├── config.example.json
├── README.md
├── src/
│   ├── types.ts
│   ├── config.ts
│   ├── fixtures.ts
│   ├── server.ts
│   └── adapters/
│       ├── openai.ts
│       └── opencode.ts
├── public/
│   ├── index.html
│   ├── app.js
│   └── styles.css
└── tests/
    └── usage.test.ts
```

## Security

- `config.json` is git-ignored.
- The OpenAI adapter passes `includeEmail: false` and never logs tokens.
- The server binds to `127.0.0.1` by default so it is not exposed on the network.
