"use strict";

const WIDGET_WIDTH = 320;
const WIDGET_HEIGHT = 172;
const WIDGET_MARGIN = 16;

function getPlatformPolicy(platform) {
  const darwin = platform === "darwin";
  return {
    platform,
    displaySelection: darwin ? "cursor" : "primary",
    width: WIDGET_WIDTH,
    height: WIDGET_HEIGHT,
    margin: WIDGET_MARGIN,
    windowLevel: darwin ? "floating" : "screen-saver",
    visibleOnAllWorkspaces: true,
    visibleOnFullScreen: !darwin,
    nativeClose: darwin ? "quit" : "hide",
    hideDock: darwin,
    activationPolicy: darwin ? "accessory" : null,
    trayIcon: darwin ? "template" : "legacy",
  };
}

function selectDisplay(policy, screenApi) {
  if (policy.displaySelection === "cursor") {
    return screenApi.getDisplayNearestPoint(screenApi.getCursorScreenPoint());
  }
  return screenApi.getPrimaryDisplay();
}

function calculateCornerBounds(workArea, policy) {
  return {
    x: Math.round(workArea.x + workArea.width - policy.width - policy.margin),
    y: Math.round(workArea.y + workArea.height - policy.height - policy.margin),
    width: policy.width,
    height: policy.height,
  };
}

module.exports = {
  WIDGET_WIDTH,
  WIDGET_HEIGHT,
  WIDGET_MARGIN,
  getPlatformPolicy,
  selectDisplay,
  calculateCornerBounds,
};
