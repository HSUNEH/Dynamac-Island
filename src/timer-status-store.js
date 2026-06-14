const fs = require("node:fs");
const path = require("node:path");
const { buildTimerStatusPayload } = require("./timer-status");

function atomicWriteJson(fileSystem, outputPath, payload) {
  const directory = path.dirname(outputPath);
  fileSystem.mkdirSync(directory, { recursive: true });
  const tempPath = path.join(
    directory,
    `.${path.basename(outputPath)}.${process.pid}.${Date.now()}.tmp`
  );
  fileSystem.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`);
  fileSystem.renameSync(tempPath, outputPath);
}

function writeTimerStatusSnapshot(options = {}) {
  const outputPath = options.outputPath;
  if (typeof outputPath !== "string" || outputPath.trim() === "") {
    throw new Error("outputPath is required");
  }

  const fileSystem = options.fs || fs;
  const payload = buildTimerStatusPayload(options.timer, { now: options.now });
  atomicWriteJson(fileSystem, outputPath, payload);

  return {
    outputPath,
    payload
  };
}

module.exports = {
  writeTimerStatusSnapshot
};
