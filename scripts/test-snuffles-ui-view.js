#!/usr/bin/env node

const assert = require("node:assert");
const {
  SNUFFLES_AGENT,
  createSnufflesViewModel,
  renderStatusCard
} = require("../src/snuffles-ui");

const snufflesViewModel = createSnufflesViewModel([
  {
    agent: SNUFFLES_AGENT,
    state: "running",
    task: "Watching desktop context",
    updatedAt: "2026-06-08T12:00:00.000Z",
    detail: "Sampling local status events for the island preview."
  }
]);

assert.equal(snufflesViewModel.agent, "Snuffles");
assert.equal(snufflesViewModel.state, "running");
assert.equal(snufflesViewModel.stateLabel, "Running");
assert.equal(snufflesViewModel.task, "Watching desktop context");
assert.equal(snufflesViewModel.isMock, false);

const html = renderStatusCard(snufflesViewModel);

assert.match(html, /<article class="status-card running" aria-label="Snuffles Running: Watching desktop context">/);
assert.match(html, /<strong>Snuffles<\/strong>/, "visible card should identify Snuffles");
assert.match(html, /<span>Running<\/span>/, "visible card should show the Snuffles state");
assert.match(html, /<h2>Watching desktop context<\/h2>/, "visible card should show the Snuffles task");
assert.match(
  html,
  /<p>Sampling local status events for the island preview\.<\/p>/,
  "visible card should show Snuffles detail"
);
assert.match(
  html,
  /<time>2026-06-08T12:00:00\.000Z<\/time>/,
  "visible card should show Snuffles update time"
);

const mockHtml = renderStatusCard(createSnufflesViewModel([]));

assert.match(mockHtml, /class="status-card idle mock"/, "missing source state should render the mock card");
assert.match(mockHtml, /<strong>Snuffles<\/strong>/, "mock card should still identify Snuffles");
assert.match(mockHtml, /<span>Idle<\/span>/, "mock card should show a visible idle state");
assert.match(mockHtml, /No Snuffles status \(mock\)/, "mock card should label the mock task");

console.log("Snuffles UI view test passed.");
