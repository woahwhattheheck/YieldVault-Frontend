import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
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
  const [positionsKey, setPositionsKey] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const queryKey = positionQueryKey({
    actor: address,
    network,
  });

  // Track the generation of the in-flight request so a late response is dropped.
  const inFlightGen = useRef(0);
  const pendingAutoReload = useRef(false);

  // A callback belongs to one committed visit to this scope. Comparing only
  // queryKey would revive an old callback after an A-to-B-to-A transition.
  const lifecycle = useMemo(() => ({}), [isConnected, address, queryKey]);
  const activeLifecycle = useRef(null);
  useLayoutEffect(() => {
    activeLifecycle.current = lifecycle;
    return () => {
      activeLifecycle.current = null;
      inFlightGen.current = -1;
      pendingAutoReload.current = false;
    };
  }, [lifecycle]);

  const invalidate = useCallback(() => {
    positionCache.invalidate(queryKey);
  }, [queryKey]);

  const load = useCallback(async (share = false) => {
    // Retired callers must not allocate a generation or consume the current
    // scope's scheduled refresh, including after this consumer unmounts.
    if (activeLifecycle.current !== lifecycle) return;

    // A caller explicitly reloading right after invalidation supersedes the
    // scheduled automatic refresh, so one mutation causes one request.
    pendingAutoReload.current = false;
    if (!isConnected || !address) {
      setPositions([]);
      setPositionsKey(null);
      setLastUpdated(null);
      return;
    }

    const { generation, promise } = positionCache.beginSharedFetch(
      queryKey,
      vaultService.getPositions,
      { force: !share },
    );
    inFlightGen.current = generation;
    setLoading(true);
    setError(null);

    try {
      const data = await promise;
      // Drop obsolete responses — a newer fetch or invalidation won the race.
      if (activeLifecycle.current !== lifecycle || inFlightGen.current !== generation) {
        return;
      }
      const accepted = positionCache.setIfCurrent(queryKey, data, generation);
      if (!accepted) {
        return;
      }
      setPositions(data);
      setPositionsKey(queryKey);
      setLastUpdated(new Date());
    } catch (err) {
      // Another mounted consumer may have refreshed this shared query even
      // when this hook's own request generation has not changed.
      if (
        activeLifecycle.current !== lifecycle ||
        inFlightGen.current !== generation ||
        positionCache.get(queryKey)?.generation !== generation
      ) {
        return;
      }
      setError(err.message || 'Failed to load positions');
    } finally {
      if (activeLifecycle.current === lifecycle && inFlightGen.current === generation) {
        setLoading(false);
      }
    }
  }, [isConnected, address, queryKey, lifecycle]);

  // Public reload always supersedes a pending read; events cannot enable sharing.
  const reload = useCallback(() => load(false), [load]);

  // Identity / network change: invalidate prior scope and reload.
  useEffect(() => {
    // Cancel any in-flight request tied to the previous key.
    inFlightGen.current = -1;
    setPositions([]);
    setPositionsKey(null);
    setLastUpdated(null);
    if (!isConnected || !address) {
      setLoading(false);
      return undefined;
    }
    positionCache.invalidateScope({ actor: address, network });
    load(true);
    return () => {
      inFlightGen.current = -1;
    };
  }, [isConnected, address, network, load]);

  // A form invalidates the shared list key after a confirmed mutation.
  // Every mounted consumer then refreshes, rather than waiting for navigation.
  useEffect(() => {
    if (!isConnected || !address) return undefined;
    return positionCache.subscribe(queryKey, (event) => {
      // Passive subscription cleanup follows layout lifecycle retirement.
      if (activeLifecycle.current !== lifecycle) return;
      if (event.type === 'invalidated') {
        inFlightGen.current = -1;
        setPositions([]);
        setPositionsKey(null);
        setLastUpdated(null);
        pendingAutoReload.current = true;
        queueMicrotask(() => {
          if (pendingAutoReload.current) void load(true);
        });
      } else if (event.type === 'data') {
        setPositions(event.data);
        setPositionsKey(queryKey);
        setLastUpdated(new Date());
        setError(null);
        setLoading(false);
      }
    });
  }, [isConnected, address, queryKey, load, lifecycle]);

  return {
    positions: positionsKey === queryKey ? positions : [],
    loading,
    error,
    lastUpdated,
    queryKey,
    reload,
    invalidate,
  };
}

export default usePositions;
