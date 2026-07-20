# Product Requirements: macOS Widget Parity

## Product contract

Ship a source-checkout macOS 13+ release of the compact Electron token-usage widget for Intel and Apple Silicon. Reuse the current renderer and local API, add native menu-bar and login behavior, make server startup non-destructive on Darwin, and add native Cursor and Firefox/OpenCode discovery without regressing Windows.

The first release is run from `<checkout>`. A packaged app, DMG, signing, and notarization are deferred and must not be implied by commands, documentation, or evidence.

## Goals

1. Match the established 320 × 172 compact Windows UI and dashboard behavior on macOS.
2. Provide native macOS menu-bar, display, Spaces, hide, close, and quit behavior.
3. Support detached source-checkout launch and automatic once-per-login startup from all successful setup modes.
4. Reuse a matching server or choose a safe fallback endpoint without terminating an unrelated Darwin listener.
5. Discover Cursor and Firefox/OpenCode credentials from standard macOS locations while retaining explicit-input priority and honest unavailable states.
6. Produce automated Windows/macOS evidence and real-hardware proof on both supported Mac architectures.

## Functional requirements

### Runtime and endpoint safety

- Continue serving and consuming `GET /api/health` and `GET /api/usage`.
- A matching healthy server on the configured host/port is reused only when its fixture/live mode matches the requested mode.
- On macOS, an unrelated listener or a healthy mode-mismatched server on the preferred port is never killed. The launcher selects a free loopback port, starts an owned server there, and returns the actual endpoint.
- Widget load, health verification, renderer URL, tray/menu dashboard action, and `window.widgetBridge.openDashboard()` use the same returned endpoint.
- Quitting terminates only an owned child. A reused server and unrelated preferred-port listener survive.
- Fallback is non-destructive and does not rewrite the user's configured preferred port.

### Native macOS shell

- Support macOS 13+ on Intel and Apple Silicon.
- Use a macOS template image with Retina representation for a legible light/dark menu-bar icon, and hide the Dock icon.
- Place the 320 × 172 widget with the existing margin at the bottom-right of the work area on the display nearest the pointer.
- Recalculate placement whenever the widget is shown and when display geometry changes.
- Use a floating macOS level suitable for a menu-bar utility, not the current Windows `screen-saver` level.
- Make the window visible on all normal Spaces with `visibleOnFullScreen: false`; it must not overlay another app in full-screen mode.
- The hide control remains hide and can be restored from the menu bar. Custom ×, native close, menu Quit, and Command-Q exit and clean up the owned child.
- Preserve the existing compact renderer, colors, typography, usage lines, timestamp, dashboard button, and provider formatting.

### Source-checkout launch and login launch

- `npm run widget:bg` becomes a platform-dispatching Node command. Its Windows route preserves the existing detached command/PowerShell behavior.
- The Darwin route resolves the current `<checkout>`, local Electron executable, Node executable, and CWD using absolute paths. It must not depend on `.exe`, NVM4W, `where.exe`, or globally installed Electron.
- Missing dependencies and invalid checkout paths produce actionable errors and leave no orphaned server.
- A per-user LaunchAgent at `~/Library/LaunchAgents/` starts the current checkout once at login using absolute current-checkout arguments and user-local stdout/stderr logs.
- The LaunchAgent uses `RunAtLoad=true` and `KeepAlive=false`.
- Install and refresh are idempotent and replace stale checkout or runtime paths. Removal is idempotent, prevents future automatic starts, and preserves `config.json`, environment credentials, provider files, and browser data.
- `npm run widget:startup` installs or refreshes login launch. `npm run widget:startup:disable` removes it.
- On macOS, interactive setup, defaults setup, and all-provider defaults setup install or refresh login launch only after configuration saves successfully.
- If configuration saves but registration fails, setup preserves the configuration, exits nonzero, states startup was not enabled, and prints `npm run widget:startup` as the retry command. A failure before save must not create or replace login state.

### Provider discovery

- Cursor state database discovery defaults to `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` on Darwin and retains the current Windows default.
- `CURSOR_TOKEN` continues to bypass state-database token discovery. `CURSOR_STATE_DB` explicitly overrides the discovered database path.
- Firefox profile discovery defaults to `~/Library/Application Support/Firefox/Profiles` on Darwin and retains the current Windows profiles root.
- OpenCode workspace resolution preserves the current ordering: configured workspace ID, `OPENCODE_GO_WORKSPACE_ID`, plugin config, then log discovery.
- OpenCode cookie resolution preserves the current ordering: configured cookie, `OPENCODE_GO_AUTH_COOKIE`, plugin config, `OPENCODE_GO_AUTH_COOKIE_FILE`, then Firefox discovery.
- Explicit inputs override discovered defaults. Existing ordering among explicit mechanisms is preserved rather than replaced by a new public precedence.
- Missing credentials retain the existing unavailable/error presentation. Local estimates remain opt-in through the existing flag and must never be presented as live plan usage.

### Windows regression contract

- Preserve current Windows tray, primary-display placement, all-workspace/full-screen visibility, close-to-hide semantics, and quit behavior.
- Preserve detached `.cmd`/PowerShell launch, Node/NVM4W/`where.exe` discovery, Startup shortcut installation, and current mode-mismatch handling.
- Any shared change affecting these paths requires explicit dimensioned Windows regression tests and evidence.

## Verification and release requirements

- Windows and macOS 13+ CI run typecheck, unit/integration tests, and fixture-mode Electron smoke tests.
- Automated coverage includes matching-server reuse; unrelated-listener survival; mode-mismatch fallback; endpoint propagation; owned-child cleanup; Darwin and Win32 provider paths; every setup route; pre-save and post-save failure stages; retry guidance; repeated setup; and platform-neutral Electron launch/stop.
- Real macOS 13+ evidence is required on Intel and Apple Silicon for pointer-display placement, reanchoring, normal Spaces, full-screen exclusion, light/dark menu icon, no Dock icon, hide/restore, all exit routes, manual background launch, login launch, refresh, intentional-quit non-relaunch, and startup removal without configuration loss.
- Real-Mac runtime proof shows an unrelated listener surviving while widget and dashboard share the fallback endpoint.
- Cursor and Firefox/OpenCode evidence uses live data when credentials are present or records the honest unavailable state when they are not. Secrets and cookies are redacted; fixture or synthetic data is never labeled live.
- A dimensioned side-by-side comparison confirms compact Windows parity.
- Artifacts contain commands, exit codes, tested architecture and macOS version, screenshots or recordings where appropriate, actionable secret-free logs, and an evidence index.
- A fresh-context reviewer records PASS or FAIL with concrete evidence for every implementation ticket criterion.

## Non-goals

- Safari, Chrome, or Arc cookie extraction.
- Linux support.
- Packaged distribution, app bundle, DMG, signing, or notarization.
- LaunchAgent `KeepAlive` or restart after intentional quit.
- Synthetic live usage.
- Renderer redesign.
