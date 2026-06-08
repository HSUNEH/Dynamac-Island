const path = require("node:path");
const { PILL_VIEW_SPEC, renderPillView } = require("./pill-view");
const { buildWindowOptions, createIslandWindow } = require("./window-config");

function createAppComposition(options = {}) {
  const baseDir = options.baseDir || __dirname;
  const preloadPath = options.preloadPath || path.join(baseDir, "preload.js");
  const indexPath = options.indexPath || path.join(baseDir, "index.html");

  return {
    windowOptions: buildWindowOptions(preloadPath),
    assets: {
      preloadPath,
      indexPath
    },
    contentRoot: {
      view: "dynamac-pill",
      shellClass: PILL_VIEW_SPEC.shellClass,
      html: renderPillView()
    }
  };
}

function createDynamacIslandWindow(BrowserWindow, options = {}) {
  const composition = createAppComposition(options);
  const window = createIslandWindow(BrowserWindow, composition.assets);

  return {
    window,
    composition
  };
}

module.exports = {
  createAppComposition,
  createDynamacIslandWindow
};
