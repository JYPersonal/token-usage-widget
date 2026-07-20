"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function requirePath(fileSystem, filePath, label, remedy) {
  if (!fileSystem.existsSync(filePath)) {
    const nextStep = remedy ? `. ${remedy}` : "";
    throw new Error(`${label} not found at ${filePath}${nextStep}`);
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
  requirePath(
    fileSystem,
    path.join(checkoutPath, "package.json"),
    "Invalid widget checkout: package.json",
  );
  requirePath(fileSystem, nodeExecPath, "Current Node executable");

  const electronRoot = path.join(checkoutPath, "node_modules", "electron");
  const installElectron = `Run npm install in ${checkoutPath} first.`;
  requirePath(
    fileSystem,
    path.join(electronRoot, "package.json"),
    "Local Electron dependency",
    installElectron,
  );
  const electronPathFile = path.join(electronRoot, "path.txt");
  requirePath(fileSystem, electronPathFile, "Local Electron path metadata", installElectron);
  const electronRelativePath = String(fileSystem.readFileSync(electronPathFile, "utf8")).trim();
  if (!electronRelativePath) {
    throw new Error(`Local Electron path metadata is empty at ${electronPathFile}`);
  }
  const electronExecutable = path.resolve(electronRoot, "dist", electronRelativePath);
  requirePath(fileSystem, electronExecutable, "Local Electron executable", installElectron);

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

function spawnError(plan, error) {
  return new Error(`Failed to spawn widget from ${plan.command}: ${error.message}`, { cause: error });
}

function spawnLaunchPlan(plan, { spawn = childProcess.spawn } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(plan.command, plan.args, plan.options);
    } catch (error) {
      reject(spawnError(plan, error));
      return;
    }

    const onError = (error) => {
      child.removeListener("spawn", onSpawn);
      try {
        child.kill?.();
      } catch {
        // The failed child may never have reached an OS process.
      }
      reject(spawnError(plan, error));
    };
    const onSpawn = () => {
      child.removeListener("error", onError);
      if (plan.options.detached) {
        child.unref();
      }
      resolve(child);
    };

    child.once("error", onError);
    child.once("spawn", onSpawn);
  });
}

module.exports = { resolveLaunchPlan, spawnLaunchPlan };
