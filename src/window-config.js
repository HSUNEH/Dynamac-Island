const path = require("node:path");

function buildWindowOptions(preloadPath) {
  return {
    width: 520,
    height: 210,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    title: "Dynamac Island",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  };
}

function createIslandWindow(BrowserWindow, options = {}) {
  const preloadPath = options.preloadPath || path.join(__dirname, "preload.js");
  const indexPath = options.indexPath || path.join(__dirname, "index.html");
  const window = new BrowserWindow(buildWindowOptions(preloadPath));

  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.loadFile(indexPath);

  return window;
}

module.exports = {
  buildWindowOptions,
  createIslandWindow
};
