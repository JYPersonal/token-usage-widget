# X (Twitter) — copy pack

Post the **corner demo image** with every variant. Put the link in a **reply**, not always in the main tweet (better reach).

**Link:** https://github.com/JYPersonal/token-usage-widget

---

## Post A — pain hook (primary)

I kept alt-tabbing to check Codex week % and Cursor API limits mid-flow.

So I built a tiny Windows corner widget that shows both locally — always on top, no SaaS account.

MIT. Codex + Cursor first.

↓ screenshot

**Reply:**
Repo + 2-min setup: https://github.com/JYPersonal/token-usage-widget

---

## Post B — specificity hook

Codex Analytics says “Week 38% remaining.”
Cursor says “API 100%.”

I want that in one glance, bottom-right, while I work.

Open-source local widget (Windows):
https://github.com/JYPersonal/token-usage-widget

---

## Thread (5 tweets)

1/ If you use Codex + Cursor, usage is scattered across CLIs, settings, and billing pages.

I got tired of guessing whether I’d blow the week mid-session.

2/ So I shipped a local Windows corner widget + dashboard.

Always on top. Tray icon. Optional Startup. Refreshes every 60s.

3/ Defaults are boring on purpose: enable OpenAI + Cursor from local login, show only what you turn on.

No fake numbers when a provider isn’t configured — fail closed.

4/ Also wires Claude / OpenRouter / Kimi / Z.AI / Grok / OpenCode where creds exist — best-effort, same local model.

5/ MIT, runs on localhost.

Repo: https://github.com/JYPersonal/token-usage-widget

If this saves you one “wait I’m out?” moment, a star helps others find it.

---

## Reply templates (when people ask)

**Mac?**  
Dashboard works on Mac via `npm start`. The always-on-top Electron widget launch path is Windows-first today.

**Is it safe?**  
Binds to 127.0.0.1 by default; secrets in gitignored `config.json`; you run it yourself.

**Does it support X provider?**  
See the providers table in the README — enable only what you use.
