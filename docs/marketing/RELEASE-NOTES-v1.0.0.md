## Token Usage Widget v1.0.0

Local **Windows corner widget** + localhost dashboard for AI harness quotas — Codex, Cursor, and more.

### Highlights
- Always-on-top corner HUD with tray + optional Startup
- `npm run setup:defaults` → OpenAI Codex + Cursor from local login
- Only enabled providers are polled and shown
- Server auto-revive if the usage API process dies
- MIT, binds to `127.0.0.1` by default

### Install
```bash
git clone https://github.com/JYPersonal/token-usage-widget.git
cd token-usage-widget
npm install
npm run setup:defaults
npm run widget:bg
```

### Notes
- Strongest paths today: **Codex** and **Cursor**
- Other providers fail closed without credentials / upstream APIs
- Widget launch scripts are Windows-oriented; `npm start` works for the browser dashboard elsewhere

**Full docs:** see README
