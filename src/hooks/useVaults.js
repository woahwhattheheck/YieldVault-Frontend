import { useState, useEffect, useCallback } from 'react';
import * as vaultService from '../services/vault.js';
import {
  assertWellFormedResponse,
  captureFailure,
} from '../utils/diagnostics.js';
import { reportDiagnostic } from '../utils/telemetry.js';

/**
 * Load all vaults plus protocol-wide stats with loading/error handling.
 * Async failures are classified, redacted, and reported with a correlation id.
 * @returns {{
 *   vaults: Array,
 *   stats: object|null,
 *   loading: boolean,
 *   error: string|null,
 *   correlationId: string|null,
 *   retryable: boolean,
 *   lastUpdated: Date|null,
 *   reload: () => void,
 * }}
 */
export function useVaults() {
  const [vaults, setVaults] = useState([]);
  const [stats, setStats] = useState(null);
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
      const [list, protocolStats] = await Promise.all([
        vaultService.listVaults(),
        vaultService.getProtocolStats(),
      ]);
      assertWellFormedResponse(list, {
        expectArray: true,
        label: 'vault list',
      });
      assertWellFormedResponse(protocolStats, {
        requireKeys: ['totalTvl', 'avgApy', 'vaultCount'],
        label: 'protocol stats',
      });
      setVaults(list);
      setStats(protocolStats);
      setLastUpdated(new Date());
    } catch (err) {
      const failure = captureFailure(err, {
        feature: 'vaults',
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
    vaults,
    stats,
    loading,
    error,
    correlationId,
    retryable,
    lastUpdated,
    reload: load,
  };
}

export default useVaults;
