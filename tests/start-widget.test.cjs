"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { resolveLaunchPlan } = require("../scripts/start-widget.cjs");

function createFileSystem(files) {
  const contents = new Map(Object.entries(files));
  return {
    existsSync(filePath) {
      return contents.has(filePath);
    },
    readFileSync(filePath) {
      if (!contents.has(filePath)) {
        throw new Error(`Unexpected read: ${filePath}`);
      }
      return contents.get(filePath);
    },
  };
}

test("Darwin launch planning uses checkout-local Electron and the current Node on Intel and Apple Silicon", () => {
  const checkout = "/workspace/token-usage-dashboard";
  const electronRoot = path.join(checkout, "node_modules", "electron");
  const electronRelativePath = "Electron.app/Contents/MacOS/Electron";
  const electronExecutable = path.join(electronRoot, "dist", electronRelativePath);
  const nodeExecPath = "/opt/current-node/bin/node";
  const fileSystem = createFileSystem({
    [path.join(checkout, "package.json")]: "{}",
    [path.join(electronRoot, "package.json")]: "{}",
    [path.join(electronRoot, "path.txt")]: `${electronRelativePath}\n`,
    [electronExecutable]: "",
    [nodeExecPath]: "",
  });
  const inputs = {
    platform: "darwin",
    checkout,
    nodeExecPath,
    env: { PATH: "/usr/bin", USAGE_FIXTURE: "1" },
    fs: fileSystem,
  };

  const intelPlan = resolveLaunchPlan({ ...inputs, arch: "x64" });
  const appleSiliconPlan = resolveLaunchPlan({ ...inputs, arch: "arm64" });

  assert.deepEqual(appleSiliconPlan, intelPlan);
  assert.equal(intelPlan.command, electronExecutable);
  assert.deepEqual(intelPlan.args, [checkout]);
  assert.equal(intelPlan.options.cwd, checkout);
  assert.equal(intelPlan.options.detached, true);
  assert.equal(intelPlan.options.stdio, "ignore");
  assert.equal(intelPlan.options.env.NODE_BINARY, nodeExecPath);
  assert.equal(intelPlan.options.env.PATH, "/usr/bin");
  assert.equal("USAGE_FIXTURE" in intelPlan.options.env, false);
});
