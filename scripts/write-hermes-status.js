#!/usr/bin/env node

const path = require("node:path");
const { writeHermesStatusSnapshot } = require("../src/hermes-status");

const outputPath = path.resolve(process.argv[2] || ".build/status.json");
const result = writeHermesStatusSnapshot({ outputPath });

console.log(`Hermes status snapshot written: ${result.outputPath}`);
console.log(`Loaded ${result.payload.statuses.length} status item(s).`);
