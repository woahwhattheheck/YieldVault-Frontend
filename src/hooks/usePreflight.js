import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CONFIG } from '../constants/config.js';
import { runPreflight } from '../services/preflight.js';
import {
  PREFLIGHT_STATUS,
  buildTxPayload,
  fingerprintTx,
  isPreflightBoundTo,
  isRetryablePreflight,
  preflightUserMessage,
  serializeTxPayload,
  shouldRequestSignature,
} from '../utils/preflight.js';

/**
 * @typedef {object} PreflightResult
 * @property {string} status
 * @property {string|null} [code]
 * @property {string|null} [reason]
 * @property {boolean} [retryable]
 * @property {true} [advisoryOnly]
 * @property {string} [fingerprint]
 * @property {string|null} [network]
 * @property {string} [serializedTx]
 * @property {object} [payload]
 */

/**
 * Manage a read-only preflight for a value-moving mutation.
 * Results are invalidated when the serialized payload or network changes.
 *
 * @param {{
 *   kind: 'deposit'|'withdraw',
 *   vaultId: string,
 *   amount: string|number,
 *   asset: string,
 *   walletAddress?: string|null,
 *   network?: string|null,
 *   expectedNetwork?: string|null,
 *   balance?: number,
 *   position?: number,
 *   vault?: object|null,
 * }} args
 * @returns {{
 *   result: PreflightResult|null,
 *   running: boolean,
 *   canSign: boolean,
 *   retryable: boolean,
 *   message: string|null,
 *   serializedTx: string,
 *   fingerprint: string,
 *   network: string|null|undefined,
 *   run: () => Promise<PreflightResult>,
 *   invalidate: (reason?: string) => void,
 *   reset: () => void,
 * }}
 */
export function usePreflight(args) {
  const {
    kind,
    vaultId,
    amount,
    asset,
    walletAddress = null,
    network = null,
    expectedNetwork = CONFIG.network,
    balance = 0,
    position = 0,
    vault = null,
  } = args;

  /** @type {[PreflightResult|null, function(PreflightResult|null|function(PreflightResult|null): PreflightResult|null): void]} */
  const [result, setResult] = useState(/** @type {PreflightResult|null} */ (null));
  const [running, setRunning] = useState(false);
  const runIdRef = useRef(0);

  const payload = useMemo(
    () =>
      buildTxPayload({
        kind,
        vaultId,
        amount,
        asset,
        walletAddress,
        network,
        contractId: CONFIG.vaultContract,
      }),
    [kind, vaultId, amount, asset, walletAddress, network],
  );

  const serializedTx = useMemo(() => serializeTxPayload(payload), [payload]);
  const fingerprint = useMemo(
    () => fingerprintTx(serializedTx, network),
    [serializedTx, network],
  );

  // Invalidate when the live intent drifts from the stored result.
  useEffect(() => {
    setResult((prev) => {
      if (!prev) return prev;
      if (isPreflightBoundTo(prev, serializedTx, network)) return prev;
      return {
        ...prev,
        status: PREFLIGHT_STATUS.STALE,
        reason:
          'Preflight expired because the wallet, network, or amount changed. Run again before signing.',
        retryable: true,
      };
    });
  }, [serializedTx, network, fingerprint]);

  const run = useCallback(async () => {
    const id = ++runIdRef.current;
    setRunning(true);
    setResult({
      status: PREFLIGHT_STATUS.RUNNING,
      code: null,
      reason: null,
      retryable: false,
      advisoryOnly: true,
      fingerprint,
      network,
      serializedTx,
      payload,
    });
    try {
      const next = await runPreflight({
        kind,
        vaultId,
        amount,
        asset,
        walletAddress,
        network,
        expectedNetwork,
        balance,
        position,
        vault,
        contractId: CONFIG.vaultContract,
      });
      if (id !== runIdRef.current) return next;
      setResult(next);
      return next;
    } finally {
      if (id === runIdRef.current) setRunning(false);
    }
  }, [
    kind,
    vaultId,
    amount,
    asset,
    walletAddress,
    network,
    expectedNetwork,
    balance,
    position,
    vault,
    fingerprint,
    serializedTx,
    payload,
  ]);

  const invalidate = useCallback((reason) => {
    setResult((prev) => ({
      status: PREFLIGHT_STATUS.STALE,
      code: prev?.code ?? null,
      reason:
        reason ||
        'Preflight expired because the wallet, network, or amount changed. Run again before signing.',
      retryable: true,
      advisoryOnly: true,
      fingerprint: prev?.fingerprint,
      network: prev?.network ?? null,
      serializedTx: prev?.serializedTx,
      payload: prev?.payload,
    }));
  }, []);

  const reset = useCallback(() => {
    runIdRef.current += 1;
    setResult(null);
    setRunning(false);
  }, []);

  const bound = result ? isPreflightBoundTo(result, serializedTx, network) : false;
  const canSign = shouldRequestSignature(result, serializedTx, network);
  const retryable = isRetryablePreflight(result);
  const message = preflightUserMessage(
    result && !bound && result.status !== PREFLIGHT_STATUS.RUNNING && result.status !== PREFLIGHT_STATUS.STALE
      ? { ...result, status: PREFLIGHT_STATUS.STALE }
      : result,
  );

  return {
    result,
    running,
    canSign,
    retryable,
    message,
    serializedTx,
    fingerprint,
    network,
    run,
    invalidate,
    reset,
  };
}

export default usePreflight;
