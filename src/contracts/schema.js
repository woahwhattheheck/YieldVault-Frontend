/**
 * Dependency-free contract validator (JSON Schema subset).
 * Incompatible shapes fail with actionable path diagnostics.
 */

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function typeMatches(value, type) {
  if (Array.isArray(type)) return type.some((candidate) => typeMatches(value, candidate));
  if (type === 'object') return isObject(value);
  if (type === 'array') return Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'string') return typeof value === 'string';
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'null') return value === null;
  return true;
}

function addError(errors, path, message, expected, actual) {
  errors.push({
    path,
    message,
    ...(expected === undefined ? {} : { expected }),
    ...(actual === undefined ? {} : { actual }),
  });
}

function validateNode(value, schema, path, errors) {
  if (schema === true || schema === undefined) return;
  if (schema === false) {
    addError(errors, path, 'value is not allowed');
    return;
  }

  if (value === undefined) {
    addError(errors, path, 'value is required');
    return;
  }
  if (value === null && schema.nullable) return;

  if (schema.type && !typeMatches(value, schema.type)) {
    addError(errors, path, `must be a ${schema.type}`, schema.type, typeof value);
    return;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    addError(errors, path, 'has an unsupported value', schema.enum, value);
  }
  if (schema.pattern && typeof value === 'string' && !schema.pattern.test(value)) {
    addError(errors, path, 'does not match the required format', schema.pattern.source, value);
  }
  if (schema.minLength !== undefined && typeof value === 'string' && value.length < schema.minLength) {
    addError(errors, path, 'is shorter than the minimum length', schema.minLength, value.length);
  }
  if (schema.min !== undefined && typeof value === 'number' && value < schema.min) {
    addError(errors, path, 'is below the minimum', schema.min, value);
  }
  if (schema.max !== undefined && typeof value === 'number' && value > schema.max) {
    addError(errors, path, 'is above the maximum', schema.max, value);
  }
  if (schema.precision !== undefined && typeof value === 'number') {
    const decimals = String(value).split('.')[1]?.length || 0;
    if (decimals > schema.precision) {
      addError(errors, path, 'has more decimal places than allowed', schema.precision, decimals);
    }
  }

  if (schema.type === 'object' && isObject(value)) {
    const properties = schema.properties || {};
    for (const field of schema.required || []) {
      if (value[field] === undefined) addError(errors, `${path}.${field}`, 'value is required');
    }
    for (const [field, child] of Object.entries(properties)) {
      if (value[field] !== undefined) validateNode(value[field], child, `${path}.${field}`, errors);
    }
    if (schema.additionalProperties === false) {
      for (const field of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(properties, field)) {
          addError(errors, `${path}.${field}`, 'unknown field is not allowed');
        }
      }
    }
  }

  if (schema.type === 'array' && Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      addError(errors, path, 'has fewer items than allowed', schema.minItems, value.length);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      addError(errors, path, 'has more items than allowed', schema.maxItems, value.length);
    }
    value.forEach((item, index) => validateNode(item, schema.items, `${path}[${index}]`, errors));
  }
}

export function validate(value, schema) {
  const errors = [];
  validateNode(value, schema, '$', errors);
  return { valid: errors.length === 0, errors };
}

export function assertValid(value, schema, label = 'value') {
  const result = validate(value, schema);
  if (!result.valid) {
    const detail = result.errors.map((error) => `${error.path} ${error.message}`).join('; ');
    const error = new Error(`${label} does not match contract: ${detail}`);
    error.code = 'CONTRACT_VALIDATION_FAILED';
    error.details = result.errors;
    throw error;
  }
  return value;
}

export { isObject };
