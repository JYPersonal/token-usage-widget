"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const path = require("node:path");
const {
  resolveNodeBinary,
  assertNotElectronBinary,
  allocateFreeLoopbackPort,
  ensureUsageServer,
  healthCheck,
} = require("../desktop/server-launch.cjs");

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

test("assertNotElectronBinary throws for electron.exe", () => {
  assert.throws(() => assertNotElectronBinary("C:\\\\fake\\\\electron.exe"), /Refusing/);
  assert.doesNotThrow(() => assertNotElectronBinary("C:\\\\nvm4w\\\\nodejs\\\\node.exe"));
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
    env: { USAGE_FIXTURE: "1" },
    fetchHealth: async () => ({ ok: true, fixture: true }),
  });

  assert.deepEqual(result, {
    proc: null,
    nodeBin: null,
    logPath: result.logPath,
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
  const child = new EventEmitter();
  child.killed = false;
  child.kill = () => {
    child.killed = true;
  };
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
    fs: {
      existsSync: () => true,
      writeFileSync: () => {},
      openSync: () => 9,
      closeSync: () => {},
      appendFileSync: () => {},
      readFileSync: () => "",
    },
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
