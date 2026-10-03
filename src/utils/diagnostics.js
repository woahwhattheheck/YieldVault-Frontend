/**
 * Safe error diagnostics for route/feature boundaries and async failures.
 *
 * Responsibilities:
 * - Mint short correlation IDs for support / telemetry join keys
 * - Redact wallet addresses, tokens, and provider secrets from any payload
 * - Classify failures as retryable dependency errors vs invalid app state
 */

/** @typedef {'retryable' | 'invalid_state'} ErrorKind */

export const REDACTED = '[REDACTED]';

/** Object keys whose values are always treated as secrets. */
const SENSITIVE_KEY_PATTERN =
  /^(authorization|cookie|set-cookie|x-api-key|api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|private[_-]?key|secret|seed|mnemonic|password|passphrase|provider[_-]?secret|bearer|jwt|session[_-]?token)$/i;

/** Stellar account (G…), contract (C…), and secret (S…) keys. */
const STELLAR_KEY_PATTERN = /\b[GCS][A-Z2-7]{55}\b/g;

/** JWT-shaped tokens. */
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

/** Bearer / token header values. */
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;

/** Long hex blobs that often encode private material. */
const HEX_SECRET_PATTERN = /\b(?:0x)?[a-fA-F0-9]{64,}\b/g;

/** Query/fragment credential parameters. */
const CRED_QUERY_PATTERN =
  /([?&#](?:token|access_token|refresh_token|api_key|apikey|secret|password|key)=)[^&#\s]+/gi;

/** URL user information, including encoded credentials and relative URLs. */
const URL_CREDENTIAL_PATTERN = /((?:\b[a-z][a-z0-9+.-]*:)?\/\/)[^\s/?#]+@/gi;

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504, 522, 524]);

const RETRYABLE_MESSAGE =
  /\b(timeout|timed out|network|fetch failed|econnreset|econnrefused|temporar|unavailable|rate limit|try again|gateway|socket)\b/i;

const INVALID_STATE_MESSAGE =
  /\b(not found|invalid|malformed|unauthorized|forbidden|corrupt|invariant|assertion|schema|typeerror)\b/i;

/**
 * @returns {string} Correlation id like `yv-m1abc2-k9xq2p`
 */
export function createCorrelationId() {
  const time = Date.now().toString(36);
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 6)
      : Math.random().toString(36).slice(2, 8);
  return `yv-${time}-${rand}`;
}

/**
 * Redact secrets from a string.
 * @param {string} text
 * @returns {string}
 */
export function redactString(text) {
  if (typeof text !== 'string' || text.length === 0) return text;
  return text
    .replace(URL_CREDENTIAL_PATTERN, `$1${REDACTED}@`)
    .replace(STELLAR_KEY_PATTERN, REDACTED)
    .replace(JWT_PATTERN, REDACTED)
    .replace(BEARER_PATTERN, `Bearer ${REDACTED}`)
    .replace(HEX_SECRET_PATTERN, REDACTED)
    .replace(CRED_QUERY_PATTERN, `$1${REDACTED}`);
}

/**
 * Deep-redact strings and sensitive keys from arbitrary JSON-like values.
 * @param {unknown} value
 * @param {number} [depth=0]
 * @returns {unknown}
 */
