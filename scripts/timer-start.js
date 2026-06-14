#!/usr/bin/env node

const path = require("node:path");
const { createTimerState } = require("../src/timer-state");
const { startTimerFromInput } = require("../src/timer-start-entrypoint");

function parseArgs(argv) {
  const args = [...argv];
  let statusPath = process.env.DYNAMAC_STATUS_FILE || "status/status.json";
  let duration = null;

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === "--status") {
      statusPath = args.shift() || "";
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      return { help: true, statusPath, duration };
    }
    if (duration === null) {
      duration = arg;
      continue;
    }
    return {
      error: `Unexpected timer argument: ${arg}`,
      statusPath,
      duration
    };
  }

  return { statusPath, duration };
}

function printUsage(stream = process.stdout) {
  stream.write("Usage: node scripts/timer-start.js <duration> [--status <path>]\n");
  stream.write("Example: node scripts/timer-start.js 5m --status status/status.json\n");
}

function main(argv = process.argv.slice(2)) {
  const parsedArgs = parseArgs(argv);

  if (parsedArgs.help) {
    printUsage(process.stdout);
    return 0;
  }

  if (parsedArgs.error) {
    console.error(JSON.stringify({ ok: false, error: parsedArgs.error }, null, 2));
    return 1;
  }

  if (!parsedArgs.duration) {
    printUsage(process.stderr);
    console.error(JSON.stringify({ ok: false, error: "Timer duration argument is required." }, null, 2));
    return 1;
  }

  const result = startTimerFromInput(createTimerState(), parsedArgs.duration, {
    statusPath: path.resolve(parsedArgs.statusPath)
  });

  if (!result.ok) {
    console.error(JSON.stringify(result, null, 2));
    return 1;
  }

  console.log(JSON.stringify({
    ok: true,
    timer: result.timer,
    statusPath: result.status.outputPath
  }, null, 2));
  return 0;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  main,
  parseArgs
};
