/**
 * Preflight helpers for value-moving vault transactions.
 *
 * Trust boundary: a successful simulation is advisory only. It never
 * confirms settlement and never replaces contract-side validation. The
 * on-chain / provider result remains authoritative after the user signs.
 */

/** @typedef {'idle'|'running'|'ok'|'rejected'|'timeout'|'unsupported'|'stale'} PreflightStatus */

export const PREFLIGHT_STATUS = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  OK: 'ok',
  REJECTED: 'rejected',
  TIMEOUT: 'timeout',
  UNSUPPORTED: 'unsupported',
  STALE: 'stale',
});

/** Deterministic failure codes surfaced to the UI. */
export const PREFLIGHT_CODE = Object.freeze({
  OK: 'OK',
  STALE_BALANCE: 'STALE_BALANCE',
  INSUFFICIENT_POSITION: 'INSUFFICIENT_POSITION',
  VAULT_PAUSED: 'VAULT_PAUSED',
  UNSUPPORTED_AMOUNT: 'UNSUPPORTED_AMOUNT',
  NETWORK_MISMATCH: 'NETWORK_MISMATCH',
  CONTRACT_REJECTED: 'CONTRACT_REJECTED',
  PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
  SIMULATION_UNSUPPORTED: 'SIMULATION_UNSUPPORTED',
  MISSING_CONTEXT: 'MISSING_CONTEXT',
});

/**
 * Build a stable payload describing a value-moving mutation.
 * @param {{
 *   kind: 'deposit'|'withdraw',
 *   vaultId: string,
 *   amount: string|number,
 *   asset: string,
 *   walletAddress: string|null|undefined,
 *   network: string|null|undefined,
 *   contractId?: string|null,
 * }} input
 */
export function buildTxPayload(input) {
  const amount = normalizeAmount(input.amount);
  return {
    kind: input.kind,
    vaultId: String(input.vaultId ?? ''),
    amount,
    asset: String(input.asset ?? ''),
    walletAddress: input.walletAddress ? String(input.walletAddress) : null,
    network: input.network ? String(input.network) : null,
    contractId: input.contractId ? String(input.contractId) : null,
  };
}

/**
 * Canonical JSON serialization used to bind a preflight result to an
 * exact transaction intent. Key order is fixed so identical intents
 * produce identical strings.
 * @param {ReturnType<typeof buildTxPayload>} payload
 * @returns {string}
 */
export function serializeTxPayload(payload) {
  const ordered = {
    kind: payload.kind,
    vaultId: payload.vaultId,
    amount: payload.amount,
    asset: payload.asset,
    walletAddress: payload.walletAddress,
    network: payload.network,
    contractId: payload.contractId ?? null,
  };
  return JSON.stringify(ordered);
}

/**
 * Fingerprint tying a preflight result to the serialized intent + network.
 * @param {string} serializedTx
 * @param {string|null|undefined} network
 * @returns {string}
 */
export function fingerprintTx(serializedTx, network) {
  return `${network ?? 'unknown'}::${serializedTx}`;
}

/**
 * True when a stored preflight result still matches the live intent.
 * @param {{ fingerprint?: string, network?: string|null, serializedTx?: string }|null|undefined} result
 * @param {string} serializedTx
 * @param {string|null|undefined} network
 */
export function isPreflightBoundTo(result, serializedTx, network) {
  if (!result || !result.fingerprint) return false;
  const expected = fingerprintTx(serializedTx, network);
  return result.fingerprint === expected && result.network === (network ?? null);
}

/**
 * Only an OK result that is still bound to the live payload may proceed
 * to wallet signing. Simulation success is never treated as confirmation.
 * @param {{ status?: string, fingerprint?: string, network?: string|null }|null|undefined} result
 * @param {string} serializedTx
 * @param {string|null|undefined} network
 */
export function shouldRequestSignature(result, serializedTx, network) {
  if (!result || result.status !== PREFLIGHT_STATUS.OK) return false;
  return isPreflightBoundTo(result, serializedTx, network);
}

/**
 * Whether the UI should offer an explicit retry (timeout / unsupported).
 * Deterministic rejections are not auto-retried; the user must change state.
 * @param {{ status?: string, retryable?: boolean }|null|undefined} result
 */
export function isRetryablePreflight(result) {
  if (!result) return false;
  if (typeof result.retryable === 'boolean') return result.retryable;
  return (
    result.status === PREFLIGHT_STATUS.TIMEOUT ||
    result.status === PREFLIGHT_STATUS.UNSUPPORTED
  );
}

/**
 * Human-readable copy for preflight outcomes.
 * @param {{ status?: string, code?: string, reason?: string }|null|undefined} result
 * @returns {string|null}
 */
export function preflightUserMessage(result) {
  if (!result || !result.status || result.status === PREFLIGHT_STATUS.IDLE) {
    return null;
  }
  if (result.status === PREFLIGHT_STATUS.RUNNING) {
    return 'Checking transaction against the current network…';
  }
  if (result.status === PREFLIGHT_STATUS.OK) {
    return 'Preflight passed. Sign to submit — on-chain validation remains authoritative.';
  }
  if (result.status === PREFLIGHT_STATUS.STALE) {
    return 'Preflight expired because the wallet, network, or amount changed. Run again before signing.';
  }
  if (result.reason) return result.reason;

  switch (result.code) {
    case PREFLIGHT_CODE.STALE_BALANCE:
      return 'Balance changed since you entered this amount. Refresh and try again.';
    case PREFLIGHT_CODE.INSUFFICIENT_POSITION:
      return 'Your position is smaller than this withdrawal. Refresh and try again.';
    case PREFLIGHT_CODE.VAULT_PAUSED:
      return 'This vault is paused and cannot accept deposits or withdrawals right now.';
    case PREFLIGHT_CODE.UNSUPPORTED_AMOUNT:
      return 'This amount is not supported by the vault.';
    case PREFLIGHT_CODE.NETWORK_MISMATCH:
      return 'Wallet network does not match the transaction network. Switch networks and retry.';
    case PREFLIGHT_CODE.CONTRACT_REJECTED:
      return 'Simulation rejected this transaction. Adjust the amount or try again later.';
    case PREFLIGHT_CODE.PROVIDER_TIMEOUT:
      return 'Simulation timed out. Retry preflight before signing.';
    case PREFLIGHT_CODE.SIMULATION_UNSUPPORTED:
      return 'This provider cannot simulate the transaction. Retry or switch RPC.';
    case PREFLIGHT_CODE.MISSING_CONTEXT:
      return 'Connect a wallet on the correct network before continuing.';
    default:
      return 'Preflight could not verify this transaction.';
  }
}

/**
 * @param {string|number|null|undefined} amount
 * @returns {string}
 */
function normalizeAmount(amount) {
  if (amount === '' || amount === null || amount === undefined) return '';
  const n = typeof amount === 'number' ? amount : Number(String(amount).replace(/,/g, ''));
  if (!Number.isFinite(n)) return String(amount);
  // Keep a stable decimal string without scientific notation for fingerprints.
  return String(n);
}

export default {
  PREFLIGHT_STATUS,
  PREFLIGHT_CODE,
  buildTxPayload,
  serializeTxPayload,
  fingerprintTx,
  isPreflightBoundTo,
  shouldRequestSignature,
  isRetryablePreflight,
  preflightUserMessage,
};
