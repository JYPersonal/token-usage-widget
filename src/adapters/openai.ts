import { getCodexStatus, CodexStatusError } from "codex-status-mcp";
import type {
  CodexStatusResult,
  RateLimitWindow,
  RateLimits,
} from "codex-status-mcp";
import type { ProviderUsage, WindowId, WindowUsage } from "../types.js";

const WINDOW_TARGETS: Record<WindowId, number> = {
  five_hour: 300,
  week: 10080,
  month: 43200,
};

const WINDOW_LABELS: Record<WindowId, string> = {
  five_hour: "5h",
  week: "7d",
  month: "30d",
};

function unavailable(reason: string): WindowUsage {
  return {
    usedPercent: null,
    remainingPercent: null,
    status: "unavailable",
    reason,
  };
}

function classifyDuration(mins: number | undefined): WindowId | null {
  if (typeof mins !== "number" || !Number.isFinite(mins) || mins <= 0) return null;
  let best: WindowId | null = null;
  let bestRatio = Infinity;
  for (const key of Object.keys(WINDOW_TARGETS) as WindowId[]) {
    const target = WINDOW_TARGETS[key];
    const ratio = Math.abs(mins - target) / target;
    if (ratio < bestRatio) {
      bestRatio = ratio;
      best = key;
    }
  }
  // 25% tolerance — anything farther is treated as unknown
  return bestRatio <= 0.25 ? best : null;
}

function windowFromRateLimit(w: RateLimitWindow): WindowUsage {
  const used = typeof w.usedPercent === "number" ? w.usedPercent : null;
  const resetsAtIso =
    typeof w.resetsAtIso === "string"
      ? w.resetsAtIso
      : typeof w.resetsAt === "number"
        ? new Date(w.resetsAt * 1000).toISOString()
        : null;
  if (used === null || !Number.isFinite(used)) {
    return {
      usedPercent: null,
      remainingPercent: null,
      resetsAtIso,
      status: "unavailable",
      reason: "Codex window reported no usable usedPercent.",
    };
  }
  const clamped = Math.min(100, Math.max(0, used));
  return {
    usedPercent: clamped,
    remainingPercent: Math.max(0, 100 - clamped),
    resetsAtIso,
    status: "ok",
  };
}

function pickRateLimits(result: CodexStatusResult): RateLimits | null {
  // Prefer the plan-level 'codex' limit over model-specific spark limits.
  const byId = result.rateLimitsByLimitId ?? {};
  const codex = byId["codex"];
  if (codex) return codex;
  // Otherwise prefer any non-spark limit, else the top-level rateLimits.
  for (const value of Object.values(byId)) {
    if (value && value.limitId && value.limitId !== "spark") return value;
  }
  return result.rateLimits ?? null;
}

function mapWindows(limits: RateLimits | null): Record<WindowId, WindowUsage> {
  const windows: Record<WindowId, WindowUsage> = {
    five_hour: unavailable("No 5h window reported by Codex app-server."),
    week: unavailable("No weekly window reported by Codex app-server."),
    month: unavailable("No monthly window reported by Codex app-server."),
  };
  if (!limits) return windows;

  const candidates: RateLimitWindow[] = [];
  if (limits.primary) candidates.push(limits.primary);
  if (limits.secondary) candidates.push(limits.secondary);

  for (const c of candidates) {
    const id = classifyDuration(c.windowDurationMins);
    if (!id) continue;
    // don't overwrite an already-mapped window with a worse one
    if (windows[id].status === "ok") continue;
    windows[id] = windowFromRateLimit(c);
  }
  return windows;
}

export async function fetchOpenAIUsage(): Promise<ProviderUsage> {
  try {
    const result = await getCodexStatus({ includeEmail: false });
    const limits = pickRateLimits(result);
    const windows = mapWindows(limits);
    return {
      provider: "openai",
      label: "OpenAI Codex",
      windows,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    const msg =
      err instanceof CodexStatusError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unknown error contacting Codex app-server.";
    const windows: Record<WindowId, WindowUsage> = {
      five_hour: unavailable("Codex app-server unreachable."),
      week: unavailable("Codex app-server unreachable."),
      month: unavailable("Codex app-server unreachable."),
    };
    return {
      provider: "openai",
      label: "OpenAI Codex",
      windows,
      fetchedAt: new Date().toISOString(),
      error: msg,
    };
  }
}

// Exported for tests
export const __test = {
  classifyDuration,
  mapWindows,
  pickRateLimits,
  windowFromRateLimit,
  WINDOW_LABELS,
};
