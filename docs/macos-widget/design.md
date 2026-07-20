# Design: macOS Widget Parity

## Scope and architecture

The release extends the existing source-checkout Electron widget rather than creating a second application. `public/widget.html`, `public/widget.js`, `public/widget.css`, and `public/widget-compact.js` remain the only compact renderer. `src/server.ts` remains the local server. Darwin-specific behavior is isolated at launch, platform policy, login registration, and provider-path boundaries.

The supported runtime is macOS 13+ on Intel and Apple Silicon. Distribution remains a source checkout with local dependencies. App bundling, DMG creation, signing, and notarization are deferred.

## Existing public contracts to preserve

- HTTP: `GET /api/health` and `GET /api/usage`.
- Preload: `window.widgetBridge.close()`, `window.widgetBridge.openDashboard()`, and `window.widgetBridge.quit()`.
- Compact formatting: the `TokenUsageCompact` UMD helpers exported by `public/widget-compact.js`.
- Commands: `npm run setup`, `npm run setup:defaults`, `npm run setup:all`, `npm run widget`, `npm run widget:bg`, and `npm run widget:startup`.
- Windows behavior: tray, primary-display corner placement, visibility/full-screen policy, close-to-hide, detached `.cmd`/PowerShell route, Node/NVM4W/`where.exe` resolution, Startup shortcut, and existing mode-mismatch handling.

Add `npm run widget:startup:disable` as the explicit idempotent startup-removal operation. On Darwin it removes only the LaunchAgent and its generated launch metadata; it never removes configuration or credentials.

## Usage-server boundary

`desktop/server-launch.cjs` remains Electron-free and is the single server-launch implementation. `ensureUsageServer(options)` returns this compatible result shape:

```ts
{
  proc: ChildProcess | null;
  nodeBin: string | null;
  logPath: string | null;
  reused: boolean;
  owned: boolean;
  endpoint: {
    host: string;
    port: number;
    baseUrl: string;
  };
}
```

Semantics:

- `reused=true` means a healthy server was already present at the preferred endpoint and its fixture/live mode matched. `owned=false`, `proc=null`, and `nodeBin=null`. `logPath` may retain the configured compatibility value, but callers must not infer ownership from it.
- `owned=true` means this invocation spawned `proc`; `reused=false`; `nodeBin` and `logPath` identify that launch. Ownership, not process presence or log path, controls cleanup.
- On Darwin, if the preferred port has an unknown listener or a healthy mode mismatch, leave it alive, choose a free loopback port, spawn the child there, and return that endpoint. The configured preferred port is not rewritten.
- On Windows, preserve the current reuse, port-freeing, Node discovery, and mode-mismatch behavior unless a shared change is covered by explicit Windows regression tests.
- `endpoint.baseUrl` is derived once from the returned `host` and `port`. `desktop/main.cjs` stores that endpoint and uses it for post-start health verification, `widget.html`, both dashboard-opening routes, and any later reload. No caller reconstructs a URL from the configured port after startup.
- `before-quit` terminates the child only when `owned=true`. Reused servers, unrelated listeners, and any process not represented by the owned child handle survive.
- If startup fails after spawning a child, the launcher terminates that child before returning an actionable error.

Public/test seams in `desktop/server-launch.cjs`:

- Preserve `fetchHealth`, `healthCheck`, `resolveNodeBinary`, `assertNotElectronBinary`, and `ensureUsageServer`.
- Add injectable platform/process/filesystem/network inputs to Node resolution and port allocation rather than mutating global platform state in tests.
- Export the free-loopback-port allocator and endpoint builder for deterministic unit tests.
- Continue rejecting Electron as the API server binary.

## Platform policy boundary

Create an Electron-free policy module at `desktop/platform-policy.cjs`. It receives `platform` and returns explicit decisions for:

- display selection: primary display on Windows; nearest display to `screen.getCursorScreenPoint()` on Darwin;
- position: bottom-right of the selected display work area using the existing 320 × 172 dimensions and margin;
- window level: existing Windows `screen-saver`; Darwin floating utility level;
- Spaces: current Windows visibility; Darwin `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false })`;
- close policy: Windows native window close and the renderer hide control (`widgetBridge.close`) hide, while its custom × (`widgetBridge.quit`) quits; Darwin custom × and native close both quit, with the renderer hide control still available;
- Dock policy: Darwin calls `app.dock.hide()`; Windows is unchanged;
- icon policy: existing Windows tray icon; Darwin template image with 1× and 2× representations for light and dark menu bars.

