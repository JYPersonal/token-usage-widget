# Dev.to — article draft

**Suggested title:**  
Stop Alt-Tabbing Your AI Quotas: A Local Windows Widget for Codex + Cursor

**Tags:** `opensource`, `javascript`, `productivity`, `ai`, `electron`

**Cover:** `docs/widget-corner-demo.png`

---

I use more than one AI harness in a day. Codex for some work, Cursor for others. Each has its own idea of “how much have you used?” — week remaining here, API percent there, a billing page somewhere else.

I got tired of guessing mid-session. So I built a small local tool:

**Token Usage Widget** — an always-on-top Windows corner HUD plus a localhost dashboard.

🔗 https://github.com/JYPersonal/token-usage-widget

## What it shows

For the providers you enable:

- **OpenAI Codex** — 5h / week / month remaining % (when the CLI reports them)
- **Cursor** — total / first-party / API % for the billing cycle
- Optionally Claude, OpenRouter, Kimi, Z.AI, Grok, OpenCode — fail closed if you’re not set up

Disabled providers are not polled. Cold start is all-off until `npm run setup` (or defaults).

## Design choices that matter

1. **Local-only by default** — binds to `127.0.0.1`
2. **No SaaS account for the app** — you run Node/Electron yourself
3. **Honest failures** — missing credentials become unavailable/error, not invented bars
4. **Widget owns the API process** — if the usage server dies, the widget tries to revive it instead of sitting on a permanent “fail”

## Quick start

```bash
git clone https://github.com/JYPersonal/token-usage-widget.git
cd token-usage-widget
npm install
npm run setup:defaults   # Codex + Cursor via local login
npm run widget:bg        # Windows corner widget
```

Or `npm start` and open `http://127.0.0.1:4321`.

## Who should skip it (for now)

- You need a polished **macOS** menubar app tomorrow (dashboard works; widget launch is Windows-first)
- You want a hosted multi-user SaaS
- You need every third-party provider to be as solid as Codex/Cursor on day one

## Try it / contribute

Repo, demos, and MIT license:  
https://github.com/JYPersonal/token-usage-widget

If it saves you one “wait, am I out?” moment, a star helps other people find it. Issues and PRs welcome — please run `npm run verify` before a PR.
