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

const completedPayload = {
  ok: true,
  source: "status/status.json",
  statuses: [
    {
      agent: "Timer",
      state: "success",
      task: "Timer done",
      updatedAt: "2026-06-14T00:05:00.000Z",
      detail: "5m timer elapsed.",
      timer: {
        id: "timer-ui-reset-test",
        durationSeconds: 300,
        remainingSeconds: 0,
        state: "done",
        startedAt: "2026-06-14T00:00:00.000Z",
        updatedAt: "2026-06-14T00:05:00.000Z",
        displayText: "5m",
        error: "",
        replacedPrevious: false
      }
    }
  ]
};

const resetPayload = {
  ok: true,
  source: "status/status.json",
  statuses: [
    {
      agent: "Timer",
      state: "idle",
      task: "Timer · 5m remaining",
      updatedAt: "2026-06-14T00:01:00.000Z",
      detail: "5m remaining of 5m.",
      timer: {
        ...completedPayload.statuses[0].timer,
        remainingSeconds: 300,
        state: "reset",
        startedAt: "2026-06-14T00:01:00.000Z",
        updatedAt: "2026-06-14T00:01:00.000Z"
      }
    }
  ]
};

const resetCalls = [];
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
      async read() { return completedPayload; },
      onUpdate() {}
    },
    dynamacTimer: {
      async reset(options) {
        resetCalls.push(options);
        return { ok: true, payload: resetPayload };
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
  assert.match(content.innerHTML, /data-action="timer-reset"/, "completed Timer card should render a reset action");
  assert.match(content.innerHTML, /data-timer-id="timer-ui-reset-test"/, "reset action should carry the completed timer id");

  content.listeners.click({
    target: {
      closest(selector) {
        assert.equal(selector, '[data-action="timer-reset"], [data-action="timer-stop"]');
        return {
          getAttribute(name) {
            if (name === "data-action") return "timer-reset";
            assert.equal(name, "data-timer-id");
            return "timer-ui-reset-test";
          }
        };
      }
    }
  });

  setImmediate(() => {
    assert.deepEqual(resetCalls, [{ timerId: "timer-ui-reset-test" }], "clicking Reset on a completed timer should invoke the reset operation with the timer id");
    assert.equal(summary.textContent, "All systems settled", "reset response should re-render the returned Timer status");
    assert.doesNotMatch(content.innerHTML, /data-action="timer-reset"/, "reset Timer card should not keep the running-only reset button");
    assert.match(content.innerHTML, /Timer · 5m remaining/, "reset response should show restored duration text");
    console.log("Renderer Timer reset interaction test passed.");
  });
});
