#!/usr/bin/env node

const assert = require("node:assert");
const {
  MOCK_OUROBOROS_UI_STATE,
  OUROBOROS_AGENT,
  renderOuroborosStateView,
  toOuroborosViewModel
} = require("../src/ouroboros-ui");

const mockUiState = {
  agent: OUROBOROS_AGENT,
  state: "warning",
  task: "Waiting for handoff",
  updatedAt: "2026-06-08T12:12:00.000Z",
  detail: "Mock UI state from the watched local JSON file.",
  isMock: false
};

const viewModel = toOuroborosViewModel(mockUiState);
const html = renderOuroborosStateView(viewModel);

assert.equal(viewModel.agent, "Ouroboros");
assert.equal(viewModel.state, "warning");
assert.equal(viewModel.stateLabel, "Warning");
assert.equal(viewModel.task, "Waiting for handoff");
assert.equal(viewModel.isMock, false);

assert.match(
  html,
  /<article class="status-card warning" aria-label="Ouroboros Warning: Waiting for handoff" data-agent="ouroboros">/,
  "Ouroboros state view should render the warning card shell"
);
assert.match(html, /<strong>Ouroboros<\/strong>/, "visible card should identify Ouroboros");
assert.match(html, /<span>Warning<\/span>/, "visible card should show the Ouroboros state");
assert.match(html, /<h2>Waiting for handoff<\/h2>/, "visible card should show the Ouroboros task");
assert.match(
  html,
  /<p>Mock UI state from the watched local JSON file\.<\/p>/,
  "visible card should show Ouroboros detail"
);
assert.match(
  html,
  /<time>2026-06-08T12:12:00\.000Z<\/time>/,
  "visible card should show Ouroboros update time"
);

const fallbackHtml = renderOuroborosStateView(toOuroborosViewModel(MOCK_OUROBOROS_UI_STATE));

assert.match(fallbackHtml, /class="status-card idle mock"/, "mock input should render the mock card");
assert.match(fallbackHtml, /<strong>Ouroboros<\/strong>/, "mock card should still identify Ouroboros");
assert.match(fallbackHtml, /<span>Idle<\/span>/, "mock card should show a visible idle state");
assert.match(fallbackHtml, /No Ouroboros status \(mock\)/, "mock card should label the mock task");

console.log("Ouroboros UI view test passed.");
