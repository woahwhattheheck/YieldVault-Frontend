/**
 * Read-only preflight simulation for value-moving vault transactions.
 *
 * Runs the configured validation path against the current wallet, network,
 * and serialized payload. A successful result is advisory only — callers must
 * still submit through the wallet and treat the on-chain outcome as final.
 */

import { CONFIG } from '../constants/config.js';
import { withLatency } from './api.js';
import {
  PREFLIGHT_CODE,
  PREFLIGHT_STATUS,
  buildTxPayload,
  fingerprintTx,
  serializeTxPayload,
} from '../utils/preflight.js';

/** @type {{ mode: string, reason?: string, delayMs?: number, code?: string }|null} */
let testBehavior = null;

/**
 * Test-only: force the next simulation outcome (timeout / unsupported / reject).
 * @param {{ mode: 'ok'|'timeout'|'unsupported'|'reject', reason?: string, delayMs?: number, code?: string }|null} behavior
 */
export function __setSimulationBehaviorForTests(behavior) {
  testBehavior = behavior;
}

/** Test-only reset. */
export function __resetSimulationBehaviorForTests() {
  testBehavior = null;
}

/**
 * Run a read-only preflight against the current intent.
 * Always resolves with a result object (timeouts become retryable TIMEOUT).
 *
 * @param {{
 *   kind: 'deposit'|'withdraw',
 *   vaultId: string,
 *   amount: string|number,
 *   asset: string,
 *   walletAddress?: string|null,
 *   network?: string|null,
 *   expectedNetwork?: string|null,
 *   contractId?: string|null,
 *   balance?: number,
 *   position?: number,
 *   vault?: { id?: string, paused?: boolean, minAmount?: number, maxAmount?: number }|null,
 * }} input
 * @param {{ timeoutMs?: number }} [opts]
 */
export async function runPreflight(input, opts = {}) {
  const payload = buildTxPayload({
    kind: input.kind,
    vaultId: input.vaultId,
    amount: input.amount,
    asset: input.asset,
    walletAddress: input.walletAddress,
    network: input.network,
    contractId: input.contractId ?? CONFIG.vaultContract,
  });
  const serializedTx = serializeTxPayload(payload);
  const network = payload.network;
  const fingerprint = fingerprintTx(serializedTx, network);
  const timeoutMs = opts.timeoutMs ?? CONFIG.preflightTimeoutMs ?? 8000;

  const base = {
    advisoryOnly: true,
    fingerprint,
    network,
    serializedTx,
    payload,
  };

  if (!payload.walletAddress || !payload.network) {
    return rejected(
      base,
      PREFLIGHT_CODE.MISSING_CONTEXT,
      'Connect a wallet on the correct network before continuing.',
    );
  }

  const expected = input.expectedNetwork ?? CONFIG.network;
  if (expected && payload.network !== expected) {
    return rejected(
      base,
      PREFLIGHT_CODE.NETWORK_MISMATCH,
      `Wallet network (${payload.network}) does not match app network (${expected}). Switch networks and retry.`,
    );
  }

  if (testBehavior?.mode === 'timeout') {
    const wait = Math.min(timeoutMs, testBehavior.delayMs ?? 25);
    await delay(wait);
    return {
      ...base,
      status: PREFLIGHT_STATUS.TIMEOUT,
      code: PREFLIGHT_CODE.PROVIDER_TIMEOUT,
      reason:
        testBehavior.reason ||
        'Simulation timed out. Retry preflight before signing.',
      retryable: true,
    };
  }

  if (testBehavior?.mode === 'unsupported') {
    await delay(testBehavior.delayMs ?? 0);
    return {
      ...base,
      status: PREFLIGHT_STATUS.UNSUPPORTED,
      code: PREFLIGHT_CODE.SIMULATION_UNSUPPORTED,
      reason:
        testBehavior.reason ||
        'This provider cannot simulate the transaction. Retry or switch RPC.',
      retryable: true,
    };
  }

  if (testBehavior?.mode === 'reject') {
    await delay(testBehavior.delayMs ?? 0);
    return rejected(
      base,
      testBehavior.code || PREFLIGHT_CODE.CONTRACT_REJECTED,
      testBehavior.reason ||
        'Simulation rejected this transaction. Adjust the amount or try again later.',
    );
  }

  const amountNum = Number(payload.amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return rejected(
      base,
      PREFLIGHT_CODE.UNSUPPORTED_AMOUNT,
      'This amount is not supported by the vault.',
    );
  }

  const vault = input.vault;
  if (vault?.paused) {
    return rejected(
      base,
      PREFLIGHT_CODE.VAULT_PAUSED,
      'This vault is paused and cannot accept deposits or withdrawals right now.',
    );
  }

  if (vault?.minAmount != null && amountNum < vault.minAmount) {
    return rejected(
      base,
      PREFLIGHT_CODE.UNSUPPORTED_AMOUNT,
      `Amount is below the vault minimum of ${vault.minAmount}.`,
    );
  }

  if (vault?.maxAmount != null && amountNum > vault.maxAmount) {
    return rejected(
      base,
      PREFLIGHT_CODE.UNSUPPORTED_AMOUNT,
      `Amount exceeds the vault maximum of ${vault.maxAmount}.`,
    );
  }

  if (payload.kind === 'deposit') {
    const balance = Number(input.balance ?? 0);
    if (!Number.isFinite(balance)) {
      return rejected(
        base,
        PREFLIGHT_CODE.MISSING_CONTEXT,
        'The wallet balance is unavailable. Refresh it before signing.',
      );
    }
    if (amountNum > balance) {
      return rejected(
        base,
        PREFLIGHT_CODE.STALE_BALANCE,
        'Balance changed since you entered this amount. Refresh and try a smaller deposit.',
      );
    }
  }

  if (payload.kind === 'withdraw') {
    const position = Number(input.position ?? 0);
    if (!Number.isFinite(position)) {
      return rejected(
        base,
        PREFLIGHT_CODE.MISSING_CONTEXT,
        'The position balance is unavailable. Refresh it before signing.',
      );
    }
    if (amountNum > position) {
      return rejected(
        base,
        PREFLIGHT_CODE.INSUFFICIENT_POSITION,
        'Your position is smaller than this withdrawal. Refresh and try again.',
      );
    }
  }

  // Keep the mock response delay independent of the caller's deadline.
  const latency = Math.min(CONFIG.mockLatency ?? 0, 50);
  let timeoutId;
  try {
    return await Promise.race([
      withLatency({
        ...base,
        status: PREFLIGHT_STATUS.OK,
        code: PREFLIGHT_CODE.OK,
        reason: null,
        retryable: false,
      }, Number.isFinite(latency) ? latency : 0),
      new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve({
          ...base,
          status: PREFLIGHT_STATUS.TIMEOUT,
          code: PREFLIGHT_CODE.PROVIDER_TIMEOUT,
          reason: 'Simulation timed out. Retry preflight before signing.',
          retryable: true,
        }), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

/** @deprecated Prefer runPreflight — alias kept for clarity at call sites. */
export const simulateValueMovingTx = runPreflight;

function rejected(base, code, reason) {
  return {
    ...base,
    status: PREFLIGHT_STATUS.REJECTED,
    code,
    reason,
    retryable: false,
  };
}

function delay(ms) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default {
  runPreflight,
  simulateValueMovingTx,
  __setSimulationBehaviorForTests,
  __resetSimulationBehaviorForTests,
};
