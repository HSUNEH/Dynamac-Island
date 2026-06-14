#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const timerUi = require("../src/timer-ui");

function makeElement() {
  return {
    textContent: "",
    className: "",
    innerHTML: "",
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
const compactPrimary = makeElement();
const compactMeta = makeElement();
const content = makeElement();
const source = makeElement();
const reload = makeElement();
const modeToggle = makeElement();

const runningPayload = {
  ok: true,
  source: "status/status.json",
  statuses: [
    {
      agent: "Timer",
      state: "running",
      task: "Timer · 4m 30s remaining",
      updatedAt: "2026-06-14T00:00:30.000Z",
      detail: "4m 30s remaining of 5m.",
      timer: {
        id: "timer-ui-stop-test",
        durationSeconds: 300,
        remainingSeconds: 270,
        state: "running",
        startedAt: "2026-06-14T00:00:00.000Z",
        updatedAt: "2026-06-14T00:00:30.000Z",
        displayText: "5m",
        error: "",
        replacedPrevious: false
      }
    }
  ]
};

const stoppedPayload = {
  ok: true,
  source: "status/status.json",
  statuses: [
    {
      agent: "Timer",
      state: "idle",
      task: "Timer · 4m 30s remaining",
      updatedAt: "2026-06-14T00:00:30.000Z",
      detail: "Stopped with 4m 30s remaining of 5m.",
      timer: {
        ...runningPayload.statuses[0].timer,
        state: "stopped"
      }
    }
  ]
};

const stopCalls = [];
const context = {
  window: {
    DynamacPillView: {
      mountPillView() {
        return { shell, summary, compactPrimary, compactMeta, content, source, reload, modeToggle };
      },
      createModeController({ shell, toggle }) {
        toggle.setAttribute("aria-expanded", "false");
        return {
          getMode() {
            return shell.dataset.mode;
          }
        };
      }
    },
    DynamacSnufflesUi: {
      toStatusViewModel(status) { return status; },
      renderStatusCard(status) { return `<article data-agent="${status.agent}">${status.task}</article>`; }
    },
    DynamacCodexUi: {
      CODEX_AGENT: "Codex",
      createCodexViewModel(statuses) { return statuses[0]; },
      renderCodexStateView(status) { return `<article data-agent="Codex">${status.task}</article>`; }
    },
    DynamacOuroborosUi: {
      OUROBOROS_AGENT: "Ouroboros",
      createOuroborosViewModel(statuses) { return statuses[0]; },
      renderOuroborosStateView(status) { return `<article data-agent="Ouroboros">${status.task}</article>`; }
    },
    DynamacTimerUi: timerUi,
    dynamacStatus: {
      async read() { return runningPayload; },
      onUpdate() {}
    },
    dynamacTimer: {
      async stop(options) {
        stopCalls.push(options);
        return { ok: true, payload: stoppedPayload };
      }
    }
  },
  document: {},
  console,
  setImmediate
};

vm.createContext(context);
vm.runInContext(fs.readFileSync(path.resolve("src/renderer.js"), "utf8"), context);

setImmediate(() => {
  assert.match(content.innerHTML, /data-action="timer-stop"/, "running Timer card should render a stop action");
  assert.match(content.innerHTML, /data-timer-id="timer-ui-stop-test"/, "stop action should carry the running timer id");

  content.listeners.click({
    target: {
      closest(selector) {
        assert.equal(selector, '[data-action="timer-reset"], [data-action="timer-stop"]');
        return {
          getAttribute(name) {
            if (name === "data-action") return "timer-stop";
            assert.equal(name, "data-timer-id");
            return "timer-ui-stop-test";
          }
        };
      }
    }
  });

  setImmediate(() => {
    assert.deepEqual(stopCalls, [{ timerId: "timer-ui-stop-test" }], "clicking Stop should invoke the native Timer stop request payload");
    assert.equal(summary.textContent, "All systems settled", "stop response should re-render returned Timer status");
    assert.doesNotMatch(content.innerHTML, /data-action="timer-stop"/, "stopped Timer card should not keep the running-only stop button");
    assert.match(content.innerHTML, /Stopped with 4m 30s remaining of 5m\./, "stop response should show stopped status detail");
    console.log("Renderer Timer stop interaction test passed.");
  });
});
