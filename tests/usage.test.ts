import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFixtureResponse } from "../src/fixtures.js";
import { __test as openaiTest } from "../src/adapters/openai.js";
import { __test as opencodeTest } from "../src/adapters/opencode.js";
import type { WindowId, WindowUsage } from "../src/types.js";

const { classifyDuration, mapWindows, windowFromRateLimit, pickRateLimits } = openaiTest;
const { extractTokens, toMs, tokenWindow } = opencodeTest;

const WINDOW_IDS: WindowId[] = ["five_hour", "week", "month"];

test("classifyDuration maps ~300→five_hour, ~10080→week, ~43200→month", () => {
  assert.equal(classifyDuration(300), "five_hour");
  assert.equal(classifyDuration(305), "five_hour");
  assert.equal(classifyDuration(10080), "week");
  assert.equal(classifyDuration(10000), "week");
  assert.equal(classifyDuration(43200), "month");
  assert.equal(classifyDuration(45000), "month");
});

test("classifyDuration rejects wildly off durations", () => {
  assert.equal(classifyDuration(1), null);
  assert.equal(classifyDuration(99999), null);
  assert.equal(classifyDuration(undefined), null);
});

test("windowFromRateLimit computes remainingPercent = 100 - used", () => {
  const w = windowFromRateLimit({ usedPercent: 34, windowDurationMins: 10080, resetsAtIso: "2026-01-01T00:00:00.000Z" });
  assert.equal(w.status, "ok");
  assert.equal(w.usedPercent, 34);
  assert.equal(w.remainingPercent, 66);
  assert.equal(w.resetsAtIso, "2026-01-01T00:00:00.000Z");
});

test("windowFromRateLimit handles resetsAt unix seconds", () => {
  const w = windowFromRateLimit({ usedPercent: 10, windowDurationMins: 300, resetsAt: 1780000000 });
  assert.equal(w.status, "ok");
  assert.equal(w.remainingPercent, 90);
  assert.equal(w.resetsAtIso, new Date(1780000000 * 1000).toISOString());
});

test("mapWindows marks missing windows unavailable when only weekly reported", () => {
  const limits = {
    primary: { usedPercent: 23, windowDurationMins: 10080, resetsAtIso: "2026-01-01T00:00:00.000Z" },
    secondary: null,
  limitId: "codex",
  limitName: null,
    credits: null,
    planType: "plus",
    rateLimitReachedType: null,
  };
  const windows = mapWindows(limits);
  assert.equal(windows.week.status, "ok");
  assert.equal(windows.week.usedPercent, 23);
  assert.equal(windows.five_hour.status, "unavailable");
  assert.equal(windows.month.status, "unavailable");
  assert.ok(windows.five_hour.reason);
  assert.ok(windows.month.reason);
});

test("mapWindows maps both primary (5h) and secondary (7d) when present", () => {
  const limits = {
    primary: { usedPercent: 45, windowDurationMins: 300 },
    secondary: { usedPercent: 12, windowDurationMins: 10080 },
    limitId: "codex",
    limitName: null,
    credits: null,
    planType: "plus",
    rateLimitReachedType: null,
  };
  const windows = mapWindows(limits);
  assert.equal(windows.five_hour.status, "ok");
  assert.equal(windows.five_hour.usedPercent, 45);
  assert.equal(windows.week.status, "ok");
  assert.equal(windows.week.usedPercent, 12);
  assert.equal(windows.month.status, "unavailable");
});

test("mapWindows returns all-unavailable when limits null", () => {
  const windows = mapWindows(null);
  assert.equal(windows.five_hour.status, "unavailable");
  assert.equal(windows.week.status, "unavailable");
  assert.equal(windows.month.status, "unavailable");
});

test("pickRateLimits prefers codex limitId over spark", () => {
  const result = {
    source: "codex app-server account/rateLimits/read" as const,
    account: null,
    requiresOpenaiAuth: true,
    rateLimits: { limitId: "spark", primary: { usedPercent: 1, windowDurationMins: 300 }, secondary: null },
    rateLimitsByLimitId: {
      spark: { limitId: "spark", primary: { usedPercent: 1, windowDurationMins: 300 }, secondary: null },
      codex: { limitId: "codex", primary: { usedPercent: 50, windowDurationMins: 300 }, secondary: { usedPercent: 5, windowDurationMins: 10080 } },
    },
  };
  const picked = pickRateLimits(result);
  assert.equal(picked?.limitId, "codex");
  assert.equal(picked?.primary?.usedPercent, 50);
});

