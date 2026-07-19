import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { Config } from "../config.js";
import type { ProviderUsage, WindowId, WindowUsage } from "../types.js";
import { unavailableAll, okWindow } from "../types.js";

/**
 * Claude Code / Claude.ai subscription usage via undocumented OAuth usage endpoint.
 * Auth: config/env token, else ~/.claude/.credentials.json (claudeAiOauth.accessToken).
 */

function readClaudeToken(cfg: Config): string | null {
  if (cfg.claude.accessToken) return cfg.claude.accessToken;
  const credPath = path.join(os.homedir(), ".claude", ".credentials.json");
  if (!existsSync(credPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(credPath, "utf8")) as Record<string, unknown>;
    const oauth = raw.claudeAiOauth as Record<string, unknown> | undefined;
    if (typeof oauth?.accessToken === "string" && oauth.accessToken.trim()) {
      return oauth.accessToken.trim();
    }
  } catch {
    // ignore
  }
  return null;
}

function mapOAuthUsage(body: Record<string, unknown>): Record<WindowId, WindowUsage> {
  const windows = unavailableAll("Claude did not report this window.");
  const five = body.five_hour as Record<string, unknown> | undefined;
  const seven = (body.seven_day ?? body.seven_day_opus ?? body.seven_day_sonnet) as
    | Record<string, unknown>
    | undefined;

  const apply = (id: WindowId, block: Record<string, unknown> | undefined) => {
    if (!block) return;
    const used = Number(block.utilization ?? block.used_percentage ?? block.usedPercent);
    if (!Number.isFinite(used)) return;
    const resets =
      typeof block.resets_at === "string"
        ? block.resets_at
        : typeof block.resetsAt === "string"
          ? block.resetsAt
          : null;
    windows[id] = okWindow(used, resets);
  };

  apply("five_hour", five);
  apply("week", seven);
  // No reliable month in OAuth payload for consumer plans.
  return windows;
}

export async function fetchClaudeUsage(cfg: Config): Promise<ProviderUsage> {
  const fetchedAt = new Date().toISOString();
  const token = readClaudeToken(cfg);
  if (!token) {
    const reason =
      "No Claude credentials. Sign in with Claude Code, or set CLAUDE_ACCESS_TOKEN / config.claude.accessToken.";
    return {
      provider: "claude",
      label: "Claude",
      windows: unavailableAll(reason),
      fetchedAt,
      error: reason,
    };
  }

  try {
    const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-beta": "oauth-2025-04-20",
        "User-Agent": "claude-code/2.0.0",
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const reason = `Claude usage HTTP ${res.status}`;
      return {
        provider: "claude",
        label: "Claude",
        windows: unavailableAll(reason),
        fetchedAt,
        error: reason,
      };
    }
    const body = (await res.json()) as Record<string, unknown>;
    return {
      provider: "claude",
      label: "Claude",
      windows: mapOAuthUsage(body),
      fetchedAt,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      provider: "claude",
      label: "Claude",
      windows: unavailableAll(msg),
      fetchedAt,
      error: msg,
    };
  }
}

export const __test = { mapOAuthUsage, readClaudeToken };
