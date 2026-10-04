/**
 * API client adapters that enforce YieldVault v1 response contracts and map
 * them into UI-safe models. Raw payloads never reach the DOM — only curated
 * messages, correlation ids, and precision-checked numbers do.
 */

import { enforce } from '../contracts/index.js';

/** @typedef {'validation'|'authorization'|'provider'|'pending'|'terminal'|'unknown'} ApiErrorKind */

export const API_ERROR_KIND = Object.freeze({
  VALIDATION: 'validation',
  AUTHORIZATION: 'authorization',
  PROVIDER: 'provider',
  PENDING: 'pending',
  TERMINAL: 'terminal',
  UNKNOWN: 'unknown',
});

const SAFE_MESSAGES = Object.freeze({
  VALIDATION_FAILED: 'Check the highlighted fields and try again.',
  AUTHORIZATION_REQUIRED: 'You are not authorized to view this resource.',
  PROVIDER_UNAVAILABLE: 'The transaction provider is temporarily unavailable. Please retry.',
  TRANSACTION_FAILED: 'The transaction failed. Your balance was not changed.',
  CONTRACT_VALIDATION_FAILED: 'The server returned an unexpected response. Please try again later.',
});

/**
 * Classify a contract error code / HTTP status into a UI kind.
 * @param {{ code?: string, status?: number, details?: unknown }} error
 * @returns {ApiErrorKind}
 */
export function classifyError(error) {
  const code = error?.code;
  if (code === 'VALIDATION_FAILED') return API_ERROR_KIND.VALIDATION;
  if (code === 'AUTHORIZATION_REQUIRED') return API_ERROR_KIND.AUTHORIZATION;
  if (code === 'PROVIDER_UNAVAILABLE') return API_ERROR_KIND.PROVIDER;
  if (code === 'TRANSACTION_FAILED') return API_ERROR_KIND.TERMINAL;
  if (error?.details && typeof error.details === 'object' && !Array.isArray(error.details)) {
    if (error.details.txStatus === 'pending') return API_ERROR_KIND.PENDING;
    if (error.details.txStatus === 'failed') return API_ERROR_KIND.TERMINAL;
    if (error.details.retryable === true) return API_ERROR_KIND.PROVIDER;
    if (error.details.retryable === false) return API_ERROR_KIND.TERMINAL;
  }
  if (error?.status === 400 || error?.status === 422) return API_ERROR_KIND.VALIDATION;
  if (error?.status === 401 || error?.status === 403) return API_ERROR_KIND.AUTHORIZATION;
  if (error?.status === 503 || error?.status === 504) return API_ERROR_KIND.PROVIDER;
  return API_ERROR_KIND.TERMINAL;
}

/**
 * Build a UI-safe message. Never embeds raw JSON, stacks, or details arrays.
 * @param {{ code?: string, message?: string }} error
 * @param {ApiErrorKind} kind
 */
function safeMessage(error, kind) {
  if (error?.code && SAFE_MESSAGES[error.code]) return SAFE_MESSAGES[error.code];
  if (kind === API_ERROR_KIND.VALIDATION) return SAFE_MESSAGES.VALIDATION_FAILED;
  if (kind === API_ERROR_KIND.AUTHORIZATION) return SAFE_MESSAGES.AUTHORIZATION_REQUIRED;
  if (kind === API_ERROR_KIND.PROVIDER) return SAFE_MESSAGES.PROVIDER_UNAVAILABLE;
  if (kind === API_ERROR_KIND.PENDING) {
    return 'Your transaction is pending confirmation. This can take a moment.';
  }
  if (kind === API_ERROR_KIND.TERMINAL) return SAFE_MESSAGES.TRANSACTION_FAILED;
  // Fall back to a short server message only when it looks like plain prose.
  const msg = typeof error?.message === 'string' ? error.message.trim() : '';
  if (msg && msg.length <= 120 && !msg.startsWith('{') && !msg.includes('\n')) {
    return msg;
  }
  return 'Something went wrong. Please try again.';
}

/**
 * Adapt an errorResponse contract payload into a UI error model.
 * @param {unknown} payload
 */
export function adaptErrorPayload(payload) {
  const verified = enforce('errorResponse', payload);
  const kind = classifyError(verified.error);
  const details = verified.error.details;
  const retryable =
    kind === API_ERROR_KIND.PROVIDER &&
    !(details &&
      typeof details === 'object' &&
      !Array.isArray(details) &&
      details.retryable === false);

  return Object.freeze({
    kind,
    code: verified.error.code || null,
    status: verified.error.status,
    message: safeMessage(verified.error, kind),
    requestId: verified.error.requestId || null,
    retryable: Boolean(retryable),
    // Intentionally omit raw details — UI must not leak them.
  });
}

