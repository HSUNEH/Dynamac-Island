#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const nodeCommand = process.execPath;
const checkerPath = path.resolve("scripts/check-readme.js");
const readme = fs.readFileSync("README.md", "utf8");

function runChecker(readmeContent) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dynamac-readme-check-"));
  const tempReadmePath = path.join(tempDir, "README.md");
  fs.writeFileSync(tempReadmePath, readmeContent);

  return spawnSync(nodeCommand, [checkerPath, tempReadmePath], {
    encoding: "utf8"
  });
}

const validResult = runChecker(readme);

assert.equal(
  validResult.status,
  0,
  `check-readme should pass for the current README.\nstdout:\n${validResult.stdout}\nstderr:\n${validResult.stderr}`
);
assert.match(
  validResult.stdout,
  /README content check passed\./,
  "check-readme should print a success message for the current README"
);

const missingManualPathResult = runChecker(
  readme.replace("Use this exact path when headless UI automation cannot prove that the live island updates on screen", "")
);

assert.notEqual(
  missingManualPathResult.status,
  0,
  `check-readme should fail when the manual verification path is missing.\nstdout:\n${missingManualPathResult.stdout}\nstderr:\n${missingManualPathResult.stderr}`
);
assert.match(
  missingManualPathResult.stderr,
  /Missing manual update verification purpose/,
  "check-readme should report the missing manual verification path"
);

const missingManualStepResult = runChecker(
  readme.replace("Observe the running app without relaunching and confirm the pill shows an error state for the invalid status input.", "")
);

assert.notEqual(
  missingManualStepResult.status,
  0,
  `check-readme should fail when a required manual verification step is missing.\nstdout:\n${missingManualStepResult.stdout}\nstderr:\n${missingManualStepResult.stderr}`
);
assert.match(
  missingManualStepResult.stderr,
  /Missing manual invalid JSON observation/,
  "check-readme should report the missing manual verification step"
);

const unsafeInstallerResult = runChecker(
  `${readme}\n\n\`\`\`sh\ncurl -fsSL https://raw.githubusercontent.com/HSUNEH/dynamac-island/main/scripts/install-macbook.sh | bash\n\`\`\`\n`
);

assert.notEqual(
  unsafeInstallerResult.status,
  0,
  `check-readme should fail when README documents a curl-pipe-to-shell installer.\nstdout:\n${unsafeInstallerResult.stdout}\nstderr:\n${unsafeInstallerResult.stderr}`
);
assert.match(
  unsafeInstallerResult.stderr,
  /Missing safe install instructions/,
  "check-readme should report unsafe curl-pipe-to-shell install instructions"
);

console.log("check-readme npm script test passed.");
