#!/usr/bin/env node

const assert = require("node:assert");
const {
  OUROBOROS_AGENT,
  toOuroborosViewModel
} = require("../src/ouroboros-state");

const mockParsedOuroboros = {
  ok: true,
  ouroboros: {
    agent: OUROBOROS_AGENT,
    state: "warning",
    task: "Waiting for handoff",
    updatedAt: "2026-06-08T12:12:00.000Z",
    detail: "Mock parsed data from the watched status file.",
    isMock: false
  },
  errors: []
};

assert.deepEqual(toOuroborosViewModel(mockParsedOuroboros), {
  ok: true,
  agent: OUROBOROS_AGENT,
  title: OUROBOROS_AGENT,
  state: "warning",
  stateLabel: "Warning",
  task: "Waiting for handoff",
  detail: "Mock parsed data from the watched status file.",
  updatedAt: "2026-06-08T12:12:00.000Z",
  isMock: false,
  cssClass: "status-card warning",
  dotClass: "state-dot warning",
  summary: "Ouroboros is warning",
  ariaLabel: "Ouroboros Warning: Waiting for handoff"
});

const mockFallbackOuroboros = {
  ok: true,
  ouroboros: {
    agent: OUROBOROS_AGENT,
    state: "idle",
    task: "No Ouroboros status",
    updatedAt: "mock",
    detail: "Ouroboros is not present in the watched status file.",
    isMock: true
  },
  errors: []
};

assert.deepEqual(toOuroborosViewModel(mockFallbackOuroboros), {
  ok: true,
  agent: OUROBOROS_AGENT,
  title: OUROBOROS_AGENT,
  state: "idle",
  stateLabel: "Idle",
  task: "No Ouroboros status (mock)",
  detail: "Ouroboros is not present in the watched status file.",
  updatedAt: "mock",
  isMock: true,
  cssClass: "status-card idle mock",
  dotClass: "state-dot idle",
  summary: "Ouroboros is idle",
  ariaLabel: "Ouroboros Idle: No Ouroboros status (mock)"
});

assert.deepEqual(toOuroborosViewModel({
  ok: false,
  ouroboros: null,
  errors: ["statuses[0].state must be one of idle, running, success, warning, error."]
}), {
  ok: false,
  agent: OUROBOROS_AGENT,
  title: "Ouroboros status unavailable",
  state: "error",
  stateLabel: "Error",
  task: "Invalid Ouroboros status",
  detail: "statuses[0].state must be one of idle, running, success, warning, error.",
  updatedAt: "unknown",
  isMock: false,
  cssClass: "status-card error",
  dotClass: "state-dot error",
  summary: "Ouroboros status input needs attention",
  ariaLabel: "Ouroboros error: Invalid Ouroboros status"
});

console.log("Ouroboros view model test passed.");
