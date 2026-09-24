import { useCallback, useEffect, useRef, useState } from 'react';
import {
  classifyProviderError,
  clearTxOperation,
  createClientOpId,
  describeTxStatus,
  fingerprintMutation,
  getActiveTxOperation,
  getTxOperation,
  saveTxOperation,
  transitionTxState,
} from '../utils/txLifecycle.js';

/**
 * Resilient vault mutation lifecycle with refresh-safe correlation.
 *
 * @param {{kind: 'deposit'|'withdraw', vaultId: string}} options
 */
export function useTxLifecycle({ kind, vaultId }) {
  const [operation, setOperation] = useState(null);
  const lockRef = useRef(false);
  const fingerprintRef = useRef(null);

  // Restore any in-flight op after refresh without auto-resubmitting.
  useEffect(() => {
    const active = getActiveTxOperation({ kind, vaultId });
    if (active) {
      setOperation(active);
      fingerprintRef.current = fingerprintMutation({
        kind: active.kind,
        vaultId: active.vaultId,
        amount: active.amount,
      });
    }
  }, [kind, vaultId]);

  const persist = useCallback((next) => {
    saveTxOperation(next);
    setOperation(next);
  }, []);

  /**
   * Run a mutation once per intent. Duplicate clicks while submitted/confirming
   * are no-ops. An unchanged retryable failure reuses the same clientOpId.
   *
   * @param {string|number} amount
   * @param {() => Promise<{hash?: string}>} submitFn - signs + submits
   */
  const run = useCallback(
    async (amount, submitFn) => {
      const fingerprint = fingerprintMutation({ kind, vaultId, amount });
      const current = operation ? getTxOperation(operation.clientOpId) : null;

      if (
        current &&
        (current.state === 'submitted' || current.state === 'confirming')
      ) {
        return current;
      }

      if (lockRef.current) return current;

      let clientOpId = current?.clientOpId;
      const sameIntent = fingerprintRef.current === fingerprint;
      if (
        !clientOpId ||
        !sameIntent ||
        (current?.state === 'failed' && current?.needsNewSignature) ||
        current?.state === 'confirmed'
      ) {
        clientOpId = createClientOpId();
      }

      fingerprintRef.current = fingerprint;
      lockRef.current = true;

      let next = {
        clientOpId,
        kind,
        vaultId,
        amount: String(amount),
        state: transitionTxState('idle', 'submit'),
        txHash: null,
        error: null,
        retryable: false,
        needsNewSignature: false,
        updatedAt: new Date().toISOString(),
      };
      persist(next);

      try {
        const result = await submitFn();
        next = {
          ...next,
          state: transitionTxState(next.state, 'provider_ack'),
          txHash: result?.hash ?? null,
          updatedAt: new Date().toISOString(),
        };
        persist(next);
        next = {
          ...next,
          state: transitionTxState(next.state, 'confirmed'),
          updatedAt: new Date().toISOString(),
        };
        persist(next);
        return next;
      } catch (err) {
        const classified = classifyProviderError(err);
        const event = classified.state === 'unknown' ? 'timeout' : 'failed';
        next = {
          ...next,
          state: transitionTxState(next.state, event),
          error: classified.error,
          retryable: classified.retryable,
          needsNewSignature: classified.needsNewSignature,
          updatedAt: new Date().toISOString(),
        };
        persist(next);
        throw err;
      } finally {
        lockRef.current = false;
      }
    },
    [kind, vaultId, operation, persist],
  );

  const reset = useCallback(() => {
    if (operation?.clientOpId) clearTxOperation(operation.clientOpId);
    fingerprintRef.current = null;
    setOperation(null);
  }, [operation]);

  const status = describeTxStatus(operation);
  const busy =
    operation?.state === 'submitted' || operation?.state === 'confirming';

  return {
    operation,
    status,
    busy,
    run,
    reset,
  };
}
