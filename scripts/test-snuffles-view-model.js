#!/usr/bin/env node

const assert = require("node:assert");
const {
  SNUFFLES_AGENT,
  toSnufflesViewModel
} = require("../src/snuffles-state");

const sampleParsedSnuffles = {
  ok: true,
  snuffles: {
    agent: SNUFFLES_AGENT,
    state: "running",
    task: "Collecting local signals",
    updatedAt: "2026-06-08T12:10:00.000Z",
    detail: "Real status data from the watched status file.",
    isMock: false
  },
  errors: []
};

assert.deepEqual(toSnufflesViewModel(sampleParsedSnuffles), {
  ok: true,
  agent: SNUFFLES_AGENT,
  title: SNUFFLES_AGENT,
  state: "running",
  stateLabel: "Running",
  task: "Collecting local signals",
  detail: "Real status data from the watched status file.",
  updatedAt: "2026-06-08T12:10:00.000Z",
  isMock: false,
  cssClass: "status-card running",
  dotClass: "state-dot running",
  summary: "Snuffles is running",
  ariaLabel: "Snuffles Running: Collecting local signals"
});

assert.deepEqual(toSnufflesViewModel({
  ok: false,
  snuffles: null,
  errors: ["statuses[0].task must be a non-empty string."]
}), {
  ok: false,
  agent: SNUFFLES_AGENT,
  title: "Snuffles status unavailable",
  state: "error",
  stateLabel: "Error",
  task: "Invalid Snuffles status",
  detail: "statuses[0].task must be a non-empty string.",
  updatedAt: "unknown",
  isMock: false,
  cssClass: "status-card error",
  dotClass: "state-dot error",
  summary: "Snuffles status input needs attention",
  ariaLabel: "Snuffles error: Invalid Snuffles status"
});

console.log("Snuffles view model test passed.");
