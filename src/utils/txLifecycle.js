/**
 * Vault mutation transaction lifecycle.
 *
 * States model backend/contract progress:
 *   idle → submitted → confirming → confirmed
 *                     ↘ failed (terminal, retryable or not)
 *                     ↘ unknown (provider timeout / lost response)
 *
 * A correlation reference (clientOpId) is persisted so a refresh can restore
 * status without automatically re-submitting. Retry reuses the same op when
 * the failure is retryable and the payload is unchanged; a new signature is
 * required when the wallet must re-authorize.
 */

export const TX_STATES = [
  'idle',
  'submitted',
  'confirming',
  'confirmed',
  'failed',
  'unknown',
];

export const TERMINAL_TX_STATES = ['confirmed', 'failed'];

const STORAGE_KEY = 'yieldvault.txOps';

/**
 * @typedef {'idle'|'submitted'|'confirming'|'confirmed'|'failed'|'unknown'} TxState
 * @typedef {{
 *   clientOpId: string,
 *   kind: 'deposit'|'withdraw',
 *   vaultId: string,
 *   amount: string,
 *   state: TxState,
 *   txHash?: string|null,
 *   error?: string|null,
 *   retryable?: boolean,
 *   needsNewSignature?: boolean,
 *   updatedAt: string,
 * }} TxOperation
 */

/** @returns {string} */
export function createClientOpId() {
  if (globalThis.crypto?.randomUUID) return `op_${globalThis.crypto.randomUUID()}`;
  return `op_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 10)}`;
}

/** Canonical fingerprint for a vault mutation intent. */
export function fingerprintMutation({ kind, vaultId, amount }) {
  return [kind, vaultId, String(amount ?? '').trim()].join('|');
}

function readStore() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore quota / private mode
  }
}

/** @param {TxOperation} op */
export function saveTxOperation(op) {
  if (!op?.clientOpId) return;
  const store = readStore();
  store[op.clientOpId] = { ...op, updatedAt: new Date().toISOString() };
  writeStore(store);
}

/** @param {string} clientOpId */
export function getTxOperation(clientOpId) {
  if (!clientOpId) return null;
  return readStore()[clientOpId] ?? null;
}

/** Latest non-terminal op for a vault+kind, if any. */
export function getActiveTxOperation({ kind, vaultId } = {}) {
  const ops = Object.values(readStore());
  const active = ops
    .filter((op) => {
      if (!op || TERMINAL_TX_STATES.includes(op.state)) return false;
      if (kind && op.kind !== kind) return false;
      if (vaultId && op.vaultId !== vaultId) return false;
      return true;
    })
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return active[0] ?? null;
}

export function clearTxOperation(clientOpId) {
  if (!clientOpId) return;
  const store = readStore();
  delete store[clientOpId];
  writeStore(store);
}

/**
 * Pure state-machine transition.
 * @param {TxState} current
 * @param {'submit'|'provider_ack'|'confirmed'|'failed'|'timeout'|'reset'} event
 * @param {{retryable?: boolean, needsNewSignature?: boolean}} [meta]
 * @returns {TxState}
 */
export function transitionTxState(current, event, meta = {}) {
  switch (event) {
    case 'submit':
      if (current === 'submitted' || current === 'confirming') return current;
      return 'submitted';
    case 'provider_ack':
      if (current === 'submitted' || current === 'unknown') return 'confirming';
      return current;
    case 'confirmed':
      if (current === 'confirming' || current === 'submitted' || current === 'unknown') {
        return 'confirmed';
      }
      return current;
    case 'failed':
      if (TERMINAL_TX_STATES.includes(current) && current === 'confirmed') return current;
      return 'failed';
    case 'timeout':
      if (current === 'submitted' || current === 'confirming') return 'unknown';
      return current;
    case 'reset':
      return 'idle';
    default:
      return current;
  }
}

/**
 * Human-readable copy + recovery affordances for a lifecycle state.
 * @param {TxOperation|null} op
 */
export function describeTxStatus(op) {
  if (!op || op.state === 'idle') {
    return { label: null, detail: null, canRetry: false, needsNewSignature: false };
  }
  switch (op.state) {
    case 'submitted':
      return {
        label: 'Submitted',
        detail: 'Waiting for the wallet / provider to acknowledge the transaction.',
        canRetry: false,
        needsNewSignature: false,
      };
    case 'confirming':
      return {
        label: 'Confirming',
        detail: 'Transaction submitted. Waiting for network confirmation.',
        canRetry: false,
        needsNewSignature: false,
      };
    case 'confirmed':
      return {
        label: 'Confirmed',
        detail: op.txHash ? `Confirmed (${op.txHash}).` : 'Confirmed on-chain.',
        canRetry: false,
        needsNewSignature: false,
      };
    case 'failed':
      return {
        label: 'Failed',
        detail: op.error || 'The mutation failed.',
        canRetry: Boolean(op.retryable),
        needsNewSignature: Boolean(op.needsNewSignature),
      };
    case 'unknown':
      return {
        label: 'Status unknown',
        detail:
          'The provider did not return a definitive outcome. Refresh to reconcile before retrying — a new signature is required if you choose to submit again.',
        canRetry: true,
        needsNewSignature: true,
      };
    default:
      return { label: op.state, detail: null, canRetry: false, needsNewSignature: false };
  }
}

/**
 * Map a thrown error / provider outcome into failed vs unknown.
 * @param {unknown} err
 * @returns {{state: 'failed'|'unknown', retryable: boolean, needsNewSignature: boolean, error: string}}
 */
export function classifyProviderError(err) {
  const message = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  const lower = message.toLowerCase();
  const timeout =
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('network') ||
    lower.includes('failed to fetch');
  if (timeout) {
    return {
      state: 'unknown',
      retryable: true,
      needsNewSignature: true,
      error: message,
    };
  }
  const rejected =
    lower.includes('reject') ||
    lower.includes('denied') ||
    lower.includes('user cancelled') ||
    lower.includes('user canceled');
  return {
    state: 'failed',
    retryable: !rejected,
    needsNewSignature: true,
    error: message,
  };
}
