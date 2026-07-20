import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { runSetup, type SetupDeps } from "../src/cli/setup.js";

/**
 * Behavior tests for the macOS login-launch integration in setup.
 *
 * Seams under test:
 *   - runSetup(args, deps) routes to injected runInteractive / runDefaults.
 *   - On darwin, after the selected setup op resolves, installLoginLaunch is
 *     called exactly once with the default seam builder's seams.
 *   - Pre-save setup rejection propagates and registration is never called.
 *   - Post-save registration rejection surfaces an actionable error containing
 *     "startup was not enabled" and "npm run widget:startup"; config is not
 *     rolled back (the setup op's writes are preserved).
 *   - win32 skips automatic registration entirely.
 *
 * No real filesystem, readline, LaunchAgent, or credentials are touched.
 */

let savedPlatform: string | undefined;
const PLATFORM_BACKUP = Object.getOwnPropertyDescriptor(process, "platform");

function setPlatform(p: string): void {
  Object.defineProperty(process, "platform", { value: p, configurable: true });
}
function restorePlatform(): void {
  if (PLATFORM_BACKUP) Object.defineProperty(process, "platform", PLATFORM_BACKUP);
  else if (savedPlatform) Object.defineProperty(process, "platform", { value: savedPlatform, configurable: true });
}

function makeDeps(overrides: Partial<SetupDeps> = {}): SetupDeps {
  return {
    runInteractive: async () => {},
    runDefaults: async () => {},
    installLoginLaunch: async () => ({ kind: "installed" as const }),
    buildSeams: () => ({
      platform: "darwin",
      homeDir: "/tmp/fake-home",
      checkout: "/tmp/fake-checkout",
      nodeBin: "/usr/bin/node",
      launcher: "/tmp/fake-checkout/scripts/start-widget.cjs",
      logDir: "/tmp/fake-home/Library/Logs/token-usage-dashboard",
      uid: 501,
      fs: {
        existsSync: () => false,
        mkdirSync: () => {},
        readFileSync: () => Buffer.from(""),
        writeFileSync: () => {},
        renameSync: () => {},
        unlinkSync: () => {},
        rmSync: () => {},
      },
      execFile: (_cmd, _args, cb) => cb(null, "", ""),
    }),
    ...overrides,
  };
}

test("darwin interactive setup calls installLoginLaunch exactly once after setup resolves", async () => {
  setPlatform("darwin");
  try {
    const calls: string[] = [];
    const deps = makeDeps({
      runInteractive: async () => { calls.push("setup"); },
      runDefaults: async () => { calls.push("setup"); },
      installLoginLaunch: async () => { calls.push("register"); return { kind: "installed" }; },
    });
    await runSetup([], deps);
    assert.deepEqual(calls, ["setup", "register"]);
  } finally {
    restorePlatform();
  }
});

test("darwin --defaults calls runDefaults (not all) then registers once", async () => {
  setPlatform("darwin");
  try {
    const calls: string[] = [];
    const deps = makeDeps({
      runInteractive: async () => { calls.push("interactive"); },
      runDefaults: async () => { calls.push("defaults"); },
      installLoginLaunch: async () => { calls.push("register"); return { kind: "installed" }; },
    });
    await runSetup(["--defaults"], deps);
    assert.deepEqual(calls, ["defaults", "register"]);
  } finally {
    restorePlatform();
  }
});

test("darwin --defaults --all calls runDefaults(true) then registers once", async () => {
  setPlatform("darwin");
  try {
    const seen: { all: boolean | undefined } = { all: undefined };
    const deps = makeDeps({
      runDefaults: async (all) => { seen.all = all; },
      installLoginLaunch: async () => ({ kind: "installed" }),
    });
    await runSetup(["--defaults", "--all"], deps);
    assert.equal(seen.all, true);
  } finally {
    restorePlatform();
  }
});

