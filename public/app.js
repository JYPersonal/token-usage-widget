const WINDOW_META = {
  five_hour: { label: "5-Hour Window", short: "5h" },
  week: { label: "Weekly Window", short: "7d" },
  month: { label: "Monthly Window", short: "30d" },
};

const REFRESH_MS = 60_000;

const providersEl = document.getElementById("providers");
const footerStatus = document.getElementById("footer-status");
const refreshClock = document.getElementById("refresh-clock");
const fixtureBadge = document.getElementById("fixture-badge");
const providerTemplate = document.getElementById("provider-template");
const windowTemplate = document.getElementById("window-template");

function fmtPct(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function fmtTokens(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function fmtReset(iso) {
  if (!iso) return "";
  const then = new Date(iso);
  const diff = then.getTime() - Date.now();
  if (diff <= 0) return "resets soon";
  const totalMin = Math.round(diff / 60000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return `resets in ${parts.join(" ")}`;
}

function toneFor(usedPercent, status) {
  if (status !== "ok" || usedPercent === null) return "ghost";
  if (usedPercent >= 85) return "danger";
  if (usedPercent >= 60) return "warn";
  return "ok";
}

function renderWindow(parent, winId, win) {
  const node = windowTemplate.content.cloneNode(true);
  const article = node.querySelector(".window");
  article.dataset.status = win.status;
  article.dataset.window = winId;

  node.querySelector(".window-label").textContent = WINDOW_META[winId].label;
  node.querySelector(".window-reset").textContent =
    win.status === "ok" ? fmtReset(win.resetsAtIso) : win.reason || "";

  const fill = node.querySelector(".meter-fill");
  const used = win.status === "ok" ? win.usedPercent : null;
  fill.style.width = used !== null ? `${Math.min(100, Math.max(0, used))}%` : "0%";
  fill.dataset.tone = toneFor(used, win.status);

  node.querySelector(".stat-used").textContent =
    win.status === "ok" ? fmtPct(win.usedPercent) : "Unavailable";
  node.querySelector(".stat-remaining").textContent =
    win.status === "ok" && win.remainingPercent !== null && win.remainingPercent !== undefined
      ? fmtPct(win.remainingPercent)
      : win.status === "ok"
        ? "uncapped"
        : "Unavailable";
  node.querySelector(".stat-tokens").textContent =
    win.usedTokens !== null && win.usedTokens !== undefined
      ? fmtTokens(win.usedTokens)
      : "—";

  parent.appendChild(node);
}

function renderProvider(p) {
  const node = providerTemplate.content.cloneNode(true);
  node.querySelector(".provider-title").textContent = p.label;
  const sub = p.error ? "error" : "live";
  node.querySelector(".provider-sub").textContent = sub;
  const errEl = node.querySelector(".provider-error");
  if (p.error) {
    errEl.textContent = p.error;
    errEl.hidden = false;
  }
  const windowsEl = node.querySelector(".windows");
  for (const winId of ["five_hour", "week", "month"]) {
    renderWindow(windowsEl, winId, p.windows[winId] || { status: "unavailable", usedPercent: null, remainingPercent: null, reason: "missing" });
  }
  providersEl.appendChild(node);
}

function renderAll(data) {
  providersEl.innerHTML = "";
  for (const p of data.providers) renderProvider(p);
  fixtureBadge.hidden = !data.fixture;
}

function updateClock() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  refreshClock.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

async function refresh() {
  try {
    const res = await fetch("/api/usage", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderAll(data);
    footerStatus.textContent = `Last updated ${new Date(data.fetchedAt).toLocaleTimeString()}`;
    document.querySelector(".site-footer").classList.remove("error");
  } catch (err) {
    footerStatus.textContent = `Failed to load: ${err.message}`;
    document.querySelector(".site-footer").classList.add("error");
  }
  updateClock();
}

function start() {
  refresh();
  setInterval(refresh, REFRESH_MS);
  setInterval(updateClock, 1000);
}

start();
