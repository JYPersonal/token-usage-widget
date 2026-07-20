"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const Module = require("node:module");
const path = require("node:path");
const {
  resolveNodeBinary,
  assertNotElectronBinary,
  buildEndpoint,
  allocateFreeLoopbackPort,
  ensureUsageServer,
  healthCheck,
} = require("../desktop/server-launch.cjs");

function createFakeChild() {
  const child = new EventEmitter();
  child.killed = false;
  child.kill = () => {
    child.killed = true;
  };
  return child;
}

function createFakeFileSystem() {
  return {
    existsSync: () => true,
    writeFileSync: () => {},
    openSync: () => 9,
    closeSync: () => {},
    appendFileSync: () => {},
    readFileSync: () => "",
  };
}

async function loadMainHarness(serverResult) {
  const mainPath = require.resolve("../desktop/main.cjs");
  const app = new EventEmitter();
  app.isQuitting = false;
  app.requestSingleInstanceLock = () => true;
  app.whenReady = () => Promise.resolve();
  app.quit = () => {};

  const ipcHandlers = new Map();
  const windows = [];
  const trays = [];
  const openedUrls = [];
  const healthCalls = [];

  class FakeBrowserWindow extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.loadedUrl = null;
      windows.push(this);
    }
    setAlwaysOnTop() {}
    setVisibleOnAllWorkspaces() {}
    loadURL(url) {
      this.loadedUrl = url;
    }
    showInactive() {}
    show() {}
    focus() {}
    hide() {}
    isVisible() {
      return false;
    }
  }

  class FakeTray extends EventEmitter {
    constructor() {
      super();
      trays.push(this);
    }
    setToolTip() {}
    setContextMenu(menu) {
      this.menu = menu;
    }
  }

  const electron = {
    app,
    BrowserWindow: FakeBrowserWindow,
    Tray: FakeTray,
    Menu: { buildFromTemplate: (template) => template },
    nativeImage: { createFromDataURL: () => ({}) },
    screen: {
      getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
    },
    shell: {
      openExternal: (url) => {
        openedUrls.push(url);
      },
    },
    ipcMain: {
      handle: (channel, handler) => ipcHandlers.set(channel, handler),
    },
    dialog: { showErrorBox: () => {} },
  };
  const launchModule = {
    DEFAULT_HOST: "127.0.0.1",
    DEFAULT_PORT: 4321,
    SERVER_LOG: "/tmp/server.log",
    ensureUsageServer: async () => serverResult,
    fetchHealth: async (host, port) => {
      healthCalls.push({ host, port });
      return { ok: true, fixture: false };
    },
  };

  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === "electron") return electron;
    if (parent?.filename === mainPath && request === "./server-launch.cjs") return launchModule;
    return originalLoad.call(this, request, parent, isMain);
  };
  delete require.cache[mainPath];
  try {
    require(mainPath);
  } finally {
    Module._load = originalLoad;
    delete require.cache[mainPath];
  }
  await new Promise((resolve) => setImmediate(resolve));

  return { app, ipcHandlers, windows, trays, openedUrls, healthCalls };
}

test("resolveNodeBinary never returns electron.exe", () => {
  const bin = resolveNodeBinary(process.env);
  const base = path.basename(bin).toLowerCase();
  assert.notEqual(base, "electron.exe");
  assert.notEqual(base, "electron");
});

test("resolveNodeBinary prefers NODE_BINARY when it exists", () => {
  const node = resolveNodeBinary(process.env);
  // If we already resolved a real path, re-resolve with NODE_BINARY set to it.
  if (node.toLowerCase().endsWith("node.exe")) {
    const again = resolveNodeBinary({ ...process.env, NODE_BINARY: node });
    assert.equal(again, node);
  } else {
    assert.ok(node === "node" || node.toLowerCase().includes("node"));
  }
});

test("resolveNodeBinary uses injected Darwin filesystem and process inputs", () => {
  const nodeBin = resolveNodeBinary(
    { NODE_BINARY: "/opt/homebrew/bin/node" },
    {
      platform: "darwin",
      fs: { existsSync: (candidate) => candidate === "/opt/homebrew/bin/node" },
      execFileSync: () => assert.fail("Darwin must not invoke where.exe"),
      execPath: "/Applications/Electron.app/Contents/MacOS/Electron",
    },
  );

  assert.equal(nodeBin, "/opt/homebrew/bin/node");
});

test("assertNotElectronBinary throws for electron.exe", () => {
  assert.throws(() => assertNotElectronBinary("C:\\\\fake\\\\electron.exe"), /Refusing/);
  assert.doesNotThrow(() => assertNotElectronBinary("C:\\\\nvm4w\\\\nodejs\\\\node.exe"));
});

test("buildEndpoint derives one base URL from the returned host and port", () => {
  assert.deepEqual(buildEndpoint("127.0.0.1", 6543), {
    host: "127.0.0.1",
    port: 6543,
    baseUrl: "http://127.0.0.1:6543",
  });
});