test("repeated setup calls installLoginLaunch each time (refresh)", async () => {
  setPlatform("darwin");
  try {
    let count = 0;
    const deps = makeDeps({
      installLoginLaunch: async () => { count++; return { kind: count === 1 ? "installed" : "refreshed" }; },
    });
    await runSetup(["--defaults"], deps);
    await runSetup(["--defaults"], deps);
    await runSetup(["--defaults"], deps);
    assert.equal(count, 3);
  } finally {
    restorePlatform();
  }
});

test("pre-save setup rejection propagates and registration is never called", async () => {
  setPlatform("darwin");
  try {
    let registered = false;
    const deps = makeDeps({
      runInteractive: async () => { throw new Error("config save failed"); },
      installLoginLaunch: async () => { registered = true; return { kind: "installed" }; },
    });
    await assert.rejects(() => runSetup([], deps), /config save failed/);
    assert.equal(registered, false);
  } finally {
    restorePlatform();
  }
});

test("post-save registration rejection throws actionable error with retry command and preserves config", async () => {
  setPlatform("darwin");
  try {
    let configWrites = 0;
    const deps = makeDeps({
      runInteractive: async () => { configWrites++; },
      installLoginLaunch: async () => { throw new Error("launchctl failed"); },
    });
    const err = await assert.rejects(
      () => runSetup([], deps),
      (e: Error) => /startup was not enabled/.test(e.message) && /npm run widget:startup/.test(e.message),
    );
    // Config was written by the setup op; registration failure must not roll it back.
    assert.equal(configWrites, 1);
    void err;
  } finally {
    restorePlatform();
  }
});

test("invalid --all without --defaults exits nonzero without registering", async () => {
  setPlatform("darwin");
  try {
    let registered = false;
    const deps = makeDeps({
      installLoginLaunch: async () => { registered = true; return { kind: "installed" }; },
    });
    await assert.rejects(() => runSetup(["--all"], deps), /--all is only valid with --defaults/);
    assert.equal(registered, false);
  } finally {
    restorePlatform();
  }
});

test("win32 skips automatic login registration but still runs setup", async () => {
  setPlatform("win32");
  try {
    const calls: string[] = [];
    const deps = makeDeps({
      runInteractive: async () => { calls.push("interactive"); },
      installLoginLaunch: async () => { calls.push("register"); return { kind: "installed" }; },
    });
    await runSetup([], deps);
    assert.deepEqual(calls, ["interactive"]);
  } finally {
    restorePlatform();
  }
});

test("win32 --defaults --all still works without registration", async () => {
  setPlatform("win32");
  try {
    const calls: string[] = [];
    const deps = makeDeps({
      runDefaults: async () => { calls.push("defaults"); },
      installLoginLaunch: async () => { calls.push("register"); return { kind: "installed" }; },
    });
    await runSetup(["--defaults", "--all"], deps);
    assert.deepEqual(calls, ["defaults"]);
  } finally {
    restorePlatform();
  }
});

test("registration uses seams from the injected buildSeams (current checkout)", async () => {
  setPlatform("darwin");
  try {
    let seenSeamsCheckout: string | undefined;
    const deps = makeDeps({
      buildSeams: () => ({
        platform: "darwin",
        homeDir: "/tmp/fake-home",
        checkout: "/tmp/specific-checkout",
        nodeBin: "/usr/bin/node",
        launcher: "/tmp/specific-checkout/scripts/start-widget.cjs",
        logDir: "/tmp/fake-home/Library/Logs/token-usage-dashboard",
        uid: 501,
        fs: {
          existsSync: () => false,
          mkdirSync: () => {},
          readFileSync: () => Buffer.from(""),
          writeFileSync: () => {},
          renameSync: () => {},
          unlinkSync: () => {},
          rmSync: () => {},
        },
        execFile: (_cmd, _args, cb) => cb(null, "", ""),
      }),
      installLoginLaunch: async (seams) => {
        seenSeamsCheckout = seams.checkout;
        return { kind: "installed" };
      },
    });
    await runSetup(["--defaults"], deps);
    assert.equal(seenSeamsCheckout, "/tmp/specific-checkout");
  } finally {
    restorePlatform();
  }
});
