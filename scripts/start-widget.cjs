"use strict";

const fs = require("node:fs");
const path = require("node:path");

function requirePath(fileSystem, filePath, label) {
  if (!fileSystem.existsSync(filePath)) {
    throw new Error(`${label} not found at ${filePath}`);
  }
}

function resolveLaunchPlan({
  platform = process.platform,
  checkout = path.resolve(__dirname, ".."),
  nodeExecPath = process.execPath,
  env = process.env,
  fs: fileSystem = fs,
} = {}) {
  if (platform !== "darwin") {
    throw new Error(`Unsupported widget launch platform: ${platform}`);
  }

  const checkoutPath = path.resolve(checkout);
  requirePath(fileSystem, path.join(checkoutPath, "package.json"), "Checkout package.json");
  requirePath(fileSystem, nodeExecPath, "Current Node executable");

  const electronRoot = path.join(checkoutPath, "node_modules", "electron");
  requirePath(fileSystem, path.join(electronRoot, "package.json"), "Local Electron dependency");
  const electronPathFile = path.join(electronRoot, "path.txt");
  requirePath(fileSystem, electronPathFile, "Local Electron path metadata");
  const electronRelativePath = String(fileSystem.readFileSync(electronPathFile, "utf8")).trim();
  if (!electronRelativePath) {
    throw new Error(`Local Electron path metadata is empty at ${electronPathFile}`);
  }
  const electronExecutable = path.resolve(electronRoot, "dist", electronRelativePath);
  requirePath(fileSystem, electronExecutable, "Local Electron executable");

  const launchEnv = { ...env, NODE_BINARY: nodeExecPath };
  delete launchEnv.USAGE_FIXTURE;

  return {
    platform,
    command: electronExecutable,
    args: [checkoutPath],
    options: {
      cwd: checkoutPath,
      env: launchEnv,
      detached: true,
      stdio: "ignore",
    },
  };
}

module.exports = { resolveLaunchPlan };
