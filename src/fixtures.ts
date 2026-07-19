import type { ProviderUsage, UsageResponse, WindowId, WindowUsage } from "./types.js";

function isoFromUnix(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}

function okWindow(usedPercent: number, resetsAtUnix?: number): WindowUsage {
  return {
    usedPercent,
    remainingPercent: Math.max(0, 100 - usedPercent),
    resetsAtIso: resetsAtUnix ? isoFromUnix(resetsAtUnix) : null,
    status: "ok",
  };
}

function tokenWindow(usedTokens: number, cap: number | null, resetsAtUnix?: number): WindowUsage {
  const usedPercent = cap && cap > 0 ? Math.min(100, (usedTokens / cap) * 100) : null;
  const remainingPercent = cap && cap > 0 ? Math.max(0, 100 - usedPercent!) : null;
  return {
    usedPercent,
    remainingPercent,
    usedTokens,
    resetsAtIso: resetsAtUnix ? isoFromUnix(resetsAtUnix) : null,
    status: "ok",
  };
}

function unavailableWindow(reason: string): WindowUsage {
  return {
    usedPercent: null,
    remainingPercent: null,
    status: "unavailable",
    reason,
  };
}

function openaiFixture(): ProviderUsage {
  // Live-probe-style payload: primary is weekly-only (secondary null).
  // five_hour and month are unavailable with a reason, not fake %.
  const now = Math.floor(Date.now() / 1000);
  const weekReset = now + 3 * 24 * 3600 + 5 * 3600;
  const windows: Record<WindowId, WindowUsage> = {
    five_hour: unavailableWindow("Codex app-server did not report a 5h window for this plan."),
    week: okWindow(34, weekReset),
    month: unavailableWindow("Codex app-server did not report a monthly window for this plan."),
  };
  return {
    provider: "openai",
    label: "OpenAI Codex",
    windows,
    fetchedAt: new Date().toISOString(),
  };
}

function opencodeFixture(): ProviderUsage {
  const now = Date.now();
  const fiveHoursAgo = Math.floor((now - 4 * 3600 * 1000) / 1000);
  const weekAgo = Math.floor((now - 5 * 24 * 3600 * 1000) / 1000);
  const monthAgo = Math.floor((now - 22 * 24 * 3600 * 1000) / 1000);

  // realistic-ish token counts and caps
  const fiveHourTokens = 184_500;
  const weekTokens = 1_920_000;
  const monthTokens = 7_410_000;

  const caps = { five_hour: 250_000, week: 3_000_000, month: 12_000_000 };

  const windows: Record<WindowId, WindowUsage> = {
    five_hour: tokenWindow(fiveHourTokens, caps.five_hour, fiveHoursAgo + 5 * 3600),
    week: tokenWindow(weekTokens, caps.week, weekAgo + 7 * 24 * 3600),
    month: tokenWindow(monthTokens, caps.month, monthAgo + 30 * 24 * 3600),
  };
  return {
    provider: "opencode",
    label: "OpenCode",
    windows,
    fetchedAt: new Date().toISOString(),
  };
}

export function buildFixtureResponse(): UsageResponse {
  return {
    fetchedAt: new Date().toISOString(),
    fixture: true,
    providers: [openaiFixture(), opencodeFixture()],
  };
}
