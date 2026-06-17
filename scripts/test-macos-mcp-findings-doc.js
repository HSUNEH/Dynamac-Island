#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const docPath = path.join(__dirname, "..", "docs", "macos-mcp-context-findings.md");
const doc = fs.readFileSync(docPath, "utf8");

const requiredPhrases = [
  "Network access succeeded",
  "cyanheads/macos-mcp-server",
  "macos-check-permissions.tool.ts",
  "macos-manage-apps.tool.ts",
  "macos-manage-windows.tool.ts",
  "osascript-service.ts",
  "Local-first command surface",
  "Read-only active context before control",
  "Permission diagnostics are first-class data",
  "Degrade visibly instead of failing silently",
  "No broad vendoring",
  "do not bypass macOS Accessibility or Screen Recording permissions",
  "activeApp",
  "activeWindow",
  "uiTreeContext",
  "permissionStatus",
  "degradationState",
  "statusSource"
];

for (const phrase of requiredPhrases) {
  assert.ok(doc.includes(phrase), `macOS-MCP findings doc should include ${phrase}`);
}

assert.doesNotMatch(doc, /TODO|TBD|blocker pending/i, "findings doc must not leave research placeholders");
console.log("macOS-MCP findings doc contract passed");
