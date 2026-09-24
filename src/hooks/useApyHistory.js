import { useState, useEffect, useCallback } from 'react';
import * as vaultService from '../services/vault.js';
import {
  assertWellFormedResponse,
  captureFailure,
} from '../utils/diagnostics.js';
import { reportDiagnostic } from '../utils/telemetry.js';

/**
 * Load APY history for a set of vaults, one fetch per vault (mirroring
 * YieldVault-Backend's per-vault GET /api/vaults/:id/apy-history endpoint,
 * as opposed to a single combined call), and aggregate into a
 * vaultId -> history map.
 * @param {Array<{id: string}>} vaults
 * @returns {{
 *   history: Record<string, Array<{date: string, apy: number}>>,
 *   loading: boolean,
 *   error: string|null,
 *   correlationId: string|null,
 *   retryable: boolean,
 *   reload: () => void,
 * }}
 */
export function useApyHistory(vaults) {
  const [history, setHistory] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [correlationId, setCorrelationId] = useState(null);
  const [retryable, setRetryable] = useState(true);

  const load = useCallback(async () => {
    if (vaults.length === 0) {
      setHistory({});
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setCorrelationId(null);
    setRetryable(true);
    try {
      const results = await Promise.all(
        vaults.map((vault) => vaultService.getVaultApyHistory(vault.id)),
      );
      const byVault = {};
      for (const result of results) {
        assertWellFormedResponse(result, {
          requireKeys: ['vaultId', 'history'],
          label: 'apy history',
        });
        assertWellFormedResponse(result.history, {
          expectArray: true,
          label: 'apy history entries',
        });
        byVault[result.vaultId] = result.history;
      }
      setHistory(byVault);
    } catch (err) {
      const failure = captureFailure(err, {
        feature: 'apy-history',
        level: 'feature',
      });
      reportDiagnostic(failure.diagnostic);
      setError(failure.message);
      setCorrelationId(failure.correlationId);
      setRetryable(failure.retryable);
    } finally {
      setLoading(false);
    }
    // vaults is refetched by identity; callers should memoize/stabilize the
    // array they pass in (e.g. from a hook's own state) to avoid refetch loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaults]);

  useEffect(() => {
    load();
  }, [load]);

  return { history, loading, error, correlationId, retryable, reload: load };
}

export default useApyHistory;
