const HUD_COMPACT_STATE_SCHEMA_VERSION = 1;

const HUD_COMPACT_STATE_SCHEMA_KEYS = {
  brightnessHud: "dynamac.brightnessHud.state.v1",
  volumeHud: "dynamac.volumeHud.state.v1"
};

function assertPlainObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`);
  }
  return value;
}

function hudCompactStateSchemaFor(hudKey) {
  const schema = HUD_COMPACT_STATE_SCHEMA_KEYS[hudKey];
  if (!schema) {
    throw new Error(`unsupported HUD compact state key: ${hudKey}`);
  }
  return schema;
}

function serializeHudCompactState(options) {
  const { hudKey, state, serializeActivity } = assertPlainObject(options, "HUD compact state serializer options");
  if (typeof serializeActivity !== "function") {
    throw new Error("HUD compact state serializer requires serializeActivity");
  }
  const active = state?.active ? serializeActivity(state.active) : null;
  return {
    schema: hudCompactStateSchemaFor(hudKey),
    version: HUD_COMPACT_STATE_SCHEMA_VERSION,
    active
  };
}

function deserializeHudCompactState(serialized, options) {
  const { hudKey, createState, serializeActivity, defaultSchema = hudCompactStateSchemaFor(hudKey) } = assertPlainObject(
    options,
    "HUD compact state deserializer options"
  );
  if (typeof createState !== "function") {
    throw new Error("HUD compact state deserializer requires createState");
  }
  if (typeof serializeActivity !== "function") {
    throw new Error("HUD compact state deserializer requires serializeActivity");
  }

  const payload = assertPlainObject(serialized, `${hudKey} state payload`);
  const schema = payload.schema === undefined || payload.schema === null || payload.schema === "" ? defaultSchema : payload.schema;
  const expectedSchema = hudCompactStateSchemaFor(hudKey);
  if (schema !== expectedSchema) {
    throw new Error(`${hudKey} state schema must be ${expectedSchema}`);
  }

  const version = payload.version === undefined || payload.version === null ? HUD_COMPACT_STATE_SCHEMA_VERSION : Number(payload.version);
  if (version !== HUD_COMPACT_STATE_SCHEMA_VERSION) {
    throw new Error(`${hudKey} state version must be ${HUD_COMPACT_STATE_SCHEMA_VERSION}`);
  }

  if (payload.active === undefined || payload.active === null) return createState();
  return createState(serializeActivity(payload.active));
}

module.exports = {
  HUD_COMPACT_STATE_SCHEMA_VERSION,
  hudCompactStateSchemaFor,
  serializeHudCompactState,
  deserializeHudCompactState
};
