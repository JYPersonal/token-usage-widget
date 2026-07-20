# Implementation Plan: macOS Widget Parity

## Delivery rules

- First release runs from `<checkout>` on macOS 13+ Intel and Apple Silicon. Packaged app, DMG, signing, and notarization are deferred.
- Keep `public/widget.html`, `public/widget.js`, `public/widget.css`, and `public/widget-compact.js` as the single compact renderer.
- Preserve Windows tray, placement, visibility, close behavior, detached `.cmd`/PowerShell route, Node/NVM4W/`where.exe` discovery, Startup shortcut, and mode-mismatch handling unless a shared edit has explicit Windows regression tests.
- Each ticket is accepted by executable or captured evidence. Final acceptance requires a fresh-context PASS/FAIL review.

## Dependency graph

- T1: none
- T2: T1
- T3A: T1
- T3B: T2 + T3A
- T3C: T3B
- T4: none
- T5A: T1 + T2 + T3A + T3B + T3C + T4
- T5B: T5A
- T5C: T1 + T4 + T5A
- T5D: T5B + T5C

## Ticket 1 — Launch safely when the preferred port is unavailable

**Dependencies:** none.

**Implementation context:** Deepen `desktop/server-launch.cjs`; do not create another server implementation. Return `{proc, nodeBin, logPath, reused, owned, endpoint}` with `endpoint: {host, port, baseUrl}`. Reuse only a healthy mode match. On Darwin, preserve unknown or mode-mismatched listeners and start an owned child on a free loopback port. Propagate the one returned endpoint through `desktop/main.cjs` health checks, widget URL, menu dashboard action, and preload/IPC dashboard action. Cleanup is controlled only by `owned`. Preserve the current Windows port and mode-mismatch behavior. Extend `tests/server-launch.test.cjs` with injectable port/process seams.

**Acceptance criteria:**

1. With a matching usage server on the configured port, launching the widget reuses it and does not create another server.
2. With an unrelated or fixture-mismatched listener on the configured port, the listener remains alive, the widget becomes usable through a free port, and “Open full dashboard” opens that same endpoint.
3. Quitting terminates only a server child started by this widget.
4. Automated tests demonstrate all three scenarios on Darwin-mode logic and preserve existing Windows expectations.

## Ticket 2 — Run the compact widget as a native macOS menu-bar utility

**Dependencies:** T1.

**Implementation context:** Reuse the existing renderer and bridge. Isolate platform decisions in an Electron-free policy seam used by `desktop/main.cjs`: Dock visibility, template/Retina menu icon, active-pointer display selection, 320 × 172 work-area bounds, floating level, Spaces/full-screen policy, and close mapping. Reanchor before each show and on display geometry changes. Route custom ×, native close, menu Quit, and Command-Q through one Darwin quit path; keep hide as hide. Add pure policy/geometry tests and dimensioned Win32 regressions.

**Acceptance criteria:**

1. On macOS 13+, launch shows the unchanged compact usage UI at the bottom-right of the display containing the pointer and exposes a menu-bar icon without a Dock icon.
2. Showing the widget after moving to another display reanchors it within that display’s work area.
3. The widget remains available across normal Spaces but does not overlay another app in full-screen mode.
4. The hide control hides and can be restored from the menu bar; ×, native close, Quit, and Command-Q exit and clean up the owned server.
5. Windows retains its current tray, placement, visibility, and close behavior.

## Ticket 3A — Launch the source-checkout widget in the background

**Dependencies:** T1.

**Implementation context:** Replace the Windows-only `widget:bg` package entry with a platform-dispatching Node launcher under `scripts/`. Its Windows branch invokes the established command/PowerShell path. Its Darwin branch derives `<checkout>` from the script, validates the checkout and local dependencies, resolves the current Node and local Electron executable, uses `<checkout>` as CWD, passes the Node path for server startup, spawns detached, and reports actionable failures. Export resolution and spawn seams for tests. Do not add packaged-app assumptions.

**Acceptance criteria:**

1. One documented background command starts the widget detached from the invoking terminal on macOS 13+ Intel and Apple Silicon.
2. Launch succeeds without `.exe`, NVM4W, `where.exe`, or a globally installed Electron assumption.
3. The launcher resolves the current checkout and uses the same runtime endpoint returned by server startup.
4. Launch errors identify missing dependencies or invalid checkout paths without leaving an orphaned server.
5. Existing Windows background launch behavior continues to work.

## Ticket 3B — Install reversible per-user login launch

