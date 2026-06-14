#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const timerUi = require("../src/timer-ui");
const { timerToNativeStatus } = require("../src/timer-status");

function makeElement() {
  return {
    textContent: "",
    innerHTML: "",
    className: "",
    title: "",
    dataset: {},
    attributes: {},
    listeners: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    addEventListener(eventName, callback) {
      this.listeners[eventName] = callback;
    }
  };
}

function makeTimerStatus(now) {
  return timerToNativeStatus(
    {
      id: "timer-overlay-state-change-test",
      durationSeconds: 300,
      remainingSeconds: 300,
      state: "running",
      startedAt: "2026-06-14T00:00:00.000Z",
      updatedAt: "2026-06-14T00:00:00.000Z",
      displayText: "5m",
      error: "",
      replacedPrevious: false
    },
    { now }
  );
}

function payloadAt(now) {
  return {
    ok: true,
    source: "status/status.json",
    statuses: [makeTimerStatus(now)]
  };
}

const shell = makeElement();
shell.dataset.mode = "collapsed";
const summary = makeElement();
const compactPrimary = makeElement();
const compactMeta = makeElement();
const content = makeElement();
const source = makeElement();
const reload = makeElement();
const modeToggle = makeElement();

let updateCallback;
const context = {
  window: {
    DynamacPillView: {
      mountPillView() {
        return { shell, summary, compactPrimary, compactMeta, content, source, reload, modeToggle };
      }
    },
    DynamacSnufflesUi: {
      toStatusViewModel(status) {
        return {
          agent: status.agent,
          state: status.state,
          stateLabel: status.state,
          task: status.task,
          detail: status.detail,
          updatedAt: status.updatedAt,
          cssClass: `status-card ${status.state}`,
          dotClass: `state-dot ${status.state}`,
          ariaLabel: `${status.agent} ${status.state}: ${status.task}`
        };
      },
      renderStatusCard(viewModel) {
        return `<article data-agent="${viewModel.agent}"><h2>${viewModel.task}</h2></article>`;
      }
    },
    DynamacCodexUi: {
      CODEX_AGENT: "Codex",
      createCodexViewModel(statuses) { return statuses[0]; },
      renderCodexStateView(viewModel) { return `<article data-agent="Codex">${viewModel.task}</article>`; }
    },
    DynamacOuroborosUi: {
      OUROBOROS_AGENT: "Ouroboros",
      createOuroborosViewModel(statuses) { return statuses[0]; },
      renderOuroborosStateView(viewModel) { return `<article data-agent="Ouroboros">${viewModel.task}</article>`; }
    },
    DynamacTimerUi: timerUi,
    dynamacStatus: {
      async read() { return payloadAt("2026-06-14T00:00:00.000Z"); },
      onUpdate(callback) { updateCallback = callback; }
    }
  },
  document: {},
  console
};

vm.createContext(context);
vm.runInContext(fs.readFileSync(path.resolve("src/renderer.js"), "utf8"), context);

setImmediate(() => {
  assert.match(compactPrimary.innerHTML, /timer-compact-time">5:00</, "start transition should render the full countdown in compact overlay");
  assert.match(compactMeta.innerHTML, /aria-valuenow="0"/, "start transition should render zero elapsed progress");
  assert.equal(summary.textContent, "1 active job", "running timer should count as one active live activity");

  updateCallback(payloadAt("2026-06-14T00:00:01.000Z"));
  assert.match(compactPrimary.innerHTML, /timer-compact-time">4:59</, "tick transition should update compact countdown text");
  assert.match(compactMeta.innerHTML, /aria-valuenow="0"/, "one-second tick should keep rounded elapsed progress stable for a five-minute timer");
  assert.match(content.innerHTML, /Timer · 4m 59s remaining/, "expanded timer card should receive the ticked task text");

  updateCallback(payloadAt("2026-06-14T00:05:00.000Z"));
  assert.match(compactPrimary.innerHTML, /timer-compact-time">0:00</, "complete transition should clamp compact countdown to zero");
  assert.match(compactMeta.innerHTML, /aria-valuenow="100"/, "complete transition should render full elapsed progress");
  assert.equal(summary.textContent, "All systems settled", "done timer should no longer count as running");
  assert.match(content.innerHTML, /Timer done/, "expanded timer card should show the done task");
  assert.match(content.innerHTML, /5m timer elapsed\./, "expanded timer card should show deterministic elapsed detail");

  console.log("Renderer Timer state-change overlay test passed.");
});
