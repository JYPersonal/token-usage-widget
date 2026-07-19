const { test } = require("node:test");
const assert = require("node:assert/strict");
const { providerLine } = require("../public/widget-compact.js");

test("codex compact line uses remaining % (matches Codex Analytics)", () => {
  const line = providerLine({
    provider: "openai",
    windows: {
      five_hour: { status: "unavailable", usedPercent: null, remainingPercent: null },
      week: { status: "ok", usedPercent: 47, remainingPercent: 53 },
      month: { status: "unavailable", usedPercent: null, remainingPercent: null },
    },
  });
  assert.equal(line, "codex: 5h NA, Week 53%");
});

test("cursor compact line matches dense format", () => {
  const line = providerLine({
    provider: "cursor",
    billing: {
      totalPercentUsed: 23,
      autoPercentUsed: 13,
      apiPercentUsed: 99,
    },
  });
  assert.equal(line, "cursor: total 23% first party 13% API 99%");
});

test("opencode compact includes rolling/week/month when ok", () => {
  const line = providerLine({
    provider: "opencode",
    windows: {
      five_hour: { status: "ok", usedPercent: 0 },
      week: { status: "ok", usedPercent: 100 },
      month: { status: "ok", usedPercent: 50 },
    },
  });
  assert.equal(line, "opencode: rolling 0%, week 100%, month 50%");
});

test("opencode missing-auth shows NA lines not blunt error", () => {
  const line = providerLine({
    provider: "opencode",
    error: "Set auth cookie (OPENCODE_GO_AUTH_COOKIE) to load live OpenCode Go meters.",
    windows: {
      five_hour: { status: "unavailable", usedPercent: null },
      week: { status: "unavailable", usedPercent: null },
      month: { status: "unavailable", usedPercent: null },
    },
  });
  assert.equal(line, "opencode: rolling NA, week NA");
});

test("openrouter compact shows dollar balance remaining", () => {
  const line = providerLine({
    provider: "openrouter",
    balance: { currency: "USD", remaining: 12.34 },
  });
  assert.equal(line, "openrouter: $12.34 left");
});

test("claude compact shows used percent windows", () => {
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