/**
 * Adapt a caught value (ContractApiError, Error, or raw payload) for the UI.
 * @param {unknown} err
 */
export function adaptCaughtError(err) {
  if (err && typeof err === 'object' && err.adapted) {
    return err.adapted;
  }
  if (err && typeof err === 'object' && err.payload && err.payload.error) {
    try {
      return adaptErrorPayload(err.payload);
    } catch {
      /* fall through */
    }
  }
  if (err && typeof err === 'object' && err.error && typeof err.error === 'object') {
    try {
      return adaptErrorPayload(err);
    } catch {
      /* fall through */
    }
  }
  if (err && typeof err === 'object' && err.code === 'CONTRACT_VALIDATION_FAILED') {
    return Object.freeze({
      kind: API_ERROR_KIND.TERMINAL,
      code: 'CONTRACT_VALIDATION_FAILED',
      status: 502,
      message: SAFE_MESSAGES.CONTRACT_VALIDATION_FAILED,
      requestId: null,
      retryable: false,
    });
  }
  const message =
    err instanceof Error && err.message
      ? safeMessage({ message: err.message }, API_ERROR_KIND.TERMINAL)
      : 'Something went wrong. Please try again.';
  return Object.freeze({
    kind: API_ERROR_KIND.TERMINAL,
    code: null,
    status: null,
    message,
    requestId: null,
    retryable: false,
  });
}

/**
 * Map a contract position into the shape PositionRow / Positions expect.
 * @param {object} position
 * @param {string} [asset]
 */
export function toUiPosition(position, asset = 'USDC') {
  return {
    id: position.id,
    vaultId: position.vaultId,
    asset,
    shares: position.shares,
    value: position.assetValue,
    earned: position.earnings,
    deposited: position.principal,
  };
}

/**
 * Adapt a positionList response. Precision is enforced by the contract.
 * @param {unknown} payload
 * @param {Record<string, string>} [assetByVaultId]
 */
export function adaptPositionList(payload, assetByVaultId = {}) {
  const verified = enforce('positionList', payload);
  return Object.freeze({
    count: verified.count,
    positions: verified.positions.map((p) =>
      toUiPosition(p, assetByVaultId[p.vaultId] || 'USDC'),
    ),
  });
}

/**
 * Adapt a depositSuccess response.
 * @param {unknown} payload
 */
export function adaptDepositSuccess(payload) {
  const verified = enforce('depositSuccess', payload);
  return Object.freeze({
    position: toUiPosition(verified.position),
    tx: Object.freeze({ ...verified.tx }),
    status: verified.tx.status,
  });
}

/**
 * Adapt a withdrawSuccess response (pending or terminal failed included).
 * @param {unknown} payload
 */
export function adaptWithdrawSuccess(payload) {
  const verified = enforce('withdrawSuccess', payload);
  const status = verified.tx.status;
  let kind = null;
  if (status === 'pending' || status === 'submitted') kind = API_ERROR_KIND.PENDING;
  if (status === 'failed') kind = API_ERROR_KIND.TERMINAL;

  return Object.freeze({
    withdrawnAssets: verified.withdrawnAssets,
    position: verified.position ? toUiPosition(verified.position) : null,
    tx: Object.freeze({ ...verified.tx }),
    status,
    kind,
    message:
      kind === API_ERROR_KIND.PENDING
        ? safeMessage({}, API_ERROR_KIND.PENDING)
        : kind === API_ERROR_KIND.TERMINAL
          ? SAFE_MESSAGES.TRANSACTION_FAILED
          : null,
  });
}

/**
 * Adapt a paginated transaction page, exposing pagination + correlation fields.
 * @param {unknown} payload
 */
export function adaptTransactionPage(payload) {
  const verified = enforce('transactionPage', payload);
  return Object.freeze({
    count: verified.count,
    pagination: Object.freeze({ ...verified.pagination }),
    transactions: verified.transactions.map((tx) =>
      Object.freeze({
        txHash: tx.txHash,
        operation: tx.operation,
        status: tx.status,
        timestamp: tx.timestamp,
        vaultId: tx.vaultId,
        amount: tx.amount,
        shares: tx.shares,
        assets: tx.assets,
        // Correlation metadata for support / tracing without dumping the raw body.
        correlationId: tx.txHash,
      }),
    ),
  });
}

/**
 * Error thrown by services when a contract errorResponse is received.
 */
export class ContractApiError extends Error {
  /**
   * @param {unknown} payload errorResponse fixture/payload
   */
  constructor(payload) {
    const adapted = adaptErrorPayload(payload);
    super(adapted.message);
    this.name = 'ContractApiError';
    this.adapted = adapted;
    this.payload = payload;
    this.code = adapted.code;
  }
}
