const fs = require("node:fs");
const { applyDroppedFileToShelf, buildShelfStatusPayload, createShelfState } = require("./shelf-state");

// The native island persists dropped file paths here as
// {"version":1,"items":[{"path":"/abs/file","droppedAt":<epoch ms>}]}.
// Native is the only writer; the status writer only reads it.
const NATIVE_DROP_SOURCE = "native-drag";

function readShelfFileItems(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.items)) return [];
  return parsed.items.filter((item) => item && typeof item.path === "string");
}

function shelfStateFromFile(filePath, options = {}) {
  const now = options.now instanceof Date ? options.now.getTime() : Number(options.now ?? Date.now());
  let state = createShelfState({ now });
  for (const item of readShelfFileItems(filePath)) {
    // Files moved or deleted since the drop are skipped instead of failing the whole shelf.
    const result = applyDroppedFileToShelf(state, {
      filePath: item.path,
      observedAt: Number.isFinite(Number(item.droppedAt)) ? Number(item.droppedAt) : now,
      source: NATIVE_DROP_SOURCE
    }, { now });
    if (result.ok) state = result.state;
  }
  return state;
}

function collectShelfStatus(options = {}) {
  const filePath = options.shelfFilePath ?? process.env.DYNAMAC_SHELF_FILE ?? "";
  if (!filePath) return null;
  try {
    return buildShelfStatusPayload(shelfStateFromFile(filePath, options)).statuses[0] || null;
  } catch (_) {
    return null;
  }
}

module.exports = {
  collectShelfStatus,
  readShelfFileItems,
  shelfStateFromFile
};