export function redactSecrets(value, depth = 0) {
  if (depth > 8) return REDACTED;
  if (value == null) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message || ''),
      code: /** @type {{ code?: unknown }} */ (value).code ?? undefined,
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item, depth + 1));
  }
  if (typeof value === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        out[key] = REDACTED;
      } else {
        out[key] = redactSecrets(nested, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

/**
 * True when a candidate payload still contains unredacted secrets.
 * Used as a telemetry safety net / test helper.
 * @param {unknown} value
 * @returns {boolean}
 */
export function containsSensitiveValue(value) {
  if (value == null) return false;
  if (typeof value === 'string') {
    // Keep the safety net aligned with every string redaction rule, including
    // URL credentials and query parameters. Redaction is idempotent.
    return redactString(value) !== value;
  }
  if (Array.isArray(value)) return value.some(containsSensitiveValue);
  if (typeof value === 'object') {
    return Object.entries(value).some(([key, nested]) => {
      if (SENSITIVE_KEY_PATTERN.test(key) && nested !== REDACTED) return true;
      return containsSensitiveValue(nested);
    });
  }
  return false;
}

/**
 * @param {unknown} error
 * @returns {{ kind: ErrorKind, retryable: boolean, userMessage: string, status?: number, code?: string }}
 */
export function classifyError(error) {
  const err = normalizeToError(error);
  const code = /** @type {{ code?: string }} */ (err).code;
  const status = pickStatus(err);
  const message = err.message || '';

  if (code === 'MALFORMED_RESPONSE' || code === 'INVALID_STATE') {
    return {
      kind: 'invalid_state',
      retryable: false,
      userMessage:
        code === 'MALFORMED_RESPONSE'
          ? 'The provider returned data we could not safely use.'
          : redactString(message) || 'The application hit an invalid state.',
      status,
      code,
    };
  }

  if (code === 'DEPENDENCY_FAILURE' || code === 'NETWORK_ERROR') {
    return {
      kind: 'retryable',
      retryable: true,
      userMessage:
        redactString(message) ||
        'A dependency failed temporarily. You can retry safely.',
      status,
      code,
    };
  }

  if (status != null) {
    if (RETRYABLE_STATUS.has(status)) {
      return {
        kind: 'retryable',
        retryable: true,
        userMessage: 'A dependency failed temporarily. You can retry safely.',
        status,
        code,
      };
    }
    if (status >= 400 && status < 500) {
      return {
        kind: 'invalid_state',
        retryable: false,
        userMessage:
          redactString(message) ||
          'The request was rejected. Reload or return home to recover.',
        status,
        code,
      };
    }
  }

  if (err.name === 'TypeError' || RETRYABLE_MESSAGE.test(message)) {
    return {
      kind: 'retryable',
      retryable: true,
      userMessage: 'A network or provider dependency failed. Please try again.',
      status,
      code,
    };
  }

  if (INVALID_STATE_MESSAGE.test(message)) {
    return {
      kind: 'invalid_state',
      retryable: false,
      userMessage:
        redactString(message) ||
        'The application hit an invalid state. Reload to recover.',
      status,
      code,
    };
  }

  // Render / unexpected errors: allow in-place retry (remount) plus reload.
  return {
    kind: 'retryable',
    retryable: true,
    userMessage: 'Something went wrong while rendering this section.',
    status,
    code,
  };
}

/**
 * Build a telemetry-safe diagnostic record.
 * @param {unknown} error
 * @param {{ feature?: string, level?: string, correlationId?: string }} [meta]
 */
export function buildSafeDiagnostic(error, meta = {}) {
  const correlationId = meta.correlationId || createCorrelationId();
  const classification = classifyError(error);
  const err = normalizeToError(error);
  const safeMessage = redactString(err.message || classification.userMessage);

  return {
    correlationId,
    feature: meta.feature || 'unknown',
    level: meta.level || 'feature',
    kind: classification.kind,
    retryable: classification.retryable,
    userMessage: classification.userMessage,
    name: err.name || 'Error',
    message: safeMessage,
    code: classification.code,
    status: classification.status,
    // Stacks can embed URLs with credentials; keep only a redacted snippet.
    stack: err.stack ? redactString(String(err.stack).split('\n').slice(0, 4).join('\n')) : undefined,
  };
}

/**
 * Normalize an async / provider failure into a safe UI error state and
 * diagnostic payload. Prefer this over passing raw Error.message to the UI.
 * @param {unknown} error
 * @param {{ feature?: string, level?: string }} [meta]
 */
export function captureFailure(error, meta = {}) {
  const diagnostic = buildSafeDiagnostic(error, meta);
  return {
    message: diagnostic.userMessage,
    correlationId: diagnostic.correlationId,
    retryable: diagnostic.retryable,
    kind: diagnostic.kind,
    diagnostic,
  };
}

/**
 * Throw when a provider payload is missing required shape.
 * Classified as non-retryable invalid application / provider state.
 * @param {unknown} payload
 * @param {{ expectArray?: boolean, requireKeys?: string[], label?: string }} [opts]
 */
export function assertWellFormedResponse(payload, opts = {}) {
  const label = opts.label || 'response';
  if (payload == null) {
    throw createAppError(`Malformed ${label}: empty payload`, {
      code: 'MALFORMED_RESPONSE',
      retryable: false,
    });
  }
  if (opts.expectArray && !Array.isArray(payload)) {
    throw createAppError(`Malformed ${label}: expected an array`, {
      code: 'MALFORMED_RESPONSE',
      retryable: false,
    });
  }
  if (opts.requireKeys && typeof payload === 'object' && !Array.isArray(payload)) {
    const missing = opts.requireKeys.filter(
      (key) => !Object.prototype.hasOwnProperty.call(payload, key),
    );
    if (missing.length > 0) {
      throw createAppError(
        `Malformed ${label}: missing ${missing.join(', ')}`,
        { code: 'MALFORMED_RESPONSE', retryable: false },
      );
    }
  }
  return payload;
}

/**
 * @param {string} message
 * @param {{ code?: string, retryable?: boolean, status?: number, cause?: unknown }} [opts]
 */
export function createAppError(message, opts = {}) {
  const error = new Error(message);
  error.name = 'AppError';
  /** @type {{ code?: string, retryable?: boolean, status?: number, cause?: unknown }} */ (
    error
  ).code = opts.code || 'APP_ERROR';
  /** @type {{ code?: string, retryable?: boolean, status?: number, cause?: unknown }} */ (
    error
  ).retryable = Boolean(opts.retryable);
  if (opts.status != null) {
    /** @type {{ status?: number }} */ (error).status = opts.status;
  }
  if (opts.cause !== undefined) {
    /** @type {{ cause?: unknown }} */ (error).cause = opts.cause;
  }
  return error;
}

/**
 * @param {string} [message]
 * @param {number} [status]
 */
export function createDependencyError(message, status) {
  return createAppError(message || 'Dependency failure', {
    code: 'DEPENDENCY_FAILURE',
    retryable: true,
    status,
  });
}

/**
 * @param {unknown} value
 * @returns {Error}
 */
function normalizeToError(value) {
  if (value instanceof Error) return value;
  if (typeof value === 'string') return new Error(value);
  if (value && typeof value === 'object' && 'message' in value) {
    const err = new Error(String(/** @type {{ message: unknown }} */ (value).message));
    if ('code' in value) {
      /** @type {{ code?: unknown }} */ (err).code = /** @type {{ code?: unknown }} */ (
        value
      ).code;
    }
    if ('status' in value) {
      /** @type {{ status?: unknown }} */ (err).status = /** @type {{ status?: unknown }} */ (
        value
      ).status;
    }
    return err;
  }
  return new Error('Unknown error');
}

/**
 * @param {Error} err
 * @returns {number|undefined}
 */
function pickStatus(err) {
  const tagged = /** @type {{ status?: unknown, statusCode?: unknown }} */ (err);
  const raw = tagged.status ?? tagged.statusCode;
  const num = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(num) ? num : undefined;
}