**Dependencies:** T2 + T3A.

**Implementation context:** Add Electron-free install/refresh/inspect/remove operations used by package scripts and tests. On Darwin, manage one stable plist under `~/Library/LaunchAgents` using absolute current-checkout Node, launcher, and CWD values; user-local logs; `RunAtLoad=true`; and `KeepAlive=false`. `npm run widget:startup` installs or refreshes; `npm run widget:startup:disable` removes. Use atomic writes and idempotent load/unload behavior. Removal touches only managed launch state and preserves configuration and credentials.

**Acceptance criteria:**

1. Installing login launch for the current checkout causes the widget to start once at the next login on macOS 13+ Intel and Apple Silicon.
2. Reinstalling login launch is idempotent and refreshes stale checkout or runtime locations.
3. After ×, native close, menu Quit, or Command-Q, the widget stays closed until manual launch or the next login.
4. Removing login launch prevents future automatic starts while preserving user configuration and provider credentials.
5. A real Mac demonstrates install, refresh, relogin launch, non-relaunch after intentional quit, and removal.

## Ticket 3C — Enable login launch from every setup mode

**Dependencies:** T3B.

**Implementation context:** Refactor `src/cli/setup.ts` behind an exported dependency-injected runner so interactive setup, defaults setup, and all-provider defaults setup share a post-save Darwin registration stage. Configuration save and login registration are ordered stages: never register before save; never roll back a successful save because registration failed. On post-save failure, exit nonzero and print the exact retry command. Win32 setup behavior remains unchanged. Add automated route, stage, retry, and repetition tests without touching a real LaunchAgent.

**Acceptance criteria:**

1. Interactive setup, defaults setup, and all-provider defaults setup each enable or refresh login launch after successfully saving configuration on macOS.
2. If configuration saves but login registration fails, setup preserves the saved configuration, exits nonzero, states that startup was not enabled, and prints the command that retries registration.
3. A failure before configuration saves does not create or replace login launch state.
4. Automated tests cover success from all three setup modes, both failure stages, recovery guidance, and repeated setup.
5. Existing Windows setup and Startup-shortcut behavior continue to work.

## Ticket 4 — Discover Cursor and OpenCode credentials in standard macOS locations

**Dependencies:** none.

**Implementation context:** Add injected platform/home/environment path resolvers used by `src/adapters/cursor.ts` and `src/adapters/opencode.ts`. Darwin Cursor defaults to `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`; Firefox defaults to `~/Library/Application Support/Firefox/Profiles`. Preserve Win32 defaults and all existing explicit ordering: Cursor token/path overrides; OpenCode workspace config, environment, plugin, log; OpenCode cookie config, environment, plugin, cookie file, Firefox. Export path and filesystem/SQLite seams for temporary fixtures. Preserve the existing opt-in-only local estimate and honest unavailable state.

**Acceptance criteria:**

1. With a Cursor state database in the standard macOS location, the enabled Cursor provider reads the same usage data it would on Windows.
2. With an OpenCode auth cookie in a standard macOS Firefox profile, the enabled OpenCode provider uses it without requiring a Windows path.
3. Explicit environment/config paths override discovered defaults on both platforms.
4. Missing credentials produce the existing honest unavailable/error state; no local estimate is invented unless the existing opt-in flag is set.
5. Automated path and fixture tests cover Darwin and Win32 behavior.

## Ticket 5A — Automate Windows and macOS release checks

**Dependencies:** T1 + T2 + T3A + T3B + T3C + T4.

**Implementation context:** Add a macOS 13+ CI job while keeping Windows verification. Make `scripts/e2e-evidence.mjs` resolve and terminate Electron without Windows-only executable/process assumptions. Run typecheck, unit/integration tests, and fixture Electron smoke on both operating systems. Ensure CI exercises server ownership and fallback, endpoint propagation, provider path fixtures, every setup route/stage, and platform launch resolution. Preserve actionable logs and redact credentials, cookies, and provider secrets.

**Acceptance criteria:**

1. Windows verification and a macOS 13+ CI job pass typecheck, unit/integration tests, and fixture-mode Electron smoke coverage.
2. The Electron evidence runner launches and stops the app without Windows-only executable or process-control assumptions.
3. CI covers matching-server reuse, unknown-listener preservation with dynamic-port fallback, returned endpoint propagation, owned-child cleanup, Darwin provider paths, and all setup registration routes.
4. Failures retain actionable logs without exposing local credentials or cookies.

## Ticket 5B — Validate macOS shell and startup on real hardware

