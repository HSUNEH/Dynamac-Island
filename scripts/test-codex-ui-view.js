#!/usr/bin/env node

const assert = require("node:assert");
const {
  CODEX_AGENT,
  createCodexViewModel,
  renderCodexStateView,
  toCodexViewModel
} = require("../src/codex-ui");

const sampleUiState = {
  agent: CODEX_AGENT,
  state: "running",
  task: "Applying repository edits",
  updatedAt: "2026-06-08T12:11:00.000Z",
  detail: "Real status state from the watched local JSON file.",
  isMock: false
};

const viewModel = toCodexViewModel(sampleUiState);
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
  /<p>Real status state from the watched local JSON file\.<\/p>/,
  "visible card should show Codex detail"
);
assert.match(
  html,
  /<time>2026-06-08T12:11:00\.000Z<\/time>/,
  "visible card should show Codex update time"
);

assert.equal(createCodexViewModel([]), null, "missing Codex source state should not render synthetic status data");

console.log("Codex UI view test passed.");
