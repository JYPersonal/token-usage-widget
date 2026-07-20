"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("widgetBridge", {
  close: () => ipcRenderer.invoke("widget:close"),
  openDashboard: () => ipcRenderer.invoke("widget:open-dashboard"),
  ensureServer: () => ipcRenderer.invoke("widget:ensure-server"),
  quit: () => ipcRenderer.invoke("widget:quit"),
});
