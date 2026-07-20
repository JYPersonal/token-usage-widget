"use strict";

const { app, BrowserWindow, Tray, Menu, nativeImage, screen, shell, ipcMain, dialog } = require("electron");
const path = require("node:path");
const { fetchHealth, ensureUsageServer, DEFAULT_HOST, DEFAULT_PORT, SERVER_LOG } = require("./server-launch.cjs");

const ROOT = path.join(__dirname, "..");
const HOST = process.env.USAGE_HOST || DEFAULT_HOST;
const PORT = Number(process.env.PORT || DEFAULT_PORT);
const WIDGET_W = 320;
const WIDGET_H = 172;
const MARGIN = 16;
/** Fixture is test-only. Widget product path never inherits USAGE_FIXTURE from the shell. */
const ALLOW_FIXTURE = process.argv.includes("--fixture");

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
  const env = { ...process.env };
  if (!ALLOW_FIXTURE) {
    delete env.USAGE_FIXTURE;
  } else {
    env.USAGE_FIXTURE = "1";
  }
  return env;
}

async function ensureServer() {
  const result = await ensureUsageServer({
    host: HOST,
    port: PORT,
    root: ROOT,
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
  const display = screen.getPrimaryDisplay();
  const area = display.workArea;
  return {
    x: Math.round(area.x + area.width - WIDGET_W - MARGIN),
    y: Math.round(area.y + area.height - WIDGET_H - MARGIN),
    width: WIDGET_W,
    height: WIDGET_H,
  };
}

function trayIcon() {
  return nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAALElEQVQ4T2NkYGD4z0ABYBzVMKoBBgYGRvL8P6oBMjIy/xkZGBhHNWBUA0Y1AABeJQMR9ZyeRgAAAABJRU5ErkJggg==",
  );
}

function createWindow() {
  const bounds = cornerBounds();
  win = new BrowserWindow({
    ...bounds,
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

  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadURL(`${currentServerEndpoint().baseUrl}/widget.html`);

  win.once("ready-to-show", () => {
    win?.showInactive();
  });

  win.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win?.hide();
    }
  });

  win.on("closed", () => {
    win = null;
  });
}

function buildTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip("Token Usage");
  const menu = Menu.buildFromTemplate([
    {
      label: "Show widget",
      click: () => {
        if (!win) createWindow();
        win?.show();
        win?.focus();
      },
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
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on("click", () => {
    if (!win) createWindow();
    else if (win.isVisible()) win.hide();
    else win.show();
  });
}

function stopServer() {
  if (ownsServer && serverProc && !serverProc.killed) {
    try {
      serverProc.kill();
    } catch {
      // ignore
    }
  }
  serverProc = null;
  ownsServer = false;
}

ipcMain.handle("widget:close", () => {
  win?.hide();
});

ipcMain.handle("widget:open-dashboard", () => {
  shell.openExternal(`${currentServerEndpoint().baseUrl}/`);
});

ipcMain.handle("widget:quit", () => {
  app.isQuitting = true;
  app.quit();
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) createWindow();
    win?.show();
    win?.focus();
  });

  app.whenReady().then(async () => {
    try {
      const endpoint = await ensureServer();
      const health = await fetchHealth(endpoint.host, endpoint.port);
      if (!health?.ok) {
        throw new Error(`Server health check failed after ensureServer. See ${SERVER_LOG}`);
      }
      if (health.fixture && !ALLOW_FIXTURE) {
        throw new Error(
          `Usage server at ${endpoint.baseUrl} is in FIXTURE mode but this widget was not started with --fixture. Refusing to show fake data. Stop that server and relaunch.`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(message);
      dialog.showErrorBox("Token Usage Widget", message);
      app.quit();
      return;
    }
    createWindow();
    buildTray();
  });

  app.on("before-quit", () => {
    app.isQuitting = true;
    stopServer();
  });
}
