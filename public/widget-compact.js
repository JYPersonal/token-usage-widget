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

  function fmtApi() {
    if (globalThis.TokenUsageFmt) return globalThis.TokenUsageFmt;
    // Node tests may load this module before fmt.js sets the global.
    if (typeof require === "function") {
      try {
        return require("./fmt.js");
      } catch {
        return null;
      }
    }
    return null;
  }

  function shortReset(iso, nowMs) {
    return fmtApi()?.formatResetShort?.(iso, nowMs) || "";
  }

  function whenReset(iso) {
    return fmtApi()?.formatResetWhen?.(iso) || "";
  }

  function winPart(label, win, mode = "used", nowMs) {
    if (!win || win.status !== "ok") {
      return `${label} NA`;
    }
    const raw = mode === "remaining" ? win.remainingPercent : win.usedPercent;
    if (raw === null || raw === undefined || Number.isNaN(Number(raw))) {
      return `${label} NA`;
    }
    const base = `${label} ${pct(raw)}`;
    const reset = shortReset(win.resetsAtIso, nowMs);
    return reset ? `${base} (${reset})` : base;
  }

  function money(n) {
    if (n === null || n === undefined || Number.isNaN(Number(n))) return null;
    return Number(n).toFixed(2);
  }

  function withCycleReset(line, iso, nowMs) {
    const reset = shortReset(iso, nowMs);
    return reset ? `${line} · ${reset}` : line;
  }

  /** Window-style used% line for claude / kimi / zai (and similar). */
  function windowUsedLine(name, p, nowMs) {
    const labels = [
      ["5h", "five_hour"],
      ["Week", "week"],
      ["Month", "month"],
    ];
    const bits = [];
    for (const [label, id] of labels) {
      const w = p.windows?.[id];
      if (id === "month" && (!w || w.status !== "ok")) continue;
      bits.push(winPart(label, w, "used", nowMs));
    }
    return `${name}: ${bits.join(", ")}`;
  }

  /**
   * @param {{ provider: string, label?: string, windows?: any, billing?: any, balance?: any, error?: string }} p
   * @param {{ nowMs?: number }} [opts]
   */
  function providerLine(p, opts) {
    const nowMs = opts?.nowMs ?? Date.now();
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
        const total = `${name}: total ${m?.status === "ok" ? pct(m.usedPercent) ?? "NA" : "NA"}`;
        return withCycleReset(total, m?.resetsAtIso, nowMs);
      }
      const parts = [`total ${pct(b.totalPercentUsed) ?? "NA"}`];
      if (b.autoPercentUsed !== null && b.autoPercentUsed !== undefined) {
        parts.push(`first party ${pct(b.autoPercentUsed)}`);
      }
      if (b.apiPercentUsed !== null && b.apiPercentUsed !== undefined) {
        parts.push(`API ${pct(b.apiPercentUsed)}`);
      }
      return withCycleReset(`${name}: ${parts.join(" ")}`, b.resetsAtIso, nowMs);
    }

    if (p.provider === "openrouter") {
      const rem = p.balance?.remaining;
      const amt = money(rem);
      const base = amt !== null ? `openrouter: $${amt} left` : "openrouter: NA";
      return withCycleReset(base, p.balance?.resetsAtIso, nowMs);
    }

    if (p.provider === "claude" || p.provider === "kimi" || p.provider === "zai") {
      return windowUsedLine(name, p, nowMs);
    }

    if (p.provider === "grok") {
      const rem = p.balance?.remaining;
      if (rem !== null && rem !== undefined && !Number.isNaN(Number(rem))) {
        return withCycleReset(`grok: ${Math.round(Number(rem))} credits left`, p.balance?.resetsAtIso, nowMs);
      }
      const m = p.windows?.month;
      if (m?.status === "ok") {
        return `grok: ${winPart("month", m, "used", nowMs)}`;
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
      bits.push(winPart(label, w, mode, nowMs));
    }
    return `${name}: ${bits.join(", ")}`;
  }

  /** @param {{ windows?: any, billing?: any, balance?: any }} p */
  function providerTitle(p) {
    const labels = [
      ["cycle", p.billing?.resetsAtIso],
      ["balance", p.balance?.resetsAtIso],
      ["5h", p.windows?.five_hour?.resetsAtIso],
      ["week", p.windows?.week?.resetsAtIso],
      ["month", p.windows?.month?.resetsAtIso],
    ];
    const resets = [];
    for (const [label, iso] of labels) {
      const when = whenReset(iso);
      if (when) resets.push(`${label} ${when}`);
    }
    return resets.join(" · ");
  }

  return { providerLine, providerTitle, pct, winPart };
});
