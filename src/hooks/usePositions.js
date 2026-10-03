import { useState, useEffect, useCallback, useRef } from 'react';
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
  const { session, sessionExpired, ensureSessionActive } = useAppContext();
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const requestSequence = useRef(0);

  const clearPositions = useCallback(() => {
    setPositions([]);
    setLoading(false);
    setError(null);
    setLastUpdated(null);
    try {
      sessionStorage?.removeItem?.(POSITIONS_CACHE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    const isCurrent = () => sequence === requestSequence.current;
    if (!isConnected || sessionExpired) {
      clearPositions();
      return;
    }

    try {
      const activeSession = await ensureSessionActive();
      if (!isCurrent()) return;
      if (!activeSession || activeSession !== session) {
        clearPositions();
        return;
      }

      setLoading(true);
      setError(null);
      const data = await vaultService.getPositions();
      if (!isCurrent()) return;

      // A response belongs only to the session that authorized its request.
      // Recheck the clock too: a resumed tab may not have run its expiry timer.
      const currentSession = await ensureSessionActive();
      if (!isCurrent()) return;
      if (currentSession !== activeSession) {
        clearPositions();
        return;
      }

      setPositions(data);
      cachePositions(data);
      setLastUpdated(new Date());
    } catch (err) {
      if (!isCurrent()) return;
      const currentSession = await ensureSessionActive();
      if (!isCurrent()) return;
      clearPositions();
      if (currentSession === session) {
        setError(err?.message || 'Failed to load positions');
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [isConnected, session, sessionExpired, ensureSessionActive, clearPositions]);

  useEffect(() => {
    clearPositions();
    void load();
    // Session replacement, expiry, and unmount invalidate pending results.
    return () => { requestSequence.current += 1; };
  }, [load, clearPositions]);

  return { positions, loading, error, lastUpdated, reload: load, cached: readCachedPositions() };
}

export default usePositions;
