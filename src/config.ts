import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { WindowId } from "./types.js";

export interface OpenCodeCaps {
  five_hour: number | null;
  week: number | null;
  month: number | null;
}

export interface Config {
  opencode: {
    dbPath: string;
    caps: OpenCodeCaps;
  };
  server: {
    port: number;
    host: string;
  };
}

const DEFAULT_DB_PATH = path.join(
  os.homedir(),
  ".local",
  "share",
  "opencode",
  "opencode.db",
);

function defaultConfig(): Config {
  return {
    opencode: {
      dbPath: DEFAULT_DB_PATH,
      caps: {
        five_hour: null,
        week: null,
        month: null,
      },
    },
    server: {
      port: 4321,
      host: "127.0.0.1",
    },
  };
}

function isWindowId(v: unknown): v is WindowId {
  return v === "five_hour" || v === "week" || v === "month";
}

function mergeCaps(base: OpenCodeCaps, incoming: unknown): OpenCodeCaps {
  if (!incoming || typeof incoming !== "object") return base;
  const src = incoming as Record<string, unknown>;
  const out = { ...base };
  for (const key of Object.keys(out) as (keyof OpenCodeCaps)[]) {
    const val = src[key];
    if (val === null || typeof val === "number") {
      out[key] = val;
    } else if (typeof val === "string" && val.trim() !== "") {
      const n = Number(val);
      out[key] = Number.isFinite(n) ? n : null;
    }
  }
  return out;
}

export async function loadConfig(): Promise<Config> {
  const cfg = defaultConfig();
  const envDb = process.env.OPENCODE_DB_PATH;
  if (envDb && envDb.trim() !== "") {
    cfg.opencode.dbPath = envDb;
  }
  const envPort = process.env.PORT;
  if (envPort && Number.isFinite(Number(envPort))) {
    cfg.server.port = Number(envPort);
  }

  const examplePath = path.join(process.cwd(), "config.example.json");
  const realPath = path.join(process.cwd(), "config.json");

  for (const p of [examplePath, realPath]) {
    if (!existsSync(p)) continue;
    try {
      const raw = await readFile(p, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const oc = parsed.opencode as Record<string, unknown> | undefined;
      if (oc) {
        if (typeof oc.dbPath === "string" && oc.dbPath.trim() !== "" && !envDb) {
          cfg.opencode.dbPath = oc.dbPath;
        }
        if (oc.caps) cfg.opencode.caps = mergeCaps(cfg.opencode.caps, oc.caps);
      }
      const srv = parsed.server as Record<string, unknown> | undefined;
      if (srv) {
        if (typeof srv.port === "number" && !envPort) cfg.server.port = srv.port;
        if (typeof srv.host === "string") cfg.server.host = srv.host;
      }
    } catch {
      // ignore malformed config files, keep defaults
    }
  }

  // sanity: caps must be positive numbers or null
  for (const key of Object.keys(cfg.opencode.caps) as (keyof OpenCodeCaps)[]) {
    const v = cfg.opencode.caps[key];
    if (v !== null && !(typeof v === "number" && v > 0)) {
      cfg.opencode.caps[key] = null;
    }
  }

  // touch isWindowId to keep the type guard live for future schema work
  void isWindowId;

  return cfg;
}

export function isFixtureMode(): boolean {
  return process.env.USAGE_FIXTURE === "1" || process.env.USAGE_FIXTURE === "true";
}
