const fs = require("node:fs");
const { validateStatusPayload } = require("./status-schema");

function loadStatusFile(statusPath) {
  let raw;
  let parsed;

  try {
    raw = fs.readFileSync(statusPath, "utf8");
  } catch (error) {
    return {
      ok: false,
      source: statusPath,
      statuses: [],
      errors: [`Status file not readable: ${error.message}`]
    };
  }

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      ok: false,
      source: statusPath,
      statuses: [],
      errors: [`Status JSON is invalid: ${error.message}`]
    };
  }

  const validation = validateStatusPayload(parsed);
  return {
    ok: validation.ok,
    source: statusPath,
    statuses: validation.ok ? validation.statuses : [],
    errors: validation.errors
  };
}

module.exports = {
  loadStatusFile
};
