"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  getPlatformPolicy,
  selectDisplay,
  calculateCornerBounds,
} = require("./platform-policy.cjs");

const LEGACY_TRAY_ICON =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAALElEQVQ4T2NkYGD4z0ABYBzVMKoBBgYGRvL8P6oBMjIy/xkZGBhHNWBUA0Y1AABeJQMR9ZyeRgAAAABJRU5ErkJggg==";

function runWidgetMain({
  electron = require("electron"),
  serverLaunch = require("./server-launch.cjs"),
  platform = process.platform,
  env = process.env,
  argv = process.argv,
} = {}) {
  const { app, BrowserWindow, Tray, Menu, nativeImage, screen, shell, ipcMain, dialog } = electron;
  const { fetchHealth, ensureUsageServer, DEFAULT_HOST, DEFAULT_PORT, SERVER_LOG } = serverLaunch;
  const policy = getPlatformPolicy(platform);
  const root = path.join(__dirname, "..");
  const host = env.USAGE_HOST || DEFAULT_HOST;
  const port = Number(env.PORT || DEFAULT_PORT);
  /** Fixture is test-only. Widget product path never inherits USAGE_FIXTURE from the shell. */
  const allowFixture = argv.includes("--fixture");

  /** @type {BrowserWindow | null} */
  let win = null;
  /** @type {Tray | null} */
  let tray = null;
  /** @type {import('node:child_process').ChildProcess | null} */
  let serverProc = null;
  let ownsServer = false;
  /** @type {{ host: string, port: number, baseUrl: string } | null} */
  let serverEndpoint = null;

  function widgetServerEnv() {
    const serverEnv = { ...env };
    if (!allowFixture) {
      delete serverEnv.USAGE_FIXTURE;
    } else {
      serverEnv.USAGE_FIXTURE = "1";
    }
    return serverEnv;
  }

  async function ensureServer() {
    const result = await ensureUsageServer({
      host,
      port,
      root,
      env: widgetServerEnv(),
    });
    serverEndpoint = result.endpoint;
    if (result.owned && result.proc) {
      serverProc = result.proc;
      ownsServer = true;
      serverProc.on("exit", () => {
        serverProc = null;
        ownsServer = false;
      });
    }
    return result.endpoint;
  }

  function currentServerEndpoint() {
    if (!serverEndpoint) {
      throw new Error("Usage server endpoint is unavailable before startup completes");
    }
    return serverEndpoint;
  }

  function cornerBounds() {
    const display = selectDisplay(policy, screen);
    return calculateCornerBounds(display.workArea, policy);
  }

  function trayIcon() {
    if (policy.trayIcon === "template") {
      const image = nativeImage.createEmpty();
      for (const representation of [
        { scaleFactor: 1, file: "trayTemplate.png" },
        { scaleFactor: 2, file: "trayTemplate@2x.png" },
      ]) {
        const imageBytes = fs.readFileSync(path.join(__dirname, "assets", representation.file));
        image.addRepresentation({
          scaleFactor: representation.scaleFactor,
          dataURL: `data:image/png;base64,${imageBytes.toString("base64")}`,
        });
      }
      image.setTemplateImage(true);
      return image;
    }
    return nativeImage.createFromDataURL(LEGACY_TRAY_ICON);
  }

  function reanchorWindow() {
    if (!win) return;
    win.setBounds(cornerBounds());
  }

  function showWindow({ focus = false, inactive = false } = {}) {
    if (!win) createWindow();
    if (!win) return;
    reanchorWindow();
    if (inactive) win.showInactive();
    else win.show();
    if (focus) win.focus();
  }

  function requestQuit() {
    if (app.isQuitting) return;
    app.isQuitting = true;
    app.quit();
  }

  function createWindow() {
    win = new BrowserWindow({
      ...cornerBounds(),
      frame: false,
      transparent: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      backgroundColor: "#04141c",
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    win.setAlwaysOnTop(true, policy.windowLevel);
    win.setVisibleOnAllWorkspaces(policy.visibleOnAllWorkspaces, {
      visibleOnFullScreen: policy.visibleOnFullScreen,
    });
    win.loadURL(`${currentServerEndpoint().baseUrl}/widget.html`);

    win.once("ready-to-show", () => {
      showWindow({ inactive: true });
    });

    win.on("close", (event) => {
      if (app.isQuitting) return;
      if (policy.nativeClose === "hide") {
        event.preventDefault();
        win?.hide();
        return;
      }
      requestQuit();
    });

    win.on("closed", () => {
      win = null;
    });
  }

  function installApplicationMenu() {
    if (platform !== "darwin") return;
    const applicationMenu = Menu.buildFromTemplate([
      {
        label: app.name || "Token Usage",
        submenu: [{ role: "quit", accelerator: "Command+Q" }],
      },
    ]);
    Menu.setApplicationMenu(applicationMenu);
  }

  function buildTray() {
    tray = new Tray(trayIcon());
    tray.setToolTip("Token Usage");
    const menu = Menu.buildFromTemplate([
      {
        label: "Show widget",
        click: () => showWindow({ focus: true }),
      },
      {
        label: "Hide widget",
        click: () => win?.hide(),
      },
      {
        label: "Open full dashboard",
        click: () => shell.openExternal(`${currentServerEndpoint().baseUrl}/`),
      },
      { type: "separator" },
      {
        label: "Quit",
        click: requestQuit,
      },
    ]);
    tray.setContextMenu(menu);
    tray.on("click", () => {
      if (win?.isVisible()) win.hide();
      else showWindow();
    });
  }

  function stopServer() {
    const child = serverProc;
    const shouldStop = ownsServer && child && !child.killed;
    serverProc = null;
    ownsServer = false;
    if (shouldStop) {
      try {
        child.kill();
      } catch {
        // ignore
      }
    }
  }

  ipcMain.handle("widget:close", () => {
    win?.hide();
  });

  ipcMain.handle("widget:open-dashboard", () => {
    shell.openExternal(`${currentServerEndpoint().baseUrl}/`);
  });

  ipcMain.handle("widget:quit", requestQuit);

  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    requestQuit();
    return;
  }

  app.on("second-instance", () => {
    if (!serverEndpoint) return;
    showWindow({ focus: true });
  });

  app.on("before-quit", () => {
    app.isQuitting = true;
    stopServer();
  });

  app.whenReady().then(async () => {
    if (policy.activationPolicy && typeof app.setActivationPolicy === "function") {
      app.setActivationPolicy(policy.activationPolicy);
    }
    if (policy.hideDock && app.dock) {
      app.dock.hide();
    }
    installApplicationMenu();

    for (const eventName of ["display-added", "display-removed", "display-metrics-changed"]) {
      screen.on(eventName, reanchorWindow);
    }

    try {
      const endpoint = await ensureServer();
      const health = await fetchHealth(endpoint.host, endpoint.port);
      if (!health?.ok) {
        throw new Error(`Server health check failed after ensureServer. See ${SERVER_LOG}`);
      }
      if (health.fixture && !allowFixture) {
        throw new Error(
          `Usage server at ${endpoint.baseUrl} is in FIXTURE mode but this widget was not started with --fixture. Refusing to show fake data. Stop that server and relaunch.`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(message);
      dialog.showErrorBox("Token Usage Widget", message);
      requestQuit();
      return;
    }
    createWindow();
    buildTray();
  });
}

module.exports = { runWidgetMain };

if (require.main === module) {
  runWidgetMain();
}
