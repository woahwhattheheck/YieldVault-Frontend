import { useState, useEffect, useCallback, useRef } from 'react';
import * as vaultService from '../services/vault.js';
import { useWallet } from './useWallet.js';
import { useNetwork } from './useNetwork.js';
import { positionCache, positionQueryKey } from '../utils/positionCache.js';

/**
 * Load the connected user's vault positions for the active network.
 * Cache keys include actor + network so a late response from a previous
 * identity cannot overwrite the current view. Confirmed mutations should
 * call `invalidate` / `reload`.
 *
 * @returns {{
 *   positions: Array,
 *   loading: boolean,
 *   error: string|null,
 *   lastUpdated: Date|null,
 *   queryKey: string,
 *   reload: () => Promise<void>,
 *   invalidate: () => void,
 * }}
 */
export function usePositions() {
  const { isConnected, address } = useWallet();
  const { network } = useNetwork();
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const queryKey = positionQueryKey({
    actor: address,
    network,
  });

  // Track the generation of the in-flight request so a late response is dropped.
  const inFlightGen = useRef(0);

  const invalidate = useCallback(() => {
    positionCache.invalidate(queryKey);
  }, [queryKey]);

  const load = useCallback(async () => {
    if (!isConnected || !address) {
      setPositions([]);
      setLastUpdated(null);
      return;
    }

    const generation = positionCache.beginFetch(queryKey);
    inFlightGen.current = generation;
    setLoading(true);
    setError(null);

    try {
      const data = await vaultService.getPositions();
      // Drop obsolete responses — a newer fetch or invalidation won the race.
      if (inFlightGen.current !== generation) {
        return;
      }
      const accepted = positionCache.setIfCurrent(queryKey, data, generation);
      if (!accepted) {
        return;
      }
      setPositions(data);
      setLastUpdated(new Date());
    } catch (err) {
      if (inFlightGen.current !== generation) {
        return;
      }
      setError(err.message || 'Failed to load positions');
    } finally {
      if (inFlightGen.current === generation) {
        setLoading(false);
      }
    }
  }, [isConnected, address, queryKey]);

  // Identity / network change: invalidate prior scope and reload.
  useEffect(() => {
    // Cancel any in-flight request tied to the previous key.
    inFlightGen.current = -1;
    if (!isConnected || !address) {
      setPositions([]);
      setLastUpdated(null);
      setLoading(false);
      return undefined;
    }
    positionCache.invalidateScope({ actor: address, network });
    load();
    return () => {
      inFlightGen.current = -1;
    };
  }, [isConnected, address, network, load]);

  return {
    positions,
    loading,
    error,
    lastUpdated,
    queryKey,
    reload: load,
    invalidate,
  };
}

export default usePositions;
