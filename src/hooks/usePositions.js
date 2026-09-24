import { useState, useEffect, useCallback } from 'react';
import * as vaultService from '../services/vault.js';
import {
  assertWellFormedResponse,
  captureFailure,
} from '../utils/diagnostics.js';
import { reportDiagnostic } from '../utils/telemetry.js';

/**
 * Load the connected user's open positions.
 * @returns {{
 *   positions: Array,
 *   loading: boolean,
 *   error: string|null,
 *   correlationId: string|null,
 *   retryable: boolean,
 *   lastUpdated: Date|null,
 *   reload: () => void,
 * }}
 */
export function usePositions() {
  const [positions, setPositions] = useState([]);
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
      const list = await vaultService.getPositions();
      assertWellFormedResponse(list, {
        expectArray: true,
        label: 'positions',
      });
      setPositions(list);
      setLastUpdated(new Date());
    } catch (err) {
      const failure = captureFailure(err, {
        feature: 'positions',
        level: 'feature',
      });
      reportDiagnostic(failure.diagnostic);
      setError(failure.message);
      setCorrelationId(failure.correlationId);
      setRetryable(failure.retryable);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return {
    positions,
    loading,
    error,
    correlationId,
    retryable,
    lastUpdated,
    reload: load,
  };
}

export default usePositions;
