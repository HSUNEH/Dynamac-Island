#!/usr/bin/env node

const assert = require("node:assert");
const {
  CODEX_AGENT,
  MOCK_CODEX_UI_STATE,
  renderCodexStateView,
  toCodexViewModel
} = require("../src/codex-ui");

const mockUiState = {
  agent: CODEX_AGENT,
  state: "running",
  task: "Applying repository edits",
  updatedAt: "2026-06-08T12:11:00.000Z",
  detail: "Mock UI state from the watched local JSON file.",
  isMock: false
};

const viewModel = toCodexViewModel(mockUiState);
const html = renderCodexStateView(viewModel);

assert.equal(viewModel.agent, "Codex");
assert.equal(viewModel.state, "running");
assert.equal(viewModel.stateLabel, "Running");
assert.equal(viewModel.task, "Applying repository edits");
assert.equal(viewModel.isMock, false);

assert.match(
  html,
  /<article class="status-card running" aria-label="Codex Running: Applying repository edits" data-agent="codex">/,
  "Codex state view should render the running card shell"
);
assert.match(html, /<strong>Codex<\/strong>/, "visible card should identify Codex");
assert.match(html, /<span>Running<\/span>/, "visible card should show the Codex state");
assert.match(html, /<h2>Applying repository edits<\/h2>/, "visible card should show the Codex task");
assert.match(
  html,
  /<p>Mock UI state from the watched local JSON file\.<\/p>/,
  "visible card should show Codex detail"
);
assert.match(
  html,
  /<time>2026-06-08T12:11:00\.000Z<\/time>/,
  "visible card should show Codex update time"
);

const fallbackHtml = renderCodexStateView(toCodexViewModel(MOCK_CODEX_UI_STATE));

assert.match(fallbackHtml, /class="status-card idle mock"/, "mock input should render the mock card");
assert.match(fallbackHtml, /<strong>Codex<\/strong>/, "mock card should still identify Codex");
assert.match(fallbackHtml, /<span>Idle<\/span>/, "mock card should show a visible idle state");
assert.match(fallbackHtml, /No Codex status \(mock\)/, "mock card should label the mock task");

console.log("Codex UI view test passed.");
