import { useCallback, useEffect, useRef, useState } from 'react';
import {
  classifyProviderError,
  clearTxOperation,
  createClientOpId,
  describeTxStatus,
  fingerprintMutation,
  getActiveTxOperation,
  getLatestTxOperation,
  getTxOperation,
  saveTxOperation,
  transitionTxState,
  type TxOperation,
  type TxStatusDescription,
} from '../utils/txLifecycle.js';

export type { TxOperation, TxStatusDescription };

type StatusResult = { status: 'pending' | 'confirmed' | 'failed' | 'unknown'; hash?: string | null; source?: 'mock' | 'chain' };
type UseTxLifecycleOptions = {
  kind: 'deposit' | 'withdraw';
  vaultId: string;
  walletAddress: string;
  network: string;
  getStatus: (ref: { clientOpId: string; txHash: string | null }) => Promise<StatusResult>;
};
type SubmitResult = { hash?: string };

/**
 * The submitted record is saved before invoking the wallet. A receipt/hash
 * advances to confirming, and only an explicit status lookup may confirm.
 */
export function useTxLifecycle({
  kind, vaultId, walletAddress, network, getStatus,
}: UseTxLifecycleOptions) {
  const [operation, setOperation] = useState<TxOperation | null>(null);
  const [checking, setChecking] = useState(false);
  const lockRef = useRef(false);
  const scopeRef = useRef('');
  scopeRef.current = JSON.stringify([kind, vaultId, walletAddress, network]);

  const persist = useCallback((next: TxOperation) => {
    saveTxOperation(next);
    // An old provider response may arrive after the user switches wallets.
    if (JSON.stringify([next.kind, next.vaultId, next.walletAddress, next.network]) === scopeRef.current) {
      setOperation(next);
    }
    return next;
  }, []);

  const reconcileOperation = useCallback(async (op: TxOperation): Promise<TxOperation> => {
    setChecking(true);
    let outcome: StatusResult = { status: 'unknown' };
    try {
      outcome = await getStatus({ clientOpId: op.clientOpId, txHash: op.txHash ?? null });
    } catch {
      // A failed lookup is not evidence that a submitted transaction failed.
    } finally {
      setChecking(false);
    }
    const latest = getTxOperation(op.clientOpId);
    if (!latest || latest.state === 'confirmed' || latest.state === 'failed') {
      return latest ?? op;
    }
    const next: TxOperation = {
      ...latest,
      txHash: outcome.hash || latest.txHash || null,
      statusSource: outcome.source || latest.statusSource,
      state: outcome.status === 'confirmed'
        ? transitionTxState(latest.state, 'confirmed')
        : outcome.status === 'failed'
          ? transitionTxState(latest.state, 'failed')
          : outcome.status === 'pending'
            ? transitionTxState(latest.state, 'provider_ack')
            : 'unknown',
      error: outcome.status === 'failed' ? 'The status provider reported a failed transaction.'
        : outcome.status === 'confirmed' ? null : latest.error,
      retryable: outcome.status === 'failed',
      needsNewSignature: outcome.status === 'failed',
      updatedAt: new Date().toISOString(),
    };
    return persist(next);
  }, [getStatus, persist]);

  // Reconcile after a refresh without ever re-signing the old operation.
  useEffect(() => {
    const latest = getLatestTxOperation({ kind, vaultId, walletAddress, network });
    setOperation(latest);
    if (latest && (latest.state === 'submitted' || latest.state === 'confirming' ||
      latest.state === 'unknown')) {
      void reconcileOperation(latest);
    }
  }, [kind, vaultId, walletAddress, network, reconcileOperation]);

  const run = useCallback(async (
    amount: string | number,
    submitFn: (clientOpId: string) => Promise<SubmitResult>,
  ): Promise<TxOperation | null> => {
    const current = getActiveTxOperation({ kind, vaultId, walletAddress, network });
    if (lockRef.current || (current && current.state !== 'failed')) return current;
    if (current?.state === 'failed') {
      if (!current.retryable ||
        fingerprintMutation(current) !== fingerprintMutation({ kind, vaultId, amount })) {
        return current;
      }
    }

    lockRef.current = true;
    const next: TxOperation = {
      clientOpId: createClientOpId(), kind, vaultId, amount: String(amount),
      walletAddress, network, state: 'submitted', txHash: null, error: null,
      retryable: false, needsNewSignature: false, updatedAt: new Date().toISOString(),
    };
    try {
      // Failure here occurs before any signing; keep the old record intact.
      persist(next);
      if (current?.state === 'failed') clearTxOperation(current.clientOpId);
      try {
        const receipt = await submitFn(next.clientOpId);
        // A status check or dismissal may have completed while the wallet was pending.
        const latest = getTxOperation(next.clientOpId);
        if (!latest || latest.state === 'confirmed' || latest.state === 'failed') return latest;
        const acknowledged = persist({
          ...latest, txHash: receipt?.hash ?? latest.txHash ?? null,
          state: transitionTxState(latest.state, 'provider_ack'),
          updatedAt: new Date().toISOString(),
        });
        return reconcileOperation(acknowledged);
      } catch (err) {
        const latest = getTxOperation(next.clientOpId);
        if (!latest || latest.state === 'confirmed' || latest.state === 'failed') return latest;
        const classified = classifyProviderError(err);
        const stopped = persist({
          ...latest, state: classified.state, error: classified.error,
          retryable: classified.retryable,
          needsNewSignature: classified.needsNewSignature,
          updatedAt: new Date().toISOString(),
        });
        return stopped.state === 'unknown' ? reconcileOperation(stopped) : stopped;
      }
    } finally {
      lockRef.current = false;
    }
  }, [kind, vaultId, walletAddress, network, persist, reconcileOperation]);

  const checkStatus = useCallback(async () => {
    const latest = operation && getTxOperation(operation.clientOpId);
    if (latest && ['submitted', 'confirming', 'unknown'].includes(latest.state)) {
      return reconcileOperation(latest);
    }
    return latest;
  }, [operation, reconcileOperation]);

  const reset = useCallback(() => {
    if (!operation || !['confirmed', 'failed'].includes(operation.state)) return;
    clearTxOperation(operation.clientOpId);
    setOperation(null);
  }, [operation]);

  const status = describeTxStatus(operation);
  const busy = checking || operation?.state === 'submitted' ||
    operation?.state === 'confirming' || operation?.state === 'unknown';

  return { operation, status, busy, checking, run, checkStatus, reset };
}

export default useTxLifecycle;
