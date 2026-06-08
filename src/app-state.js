function createAppState(initialStatus = null) {
  return {
    status: initialStatus || {
      ok: false,
      source: "status/status.json",
      statuses: [],
      errors: ["Status has not loaded yet."]
    },
    lastAppliedAt: null
  };
}

function updateAppStateFromStatusPayload(appState, payload, options = {}) {
  if (!appState || typeof appState !== "object") {
    throw new Error("appState must be an object");
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("status payload must be an object");
  }

  const now = options.now || (() => new Date().toISOString());
  const nextStatus = {
    ok: payload.ok === true,
    source: payload.source || "status/status.json",
    statuses: Array.isArray(payload.statuses) ? payload.statuses : [],
    errors: Array.isArray(payload.errors) ? payload.errors : []
  };

  appState.status = nextStatus;
  appState.lastAppliedAt = now();

  return appState;
}

module.exports = {
  createAppState,
  updateAppStateFromStatusPayload
};
