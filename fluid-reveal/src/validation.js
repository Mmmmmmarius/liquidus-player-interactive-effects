/** Shared validation primitives. No DOM or network dependency. */
export function plainObject(value, label = 'Parameters') {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError(`${label} must be a plain object.`);
  }
}

export function defaultsFrom(schema) {
  return Object.freeze(Object.fromEntries(Object.entries(schema).map(([key, rule]) =>
    [key, Array.isArray(rule.default) ? Object.freeze([...rule.default]) : rule.default])));
}

/** Validate the complete update before mutating state. Finite numbers are clamped. */
export function normalize(schema, partial, base) {
  plainObject(partial);
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(partial)) {
    if (!Object.hasOwn(schema, key)) throw new TypeError(`Unknown parameter: ${key}`);
    const rule = schema[key];
    if (rule.type === 'boolean') {
      if (typeof value !== 'boolean') throw new TypeError(`${key} must be a boolean.`);
      result[key] = value;
    } else if (rule.type === 'select') {
      if (!rule.options.includes(value)) throw new TypeError(`Invalid value for ${key}.`);
      result[key] = value;
    } else if (rule.type === 'color') {
      if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw new TypeError(`${key} must be #rrggbb.`);
      result[key] = value.toLowerCase();
    } else if (rule.type === 'vector') {
      if (!Array.isArray(value) || value.length !== rule.default.length || value.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
        throw new TypeError(`${key} must contain ${rule.default.length} finite numbers.`);
      }
      result[key] = value.map(v => Math.min(rule.max, Math.max(rule.min, v)));
    } else {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${key} must be a finite number.`);
      result[key] = Math.min(rule.max, Math.max(rule.min, value));
      if (rule.integer) result[key] = Math.round(result[key]);
    }
  }
  return result;
}

export function parsePreset(text, effect, normalizeParameters) {
  if (typeof text !== 'string' || text.length > 32768) throw new TypeError('Preset must be JSON under 32 KB.');
  const value = JSON.parse(text);
  plainObject(value, 'Preset');
  if (value.format !== 1 || value.effect !== effect || Object.keys(value).some(k => !['format','effect','parameters'].includes(k))) {
    throw new TypeError(`Expected a version 1 ${effect} preset.`);
  }
  plainObject(value.parameters);
  return normalizeParameters(value.parameters);
}

export function serializePreset(effect, parameters) {
  return JSON.stringify({format: 1, effect, parameters}, null, 2) + '\n';
}