`desktop/main.cjs` owns Electron objects and applies the policy. It recalculates bounds before every show/restore and on display-added, display-removed, and display-metrics-changed events. Menu-bar click and “Show widget” use the same show-and-reanchor function. The existing `widgetBridge.close` remains the renderer hide action and `widgetBridge.quit` remains the custom-× quit action on both platforms; Windows alone also retains native-close-to-hide. No renderer markup or styling is duplicated.

On Darwin, Command-Q, menu Quit, native close, and custom × converge on one quit path so owned-child cleanup runs once. On Windows, menu Quit and custom × retain the existing quit path while native close retains hide behavior. Single-instance restore uses show-and-reanchor.

Pure policy and geometry functions are exported for unit tests. Electron integration tests validate that `desktop/main.cjs` applies the returned decisions.

## Source-checkout launch design

Add a platform-dispatching Node launcher under `scripts/` and point `widget:bg` to it.

- Windows dispatch invokes the established `scripts/start-widget.cmd`/`scripts/start-widget.ps1` path and preserves detached launch, `.exe`, NVM4W, `where.exe`, and Startup shortcut behavior.
- Darwin derives `<checkout>` from the launcher location, validates `package.json`, resolves the local Electron dependency under `<checkout>/node_modules`, captures the absolute Node executable used to run the launcher, and sets CWD to `<checkout>`.
- Darwin passes the resolved Node binary into Electron for API-server startup, removes inherited fixture mode unless the explicit fixture test route is used, spawns detached with ignored terminal stdio, and unrefs only after a successful spawn.
- No Darwin path depends on a global Electron install, `.exe`, NVM4W, or `where.exe`.
- Resolution and spawn are separate exported seams so tests can inject platform, environment, filesystem, checkout, executable paths, and spawn behavior.
- Invalid checkout, missing local Electron, missing Node, or spawn failure reports the exact missing path or dependency. Any owned server started during a failed launch is terminated.

## Login-launch operations

Implement Electron-free operations callable by setup, package scripts, and tests:

```ts
installLoginLaunch({ platform, homeDir, checkout, nodeBin, logDir, execFile, fs }): Promise<void>
removeLoginLaunch({ platform, homeDir, execFile, fs }): Promise<void>
inspectLoginLaunch({ platform, homeDir, fs }): Promise<LoginLaunchStatus>
```

`installLoginLaunch` is also the refresh operation. It writes a stable per-user LaunchAgent label under `~/Library/LaunchAgents`, with:

- absolute `ProgramArguments` for the resolved Node binary, the current `<checkout>` launcher, and the current checkout;
- `WorkingDirectory` set to `<checkout>`;
- `RunAtLoad=true`;
- `KeepAlive=false`;
- stdout and stderr paths under a user-local log directory such as `~/Library/Logs/token-usage-dashboard/`;
- no secrets or provider credentials embedded in the plist.

Install/refresh writes atomically, compares or replaces stale paths, and loads the current definition idempotently. Removal unloads if loaded, removes only the managed plist, succeeds if already absent, and preserves `config.json`, environment variables, provider credential files, browser profiles, and logs needed for diagnosis.

`npm run widget:startup` dispatches install/refresh and `npm run widget:startup:disable` dispatches removal. Quitting never edits registration; `KeepAlive=false` ensures no immediate restart. The next login or a manual launch can start the widget again.

## Setup transaction boundary

Refactor `src/cli/setup.ts` so the CLI wrapper delegates to an exported, dependency-injected `runSetup(args, deps)` seam. Interactive, defaults, and all-provider defaults modes share this sequence on Darwin:

1. Validate and collect configuration.
2. Save configuration.
3. Call `installLoginLaunch` for the current checkout.
4. Report success only after registration succeeds.

A pre-save failure performs no registration. A post-save registration failure preserves the saved configuration, exits nonzero, states that startup was not enabled, and prints `npm run widget:startup`. Repetition refreshes the same registration. Win32 skips automatic setup registration and retains existing setup and Startup-shortcut behavior.

Tests inject config writing and registration operations to cover all three routes, both failure stages, retry text, and repeated setup without writing a real user LaunchAgent.

## Provider path resolver seams

Path selection is separated from credential reading and accepts injected `platform`, `homeDir`, and environment values.

### Cursor

Export `resolveCursorStateDbPath({ platform, homeDir, env })` for direct tests.

- `CURSOR_TOKEN` remains the direct token override.
- `CURSOR_STATE_DB` explicitly overrides path discovery.
- Darwin default: `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`.
- Win32 default: the current `%APPDATA%/Cursor/User/globalStorage/state.vscdb` behavior, including its current home fallback.

