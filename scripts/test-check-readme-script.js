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

const missingActivityRouterSectionResult = runChecker(
  readme.replace("## Activity Router MVP", "## Router Notes")
);

assert.notEqual(
  missingActivityRouterSectionResult.status,
  0,
  `check-readme should fail when the Activity Router section heading is missing.\nstdout:\n${missingActivityRouterSectionResult.stdout}\nstderr:\n${missingActivityRouterSectionResult.stderr}`
);
assert.match(
  missingActivityRouterSectionResult.stderr,
  /Missing Activity Router section/,
  "check-readme should report the missing Activity Router section"
);

const missingActivityRouterTieBreakResult = runChecker(
  readme.replace("higher priority wins, then newer `updatedAt`, older `createdAt`, and stable `activityId`", "")
);

assert.notEqual(
  missingActivityRouterTieBreakResult.status,
  0,
  `check-readme should fail when Activity Router deterministic tie-break docs are missing.\nstdout:\n${missingActivityRouterTieBreakResult.stdout}\nstderr:\n${missingActivityRouterTieBreakResult.stderr}`
);
assert.match(
  missingActivityRouterTieBreakResult.stderr,
  /Missing Activity Router deterministic ties/,
  "check-readme should report the missing Activity Router deterministic tie-break docs"
);

const missingDynaKeysHudSectionResult = runChecker(
  readme.replace("### DynaKeys Volume/Brightness HUD Core Model", "### Volume/Brightness HUD Core Model")
);

assert.notEqual(
  missingDynaKeysHudSectionResult.status,
  0,
  `check-readme should fail when the DynaKeys HUD section heading is missing.\nstdout:\n${missingDynaKeysHudSectionResult.stdout}\nstderr:\n${missingDynaKeysHudSectionResult.stderr}`
);
assert.match(
  missingDynaKeysHudSectionResult.stderr,
  /Missing DynaKeys HUD section/,
  "check-readme should report the missing DynaKeys HUD section"
);

const missingDynaKeysHudBehaviorResult = runChecker(
  readme.replace("volume changes render a `speaker.wave.2` or muted-speaker compact surface with a percentage label/progress", "")
);

assert.notEqual(
  missingDynaKeysHudBehaviorResult.status,
  0,
  `check-readme should fail when the implemented DynaKeys HUD behavior is missing.\nstdout:\n${missingDynaKeysHudBehaviorResult.stdout}\nstderr:\n${missingDynaKeysHudBehaviorResult.stderr}`
);
assert.match(
  missingDynaKeysHudBehaviorResult.stderr,
  /Missing DynaKeys volume compact behavior/,
  "check-readme should report the missing implemented DynaKeys HUD behavior"
);

const missingDynaClipSectionResult = runChecker(
  readme.replace("### DynaClip Clipboard Activity Core Model", "### Clipboard Activity Core Model")
);

assert.notEqual(
  missingDynaClipSectionResult.status,
  0,
  `check-readme should fail when the DynaClip section heading is missing.\nstdout:\n${missingDynaClipSectionResult.stdout}\nstderr:\n${missingDynaClipSectionResult.stderr}`
);
assert.match(
  missingDynaClipSectionResult.stderr,
  /Missing DynaClip section/,
  "check-readme should report the missing DynaClip section"
);

const missingDynaClipBehaviorResult = runChecker(
  readme.replace("recent copied plain text shows a compact `Copied` HUD with the classification glyph and a sanitized preview", "")
);

assert.notEqual(
  missingDynaClipBehaviorResult.status,
  0,
  `check-readme should fail when the implemented DynaClip behavior is missing.\nstdout:\n${missingDynaClipBehaviorResult.stdout}\nstderr:\n${missingDynaClipBehaviorResult.stderr}`
);
assert.match(
  missingDynaClipBehaviorResult.stderr,
  /Missing DynaClip compact copied HUD/,
  "check-readme should report the missing implemented DynaClip behavior"
);

const missingDynaClipPersistenceBoundaryResult = runChecker(
  readme.replace("clipboard text is not written to persistent history across restarts", "")
);

assert.notEqual(
  missingDynaClipPersistenceBoundaryResult.status,
  0,
  `check-readme should fail when the DynaClip non-persistence boundary is missing.\nstdout:\n${missingDynaClipPersistenceBoundaryResult.stdout}\nstderr:\n${missingDynaClipPersistenceBoundaryResult.stderr}`
);
assert.match(
  missingDynaClipPersistenceBoundaryResult.stderr,
  /Missing DynaClip non-persistence/,
  "check-readme should report the missing DynaClip non-persistence boundary"
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
