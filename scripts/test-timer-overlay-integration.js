#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { createAppState, updateAppStateFromStatusPayload } = require("../src/app-state");
const { loadStatusFile } = require("../src/status-loader");
const { parseTimerDuration } = require("../src/timer-duration");
const { createTimerState, startTimer } = require("../src/timer-state");
const {
  refreshTimerStatusSnapshot,
  writeTimerStatusSnapshot
} = require("../src/timer-status-store");
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
    addEventListener(eventName, callback) {
      this.listeners[eventName] = callback;
    }
  };
}

function mountRenderer({ readStatus }) {
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
        async read() { return readStatus(); },
        onUpdate(callback) { updateCallback = callback; }
      }
    },
    document: {},
    console
  };

  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.resolve("src/renderer.js"), "utf8"), context);

  return {
    compactMeta,
    compactPrimary,
    content,
    source,
    summary,
    pushStatus(payload) {
      assert.equal(typeof updateCallback, "function", "renderer should subscribe to status model updates");
      updateCallback(payload);
    }
  };
}

function loadThroughAppStatusModel(statusPath, appState, appliedAt) {
  const loaded = loadStatusFile(statusPath);
  assert.equal(loaded.ok, true, `timer status file should validate before rendering: ${loaded.errors.join(", ")}`);
  updateAppStateFromStatusPayload(appState, loaded, { now: () => appliedAt });
  assert.equal(appState.status.source, statusPath, "app status model should preserve the local status file source");
  assert.equal(appState.status.statuses.length, 1, "timer integration should expose exactly one status item");
  return appState.status;
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dynamac-timer-overlay-integration-"));
const statusPath = path.join(tempDir, "status.json");

try {
  const appState = createAppState();
  const timerState = createTimerState();
  const timer = startTimer(timerState, parseTimerDuration("5m"), {
    id: "timer-overlay-integration-test",
    now: () => "2026-06-14T00:00:00.000Z"
  });

  writeTimerStatusSnapshot({
    outputPath: statusPath,
    timer,
    now: "2026-06-14T00:00:00.000Z"
  });
  const initialPayload = loadThroughAppStatusModel(statusPath, appState, "2026-06-14T00:00:00.100Z");
  const renderer = mountRenderer({ readStatus: () => appState.status });

  setImmediate(() => {
    assert.equal(initialPayload.statuses[0].timer.state, "running", "core timer start should publish a running timer status");
    assert.match(renderer.compactPrimary.innerHTML, /timer-compact-time">5:00</, "initial running timer should render in the compact notch surface");
    assert.match(renderer.compactMeta.innerHTML, /aria-valuenow="0"/, "initial timer should render zero elapsed progress");
    assert.match(renderer.content.innerHTML, /Timer · 5m remaining/, "initial timer should render through the expanded status representation");
    assert.equal(renderer.summary.textContent, "1 active job", "running timer should count as an active live activity");
    assert.equal(renderer.source.textContent, statusPath, "renderer should show the propagated local status source");

    writeTimerStatusSnapshot({
      outputPath: statusPath,
      timer,
      now: "2026-06-14T00:02:30.000Z"
    });
    const tickPayload = loadThroughAppStatusModel(statusPath, appState, "2026-06-14T00:02:30.100Z");
    renderer.pushStatus(tickPayload);

    assert.equal(tickPayload.statuses[0].timer.remainingSeconds, 150, "status model should carry the changed countdown value");
    assert.match(renderer.compactPrimary.innerHTML, /timer-compact-time">2:30</, "timer tick should propagate from status model into compact rendering");
    assert.match(renderer.compactMeta.innerHTML, /aria-valuenow="50"/, "timer tick should propagate into rendered progress");
    assert.match(renderer.content.innerHTML, /Timer · 2m 30s remaining/, "timer tick should propagate into expanded status text");
    assert.match(renderer.content.innerHTML, /2m 30s remaining of 5m\./, "timer tick should propagate into expanded detail text");

    refreshTimerStatusSnapshot(timerState, {
      outputPath: statusPath,
      now: () => "2026-06-14T00:05:01.000Z",
      statusNow: "2026-06-14T00:05:01.000Z"
    });
    const donePayload = loadThroughAppStatusModel(statusPath, appState, "2026-06-14T00:05:01.100Z");
    renderer.pushStatus(donePayload);

    assert.equal(donePayload.statuses[0].state, "success", "elapsed timer should publish success status");
    assert.equal(donePayload.statuses[0].timer.state, "done", "elapsed timer should publish done timer lifecycle");
    assert.match(renderer.compactPrimary.innerHTML, /timer-compact-time">Done</, "done timer should propagate into compact rendering");
    assert.match(renderer.compactMeta.innerHTML, /aria-valuenow="100"/, "done timer should propagate into full rendered progress");
    assert.match(renderer.content.innerHTML, /Timer done/, "done timer should propagate into expanded status title");
    assert.match(renderer.content.innerHTML, /5m timer elapsed\./, "done timer should propagate into expanded status detail");
    assert.equal(renderer.summary.textContent, "All systems settled", "done timer should no longer count as active after renderer update");

    console.log("Timer overlay integration test passed.");
  });
} finally {
  process.on("exit", () => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
}
