import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ProviderId, WindowId } from "./types.js";
import { ALL_PROVIDER_IDS } from "./types.js";

export interface OpenCodeCaps {
  five_hour: number | null;
  week: number | null;
  month: number | null;
}

export type ProviderFlags = Record<ProviderId, boolean>;

export interface Config {
  /** Which providers to poll. Missing keys default per DEFAULT_ENABLED. */
  providers: ProviderFlags;
  opencode: {
    dbPath: string;
    caps: OpenCodeCaps;
    go: {
      workspaceId: string | null;
      authCookie: string | null;
    };
  };
  openrouter: { apiKey: string | null };
  kimi: { apiKey: string | null };
  zai: { apiKey: string | null };
  grok: { oauthToken: string | null };
  claude: { accessToken: string | null };
  server: {
    port: number;
    host: string;
  };
}

const DEFAULT_DB_PATH = path.join(os.homedir(), ".local", "share", "opencode", "opencode.db");

/** Cold start: show nothing until `npm run setup` (or explicit config.providers). */
export const DEFAULT_ENABLED: ProviderFlags = {
  openai: false,
  opencode: false,
  cursor: false,
  claude: false,
  openrouter: false,
  kimi: false,
  zai: false,
  grok: false,
};

/** Sensible first-run picks for `npm run setup:defaults` (local auto-login providers). */
export const SETUP_DEFAULTS_ENABLED: ProviderFlags = {
  openai: true,
  opencode: false,
  cursor: true,
  claude: false,
  openrouter: false,
  kimi: false,
  zai: false,
  grok: false,
};

function defaultConfig(): Config {
  return {
    providers: { ...DEFAULT_ENABLED },
    opencode: {
      dbPath: DEFAULT_DB_PATH,
      caps: { five_hour: null, week: null, month: null },
      go: { workspaceId: null, authCookie: null },
    },
    openrouter: { apiKey: null },
    kimi: { apiKey: null },
    zai: { apiKey: null },
    grok: { oauthToken: null },
    claude: { accessToken: null },
    server: { port: 4321, host: "127.0.0.1" },
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

function mergeProviders(base: ProviderFlags, incoming: unknown): ProviderFlags {
  const out = { ...base };
  if (!incoming || typeof incoming !== "object") return out;
  const src = incoming as Record<string, unknown>;
  for (const id of ALL_PROVIDER_IDS) {
    if (typeof src[id] === "boolean") out[id] = src[id];
  }
  return out;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function configPath(): string {
  return path.join(process.cwd(), "config.json");
}

export function exampleConfigPath(): string {
  return path.join(process.cwd(), "config.example.json");
}

export async function loadConfig(): Promise<Config> {
  const cfg = defaultConfig();
  const envDb = process.env.OPENCODE_DB_PATH;
  if (envDb && envDb.trim() !== "") cfg.opencode.dbPath = envDb;
  const envPort = process.env.PORT;
  if (envPort && Number.isFinite(Number(envPort))) cfg.server.port = Number(envPort);

  for (const p of [exampleConfigPath(), configPath()]) {
    if (!existsSync(p)) continue;
    try {
      const raw = await readFile(p, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed.providers) cfg.providers = mergeProviders(cfg.providers, parsed.providers);

      const oc = parsed.opencode as Record<string, unknown> | undefined;
      if (oc) {
        if (typeof oc.dbPath === "string" && oc.dbPath.trim() !== "" && !envDb) {
          cfg.opencode.dbPath = oc.dbPath;
        }
        if (oc.caps) cfg.opencode.caps = mergeCaps(cfg.opencode.caps, oc.caps);
        const go = oc.go as Record<string, unknown> | undefined;
        if (go) {
          cfg.opencode.go.workspaceId = strOrNull(go.workspaceId) ?? cfg.opencode.go.workspaceId;
          cfg.opencode.go.authCookie = strOrNull(go.authCookie) ?? cfg.opencode.go.authCookie;
        }
      }

      const or = parsed.openrouter as Record<string, unknown> | undefined;
      if (or) cfg.openrouter.apiKey = strOrNull(or.apiKey) ?? cfg.openrouter.apiKey;
      const kimi = parsed.kimi as Record<string, unknown> | undefined;
      if (kimi) cfg.kimi.apiKey = strOrNull(kimi.apiKey) ?? cfg.kimi.apiKey;
      const zai = parsed.zai as Record<string, unknown> | undefined;
      if (zai) cfg.zai.apiKey = strOrNull(zai.apiKey) ?? cfg.zai.apiKey;
      const grok = parsed.grok as Record<string, unknown> | undefined;
      if (grok) cfg.grok.oauthToken = strOrNull(grok.oauthToken) ?? cfg.grok.oauthToken;
      const claude = parsed.claude as Record<string, unknown> | undefined;
      if (claude) cfg.claude.accessToken = strOrNull(claude.accessToken) ?? cfg.claude.accessToken;

      const srv = parsed.server as Record<string, unknown> | undefined;
      if (srv) {
        if (typeof srv.port === "number" && !envPort) cfg.server.port = srv.port;
        if (typeof srv.host === "string") cfg.server.host = srv.host;
      }
    } catch {
      // ignore malformed config files, keep defaults
    }
  }

  // Env overrides for secrets (never require storing in config.json)
  if (process.env.OPENROUTER_API_KEY?.trim()) cfg.openrouter.apiKey = process.env.OPENROUTER_API_KEY.trim();
  if (process.env.KIMI_CODE_API_KEY?.trim()) cfg.kimi.apiKey = process.env.KIMI_CODE_API_KEY.trim();
  if (process.env.ZAI_API_KEY?.trim()) cfg.zai.apiKey = process.env.ZAI_API_KEY.trim();
  else if (process.env.GLM_API_KEY?.trim()) cfg.zai.apiKey = process.env.GLM_API_KEY.trim();
  if (process.env.GROK_CLI_OAUTH_TOKEN?.trim()) cfg.grok.oauthToken = process.env.GROK_CLI_OAUTH_TOKEN.trim();
  if (process.env.CLAUDE_ACCESS_TOKEN?.trim()) cfg.claude.accessToken = process.env.CLAUDE_ACCESS_TOKEN.trim();

  for (const key of Object.keys(cfg.opencode.caps) as (keyof OpenCodeCaps)[]) {
    const v = cfg.opencode.caps[key];
    if (v !== null && !(typeof v === "number" && v > 0)) cfg.opencode.caps[key] = null;
  }

  void isWindowId;
  return cfg;
}

export function isFixtureMode(): boolean {
  return process.env.USAGE_FIXTURE === "1" || process.env.USAGE_FIXTURE === "true";
}

export function enabledProviders(cfg: Config): ProviderId[] {
  return ALL_PROVIDER_IDS.filter((id) => cfg.providers[id]);
}
