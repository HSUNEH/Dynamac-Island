#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const timerUi = require("../src/timer-ui");

const timerStatus = {
  agent: "Timer",
  state: "running",
  task: "Timer · 4m 30s remaining",
  updatedAt: "2026-06-14T00:00:00.000Z",
  now: "2026-06-14T00:00:30.000Z",
  detail: "4m 30s remaining of 5m.",
  timer: {
    id: "timer-ui-component-test",
    durationSeconds: 300,
    remainingSeconds: 270,
    state: "running",
    startedAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
    displayText: "4m 30s",
    error: "",
    replacedPrevious: true
  }
};

const viewModel = timerUi.createTimerViewModel(timerStatus, {
  now: "2026-06-14T00:00:30.250Z"
});
assert.equal(viewModel.agent, "Timer");
assert.equal(viewModel.remainingText, "4:30", "compact timer time should use clock text");
assert.equal(viewModel.progressPercent, 10, "progress should reflect elapsed/duration");
assert.equal(viewModel.progressLabel, "10% elapsed");
assert.equal(viewModel.isRunning, true);
assert.equal(viewModel.replacedPrevious, true);
assert.equal(timerUi.formatClock(3661), "1:01:01", "clock text should support hour-long timers");

const compactPrimary = { innerHTML: "", title: "" };
const compactMeta = { innerHTML: "", title: "" };
timerUi.applyCompactTimerView({ compactPrimary, compactMeta }, viewModel);
assert.match(compactPrimary.innerHTML, /timer-compact-label">Timer</, "compact primary should show the Timer label");
assert.match(compactPrimary.innerHTML, /timer-compact-time">4:30</, "compact primary should show remaining time");
assert.match(compactMeta.innerHTML, /role="progressbar"/, "compact metadata should expose progressbar semantics");
assert.match(compactMeta.innerHTML, /aria-valuenow="10"/, "compact progress should expose elapsed percentage");
assert.match(compactMeta.innerHTML, /width: 10%/, "compact progress fill should render visible width");
assert.match(compactMeta.innerHTML, /10% elapsed/, "compact progress should show visible progress text");

const statusCardHtml = timerUi.renderTimerStateView(viewModel);
assert.match(statusCardHtml, /data-agent="Timer"/, "expanded card should identify Timer");
assert.match(statusCardHtml, /Timer · 4m 30s remaining/, "expanded card should keep status task text");
assert.match(statusCardHtml, /aria-valuenow="10"/, "expanded card should reuse deterministic timer progress");

const pausedTimerStatus = {
  ...timerStatus,
  state: "idle",
  task: "Timer · 4m 30s remaining",
  detail: "4m 30s remaining of 5m.",
  timer: {
    ...timerStatus.timer,
    state: "stopped"
  }
};
const pausedViewModel = timerUi.createTimerViewModel(pausedTimerStatus, {
  now: "2026-06-14T00:04:00.000Z"
});
assert.equal(pausedViewModel.isRunning, false, "paused Timer should not be treated as running");
assert.equal(pausedViewModel.canReset, true, "paused Timer should expose the reset control");
assert.match(
  timerUi.renderTimerStateView(pausedViewModel),
  /data-action="timer-reset"/,
  "paused Timer card should render a reset action"
);

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

const shell = makeElement();
shell.dataset.mode = "collapsed";
const summary = makeElement();
const rendererCompactPrimary = makeElement();
const rendererCompactMeta = makeElement();
const content = makeElement();
const source = makeElement();
const reload = makeElement();
const modeToggle = makeElement();

const payload = {
  ok: true,
  source: "fixtures/timer-running-status.json",
  statuses: [
    timerStatus,
    {
      agent: "Now Playing",
      state: "running",
      task: "Background track",
      updatedAt: "2026-06-14T00:00:00.000Z",
      detail: "Timer must take compact overlay priority while active."
    }
  ]
};

const context = {
  window: {
    DynamacPillView: {
      mountPillView() {
        return {
          shell,
          summary,
          compactPrimary: rendererCompactPrimary,
          compactMeta: rendererCompactMeta,
          content,
          source,
          reload,
          modeToggle
        };
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
      async read() { return payload; },
      onUpdate() {}
    }
  },
  document: {},
  console
};

vm.createContext(context);
vm.runInContext(fs.readFileSync(path.resolve("src/renderer.js"), "utf8"), context);

setImmediate(() => {
  assert.equal(summary.textContent, "2 active jobs", "renderer summary should preserve active status count");
  assert.match(rendererCompactPrimary.innerHTML, /timer-compact-label">Timer</, "renderer compact overlay should show Timer label");
  assert.match(rendererCompactPrimary.innerHTML, /timer-compact-time">4:30</, "renderer compact overlay should show Timer time");
  assert.match(rendererCompactMeta.innerHTML, /aria-valuenow="10"/, "renderer compact overlay should show Timer progress");
  assert.match(content.innerHTML, /data-agent="Timer"/, "expanded content should render Timer card through timer UI module");
  console.log("Timer UI component test passed.");
});
