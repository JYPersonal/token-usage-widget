export type ProviderId = "openai" | "opencode";

export type WindowId = "five_hour" | "week" | "month";

export type WindowStatus = "ok" | "unavailable" | "error";

export interface WindowUsage {
  usedPercent: number | null;
  remainingPercent: number | null;
  usedTokens?: number | null;
  resetsAtIso?: string | null;
  status: WindowStatus;
  reason?: string;
}

export interface ProviderUsage {
  provider: ProviderId;
  label: string;
  windows: Record<WindowId, WindowUsage>;
  fetchedAt: string;
  error?: string;
}

export interface UsageResponse {
  fetchedAt: string;
  fixture: boolean;
  providers: ProviderUsage[];
}
