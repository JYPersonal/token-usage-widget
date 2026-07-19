"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  resolveNodeBinary,
  assertNotElectronBinary,
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

test("ensureUsageServer starts fixture server with real node (not electron)", async () => {
  const port = 18765;
  // Clean slate: if something is on this port, skip conflict by using unique port.
  assert.equal(await healthCheck("127.0.0.1", port, 500), false);

  const result = await ensureUsageServer({
    host: "127.0.0.1",
    port,
    env: { ...process.env, USAGE_FIXTURE: "1", PORT: String(port) },
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
