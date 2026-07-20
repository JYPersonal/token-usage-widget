"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 96;
const MIN_WIDTH = 220;
const MIN_HEIGHT = 72;
const MAX_WIDTH = 900;
const MAX_HEIGHT = 640;

function clamp(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(x)));
}

function boundsFile(userDataDir) {
  return path.join(userDataDir, "widget-bounds.json");
}

/**
 * @param {string} userDataDir
 * @returns {{ width: number, height: number } | null}
 */
function loadBounds(userDataDir) {
  try {
    const raw = fs.readFileSync(boundsFile(userDataDir), "utf8");
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object") return null;
    return {
      width: clamp(j.width, MIN_WIDTH, MAX_WIDTH),
      height: clamp(j.height, MIN_HEIGHT, MAX_HEIGHT),
    };
  } catch {
    return null;
  }
}

/**
 * @param {string} userDataDir
 * @param {{ width?: number, height?: number }} size
 */
function saveBounds(userDataDir, size) {
  const prev = loadBounds(userDataDir) || { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  const next = {
    width: clamp(size.width ?? prev.width, MIN_WIDTH, MAX_WIDTH),
    height: clamp(size.height ?? prev.height, MIN_HEIGHT, MAX_HEIGHT),
  };
  fs.writeFileSync(boundsFile(userDataDir), `${JSON.stringify(next)}\n`, "utf8");
  return next;
}

/**
 * @param {{ width: number, height: number }} size
 * @param {{ x: number, y: number, width: number, height: number }} workArea
 * @param {number} margin
 */
function cornerPlacement(size, workArea, margin) {
  const width = clamp(size.width, MIN_WIDTH, MAX_WIDTH);
  const height = clamp(size.height, MIN_HEIGHT, MAX_HEIGHT);
  return {
    width,
    height,
    x: Math.round(workArea.x + workArea.width - width - margin),
    y: Math.round(workArea.y + workArea.height - height - margin),
  };
}

/**
 * Keep the bottom-right corner fixed while changing size (corner widget).
 * @param {{ x: number, y: number, width: number, height: number }} bounds
 * @param {number} width
 * @param {number} height
 */
function resizeBottomRight(bounds, width, height) {
  const w = clamp(width, MIN_WIDTH, MAX_WIDTH);
  const h = clamp(height, MIN_HEIGHT, MAX_HEIGHT);
  return {
    x: Math.round(bounds.x + bounds.width - w),
    y: Math.round(bounds.y + bounds.height - h),
    width: w,
    height: h,
  };
}

module.exports = {
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
  MIN_WIDTH,
  MIN_HEIGHT,
  MAX_WIDTH,
  MAX_HEIGHT,
  clamp,
  boundsFile,
  loadBounds,
  saveBounds,
  cornerPlacement,
  resizeBottomRight,
};