test("allocateFreeLoopbackPort asks the OS for an ephemeral loopback port", async () => {
  const server = new EventEmitter();
  server.unref = () => {};
  server.listen = (port, host, callback) => {
    assert.equal(port, 0);
    assert.equal(host, "127.0.0.1");
    queueMicrotask(callback);
  };
  server.address = () => ({ address: "127.0.0.1", family: "IPv4", port: 6543 });
  server.close = (callback) => callback();

  const port = await allocateFreeLoopbackPort("127.0.0.1", {
    createServer: () => server,
  });

  assert.equal(port, 6543);
});

test("ensureUsageServer reuses a matching healthy server and returns its endpoint", async () => {
  const result = await ensureUsageServer({
    platform: "darwin",
    host: "127.0.0.1",
    port: 5432,
    logPath: "/tmp/reused-server.log",
    env: { USAGE_FIXTURE: "1" },
    fetchHealth: async () => ({ ok: true, fixture: true }),
  });

  assert.deepEqual(result, {
    proc: null,
    nodeBin: null,
    logPath: "/tmp/reused-server.log",
    reused: true,
    owned: false,
    endpoint: {
      host: "127.0.0.1",
      port: 5432,
      baseUrl: "http://127.0.0.1:5432",
    },
  });
});

test("ensureUsageServer preserves an unknown Darwin listener and starts on a free port", async () => {
  const child = createFakeChild();
  const healthCalls = [];
  let spawned;

  const result = await ensureUsageServer({
    platform: "darwin",
    host: "127.0.0.1",
    port: 4321,
    env: { USAGE_FIXTURE: "1" },
    maxAttempts: 1,
    fetchHealth: async (host, port) => {
      healthCalls.push({ host, port });
      if (healthCalls.length === 1) return null;
      return port === 6543 ? { ok: true, fixture: true } : null;
    },
    isPortAvailable: async () => false,
    allocateFreeLoopbackPort: async () => 6543,
    freePort: () => assert.fail("Darwin must not kill the preferred-port listener"),
    resolveNodeBinary: () => "/usr/bin/node",
    sleep: async () => {},
    fs: createFakeFileSystem(),
    spawn: (nodeBin, args, options) => {
      spawned = { nodeBin, args, options };
      return child;
    },
  });

  assert.equal(result.reused, false);
  assert.equal(result.owned, true);
  assert.equal(result.proc, child);
  assert.deepEqual(result.endpoint, {
    host: "127.0.0.1",
    port: 6543,
    baseUrl: "http://127.0.0.1:6543",
  });
  assert.equal(spawned.options.env.PORT, "6543");
  assert.deepEqual(healthCalls, [
    { host: "127.0.0.1", port: 4321 },
    { host: "127.0.0.1", port: 6543 },
  ]);
});

test("ensureUsageServer preserves a fixture-mismatched Darwin listener", async () => {
  const child = createFakeChild();
  const healthCalls = [];
  const freedPorts = [];

  const result = await ensureUsageServer({
    platform: "darwin",
    host: "127.0.0.1",
    port: 4321,
    env: { USAGE_FIXTURE: "1" },
    maxAttempts: 1,
    fetchHealth: async (host, port) => {
      healthCalls.push({ host, port });
      return healthCalls.length === 1
        ? { ok: true, fixture: false }
        : { ok: true, fixture: true };
    },
    isPortAvailable: () => assert.fail("a healthy mismatch is already known to occupy the port"),
    allocateFreeLoopbackPort: async () => 6544,
    freePort: (port) => freedPorts.push(port),
    resolveNodeBinary: () => "/usr/bin/node",
    sleep: async () => {},
    fs: createFakeFileSystem(),
    spawn: () => child,
  });

  assert.deepEqual(freedPorts, []);
  assert.equal(result.owned, true);
  assert.deepEqual(result.endpoint, {
    host: "127.0.0.1",
    port: 6544,
    baseUrl: "http://127.0.0.1:6544",
  });
  assert.deepEqual(healthCalls, [
    { host: "127.0.0.1", port: 4321 },
    { host: "127.0.0.1", port: 6544 },
  ]);
});

test("ensureUsageServer preserves Windows mode-mismatch replacement on the preferred port", async () => {
  const child = createFakeChild();
  const healthCalls = [];
  const freedPorts = [];
  let spawnedPort;

  const result = await ensureUsageServer({
    platform: "win32",
    host: "127.0.0.1",
    port: 4321,
    env: { USAGE_FIXTURE: "1" },
    maxAttempts: 1,
    fetchHealth: async (host, port) => {
      healthCalls.push({ host, port });
      return healthCalls.length === 1
        ? { ok: true, fixture: false }
        : { ok: true, fixture: true };
    },
    isPortAvailable: () => assert.fail("Windows mode mismatch must retain its existing replacement path"),
    allocateFreeLoopbackPort: () => assert.fail("Windows must retain the configured port"),
    freePort: (port) => freedPorts.push(port),
    resolveNodeBinary: () => "C:\\nvm4w\\nodejs\\node.exe",
    sleep: async () => {},
    fs: createFakeFileSystem(),
    spawn: (_nodeBin, _args, options) => {
      spawnedPort = options.env.PORT;
      return child;
    },
  });

  assert.deepEqual(freedPorts, [4321]);
  assert.equal(spawnedPort, "4321");
  assert.equal(result.owned, true);
  assert.deepEqual(result.endpoint, {
    host: "127.0.0.1",
    port: 4321,
    baseUrl: "http://127.0.0.1:4321",
  });
  assert.deepEqual(healthCalls, [
    { host: "127.0.0.1", port: 4321 },
    { host: "127.0.0.1", port: 4321 },
  ]);
});

