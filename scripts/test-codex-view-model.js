#!/usr/bin/env node

const assert = require("node:assert");
const {
  CODEX_AGENT,
  toCodexViewModel
} = require("../src/codex-state");

const sampleParsedCodex = {
  ok: true,
  codex: {
    agent: CODEX_AGENT,
    state: "running",
    task: "Applying repository edits",
    updatedAt: "2026-06-08T12:11:00.000Z",
    detail: "Real status data from the watched status file.",
    isMock: false
  },
  errors: []
};

assert.deepEqual(toCodexViewModel(sampleParsedCodex), {
  ok: true,
  agent: CODEX_AGENT,
  title: CODEX_AGENT,
  state: "running",
  stateLabel: "Running",
  task: "Applying repository edits",
  detail: "Real status data from the watched status file.",
  updatedAt: "2026-06-08T12:11:00.000Z",
  isMock: false,
  cssClass: "status-card running",
  dotClass: "state-dot running",
  summary: "Codex is running",
  ariaLabel: "Codex Running: Applying repository edits"
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
