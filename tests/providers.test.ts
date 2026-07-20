import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { __test as claudeTest } from "../src/adapters/claude.js";
import {
  fetchCursorUsage,
  readCursorAccessToken,
  resolveCursorStateDbPath,
} from "../src/adapters/cursor.js";
import { __test as kimiTest } from "../src/adapters/kimi.js";
import { __test as zaiTest } from "../src/adapters/zai.js";
import { fetchOpenRouterUsage } from "../src/adapters/openrouter.js";
import type { Config } from "../src/config.js";
import { DEFAULT_ENABLED } from "../src/config.js";

const require = createRequire(import.meta.url);
const { providerLine } = require("../public/widget-compact.js");

function bareConfig(overrides: Partial<Config> = {}): Config {
  return {
    providers: { ...DEFAULT_ENABLED },
    opencode: {
      dbPath: "",
      caps: { five_hour: null, week: null, month: null },
      go: { workspaceId: null, authCookie: null },
    },
    openrouter: { apiKey: null },
    kimi: { apiKey: null },
    zai: { apiKey: null },
    grok: { oauthToken: null },
    claude: { accessToken: null },
    server: { port: 4321, host: "127.0.0.1" },
    ...overrides,
  };
}

async function makeTempDir(t: { after(fn: () => Promise<void>): void }): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "token-usage-providers-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test("Cursor uses the standard macOS state database for normal usage", async (t) => {
  const homeDir = await makeTempDir(t);
  const dbPath = path.join(
    homeDir,
    "Library",
    "Application Support",
    "Cursor",
    "User",
    "globalStorage",
    "state.vscdb",
  );
  await mkdir(path.dirname(dbPath), { recursive: true });
  await writeFile(
    dbPath,
    JSON.stringify({
      "cursorAuth/accessToken": "fixture-cursor-token",
      "cursorAuth/stripeMembershipType": "pro",
    }),
  );

  const sqlitePaths: string[] = [];
  const usage = await fetchCursorUsage({
    platform: "darwin",
    homeDir,
    env: {},
    sqliteGet: async (fixturePath, sql) => {
      sqlitePaths.push(fixturePath);
      const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as Record<string, string>;
      const key = sql.includes("stripeMembershipType")
        ? "cursorAuth/stripeMembershipType"
        : "cursorAuth/accessToken";
      return fixture[key] ?? "";
    },
    fetchImpl: async (_input, init) => {
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer fixture-cursor-token");
      return new Response(
        JSON.stringify({
          billingCycleEnd: "1780000000000",
          planUsage: { totalPercentUsed: 37 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  assert.equal(usage.windows.month.status, "ok");
  assert.equal(usage.windows.month.usedPercent, 37);
  assert.equal(usage.billing?.planLabel, "Included in Pro");
  assert.deepEqual(sqlitePaths, [dbPath, dbPath]);
});

test("Cursor path and token overrides stay ahead of platform defaults", async () => {
  assert.equal(
    resolveCursorStateDbPath({
      platform: "darwin",
      homeDir: "/Users/example",
      env: { CURSOR_STATE_DB: "/override/cursor.sqlite" },
    }),
    "/override/cursor.sqlite",
  );
  assert.equal(
    resolveCursorStateDbPath({ platform: "win32", homeDir: "C:\\Users\\example", env: {} }),
    path.join("C:\\Users\\example", "AppData", "Roaming", "Cursor", "User", "globalStorage", "state.vscdb"),
  );
  assert.equal(
    await readCursorAccessToken({
      platform: "darwin",
      homeDir: "/Users/example",
      env: { CURSOR_TOKEN: "override-token" },
      sqliteGet: async () => {
        throw new Error("sqlite should not run for CURSOR_TOKEN");
      },
    }),
    "override-token",
  );
});

test("claude mapOAuthUsage maps five_hour + seven_day", () => {
  const windows = claudeTest.mapOAuthUsage({
    five_hour: { utilization: 42, resets_at: "2026-07-19T20:00:00.000Z" },
    seven_day: { utilization: 61, resets_at: "2026-07-23T00:00:00.000Z" },
  });
  assert.equal(windows.five_hour.status, "ok");
  assert.equal(windows.five_hour.usedPercent, 42);
  assert.equal(windows.five_hour.remainingPercent, 58);
  assert.equal(windows.week.status, "ok");
  assert.equal(windows.week.usedPercent, 61);
  assert.equal(windows.month.status, "unavailable");
});

test("kimi mapUsages maps session + week array entries", () => {
  const windows = kimiTest.mapUsages({
    data: [
      { name: "5h session", used: 18, limit: 100, resetTime: "2026-07-19T22:00:00.000Z" },
      { name: "week", used: 55, limit: 100 },
    ],
  });
  assert.equal(windows.five_hour.status, "ok");
  assert.equal(windows.five_hour.usedPercent, 18);
  assert.equal(windows.week.status, "ok");
  assert.ok(windows.week.usedPercent !== null);
  assert.ok(Math.abs(windows.week.usedPercent! - 55) < 0.01);
});

test("zai mapQuota maps session + week limits", () => {
  const windows = zaiTest.mapQuota({
    limits: [
      { type: "session", percentage: 27, nextResetTime: 1780000000000 },
      { type: "week", percentage: 70 },
    ],
  });
  assert.equal(windows.five_hour.status, "ok");
  assert.equal(windows.five_hour.usedPercent, 27);
  assert.equal(windows.week.status, "ok");
  assert.equal(windows.week.usedPercent, 70);
});

test("openrouter missing key returns unavailable", async () => {
  const usage = await fetchOpenRouterUsage(bareConfig());
  assert.equal(usage.provider, "openrouter");
  assert.ok(usage.error);
  assert.equal(usage.windows.five_hour.status, "unavailable");
  assert.equal(usage.balance, undefined);
});

test("widget-compact openrouter shows $ left from balance.remaining", () => {
  const line = providerLine({
    provider: "openrouter",
    balance: { currency: "USD", remaining: 12.34 },
  });
  assert.equal(line, "openrouter: $12.34 left");
});

test("widget-compact claude shows used% windows", () => {
  const line = providerLine({
    provider: "claude",
    windows: {
      five_hour: { status: "ok", usedPercent: 42 },
      week: { status: "ok", usedPercent: 61 },
      month: { status: "unavailable", usedPercent: null },
    },
  });
  assert.equal(line, "claude: 5h 42%, Week 61%");
});
