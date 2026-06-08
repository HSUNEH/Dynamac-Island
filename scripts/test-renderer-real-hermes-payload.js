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
    addEventListener() {}
  };
}

const summary = makeElement();
const content = makeElement();
const source = makeElement();
const reload = makeElement();

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
      state: "running",
      task: "Latest Hermes session",
      updatedAt: "2026-06-08T14:00:00.000Z",
      detail: "Session state: active. Title, token count, and cost are hidden on the overlay."
    }
  ]
};

const context = {
  window: {
    DynamacPillView: {
      mountPillView() {
        return { summary, content, source, reload };
      }
    },
    DynamacSnufflesUi: {
      SNUFFLES_AGENT: "Snuffles",
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
      createCodexViewModel(statuses) {
        const status = statuses[0];
        return { agent: status.agent, task: status.task };
      },
      renderCodexStateView(viewModel) {
        return `<article data-agent="Codex"><h2>${viewModel.task}</h2></article>`;
      }
    },
    DynamacOuroborosUi: {
      OUROBOROS_AGENT: "Ouroboros",
      createOuroborosViewModel(statuses) {
        const status = statuses[0];
        return { agent: status.agent, task: status.task };
      },
      renderOuroborosStateView(viewModel) {
        return `<article data-agent="Ouroboros"><h2>${viewModel.task}</h2></article>`;
      }
    },
    dynamacStatus: {
      async read() {
        return payload;
      },
      onUpdate() {}
    }
  },
  document: {},
  console
};

vm.createContext(context);
vm.runInContext(fs.readFileSync(path.resolve("src/renderer.js"), "utf8"), context);

setImmediate(() => {
  assert.match(content.innerHTML, /data-agent="Snuffles"/);
  assert.match(content.innerHTML, /data-agent="Hermes Gateway"/);
  assert.match(content.innerHTML, /data-agent="Active Session"/);
  assert.doesNotMatch(content.innerHTML, /data-agent="Codex"|No Codex status|mock/i);
  assert.doesNotMatch(content.innerHTML, /data-agent="Ouroboros"|No Ouroboros status|mock/i);
  console.log("Renderer real Hermes payload test passed.");
});
