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

const missingNotchConceptResult = runChecker(
  readme.replace("macOS notch-attached utility island for everyday Mac activity", "")
);

assert.notEqual(
  missingNotchConceptResult.status,
  0,
  `check-readme should fail when the notch island identity is missing.\nstdout:\n${missingNotchConceptResult.stdout}\nstderr:\n${missingNotchConceptResult.stderr}`
);
assert.match(
  missingNotchConceptResult.stderr,
  /Missing product identity/,
  "check-readme should report the missing notch island identity"
);

const missingMacActivityStatusResult = runChecker(
  readme.replace("Now Playing, Clipboard, and Battery instead of deterministic sample jobs", "")
);

assert.notEqual(
  missingMacActivityStatusResult.status,
  0,
  `check-readme should fail when real Mac activity status verification is missing.\nstdout:\n${missingMacActivityStatusResult.stdout}\nstderr:\n${missingMacActivityStatusResult.stderr}`
);
assert.match(
  missingMacActivityStatusResult.stderr,
  /Missing manual real status observation/,
  "check-readme should report the missing real status verification step"
);

const missingDynaDropDeferredNativeDragResult = runChecker(
  readme.replace("Deferred: native drag-to-island capture", "")
);

assert.notEqual(
  missingDynaDropDeferredNativeDragResult.status,
  0,
  `check-readme should fail when the DynaDrop native drag deferral is missing.\nstdout:\n${missingDynaDropDeferredNativeDragResult.stdout}\nstderr:\n${missingDynaDropDeferredNativeDragResult.stderr}`
);
assert.match(
  missingDynaDropDeferredNativeDragResult.stderr,
  /Missing DynaDrop deferred native drag capture/,
  "check-readme should report the missing DynaDrop native drag deferral"
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
