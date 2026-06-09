#!/usr/bin/env node

const assert = require("node:assert");
const {
  OUROBOROS_AGENT,
  toOuroborosViewModel
} = require("../src/ouroboros-state");

const sampleParsedOuroboros = {
  ok: true,
  ouroboros: {
    agent: OUROBOROS_AGENT,
    state: "warning",
    task: "Waiting for handoff",
    updatedAt: "2026-06-08T12:12:00.000Z",
    detail: "Real status data from the watched status file.",
    isMock: false
  },
  errors: []
};

assert.deepEqual(toOuroborosViewModel(sampleParsedOuroboros), {
  ok: true,
  agent: OUROBOROS_AGENT,
  title: OUROBOROS_AGENT,
  state: "warning",
  stateLabel: "Warning",
  task: "Waiting for handoff",
  detail: "Real status data from the watched status file.",
  updatedAt: "2026-06-08T12:12:00.000Z",
  isMock: false,
  cssClass: "status-card warning",
  dotClass: "state-dot warning",
  summary: "Ouroboros is warning",
  ariaLabel: "Ouroboros Warning: Waiting for handoff"
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
