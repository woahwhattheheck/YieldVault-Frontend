import { useState, useEffect, useCallback } from 'react';
import * as vaultService from '../services/vault.js';
import { useWallet } from './useWallet.js';
import { useAppContext } from '../context/AppContext.jsx';
import {
  cachePositions,
  readCachedPositions,
  POSITIONS_CACHE_KEY,
} from '../utils/sessionAuth.js';

/**
 * Load the connected user's vault positions. Returns an empty list when
 * the wallet is not connected or the session has expired. Cached positions
 * are wiped on logout / expiry via clearSensitiveClientState.
 * @returns {{ positions: Array, loading: boolean, error: string|null, lastUpdated: Date|null, reload: () => void }}
 */
export function usePositions() {
  const { isConnected } = useWallet();
  const { sessionExpired, ensureSessionActive } = useAppContext();
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = useCallback(async () => {
    if (!isConnected || sessionExpired) {
      setPositions([]);
      try {
        sessionStorage?.removeItem?.(POSITIONS_CACHE_KEY);
      } catch {
        /* ignore */
      }
      return;
    }

    const activeSession = await ensureSessionActive();
    if (!activeSession) {
      setPositions([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await vaultService.getPositions();
      setPositions(data);
      cachePositions(data);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message || 'Failed to load positions');
      // Fall back to empty rather than stale sensitive data.
      setPositions([]);
    } finally {
      setLoading(false);
    }
  }, [isConnected, sessionExpired, ensureSessionActive]);

  useEffect(() => {
    load();
  }, [load]);

  // Drop in-memory positions immediately when the session expires.
  useEffect(() => {
    if (sessionExpired || !isConnected) {
      setPositions([]);
    }
  }, [sessionExpired, isConnected]);

  return { positions, loading, error, lastUpdated, reload: load, cached: readCachedPositions() };
}

export default usePositions;
