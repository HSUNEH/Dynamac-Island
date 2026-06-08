#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const scriptPath = path.resolve(__dirname, "install-macbook.sh");
const script = fs.readFileSync(scriptPath, "utf8");

const requiredSnippets = [
  "set -euo pipefail",
  "DYNAMAC_ISLAND_DIR",
  "DYNAMAC_ISLAND_REPO",
  "https://github.com/HSUNEH/dynamac-island.git",
  "git clone",
  "npm install",
  "npm run check",
  "npm run smoke:launch",
  "npm start"
];

const missing = requiredSnippets.filter((snippet) => !script.includes(snippet));

if (missing.length > 0) {
  console.error("install-macbook script test failed.");
  for (const snippet of missing) {
    console.error(`- Missing snippet: ${snippet}`);
  }
  process.exit(1);
}

console.log("install-macbook script test passed.");