test("pickRateLimits falls back to top-level rateLimits when no codex key", () => {
  const result = {
    source: "codex app-server account/rateLimits/read" as const,
    account: null,
    requiresOpenaiAuth: true,
    rateLimits: { limitId: "codex", primary: { usedPercent: 7, windowDurationMins: 10080 }, secondary: null },
    rateLimitsByLimitId: {},
  };
  const picked = pickRateLimits(result);
  assert.equal(picked?.limitId, "codex");
  assert.equal(picked?.primary?.usedPercent, 7);
});

test("fixture response shape: both providers, three windows each, fixture flag true", () => {
  const resp = buildFixtureResponse();
  assert.equal(resp.fixture, true);
  assert.equal(resp.providers.length, 2);
  const ids = resp.providers.map((p) => p.provider).sort();
  assert.deepEqual(ids, ["openai", "opencode"]);
  for (const p of resp.providers) {
    assert.ok(p.fetchedAt);
    assert.equal(Object.keys(p.windows).length, 3);
    for (const winId of WINDOW_IDS) {
      const w = p.windows[winId];
      assert.ok(["ok", "unavailable", "error"].includes(w.status), `${p.provider}/${winId} status`);
    }
  }
});

test("fixture OpenAI weekly window is ok with remainingPercent = 100 - used", () => {
  const resp = buildFixtureResponse();
  const openai = resp.providers.find((p) => p.provider === "openai");
  if (!openai) throw new Error("openai provider missing from fixture");
  assert.equal(openai.windows.five_hour.status, "unavailable");
  assert.equal(openai.windows.month.status, "unavailable");
  assert.equal(openai.windows.week.status, "ok");
  const w = openai.windows.week;
  assert.equal(w.remainingPercent, Math.max(0, 100 - w.usedPercent!));
});

test("fixture OpenCode windows report usedTokens and remainingPercent when capped", () => {
  const resp = buildFixtureResponse();
  const oc = resp.providers.find((p) => p.provider === "opencode");
  if (!oc) throw new Error("opencode provider missing from fixture");
  for (const winId of WINDOW_IDS) {
    const w: WindowUsage = oc.windows[winId];
    assert.equal(w.status, "ok");
    assert.ok(w.usedTokens !== null && w.usedTokens !== undefined);
    assert.ok(w.remainingPercent !== null && w.remainingPercent !== undefined);
    assert.equal(w.remainingPercent, Math.max(0, 100 - w.usedPercent!));
  }
});

test("extractTokens prefers explicit total, else sums nested parts", () => {
  assert.equal(extractTokens('{"tokens":{"total":1234}}')?.total, 1234);
  const summed = extractTokens('{"tokens":{"input":100,"output":20,"reasoning":5,"cache":{"read":10,"write":3}}}');
  assert.equal(summed?.total, 138);
  assert.equal(extractTokens('{"tokens":{"input":1}}')?.total, 1);
  assert.equal(extractTokens('not json'), null);
  assert.equal(extractTokens('{"nope":1}'), null);
});

test("toMs auto-detects seconds vs milliseconds", () => {
  const sec = 1780000000; // seconds, ~2026
  const ms = 1780000000_000; // ms, ~2026
  assert.ok(Math.abs(toMs(sec) - toMs(ms)) < 1);
  assert.equal(toMs(sec), sec * 1000);
  assert.equal(toMs(ms), ms);
});

test("OpenCode tokenWindow: remainingPercent null when no cap, usedTokens still shown", () => {
  const w = tokenWindow(5_000_000, null);
  assert.equal(w.status, "ok");
  assert.equal(w.usedPercent, null);
  assert.equal(w.remainingPercent, null);
  assert.equal(w.usedTokens, 5_000_000);
});

test("OpenCode tokenWindow: clamps to 100 and computes remaining when capped", () => {
  const w = tokenWindow(2_000_000, 1_000_000);
  assert.equal(w.status, "ok");
  assert.equal(w.usedPercent, 100);
  assert.equal(w.remainingPercent, 0);
  assert.equal(w.usedTokens, 2_000_000);
});
