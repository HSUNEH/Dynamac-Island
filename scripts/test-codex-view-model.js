#!/usr/bin/env node

const assert = require("node:assert");
const {
  CODEX_AGENT,
  toCodexViewModel
} = require("../src/codex-state");

const mockParsedCodex = {
  ok: true,
  codex: {
    agent: CODEX_AGENT,
    state: "running",
    task: "Applying repository edits",
    updatedAt: "2026-06-08T12:11:00.000Z",
    detail: "Mock parsed data from the watched status file.",
    isMock: false
  },
  errors: []
};

assert.deepEqual(toCodexViewModel(mockParsedCodex), {
  ok: true,
  agent: CODEX_AGENT,
  title: CODEX_AGENT,
  state: "running",
  stateLabel: "Running",
  task: "Applying repository edits",
  detail: "Mock parsed data from the watched status file.",
  updatedAt: "2026-06-08T12:11:00.000Z",
  isMock: false,
  cssClass: "status-card running",
  dotClass: "state-dot running",
  summary: "Codex is running",
  ariaLabel: "Codex Running: Applying repository edits"
});

const mockFallbackCodex = {
  ok: true,
  codex: {
    agent: CODEX_AGENT,
    state: "idle",
    task: "No Codex status",
    updatedAt: "mock",
    detail: "Codex is not present in the watched status file.",
    isMock: true
  },
  errors: []
};

assert.deepEqual(toCodexViewModel(mockFallbackCodex), {
  ok: true,
  agent: CODEX_AGENT,
  title: CODEX_AGENT,
  state: "idle",
  stateLabel: "Idle",
  task: "No Codex status (mock)",
  detail: "Codex is not present in the watched status file.",
  updatedAt: "mock",
  isMock: true,
  cssClass: "status-card idle mock",
  dotClass: "state-dot idle",
  summary: "Codex is idle",
  ariaLabel: "Codex Idle: No Codex status (mock)"
});

assert.deepEqual(toCodexViewModel({
  ok: false,
  codex: null,
  errors: ["statuses[0].task must be a non-empty string."]
}), {
  ok: false,
  agent: CODEX_AGENT,
  title: "Codex status unavailable",
  state: "error",
  stateLabel: "Error",
  task: "Invalid Codex status",
  detail: "statuses[0].task must be a non-empty string.",
  updatedAt: "unknown",
  isMock: false,
  cssClass: "status-card error",
  dotClass: "state-dot error",
  summary: "Codex status input needs attention",
  ariaLabel: "Codex error: Invalid Codex status"
});

console.log("Codex view model test passed.");
