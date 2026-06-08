#!/usr/bin/env node

const path = require("node:path");
const { loadStatusFile } = require("../src/status-loader");

const statusPath = path.resolve(process.argv[2] || "status/status.json");

function main() {
  const result = loadStatusFile(statusPath);
  if (!result.ok) {
    console.error(`Status validation failed: ${statusPath}`);
    for (const issue of result.errors) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log(`Status validation passed: ${statusPath}`);
  console.log(`Loaded ${result.statuses.length} status item(s).`);
}

main();
