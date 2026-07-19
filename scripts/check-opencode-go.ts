#!/usr/bin/env node
/**
 * One-shot helper: verify OpenCode Go dashboard scrape credentials.
 * Usage:
 *   set OPENCODE_GO_AUTH_COOKIE=Fe26.2**...
 *   node --import tsx scripts/check-opencode-go.ts
 */
import { loadConfig } from "../src/config.js";
import {
  resolveWorkspaceId,
  resolveAuthCookie,
  scrapeGoDashboard,
  fetchGoUsageApi,
} from "../src/adapters/opencode.js";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

async function main(): Promise<void> {
  const cfg = await loadConfig();
  const workspaceId = await resolveWorkspaceId(cfg);
  const authCookie = await resolveAuthCookie(cfg);
  console.log("workspaceId:", workspaceId ?? "(missing)");
  console.log("authCookie:", authCookie ? `(len ${authCookie.length})` : "(missing)");

  const authPath = path.join(os.homedir(), ".local", "share", "opencode", "auth.json");
  if (existsSync(authPath)) {
    const auth = JSON.parse(readFileSync(authPath, "utf8")) as {
      "opencode-go"?: { key?: string };
    };
    const key = auth["opencode-go"]?.key;
    if (key) {
      const api = await fetchGoUsageApi(key);
      console.log("api /zen/go/v1/usage:", api ? "ok" : "unavailable/404");
    }
  }

  if (!workspaceId || !authCookie) {
    console.log(
      "\nTo align with the Go UI: copy the `auth` cookie from https://opencode.ai (DevTools → Application → Cookies) into config.json opencode.go.authCookie or OPENCODE_GO_AUTH_COOKIE.",
    );
    process.exit(2);
  }

  const snap = await scrapeGoDashboard(workspaceId, authCookie);
  if (!snap) {
    console.log("scrape: parse failed");
    process.exit(1);
  }
  console.log("scrape ok:", {
    rolling: snap.rolling,
    weekly: snap.weekly,
    monthly: snap.monthly,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
