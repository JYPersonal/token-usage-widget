# macOS Widget Parity — Evidence Index

Maps each public macOS support claim to its evidence source. Evidence is either automated (GitHub Actions CI) or, for real interactive Mac behavior, explicitly **SKIPPED** because no macOS hardware was available to the maintainer for this release. Nothing here is fabricated as PASS.

- **Automated CI run:** https://github.com/JYPersonal/token-usage-widget/actions/runs/29726419443
- **Commit:** `121a656c3ecc431bb2f77c94a2b60000d578649b`
- **CI matrix:** `windows-latest`, `macos-15-intel`, `macos-15` (Apple Silicon)
- **CI gate:** `npm run verify` = `npm run typecheck` + `npm test` + `node scripts/e2e-evidence.mjs`

## Automated claims (CI PASS on all three runners)

| Claim | Automated evidence |
| --- | --- |
| Typecheck passes on Windows, macOS 15 Intel, macOS 15 arm64 | CI run 29726419443, job `verify (windows-latest)`, `verify (macos-15-intel)`, `verify (macos-15)`; command `npm run typecheck` |
| Unit/integration suite passes on all three runners | CI run 29726419443; command `npm test` (119 tests; suite list in `package.json` `test` script: `usage`, `providers`, `e2e-smoke`, `server-launch`, `start-widget`, `format-reset`, `widget-compact`, `login-launch`, `setup`, `ci-workflow`) |
| Fixture Electron smoke launches and stops the widget without Windows-only process assumptions | CI run 29726419443; script `scripts/e2e-evidence.mjs`; test `tests/e2e-smoke.test.ts` |
| Dynamic-port fallback: an unrelated/mode-mismatched listener on the preferred port survives while the widget uses a free loopback endpoint | `tests/server-launch.test.cjs` (Darwin-mode reuse, unknown-listener survival, mode-mismatch fallback, single returned endpoint, owned-child-only cleanup) |
| Source-checkout launch resolution (no `.exe`/NVM4W/`where.exe`/global Electron dependence on Darwin) | `tests/start-widget.test.cjs` |
| Reversible per-user LaunchAgent install/refresh/remove is idempotent | `tests/login-launch.test.ts` |
| Setup registers login launch after successful save from all three modes; pre-save failure does not register; post-save failure preserves config and prints retry | `tests/setup.test.ts` |
| Native Cursor state-DB and Firefox profile path resolution for Darwin | `tests/providers.test.ts` |
| CI workflow files exist and target the three-runner matrix | `tests/ci-workflow.test.cjs` and `.github/workflows/verify.yml` |
| Shared compact renderer and 320 × 172 / 16 px margin geometry are invariant across platforms | `desktop/platform-policy.cjs` (`WIDGET_WIDTH=320`, `WIDGET_HEIGHT=172`, `WIDGET_MARGIN=16`); `public/widget.html` + `public/widget.css` + `public/widget.js` + `public/widget-compact.js` are the single compact renderer used on both Windows and macOS |
| Bridge contract `widgetBridge.close/openDashboard/quit` is unchanged | `desktop/preload.cjs` |

## Local full-verify evidence (maintainer machine, Windows)

`npm run verify` was run locally on the maintainer's Windows machine during release prep and passed. This is not a substitute for the CI matrix above; it is recorded only because the maintainers have direct access to a Windows host.

## Real-Mac observation — SKIPPED (no Mac available)

The maintainer has no macOS hardware. The following T5B/T5C real-hardware observations were **not** performed and are **not** claimed as PASS. They remain required for full ticket-5 acceptance on real hardware:

| Real-Mac claim | Status |
| --- | --- |
| Menu-bar template icon in light and dark appearance, no Dock icon | SKIPPED — no Mac available |
| Initial and restored placement on the display containing the pointer (multi-display reanchor) | SKIPPED — no Mac available |
| Normal-Space visibility and full-screen exclusion | SKIPPED — no Mac available |
| Hide and menu-bar restore | SKIPPED — no Mac available |
| Custom ×, native close, menu Quit, Command-Q converge on one quit path with owned-child cleanup | SKIPPED — no Mac available |
| Manual detached background launch (`npm run widget:bg`) on macOS 13+ Intel and Apple Silicon | SKIPPED — no Mac available |
| LaunchAgent install, stale-path refresh, relogin launch, no immediate relaunch after intentional quit, disable without configuration loss | SKIPPED — no Mac available |
| Unrelated preferred-port listener survival with widget+dashboard sharing the fallback endpoint, observed on real macOS | SKIPPED — no Mac available (automated Darwin-mode logic covered by `tests/server-launch.test.cjs`) |
| Live Cursor discovery from the standard macOS `state.vscdb` path | SKIPPED — no Mac available (path logic covered by `tests/providers.test.ts`) |
| Live Firefox/OpenCode cookie discovery from the standard macOS Firefox profiles root | SKIPPED — no Mac available (path logic covered by `tests/providers.test.ts`) |
| Live local-provider/port observations on real macOS hardware | SKIPPED — no Mac available |

## Dimensioned parity table (invariant shared renderer/geometry)

There is no macOS screenshot for this release; a real Mac screenshot is explicitly unavailable. Parity is asserted from the shared invariant implementation, not from a side-by-side image.

| Dimension | Source of truth | Windows | macOS | Notes |
| --- | --- | --- | --- | --- |
| Widget width | `desktop/platform-policy.cjs` `WIDGET_WIDTH` | 320 px | 320 px | Same constant |
| Widget height | `desktop/platform-policy.cjs` `WIDGET_HEIGHT` | 172 px | 172 px | Same constant |
| Work-area margin | `desktop/platform-policy.cjs` `WIDGET_MARGIN` | 16 px | 16 px | Same constant |
| Anchor | `desktop/platform-policy.cjs` `positionForWorkArea` | bottom-right of primary display | bottom-right of display nearest pointer | Same bounds formula; display selection differs by platform policy |
| Renderer markup | `public/widget.html` | shared | shared | One file |
| Renderer styles | `public/widget.css` | shared | shared | One file |
| Renderer script | `public/widget.js` | shared | shared | One file |
| Compact formatting helpers | `public/widget-compact.js` (`TokenUsageCompact`) | shared | shared | One UMD module |
| Bridge | `desktop/preload.cjs` (`widgetBridge.close/openDashboard/quit`) | shared | shared | One file |
| Window level | `desktop/platform-policy.cjs` `windowLevel` | `screen-saver` | `floating` | Platform policy difference; does not affect renderer |
| Spaces/full-screen | `desktop/platform-policy.cjs` | visible, full-screen visible | visible on all normal Spaces, `visibleOnFullScreen: false` | Platform policy difference |
| Dock | `desktop/platform-policy.cjs` `hideDock`/`activationPolicy` | n/a | `dock.hide()`, accessory | macOS only |
| Close semantics | `desktop/platform-policy.cjs` `nativeClose` | native close hides | native close quits | Both keep renderer hide control; custom × quits on both |
| Reference screenshot | `docs/widget-demo.png` | available | unavailable | macOS screenshot deferred until real-Mac observation is possible |

## Secrets and paths

This index contains no cookies, token values, workspace IDs, or absolute user-local paths. Provider credential locations are referenced by their documented standard placeholders (`~/Library/...`, `config.json`, environment variables) only.
