"use strict";

const { app, BrowserWindow, Tray, Menu, nativeImage, screen, shell, ipcMain, dialog } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { fetchHealth, ensureUsageServer, DEFAULT_HOST, DEFAULT_PORT, SERVER_LOG } = require("./server-launch.cjs");

const ROOT = path.join(__dirname, "..");
const ICON_DIR = path.join(__dirname, "icons");
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
let startedServer = false;
/** @type {Promise<unknown> | null} */
let ensurePromise = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let reviveTimer = null;
/** @type {ReturnType<typeof setInterval> | null} */
let healthTimer = null;
let reviveFailures = 0;
const HEALTH_POLL_MS = 15_000;
const MAX_REVIVE_FAILURES = 12;

function widgetServerEnv() {
  const env = { ...process.env };
  if (!ALLOW_FIXTURE) {
    delete env.USAGE_FIXTURE;
  } else {
    env.USAGE_FIXTURE = "1";
  }
  return env;
}

function bindServerProc(proc) {
  if (!proc) return;
  serverProc = proc;
  startedServer = true;
  proc.once("exit", (code, signal) => {
    if (serverProc === proc) {
      serverProc = null;
      startedServer = false;
    }
    if (app.isQuitting) return;
    console.error(`[widget] usage server exited code=${code} signal=${signal}; scheduling revive`);
    scheduleRevive(400);
  });
}

async function ensureServer() {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    const result = await ensureUsageServer({
      host: HOST,
      port: PORT,
      root: ROOT,
      env: widgetServerEnv(),
    });
    if (result.proc) {
      bindServerProc(result.proc);
    }
    reviveFailures = 0;
    return result;
  })().finally(() => {
    ensurePromise = null;
  });
  return ensurePromise;
}

function scheduleRevive(delayMs) {
  if (app.isQuitting) return;
  if (reviveTimer) clearTimeout(reviveTimer);
  reviveTimer = setTimeout(() => {
    reviveTimer = null;
    void reviveIfNeeded();
  }, delayMs);
}

/**
 * Root-cause fix: usage server used to start once; if it died, the renderer
 * kept showing "fail" forever. Revive whenever health is down.
 */
async function reviveIfNeeded() {
  if (app.isQuitting) return { ok: false, reason: "quitting" };
  const health = await fetchHealth(HOST, PORT);
  if (health?.ok) {
    if (health.fixture && !ALLOW_FIXTURE) {
      return { ok: false, reason: "fixture_mismatch" };
    }
    reviveFailures = 0;
    return { ok: true, reason: "healthy" };
  }
  if (reviveFailures >= MAX_REVIVE_FAILURES) {
    return { ok: false, reason: "give_up" };
  }
  try {
    await ensureServer();
    const again = await fetchHealth(HOST, PORT);
    if (again?.ok && !(again.fixture && !ALLOW_FIXTURE)) {
      reviveFailures = 0;
      return { ok: true, reason: "restarted" };
    }
    reviveFailures += 1;
    scheduleRevive(Math.min(30_000, 1000 * reviveFailures));
    return { ok: false, reason: "not_ready" };
  } catch (err) {
    reviveFailures += 1;
    console.error("[widget] revive failed:", err instanceof Error ? err.message : err);
    scheduleRevive(Math.min(30_000, 1000 * reviveFailures));
    return { ok: false, reason: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

function startHealthWatchdog() {
  if (healthTimer) return;
  healthTimer = setInterval(() => {
    void reviveIfNeeded();
  }, HEALTH_POLL_MS);
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

function iconPath(name) {
  return path.join(ICON_DIR, name);
}

function loadNativeIcon(name) {
  const img = nativeImage.createFromPath(iconPath(name));
  return img.isEmpty() ? null : img;
}

/** Tray wants a sharp small bitmap; fall back through sizes then hi-res. */
function trayIcon() {
  return (
    loadNativeIcon("icon-16.png") ||
    loadNativeIcon("icon-32.png") ||
    loadNativeIcon("icon.png") ||
    nativeImage.createEmpty()
  );
}

function windowIconPath() {
  for (const name of ["icon.png", "icon-256.png", "icon-64.png", "icon-32.png"]) {
    const p = iconPath(name);
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function createWindow() {
  const bounds = cornerBounds();
  const icon = windowIconPath();
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
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadURL(`http://${HOST}:${PORT}/widget.html`);

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
      click: () => shell.openExternal(`http://${HOST}:${PORT}/`),
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
  if (reviveTimer) {
    clearTimeout(reviveTimer);
    reviveTimer = null;
  }
  if (healthTimer) {
    clearInterval(healthTimer);
    healthTimer = null;
  }
  if (startedServer && serverProc && !serverProc.killed) {
    try {
      serverProc.kill();
    } catch {
      // ignore
    }
    serverProc = null;
  }
}

ipcMain.handle("widget:close", () => {
  win?.hide();
});

ipcMain.handle("widget:open-dashboard", () => {
  shell.openExternal(`http://${HOST}:${PORT}/`);
});

ipcMain.handle("widget:ensure-server", async () => reviveIfNeeded());

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
    if (process.platform === "win32") {
      app.setAppUserModelId("com.token-usage.widget");
    }
    try {
      await ensureServer();
      const health = await fetchHealth(HOST, PORT);
      if (!health?.ok) {
        throw new Error(`Server health check failed after ensureServer. See ${SERVER_LOG}`);
      }
      if (health.fixture && !ALLOW_FIXTURE) {
        throw new Error(
          "Usage server is in FIXTURE mode but this widget was not started with --fixture. Refusing to show fake data. Stop the process on port 4321 and relaunch.",
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(message);
      dialog.showErrorBox("Token Usage Widget", message);
      app.quit();
      return;
    }
    startHealthWatchdog();
    createWindow();
    buildTray();
  });

  app.on("before-quit", () => {
    app.isQuitting = true;
    stopServer();
  });
}
