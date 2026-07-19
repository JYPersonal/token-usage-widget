/**
 * Compact one-line summaries for the corner widget.
 * UMD: browser → TokenUsageCompact; Node → module.exports.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TokenUsageCompact = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function pct(v) {
    if (v === null || v === undefined || Number.isNaN(Number(v))) return null;
    return `${Math.round(Number(v))}%`;
  }

  function winPart(label, win, mode = "used") {
    if (!win || win.status !== "ok") {
      return `${label} NA`;
    }
    const raw = mode === "remaining" ? win.remainingPercent : win.usedPercent;
    if (raw === null || raw === undefined || Number.isNaN(Number(raw))) {
      return `${label} NA`;
    }
    return `${label} ${pct(raw)}`;
  }

  function money(n) {
    if (n === null || n === undefined || Number.isNaN(Number(n))) return null;
    return Number(n).toFixed(2);
  }

  /** Window-style used% line for claude / kimi / zai (and similar). */
  function windowUsedLine(name, p) {
    const labels = [
      ["5h", "five_hour"],
      ["Week", "week"],
      ["Month", "month"],
    ];
    const bits = [];
    for (const [label, id] of labels) {
      const w = p.windows?.[id];
      if (id === "month" && (!w || w.status !== "ok")) continue;
      bits.push(winPart(label, w, "used"));
    }
    return `${name}: ${bits.join(", ")}`;
  }

  /** @param {{ provider: string, label?: string, windows?: any, billing?: any, balance?: any, error?: string }} p */
  function providerLine(p) {
    const name =
      p.provider === "openai"
        ? "codex"
        : p.provider === "opencode"
          ? "opencode"
          : p.provider === "cursor"
            ? "cursor"
            : String(p.provider || "provider").toLowerCase();

    if (p.error && p.provider !== "cursor") {
      // Prefer window NA lines when present; only collapse when no windows payload.
      if (!p.windows) return `${name}: error`;
    }

    if (p.provider === "cursor") {
      const b = p.billing;
      if (!b) {
        const m = p.windows?.month;
        return `${name}: total ${m?.status === "ok" ? pct(m.usedPercent) ?? "NA" : "NA"}`;
      }
      const parts = [`total ${pct(b.totalPercentUsed) ?? "NA"}`];
      if (b.autoPercentUsed !== null && b.autoPercentUsed !== undefined) {
        parts.push(`first party ${pct(b.autoPercentUsed)}`);
      }
      if (b.apiPercentUsed !== null && b.apiPercentUsed !== undefined) {
        parts.push(`API ${pct(b.apiPercentUsed)}`);
      }
      return `${name}: ${parts.join(" ")}`;
    }

    if (p.provider === "openrouter") {
      const rem = p.balance?.remaining;
      const amt = money(rem);
      return amt !== null ? `openrouter: $${amt} left` : "openrouter: NA";
    }

    if (p.provider === "claude" || p.provider === "kimi" || p.provider === "zai") {
      return windowUsedLine(name, p);
    }

    if (p.provider === "grok") {
      const rem = p.balance?.remaining;
      if (rem !== null && rem !== undefined && !Number.isNaN(Number(rem))) {
        return `grok: ${Math.round(Number(rem))} credits left`;
      }
      const m = p.windows?.month;
      if (m?.status === "ok") {
        return `grok: month ${pct(m.usedPercent) ?? "NA"}`;
      }
      return "grok: NA";
    }

    // Codex Analytics shows "% remaining" — match that number for openai.
    // OpenCode Go meters are usage/% used.
    const mode = p.provider === "openai" ? "remaining" : "used";
    const labels =
      p.provider === "opencode"
        ? [
            ["rolling", "five_hour"],
            ["week", "week"],
            ["month", "month"],
          ]
        : [
            ["5h", "five_hour"],
            ["Week", "week"],
            ["Month", "month"],
          ];

    const bits = [];
    for (const [label, id] of labels) {
      const w = p.windows?.[id];
      if (id === "month" && (!w || w.status !== "ok")) continue;
      bits.push(winPart(label, w, mode));
    }
    return `${name}: ${bits.join(", ")}`;
  }

  /** @param {{ windows?: any, billing?: any, balance?: any }} p */
  function providerTitle(p) {
    const resets = [];
    if (p.billing?.resetsAtIso) resets.push(`cycle ${p.billing.resetsAtIso}`);
    if (p.balance?.resetsAtIso) resets.push(`balance ${p.balance.resetsAtIso}`);
    for (const id of ["five_hour", "week", "month"]) {
      const iso = p.windows?.[id]?.resetsAtIso;
      if (iso) resets.push(`${id} ${iso}`);
    }
    return resets.join(" · ");
  }

  return { providerLine, providerTitle, pct, winPart };
});
