import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Config } from "../config.js";
import type { ProviderUsage, WindowId, WindowUsage } from "../types.js";

const execFileAsync = promisify(execFile);

const WINDOW_MS: Record<WindowId, number> = {
  five_hour: 5 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

interface MessageRow {
  time_created: number;
  data: string;
}

interface ParsedTokens {
  total: number;
}

function toMs(ts: number): number {
  // Auto-detect seconds vs milliseconds. 1e11 ms ≈ year 5136, so anything
  // larger than that is milliseconds; anything smaller is seconds.
  if (ts > 1e11) return ts;
  return ts * 1000;
}

function extractTokens(data: string): ParsedTokens | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const tokens = obj.tokens as Record<string, unknown> | undefined;
  if (!tokens || typeof tokens !== "object") return null;

  // Prefer explicit total if present and finite
  const explicitTotal = tokens.total;
  if (typeof explicitTotal === "number" && Number.isFinite(explicitTotal)) {
    return { total: explicitTotal };
  }

  // Otherwise sum the parts: input + output + reasoning + cache.read + cache.write
  const readNum = (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) ? v : 0;
  const cache = (tokens.cache as Record<string, unknown> | undefined) ?? {};
  const total =
    readNum(tokens.input) +
    readNum(tokens.output) +
    readNum(tokens.reasoning) +
    readNum(cache.read) +
    readNum(cache.write);
  return { total };
}

function rowTimestamp(row: MessageRow): number | null {
  const col = typeof row.time_created === "number" ? row.time_created : null;
  if (col !== null && col > 0) return toMs(col);
  // Fallback: parse time.created from the JSON payload
  try {
    const obj = JSON.parse(row.data) as Record<string, unknown>;
    const time = obj.time as Record<string, unknown> | undefined;
    const created = time?.created;
    if (typeof created === "number" && created > 0) return toMs(created);
  } catch {
    // ignore
  }
  return null;
}

function unavailable(reason: string): WindowUsage {
  return {
    usedPercent: null,
    remainingPercent: null,
    status: "unavailable",
    reason,
  };
}

function tokenWindow(usedTokens: number, cap: number | null): WindowUsage {
  if (cap && cap > 0) {
    const usedPercent = Math.min(100, (usedTokens / cap) * 100);
    return {
      usedPercent,
      remainingPercent: Math.max(0, 100 - usedPercent),
      usedTokens,
      status: "ok",
    };
  }
  return {
    usedPercent: null,
    remainingPercent: null,
    usedTokens,
    status: "ok",
  };
}

async function queryMessages(dbPath: string): Promise<MessageRow[]> {
  if (!existsSync(dbPath)) {
    throw new Error(`OpenCode database not found at ${dbPath}`);
  }
  // Pull every message; window bucketing happens in JS so we only hit the DB once.
  const sql = "SELECT time_created, data FROM message;";
  let stdout: string;
  try {
    const res = await execFileAsync("sqlite3", [dbPath, sql, "-json"], {
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
    stdout = res.stdout;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not recognized|command not found|ENOENT/i.test(msg)) {
      throw new Error(
        "sqlite3 executable not found on PATH. Install sqlite3 (e.g. `winget install SQLite.SQLite` or scoop install sqlite) and retry.",
      );
    }
    throw new Error(`sqlite3 query failed: ${msg}`);
  }
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  let rows: MessageRow[];
  try {
    rows = JSON.parse(trimmed) as MessageRow[];
  } catch {
    throw new Error("sqlite3 returned non-JSON output; cannot parse message rows.");
  }
  if (!Array.isArray(rows)) return [];
  return rows;
}

export async function fetchOpenCodeUsage(cfg: Config): Promise<ProviderUsage> {
  const windows: Record<WindowId, WindowUsage> = {
    five_hour: unavailable("No data."),
    week: unavailable("No data."),
    month: unavailable("No data."),
  };

  let rows: MessageRow[];
  try {
    rows = await queryMessages(cfg.opencode.dbPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const errWindows: Record<WindowId, WindowUsage> = {
      five_hour: unavailable(msg),
      week: unavailable(msg),
      month: unavailable(msg),
    };
    return {
      provider: "opencode",
      label: "OpenCode",
      windows: errWindows,
      fetchedAt: new Date().toISOString(),
      error: msg,
    };
  }

  const now = Date.now();
  const sums: Record<WindowId, number> = { five_hour: 0, week: 0, month: 0 };

  for (const row of rows) {
    const ts = rowTimestamp(row);
    if (ts === null) continue;
    const parsed = extractTokens(row.data);
    if (!parsed || parsed.total <= 0) continue;
    for (const key of Object.keys(WINDOW_MS) as WindowId[]) {
      if (ts >= now - WINDOW_MS[key]) {
        sums[key] += parsed.total;
      }
    }
  }

  (Object.keys(WINDOW_MS) as WindowId[]).forEach((key) => {
    const cap = cfg.opencode.caps[key];
    windows[key] = tokenWindow(sums[key], cap);
  });

  return {
    provider: "opencode",
    label: "OpenCode",
    windows,
    fetchedAt: new Date().toISOString(),
  };
}

// Exported for tests
export const __test = {
  toMs,
  extractTokens,
  rowTimestamp,
  tokenWindow,
  WINDOW_MS,
};
