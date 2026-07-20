const REFRESH_MS = 60_000;
const bodyEl = document.getElementById("body");
const statusEl = document.getElementById("status");
const fixtureEl = document.getElementById("fixture");
const { providerLine, providerTitle } = globalThis.TokenUsageCompact;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderAll(data) {
  const lines = (data.providers || [])
    .map((p) => {
      const line = providerLine(p);
      const title = providerTitle(p);
      const cls = p.error ? "line line--err" : "line";
      const tip = title ? ` title="${escapeHtml(title)}"` : "";
      return `<div class="${cls}"${tip}>${escapeHtml(line)}</div>`;
    })
    .join("");

  bodyEl.innerHTML = lines || `<div class="line">No providers</div>`;
  fixtureEl.hidden = !data.fixture;
  const t = data.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString() : "";
  statusEl.textContent = t ? `↻ ${t}` : "";
  statusEl.classList.remove("error");
}

async function loadUsage() {
  const res = await fetch("/api/usage", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  renderAll(await res.json());
}

async function refresh() {
  try {
    await loadUsage();
  } catch (err) {
    statusEl.textContent = `fail`;
    statusEl.classList.add("error");
    statusEl.title = String(err.message || err);
    // Main process owns the Node usage server; ask it to revive, then retry once.
    try {
      const revived = await window.widgetBridge?.ensureServer?.();
      if (revived?.ok) await loadUsage();
    } catch (retryErr) {
      statusEl.title = String(retryErr.message || retryErr);
    }
  }
}

document.getElementById("btn-hide").addEventListener("click", () => {
  window.widgetBridge?.close?.();
});
document.getElementById("btn-dash").addEventListener("click", () => {
  window.widgetBridge?.openDashboard?.();
});
document.getElementById("btn-quit").addEventListener("click", () => {
  window.widgetBridge?.quit?.();
});

refresh();
setInterval(refresh, REFRESH_MS);
