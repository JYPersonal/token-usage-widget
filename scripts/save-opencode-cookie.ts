#!/usr/bin/env node
/**
 * Save OpenCode Go auth cookie into config.json (gitignored).
 * Usage (PowerShell):
 *   $env:OPENCODE_GO_AUTH_COOKIE = 'Fe26.2**...'
 *   node --import tsx scripts/save-opencode-cookie.ts
 * Or pipe:
 *   Get-Clipboard | node --import tsx scripts/save-opencode-cookie.ts
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stdin as input } from "node:process";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = path.join(ROOT, "config.json");
const EXAMPLE = path.join(ROOT, "config.example.json");

async function readStdin(): Promise<string> {
  if (input.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const c of input) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function main(): Promise<void> {
  let cookie =
    process.env.OPENCODE_GO_AUTH_COOKIE?.trim() ||
    process.argv[2]?.trim() ||
    (await readStdin());
  // strip wrapping quotes / Cookie: auth= prefix
  cookie = cookie.replace(/^['"]|['"]$/g, "").trim();
  if (cookie.toLowerCase().startsWith("auth=")) cookie = cookie.slice(5).trim();
  if (!cookie || cookie.length < 20) {
    console.error(
      "No cookie provided. Copy the `auth` cookie value from https://opencode.ai (DevTools → Application → Cookies),\n" +
        "then:  $env:OPENCODE_GO_AUTH_COOKIE='…'; node --import tsx scripts/save-opencode-cookie.ts",
    );
    process.exit(2);
  }

  const base = existsSync(CONFIG)
    ? JSON.parse(readFileSync(CONFIG, "utf8"))
    : JSON.parse(readFileSync(EXAMPLE, "utf8"));
  base.opencode = base.opencode || {};
  base.opencode.go = base.opencode.go || {};
  base.opencode.go.authCookie = cookie;
  if (!base.opencode.go.workspaceId) {
    base.opencode.go.workspaceId = "wrk_01KQ7YBQFHJ41HHM6NCN116F9Y";
  }
  writeFileSync(CONFIG, JSON.stringify(base, null, 2) + "\n", "utf8");
  console.log(`Saved auth cookie (len=${cookie.length}) to config.json. Restart the widget.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
