#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const timerUi = require("../src/timer-ui");

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
    getAttribute(name) {
      return this.attributes[name];
    },
    addEventListener(eventName, callback) {
      this.listeners[eventName] = callback;
    }
  };
}

const repoRoot = path.resolve(__dirname, "..");
const donePayload = JSON.parse(fs.readFileSync(path.join(repoRoot, "fixtures", "timer-done-status.json"), "utf8"));
const doneTimerStatus = donePayload.statuses[0];

const doneViewModel = timerUi.createTimerViewModel(doneTimerStatus, {
  now: "2026-06-14T00:05:00.000Z"
});
assert.equal(doneViewModel.remainingSeconds, 0, "done timer should render from zero remaining seconds");
assert.equal(doneViewModel.remainingText, "Done", "done timer UI view model should preserve serialized display text");
assert.equal(doneViewModel.progressPercent, 100, "done timer UI view model should render complete progress");

const compactPrimary = makeElement();
const compactMeta = makeElement();
timerUi.applyCompactTimerView({ compactPrimary, compactMeta }, doneViewModel);
assert.match(compactPrimary.innerHTML, /timer-compact-label">Timer</, "compact overlay should keep Timer label for done state");
assert.match(compactPrimary.innerHTML, /timer-compact-time">Done</, "compact overlay should show serialized done text");
assert.doesNotMatch(compactPrimary.innerHTML, /timer-compact-time">0:00</, "compact overlay should not replace serialized done text with clock text");
assert.match(compactMeta.innerHTML, /aria-valuenow="100"/, "compact overlay should expose completed progress");
assert.match(compactMeta.innerHTML, /100% elapsed/, "compact overlay should show completed progress text");

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
  source: "fixtures/timer-done-status.json",
  statuses: donePayload.statuses
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
vm.runInContext(fs.readFileSync(path.join(repoRoot, "src", "renderer.js"), "utf8"), context);

setImmediate(() => {
  assert.equal(summary.textContent, "All systems settled", "done timer should not count as a running job");
  assert.match(rendererCompactPrimary.innerHTML, /timer-compact-time">Done</, "renderer compact overlay should show serialized done timer text");
  assert.doesNotMatch(rendererCompactPrimary.innerHTML, /timer-compact-time">0:00</, "renderer compact overlay should not show raw zero clock text for done state");
  assert.match(rendererCompactMeta.innerHTML, /aria-valuenow="100"/, "renderer compact overlay should render done progress");
  assert.match(content.innerHTML, /data-agent="Timer"/, "expanded content should render the Timer card");
  assert.match(content.innerHTML, /Timer done/, "expanded content should preserve serialized status task text");
  assert.match(content.innerHTML, /100% elapsed/, "expanded Timer card should render completed progress text");
  console.log("Renderer timer done rendering test passed.");
});
