#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

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

const payload = {
  ok: true,
  source: "status/status.json",
  statuses: [
    {
      agent: "Snuffles",
      state: "running",
      task: "Watching Hermes runtime",
      updatedAt: "2026-06-08T14:05:00.000Z",
      detail: "2 Hermes gateway processes active on this Mac."
    },
    {
      agent: "Hermes Gateway",
      state: "running",
      task: "Gateway online",
      updatedAt: "2026-06-08T14:05:00.000Z",
      detail: "Profiles: build, default."
    },
    {
      agent: "Active Session",
      state: "warning",
      task: "Latest Hermes session",
      updatedAt: "2026-06-08T14:00:00.000Z",
      detail: "Session state: suspended. Title, token count, and cost are hidden on the overlay."
    }
  ]
};

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
          },
          toggleMode() {
            shell.dataset.mode = shell.dataset.mode === "expanded" ? "collapsed" : "expanded";
            toggle.setAttribute("aria-expanded", shell.dataset.mode === "expanded" ? "true" : "false");
          }
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
        return `<article data-agent="${viewModel.agent}"><h2>${viewModel.task}</h2><p>${viewModel.detail}</p></article>`;
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
  assert.equal(summary.textContent, "2 active jobs", "expanded summary should preserve active count");
  assert.equal(compactPrimary.textContent, "Snuffles · Running", "collapsed primary should show the top-priority activity");
  assert.equal(compactMeta.textContent, "2 active · 1 warning", "collapsed metadata should show live activity counts");
  assert.equal(modeToggle.attributes["aria-expanded"], "false", "island should remain collapsed after rendering status");
  assert.match(content.innerHTML, /data-agent="Snuffles"/);
  assert.doesNotMatch(content.innerHTML, /No Codex status|No Ouroboros status|mock/i);
  console.log("Renderer compact summary test passed.");
});
