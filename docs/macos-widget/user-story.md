# macOS Widget User Story

## Primary story

As a token-usage-dashboard user working from a source checkout on macOS 13 or later, I want the existing compact widget to run as a native menu-bar utility, start once when I log in, discover supported local provider credentials, and avoid disrupting other local services, so I can monitor the same honest usage data and open the same dashboard that the Windows widget provides.

## Supported users and environment

- macOS 13+ on Intel and Apple Silicon.
- First release operates from a valid source checkout with dependencies installed.
- Windows remains supported with its existing tray, placement, visibility, close, detached command/PowerShell launch, Node/NVM4W/`where.exe` discovery, Startup shortcut, and mode-mismatch behavior.
- Packaged application, DMG, signing, and notarization are deferred and are not part of this release.

## Expected journey

1. The user runs interactive setup, defaults setup, or all-provider defaults setup from `<checkout>`.
2. After configuration is saved successfully on macOS, setup installs or refreshes an idempotent per-user LaunchAgent for that checkout. If registration fails, configuration remains saved, setup exits nonzero, explains that startup was not enabled, and prints the retry command.
3. The user can also run one documented background command. It resolves `<checkout>`, its local Electron dependency, Node, and the working directory without `.exe`, NVM4W, `where.exe`, or global Electron assumptions.
4. The widget appears at the bottom-right of the work area on the display containing the pointer. Showing it again after the pointer moves to another display reanchors it there.
5. The widget has a light/dark-compatible menu-bar icon and no Dock icon. It is available on all normal Spaces but does not overlay another app in full-screen mode.
6. The hide control hides the widget and the menu bar restores it. Custom ×, native close, menu Quit, and Command-Q exit the app and terminate only a usage-server child owned by this widget.
7. If the configured loopback port contains a matching healthy usage server, the widget reuses it. If it contains an unrelated or mode-mismatched listener on macOS, that listener survives while the widget starts an owned server on a free loopback port; the widget and full dashboard use that one returned endpoint.
8. Cursor and Firefox/OpenCode discovery use native default paths when explicit inputs are absent. Missing credentials continue to produce the existing honest unavailable state rather than synthetic live usage.
9. The user can idempotently refresh login launch or disable/uninstall it. Removal prevents future automatic starts while preserving configuration and credentials. Because `KeepAlive=false`, an intentional quit stays quit until manual launch or the next login.

## Acceptance narrative

Release acceptance requires Windows and macOS typecheck, unit/integration, and fixture Electron smoke evidence; real-Mac proof on macOS 13+ Intel and Apple Silicon; redacted live-or-honestly-unavailable Cursor and OpenCode proof; non-destructive fallback-port proof; native visual, Spaces, menu icon, Dock, hide/restore, and exit-route proof; a dimensioned Windows parity comparison; and a fresh-context PASS/FAIL review tied to actionable, secret-free artifacts.

## Non-goals

- Safari, Chrome, or Arc cookie extraction.
- Linux support.
- Packaged distribution, including an app bundle, DMG, signing, or notarization.
- LaunchAgent `KeepAlive` or restart-on-quit behavior.
- Synthetic usage presented as live provider usage.
- Renderer redesign; `public/widget.html`, `public/widget.js`, `public/widget.css`, and `public/widget-compact.js` remain the single compact UI implementation.
