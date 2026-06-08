const path = require("node:path");

const DEFAULT_WINDOW_WIDTH = 520;
const DEFAULT_WINDOW_HEIGHT = 210;

function buildWindowOptions(preloadPath) {
  return {
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    fullscreenable: false,
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

function calculateNotchAnchoredPosition(display, windowOptions) {
  const bounds = display.bounds || display.workArea;
  const width = windowOptions.width || DEFAULT_WINDOW_WIDTH;
  return {
    x: bounds.x + Math.round((bounds.width - width) / 2),
    y: bounds.y
  };
}

function anchorWindowToNotch(window, screen, windowOptions) {
  if (!screen || typeof screen.getPrimaryDisplay !== "function") {
    return;
  }

  const position = calculateNotchAnchoredPosition(screen.getPrimaryDisplay(), windowOptions);
  window.setPosition(position.x, position.y);
}

function createIslandWindow(BrowserWindow, options = {}) {
  const preloadPath = options.preloadPath || path.join(__dirname, "preload.js");
  const indexPath = options.indexPath || path.join(__dirname, "index.html");
  const windowOptions = buildWindowOptions(preloadPath);
  const window = new BrowserWindow(windowOptions);

  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (typeof window.setAlwaysOnTop === "function") {
    window.setAlwaysOnTop(true, "screen-saver");
  }
  anchorWindowToNotch(window, options.screen, windowOptions);
  window.loadFile(indexPath);

  return window;
}

module.exports = {
  buildWindowOptions,
  calculateNotchAnchoredPosition,
  anchorWindowToNotch,
  createIslandWindow
};
