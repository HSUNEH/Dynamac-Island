#!/usr/bin/env node

const path = require("node:path");
const { writeMacActivityStatusSnapshot } = require("../src/mac-activity-status");

const outputPath = path.resolve(process.argv[2] || ".build/status.json");
const result = writeMacActivityStatusSnapshot({
  outputPath,
  hudEventStorePath: process.env.DYNAMAC_HUD_EVENT_STORE || ""
});

console.log(`Mac activity snapshot written: ${result.outputPath}`);
console.log(`Loaded ${result.payload.statuses.length} status item(s).`);
