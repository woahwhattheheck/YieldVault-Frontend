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

const STALE_REASON =
  'Preflight expired because transaction context changed. Run again before signing.';

function staleResult(result, reason = STALE_REASON) {
  return { ...result, status: PREFLIGHT_STATUS.STALE, reason, retryable: true, advisoryOnly: true };
}

/**
 * Capture the current intent before asynchronous work. The returned guard
 * expires on context changes and unmount, even if the context later changes
 * back. Wizards provide their amount when capturing; forms include it in input.
 */
export function usePreflightGuard(input) {
  const normalized = {
    ...input,
    walletAddress: input.isConnected === false ? null : input.walletAddress,
    expectedNetwork: input.expectedNetwork ?? CONFIG.network,
    contractId: input.contractId ?? CONFIG.vaultContract,
  };
  const contextKey = JSON.stringify([
    serializeTxPayload(buildTxPayload(normalized)),
    normalized.expectedNetwork,
    String(input.balance ?? 0),
    String(input.position ?? 0),
    Boolean(input.vault?.paused),
    String(input.vault?.minAmount ?? ''),
    String(input.vault?.maxAmount ?? ''),
  ]);
  const current = useRef({ contextKey, input: normalized, revision: 0 });
  if (current.current.contextKey !== contextKey) current.current.revision += 1;
  current.current.contextKey = contextKey;
  current.current.input = normalized;
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      current.current.revision += 1;
    };
  }, []);

  const capture = useCallback((amount = undefined) => {
    const snapshot = current.current;
    const revision = snapshot.revision;
    const capturedInput = { ...snapshot.input };
    if (amount !== undefined) capturedInput.amount = amount;
    const payload = buildTxPayload(capturedInput);
    const serializedTx = serializeTxPayload(payload);
    const network = payload.network;
    const isCurrent = () => mounted.current && current.current.revision === revision;
    return {
      input: capturedInput,
      contextKey: snapshot.contextKey,
      binding: { payload, serializedTx, network, fingerprint: fingerprintTx(serializedTx, network) },
      isCurrent,
      canSign: (result, connectedNetwork) =>
        isCurrent() &&
        connectedNetwork === network &&
        (!capturedInput.expectedNetwork || capturedInput.expectedNetwork === network) &&
        shouldRequestSignature(result, serializedTx, network),
    };
  }, []);

  return { capture, contextKey };
}

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
 *   isConnected?: boolean,
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
 *   capture: ReturnType<typeof usePreflightGuard>['capture'],
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
  } = args;

  /** @type {[PreflightResult|null, function(PreflightResult|null|function(PreflightResult|null): PreflightResult|null): void]} */
  const [result, setResult] = useState(/** @type {PreflightResult|null} */ (null));
  const [running, setRunning] = useState(false);
  const runIdRef = useRef(0);
  const resultContextRef = useRef(null);
  const { capture, contextKey } = usePreflightGuard(args);

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

  // Context drift cancels the awaiting caller too, not only the rendered status.
  useEffect(() => {
    runIdRef.current += 1;
    setRunning(false);
    setResult((prev) => prev ? staleResult(prev) : prev);
  }, [contextKey]);

  const run = useCallback(async () => {
    const attempt = capture();
    const id = ++runIdRef.current;
    resultContextRef.current = attempt.contextKey;
    setRunning(true);
    setResult({
      status: PREFLIGHT_STATUS.RUNNING,
      code: null,
      reason: null,
      retryable: false,
      advisoryOnly: true,
      ...attempt.binding,
    });
    try {
      const next = await runPreflight(attempt.input);
      if (id !== runIdRef.current || !attempt.isCurrent()) return staleResult(next);
      setResult(next);
      return next;
    } finally {
      if (id === runIdRef.current && attempt.isCurrent()) setRunning(false);
    }
  }, [capture]);

  const invalidate = useCallback((reason) => {
    runIdRef.current += 1;
    setRunning(false);
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
  const canSign = resultContextRef.current === contextKey &&
    shouldRequestSignature(result, serializedTx, network);
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
    capture,
    invalidate,
    reset,
  };
}

export default usePreflight;
