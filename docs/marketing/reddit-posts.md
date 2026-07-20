# Reddit — copy pack

**Rules:** One primary sub first. Use the corner screenshot. Be a maintainer in comments. Don’t multi-post identical text to 5 subs in 10 minutes.

**Link:** https://github.com/JYPersonal/token-usage-widget

---

## r/cursor — title + body

**Title:**  
Local Windows corner widget for Cursor usage (total / first-party / API%) — also shows Codex week remaining

**Body:**

I kept opening Cursor billing / settings to check whether I was about to hit API or first-party limits mid-session — especially when also using Codex.

I built a small **local** always-on-top Windows widget + browser dashboard that shows:

- Cursor: total / first-party / API %
- Codex: week remaining % (and 5h/month when available)
- Only the providers you enable
- Runs on localhost; MIT; no account for the app itself

Setup is roughly:

```bash
git clone https://github.com/JYPersonal/token-usage-widget.git
cd token-usage-widget
npm install
npm run setup:defaults
npm run widget:bg
```

Repo: https://github.com/JYPersonal/token-usage-widget

Happy to take bug reports. Windows widget is the polished path; `npm start` opens the full dashboard in a browser.

---

## r/ChatGPTCoding — title + body

**Title:**  
Open-source local HUD for Codex + Cursor quotas (Windows corner widget)

**Body:**

Problem: quota UIs are scattered. You find out you’re out of weekly Codex or Cursor API when the tool starts refusing you.

I open-sourced a local Node + Electron corner widget that pulls usage for the harnesses you enable and parks it bottom-right.

- Local only (`127.0.0.1`)
- MIT
- Strongest today: OpenAI Codex + Cursor
- Optional: Claude, OpenRouter, Kimi, Z.AI, Grok, OpenCode (fail closed if not configured)

GitHub: https://github.com/JYPersonal/token-usage-widget

Screenshot of the widget in the corner attached.

---

## r/LocalLLaMA (lighter fit — optional)

**Title:**  
Local-only multi-harness usage widget (Codex/Cursor/…) — no SaaS, MIT

**Body:**  
Not a local LLM runner — a **local usage HUD** for cloud/harness quotas so you stop tabbing into billing pages. Windows corner widget + localhost dashboard. Feedback welcome: https://github.com/JYPersonal/token-usage-widget

---

## Sticky comment (post as OP)

FAQ quick hits:

- **Secrets:** gitignored `config.json`, localhost by default  
- **Mac:** dashboard yes; widget scripts are Windows-oriented for now  
- **Fake data:** don’t leave `USAGE_FIXTURE=1` on for real use
