const {
  applyClipboardRead,
  createClipboardActivityState
} = require("./clipboard-activity");

let memoryState = createClipboardActivityState();

function cloneState(state) {
  return createClipboardActivityState({
    lastSignature: state.lastSignature,
    active: state.active ? JSON.parse(JSON.stringify(state.active)) : null
  });
}

function createClipboardActivityStore(seed = {}) {
  memoryState = createClipboardActivityState(seed);
  return readClipboardActivityStore();
}

function readClipboardActivityStore() {
  return cloneState(memoryState);
}

function createClipboardActivity(read = {}, options = {}) {
  const result = applyClipboardRead(memoryState, read, options);
  memoryState = createClipboardActivityState(result.state);
  return {
    state: readClipboardActivityStore(),
    status: result.status
  };
}

function clearClipboardActivityStore() {
  memoryState = createClipboardActivityState();
  return readClipboardActivityStore();
}

module.exports = {
  clearClipboardActivityStore,
  createClipboardActivity,
  createClipboardActivityStore,
  readClipboardActivityStore
};
