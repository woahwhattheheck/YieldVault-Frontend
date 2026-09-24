/**
 * Client telemetry sink for safe diagnostics.
 *
 * Never accepts raw Error objects from call sites — always pass the output of
 * `buildSafeDiagnostic` / `captureFailure`. A final redaction pass plus a
 * sensitive-value guard keep wallet / token / provider secrets out of the sink.
 */

import {
  containsSensitiveValue,
  redactSecrets,
} from './diagnostics.js';

/** @type {Array<Record<string, unknown>>} */
const buffer = [];

const MAX_BUFFER = 100;

/**
 * @returns {Array<Record<string, unknown>>}
 */
function getWindowBuffer() {
  if (typeof window === 'undefined') return buffer;
  if (!Array.isArray(window.__YV_TELEMETRY__)) {
    window.__YV_TELEMETRY__ = buffer;
  }
  return window.__YV_TELEMETRY__;
}

/**
 * Report a pre-built diagnostic. Sensitive values are stripped; if anything
 * still looks secret after redaction the event is dropped and a safe stub is
 * recorded instead.
 * @param {Record<string, unknown>} diagnostic
 * @returns {Record<string, unknown>|null} The event that was stored, or null
 */
export function reportDiagnostic(diagnostic) {
  if (!diagnostic || typeof diagnostic !== 'object') return null;

  const safe = /** @type {Record<string, unknown>} */ (redactSecrets({
    ...diagnostic,
    reportedAt: Date.now(),
  }));

  if (containsSensitiveValue(safe)) {
    const stub = {
      correlationId: typeof diagnostic.correlationId === 'string'
        ? diagnostic.correlationId
        : 'unknown',
      feature: diagnostic.feature || 'unknown',
      level: diagnostic.level || 'feature',
      kind: 'invalid_state',
      retryable: false,
      message: 'Diagnostic dropped: sensitive values detected',
      reportedAt: Date.now(),
      dropped: true,
    };
    pushEvent(stub);
    return stub;
  }

  pushEvent(safe);
  return safe;
}

/**
 * @param {Record<string, unknown>} event
 */
function pushEvent(event) {
  const sink = getWindowBuffer();
  sink.push(event);
  while (sink.length > MAX_BUFFER) sink.shift();

  if (typeof console !== 'undefined' && typeof console.info === 'function') {
    // Dev-friendly breadcrumb; payload is already redacted.
    console.info('[yv-telemetry]', event.correlationId, event.feature, event.kind);
  }
}

/** @returns {Array<Record<string, unknown>>} */
export function getTelemetryEvents() {
  return getWindowBuffer().slice();
}

/** Clear the in-memory sink (tests). */
export function clearTelemetry() {
  buffer.length = 0;
  if (typeof window !== 'undefined') {
    window.__YV_TELEMETRY__ = buffer;
  }
}

export default {
  reportDiagnostic,
  getTelemetryEvents,
  clearTelemetry,
};
