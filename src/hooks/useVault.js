import { useState, useEffect, useCallback, useRef } from 'react';
import * as vaultService from '../services/vault.js';
import {
  assertWellFormedResponse,
  captureFailure,
  createAppError,
} from '../utils/diagnostics.js';
import { reportDiagnostic } from '../utils/telemetry.js';

/**
 * Load a single vault by id with loading and error states.
 * @param {string} id
 * @returns {{
 *   vault: object|null,
 *   loading: boolean,
 *   error: string|null,
 *   correlationId: string|null,
 *   retryable: boolean,
 *   lastUpdated: Date|null,
 *   reload: () => void,
 * }}
 */
export function useVault(id) {
  const [vault, setVault] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [correlationId, setCorrelationId] = useState(null);
  const [retryable, setRetryable] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const requestGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = ++requestGeneration.current;
    const isCurrent = () => requestGeneration.current === generation;
    setLoading(true);
    setError(null);
    setCorrelationId(null);
    setRetryable(true);
    try {
      const data = await vaultService.getVault(id);
      if (!isCurrent()) return;
      if (!data) {
        throw createAppError('Vault not found', {
          code: 'INVALID_STATE',
          retryable: false,
        });
      }
      assertWellFormedResponse(data, {
        requireKeys: ['id', 'name', 'asset'],
        label: 'vault',
      });
      setVault(data);
      setLastUpdated(new Date());
    } catch (err) {
      if (!isCurrent()) return;
      const failure = captureFailure(err, {
        feature: 'vault',
        level: 'feature',
      });
      reportDiagnostic(failure.diagnostic);
      setError(failure.message);
      setCorrelationId(failure.correlationId);
      setRetryable(failure.retryable);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    return () => {
      // Navigation, unmount and StrictMode cleanup retire pending callbacks.
      requestGeneration.current += 1;
    };
  }, [load]);

  return {
    vault,
    loading,
    error,
    correlationId,
    retryable,
    lastUpdated,
    reload: load,
  };
}

export default useVault;