test("desktop main ignores second-instance until endpoint startup is ready", async () => {
  let resolveServer;
  const serverResult = new Promise((resolve) => {
    resolveServer = resolve;
  });
  const harness = await loadMainHarness(serverResult);

  assert.doesNotThrow(() => harness.app.emit("second-instance"));
  assert.equal(harness.windows.length, 0);

  resolveServer({
    proc: null,
    nodeBin: null,
    logPath: "/tmp/server.log",
    reused: true,
    owned: false,
    endpoint: {
      host: "127.0.0.1",
      port: 4321,
      baseUrl: "http://127.0.0.1:4321",
    },
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(harness.windows.length, 1);
  assert.equal(harness.windows[0].loadedUrl, "http://127.0.0.1:4321/widget.html");
});

test("desktop main uses one returned endpoint and stops its owned child on quit", async () => {
  const child = createFakeChild();
  const harness = await loadMainHarness({
    proc: child,
    nodeBin: "/usr/bin/node",
    logPath: "/tmp/server.log",
    reused: false,
    owned: true,
    endpoint: {
      host: "127.0.0.1",
      port: 6543,
      baseUrl: "http://127.0.0.1:6543",
    },
  });

  assert.deepEqual(harness.healthCalls, [{ host: "127.0.0.1", port: 6543 }]);
  assert.equal(harness.windows[0].loadedUrl, "http://127.0.0.1:6543/widget.html");

  const dashboardItem = harness.trays[0].menu.find((item) => item.label === "Open full dashboard");
  dashboardItem.click();
  harness.ipcHandlers.get("widget:open-dashboard")();
  assert.deepEqual(harness.openedUrls, [
    "http://127.0.0.1:6543/",
    "http://127.0.0.1:6543/",
  ]);

  harness.app.emit("before-quit");
  assert.equal(child.killed, true);
});

test("desktop main never stops a child it does not own", async () => {
  const child = createFakeChild();
  const harness = await loadMainHarness({
    proc: child,
    nodeBin: "/usr/bin/node",
    logPath: "/tmp/server.log",
    reused: true,
    owned: false,
    endpoint: {
      host: "127.0.0.1",
      port: 4321,
      baseUrl: "http://127.0.0.1:4321",
    },
  });

  harness.app.emit("before-quit");
  assert.equal(child.killed, false);
});

test("ensureUsageServer stops its spawned child when startup readiness fails", async () => {
  const child = createFakeChild();
  let healthChecks = 0;

  await assert.rejects(
    ensureUsageServer({
      platform: "darwin",
      host: "127.0.0.1",
      port: 4321,
      maxAttempts: 1,
      fetchHealth: async () => {
        healthChecks += 1;
        return null;
      },
      isPortAvailable: async () => true,
      resolveNodeBinary: () => "/usr/bin/node",
      sleep: async () => {},
      fs: createFakeFileSystem(),
      spawn: () => child,
    }),
    /did not become ready on http:\/\/127\.0\.0\.1:4321/,
  );

  assert.equal(healthChecks, 2);
  assert.equal(child.killed, true);
});

test("ensureUsageServer starts fixture server with real node (not electron)", async () => {
  const port = 18765;
  // Clean slate: if something is on this port, skip conflict by using unique port.
  assert.equal(await healthCheck("127.0.0.1", port, 500), false);

  const result = await ensureUsageServer({
    host: "127.0.0.1",
    port,
    env: { ...process.env, USAGE_FIXTURE: "1", USAGE_FIXTURE_ALL: "1", PORT: String(port) },
    maxAttempts: 60,
  });

  try {
    assert.equal(result.reused, false);
    assert.ok(result.nodeBin);
    assert.notEqual(path.basename(result.nodeBin).toLowerCase(), "electron.exe");
    assert.equal(await healthCheck("127.0.0.1", port), true);

    const res = await fetch(`http://127.0.0.1:${port}/api/usage`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.fixture, true);
    assert.equal(body.providers.length, 8);
    const ids = body.providers.map((p) => p.provider).sort();
    assert.deepEqual(ids, [
      "claude",
      "cursor",
      "grok",
      "kimi",
      "openai",
      "opencode",
      "openrouter",
      "zai",
    ]);
  } finally {
    if (result.proc && !result.proc.killed) result.proc.kill();
  }
});