`readCursorAccessToken` and `readCursorMembership` use the same resolved path. SQLite execution remains injectable for fixture tests.

### OpenCode and Firefox

Export `resolveFirefoxProfilesRoot({ platform, homeDir })` and make Firefox cookie reading accept the resolved root plus injected filesystem, temporary directory, and SQLite execution seams.

- Darwin default: `~/Library/Application Support/Firefox/Profiles`.
- Win32 default: the current home/AppData Firefox profiles root.
- Workspace ordering remains: config, `OPENCODE_GO_WORKSPACE_ID`, plugin config, log discovery.
- Cookie ordering remains: config, `OPENCODE_GO_AUTH_COOKIE`, plugin config, `OPENCODE_GO_AUTH_COOKIE_FILE`, Firefox discovery.
- Existing `resolveWorkspaceId` and `resolveAuthCookie` exports remain public.
- Explicit mechanisms keep their existing ordering and always precede default-path discovery.
- Missing credentials return the current honest unavailable/error state. `OPENCODE_ALLOW_LOCAL_ESTIMATE=1` remains the only opt-in local estimate route and is labeled as an estimate.

Safari, Chrome, and Arc discovery are not added.

## Test and evidence seams

### Automated matrix

| Area | Win32 | Darwin CI | Primary seams |
| --- | --- | --- | --- |
| Typecheck and unit/integration | Required | Required on macOS 13+ | `npm run typecheck`, `npm test` |
| Server reuse/fallback/cleanup | Preserve current behavior | Matching reuse, unknown listener survival, mode mismatch fallback, one endpoint, owned cleanup | `tests/server-launch.test.cjs` |
| Shell policy and geometry | Existing dimensions and behavior | pointer display, 320 × 172 bounds, Spaces/full-screen, close mapping | pure platform-policy tests plus Electron fixture smoke |
| Launch resolution | `.cmd`/PowerShell, NVM4W, `where.exe` | local Electron, current Node, absolute checkout/CWD | launcher resolver tests |
| Setup registration | Existing setup and shortcut behavior | all three routes, pre-save/post-save failure, retry, repetition | injected `runSetup` tests |
| Provider discovery | Current Cursor/Firefox paths | standard Darwin Cursor/Firefox fixtures | `tests/providers.test.ts` and temporary fixtures |
| Electron evidence | Platform-neutral launch and stop | fixture smoke | `scripts/e2e-evidence.mjs` |

The Electron evidence runner resolves the platform-local Electron executable and uses platform-neutral graceful termination before any platform-specific fallback. It must not hard-code `electron.exe` or `taskkill` as the only route. Logs include commands, exit codes, endpoints, and failure locations, but redact cookies, tokens, provider payload secrets, and local credential contents.

### Real-Mac proof matrix

Run on macOS 13+ Intel and Apple Silicon. Capture tested hardware and OS version plus screenshot, recording, or command result for:

- menu-bar template icon in light and dark appearance, with no Dock icon;
- initial and restored placement on the display containing the pointer;
- normal-Space visibility and full-screen exclusion;
- hide and menu restore;
- custom ×, native close, menu Quit, and Command-Q;
- manual detached background launch;
- LaunchAgent install, stale-path refresh, relogin launch, no immediate relaunch after intentional quit, and disable without configuration loss;
- unrelated preferred-port listener survival, shared fallback endpoint for widget and dashboard, and owned-child-only termination;
- live Cursor and Firefox/OpenCode discovery when credentials are present, or an explicitly recorded honest unavailable result when they are not;
- a dimensioned side-by-side comparison with the Windows 320 × 172 baseline.

Fixture data may prove mechanics but is never labeled live. Evidence artifacts are secret-free, actionable, indexed to every criterion, and reviewed by a fresh-context acceptance reviewer who records PASS or FAIL with concrete evidence.

## Windows regression constraints

Shared edits in `desktop/main.cjs`, `desktop/server-launch.cjs`, `package.json`, setup, launch scripts, provider adapters, or evidence scripts require Win32 tests for every affected behavior. A change is not accepted if it silently replaces Windows mode-mismatch handling with Darwin fallback, changes close-to-hide, changes the primary-display position, removes full-screen visibility, bypasses command/PowerShell startup, weakens Node/NVM4W/`where.exe` discovery, or breaks Startup shortcut installation.

## Non-goals

- Safari, Chrome, or Arc cookie extraction.
- Linux support.
- Packaged distribution, app bundle, DMG, signing, or notarization.
- `KeepAlive` or restart-on-quit.
- Synthetic usage presented as live.
- Renderer redesign.
