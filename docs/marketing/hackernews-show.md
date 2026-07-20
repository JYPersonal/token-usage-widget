# Hacker News — Show HN

Post **once**, when README + release look good. Weekday morning US time often works. Attach nothing (HN is text); put the image in the README so the link previews well via GitHub.

---

## Title

Show HN: Local Windows corner widget for Codex and Cursor usage quotas

---

## Text (first comment — post immediately as OP)

I kept losing flow checking Codex week remaining and Cursor API / first-party usage in separate UIs.

Token Usage Widget is a small local Node service + Electron always-on-top corner HUD:

- Shows only providers you enable (defaults: OpenAI Codex + Cursor from local login)
- Dashboard at http://127.0.0.1:4321
- MIT, no hosted account for the app
- Other adapters (Claude, OpenRouter, Kimi, Z.AI, Grok, OpenCode) are best-effort and fail closed

Repo: https://github.com/JYPersonal/token-usage-widget

Happy to answer questions about auth sources, Windows-only widget scripts, and limitations.