**Dependencies:** T5A.

**Implementation context:** Run the automated release gate and a scripted manual checklist on macOS 13+ Intel and Apple Silicon. Capture architecture and OS version. Use screenshots or recordings for visual/window-manager behavior and command results for launch/startup operations. Exercise every restore and exit route, both menu-bar appearances, multi-display placement, normal/full-screen Spaces, and reversible LaunchAgent behavior. Redact all local identity and secret material.

**Acceptance criteria:**

1. Both hardware architectures demonstrate pointer-display reanchoring, normal-Space visibility, full-screen exclusion, a light/dark menu-bar icon, and no Dock icon.
2. Both hardware architectures demonstrate hide/restore, custom ×, native close, menu Quit, and Command-Q behavior.
3. Both hardware architectures demonstrate login launch, idempotent refresh, non-relaunch after intentional quit, manual background launch, and startup removal without configuration loss.
4. Every observation is captured with a screenshot, recording, or command result and contains no credential or cookie value.

## Ticket 5C — Validate macOS data and port behavior on real hardware

**Dependencies:** T1 + T4 + T5A.

**Implementation context:** On macOS 13+ hardware, occupy the preferred port with an unrelated listener and record its survival while the widget starts a fallback server. Capture the actual endpoint and prove both widget and dashboard use it. Exercise standard-path Cursor and Firefox/OpenCode discovery with available real credentials; if credentials are absent, record the existing honest unavailable result. Redact secrets and distinguish fixture mechanics from live provider proof.

**Acceptance criteria:**

1. An unrelated preferred-port listener remains alive while the widget and dashboard both use the same fallback endpoint.
2. Native Cursor discovery returns live data when standard credentials are present, otherwise the existing honest unavailable state is shown.
3. Native Firefox/OpenCode discovery returns live data when the required cookie is present, otherwise the existing honest unavailable state is shown.
4. Evidence is captured on macOS 13+ with all secrets redacted and no synthetic usage presented as live.

## Ticket 5D — Publish the macOS support contract and evidence index

**Dependencies:** T5B + T5C.

**Implementation context:** Update public project documentation and command/config examples only after the preceding evidence passes. State source-checkout prerequisites, macOS 13+ Intel/Apple Silicon support, setup modes, detached launch, automatic login enablement, refresh/removal, provider paths and override ordering, troubleshooting, and limitations. Build an evidence index mapping every manual claim to its redacted artifact, hardware architecture, and macOS version. Include a measured 320 × 172 side-by-side Windows/macOS comparison. Do not imply deferred distribution or provider discovery features.

**Acceptance criteria:**

1. A dimensioned side-by-side comparison confirms compact UI parity with the Windows baseline.
2. Public instructions cover macOS setup, background launch, automatic login behavior, startup removal, troubleshooting, supported version/architectures, provider discovery, and known limitations.
3. An evidence index links every manual acceptance claim to its redacted artifact and identifies the tested hardware and macOS version.
4. Documentation does not claim a packaged app, DMG, notarization, Safari/Chrome/Arc cookie discovery, Linux support, or synthetic live usage.

## Final verification gate

1. Run `npm run typecheck` and `npm test` on Windows and macOS.
2. Run fixture Electron evidence on both operating systems and confirm the child server uses the returned endpoint.
3. Exercise login-registration installation from interactive, defaults, and all-provider setup success paths in automated tests. On real macOS 13+ Intel and Apple Silicon, prove idempotent refresh, relogin launch, non-relaunch after intentional quit, manual relaunch, and disable without configuration loss.
4. Occupy the preferred port with an unrelated listener and confirm it survives while the widget and dashboard use another port.
5. Capture separate real-Mac evidence for pointer-display reanchoring, normal-Space visibility, full-screen exclusion, light/dark menu-bar template icon with no Dock icon, hide/restore, custom ×, native close, menu Quit, Command-Q, and a dimensioned side-by-side compact-UI comparison against Windows.
6. Validate Cursor and Firefox/OpenCode discovery with redacted local fixtures or credentials; confirm unavailable states remain honest.
7. Dispatch a fresh-context acceptance review. Every ticket criterion receives PASS or FAIL plus concrete command, screenshot, recording, or file evidence before implementation is considered complete.

## Non-goals

- Safari, Chrome, or Arc cookie extraction.
- Linux support.
- Packaged distribution, app bundle, DMG, signing, or notarization.
- LaunchAgent `KeepAlive` or restart-on-quit.
- Synthetic live usage.
- Renderer redesign.
