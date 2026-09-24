import { useState, useEffect, useCallback } from 'react';
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCorrelationId(null);
    setRetryable(true);
    try {
      const data = await vaultService.getVault(id);
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
      const failure = captureFailure(err, {
        feature: 'vault',
        level: 'feature',
      });
      reportDiagnostic(failure.diagnostic);
      setError(failure.message);
      setCorrelationId(failure.correlationId);
      setRetryable(failure.retryable);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
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
