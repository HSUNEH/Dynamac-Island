#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const rootDir = path.resolve(__dirname, "..");
const electronBin = path.join(
  rootDir,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "electron.cmd" : "electron"
);

if (!fs.existsSync(electronBin)) {
  console.error("Electron is not installed. Run `npm install` before `npm run smoke:launch`.");
  process.exit(1);
}

let sawReadyMarker = false;
let output = "";

const child = spawn(electronBin, [rootDir], {
  cwd: rootDir,
  env: {
    ...process.env,
    DYNAMAC_SMOKE_TEST: "1"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

const timeout = setTimeout(() => {
  child.kill("SIGTERM");
  console.error("Smoke launch timed out before the app finished loading.");
  if (output.trim()) {
    console.error(output.trim());
  }
  process.exit(1);
}, 15000);

function capture(chunk) {
  const text = chunk.toString();
  output += text;
  if (text.includes("DYNAMAC_SMOKE_READY")) {
    sawReadyMarker = true;
  }
}

child.stdout.on("data", capture);
child.stderr.on("data", capture);

child.on("error", (error) => {
  clearTimeout(timeout);
  console.error(`Smoke launch failed to start Electron: ${error.message}`);
  process.exit(1);
});

child.on("close", (code, signal) => {
  clearTimeout(timeout);

  if (code === 0 && sawReadyMarker) {
    console.log("Smoke launch passed: Electron loaded the Dynamac Island window.");
    return;
  }

  const reason = signal ? `signal ${signal}` : `exit code ${code}`;
  console.error(`Smoke launch failed with ${reason}.`);
  if (!sawReadyMarker) {
    console.error("The app did not emit DYNAMAC_SMOKE_READY.");
  }
  if (output.trim()) {
    console.error(output.trim());
  }
  process.exit(1);
});
