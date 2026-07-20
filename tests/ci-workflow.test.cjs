"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const WORKFLOW_PATH = path.join(ROOT, ".github", "workflows", "verify.yml");
const PACKAGE_PATH = path.join(ROOT, "package.json");

// Expected values are independent literals sourced from the task acceptance
// criteria (not derived from the workflow file under test).
const EXPECTED_RUNNERS = ["windows-latest", "macos-15-intel", "macos-15"];
const EXPECTED_TRIGGERS = ["pull_request", "push"];
const EXPECTED_NODE_MAJOR = 22;
const EXPECTED_CHECKOUT_MAJOR = 6;
const EXPECTED_SETUP_NODE_MAJOR = 6;

function readWorkflow() {
  assert.ok(fs.existsSync(WORKFLOW_PATH), `workflow missing at ${WORKFLOW_PATH}`);
  return fs.readFileSync(WORKFLOW_PATH, "utf8");
}

test("workflow file exists at .github/workflows/verify.yml", () => {
  readWorkflow();
});

test("triggers on pull requests and pushes to master and harness/** branches", () => {
  const y = readWorkflow();
  assert.match(y, /\bon:\s*\n\s*pull_request:/, "on: pull_request trigger missing");
  assert.match(y, /\n\s*push:\s*\n\s*branches:/, "push trigger missing");
  assert.match(y, /-\s*master\b/, "push branch must include master literal");
  assert.match(y, /-\s*'harness\/\*\*'/, "push branch must include 'harness/**' literal");
});

test("matrix runs windows-latest, macos-15-intel, macos-15 with fail-fast false", () => {
  const y = readWorkflow();
  for (const label of EXPECTED_RUNNERS) {
    assert.ok(
      y.includes(`- ${label}`),
      `matrix missing runner label: ${label}`
    );
  }
  assert.match(y, /fail-fast:\s*false/i, "fail-fast must be false");
});

test("matrix has a bounded timeout-minutes", () => {
  const y = readWorkflow();
  assert.match(y, /timeout-minutes:\s*\d+/, "timeout-minutes missing");
  const m = y.match(/timeout-minutes:\s*(\d+)/);
  const minutes = Number(m[1]);
  assert.ok(minutes > 0 && minutes <= 60, `timeout-minutes out of bounds: ${minutes}`);
});

test("uses actions/checkout@v6", () => {
  const y = readWorkflow();
  assert.match(y, /actions\/checkout@v6\b/, "checkout@v6 missing");
});

test("uses actions/setup-node@v6 with node 22 and npm cache", () => {
  const y = readWorkflow();
  assert.match(y, /actions\/setup-node@v6\b/, "setup-node@v6 missing");
  assert.match(y, /node-version:\s*["']?22["']?/, "node-version must be 22");
  assert.match(y, /cache:\s*["']?npm["']?/i, "npm cache missing");
});

test("runs npm ci and the full npm run verify (no weaker per-OS proxy)", () => {
  const y = readWorkflow();
  assert.match(y, /\bnpm ci\b/, "npm ci step missing");
  assert.match(y, /npm run verify\b/, "npm run verify step missing");
  // Reject per-OS weakened proxies: no run-script that bypasses verify.
  assert.doesNotMatch(y, /npm run (typecheck|test)\b(?!.*verify)/, "weakened per-OS run detected");
});

test("contains no secrets, credentials, cookies, or env/config dumps", () => {
  const y = readWorkflow();
  const lower = y.toLowerCase();
  for (const banned of ["secrets.", "cookie", "password", "token_", "${{ secrets", "env:", "printenv", "npm config", "cat ~/.npmrc", "dump"]) {
    assert.ok(!lower.includes(banned), `workflow contains banned token: ${banned}`);
  }
});

test("package.json test wiring includes the ci-workflow test", () => {
  assert.ok(fs.existsSync(PACKAGE_PATH), "package.json missing");
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_PATH, "utf8"));
  const testScript = String(pkg.scripts?.test ?? "");
  assert.ok(
    testScript.includes("tests/ci-workflow.test.cjs"),
    "npm test must include tests/ci-workflow.test.cjs"
  );
});
