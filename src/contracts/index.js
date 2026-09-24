import { definitions, version } from './definitions.js';
import { assertValid, validate } from './schema.js';

function contractName(name) {
  if (!Object.prototype.hasOwnProperty.call(definitions, name)) {
    const error = new Error(`Unknown ${version} contract: ${name}`);
    error.code = 'UNKNOWN_CONTRACT';
    throw error;
  }
  return name;
}

export function check(name, value) {
  return validate(value, definitions[contractName(name)]);
}

export function enforce(name, value) {
  return assertValid(value, definitions[contractName(name)], `${version}.${name}`);
}

export function names() {
  return Object.freeze(Object.keys(definitions));
}

export { definitions, version };
