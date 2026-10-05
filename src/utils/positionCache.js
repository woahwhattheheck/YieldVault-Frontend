/**
 * Position query cache keys and invalidation helpers.
 *
 * Keys incorporate actor, network, vault, and asset so a late response from
 * a previous wallet/network cannot overwrite the visible position for the
 * current identity.
 */

/**
 * @param {{
 *   actor?: string|null,
 *   network?: string|null,
 *   vaultId?: string|null,
 *   asset?: string|null,
 * }} parts
 * @returns {string}
 */
export function positionQueryKey({ actor = null, network = null, vaultId = null, asset = null } = {}) {
  return ['positions', actor || 'anon', network || 'unknown', vaultId || '*', asset || '*'].join(':');
}

/**
 * In-memory position query cache with generation tokens so obsolete
 * responses cannot overwrite newer state.
 */
export function createPositionCache() {
  /** @type {Map<string, { generation: number, data: unknown }>} */
  const entries = new Map();
  const listeners = new Map();
  const inFlight = new Map();
  let globalGeneration = 0;

  function notify(key, event) {
    for (const listener of listeners.get(key) || []) {
      listener(event);
    }
  }

  return {
    /** Listen for invalidation or refreshed data for one query key. */
    subscribe(key, listener) {
      const current = listeners.get(key) || new Set();
      current.add(listener);
      listeners.set(key, current);
      return () => {
        current.delete(listener);
        if (current.size === 0) listeners.delete(key);
      };
    },
    /**
     * @param {string} key
     * @returns {{ generation: number, data: unknown }|undefined}
     */
    get(key) {
      return entries.get(key);
    },

    /**
     * @param {string} key
     * @param {unknown} data
     * @param {number} generation
     * @returns {boolean} true when the write was accepted
     */
    setIfCurrent(key, data, generation) {
      const current = entries.get(key);
      if (!current || current.generation !== generation) {
        return false;
      }
      entries.set(key, { generation, data });
      notify(key, { type: 'data', data });
      return true;
    },

    /**
     * Bump generation for a key (and optionally clear data) after a mutation
     * or identity change.
     * @param {string} key
     * @returns {number} new generation
     */
    invalidate(key) {
      inFlight.delete(key);
      globalGeneration += 1;
      const nextGen = globalGeneration;
      entries.set(key, { generation: nextGen, data: undefined });
      notify(key, { type: 'invalidated' });
      return nextGen;
    },

    /**
     * Invalidate every cache entry that belongs to the given actor/network
     * prefix (used on wallet disconnect or network switch).
     * @param {{ actor?: string|null, network?: string|null }} scope
     * @returns {number} number of keys invalidated
     */
    invalidateScope({ actor = null, network = null } = {}) {
      const listKey = positionQueryKey({ actor, network });
      // Match the complete actor/network prefix, not an actor in a vault/asset.
      const prefix = listKey.replace(/:\*:\*$/, ':');
      let count = 0;
      let invalidatedList = false;
      for (const key of [...entries.keys()]) {
        if (key.startsWith(prefix)) {
          this.invalidate(key);
          count += 1;
          if (key === listKey) invalidatedList = true;
        }
      }
      // Refresh the list even when absent, but never notify it twice.
      if (!invalidatedList) this.invalidate(listKey);
      return count;
    },

    /**
     * Allocate a generation token for an in-flight request.
     * @param {string} key
     * @returns {number}
     */
    beginFetch(key) {
      inFlight.delete(key);
      globalGeneration += 1;
      const generation = globalGeneration;
      const existing = entries.get(key);
      entries.set(key, {
        generation,
        data: existing?.data,
      });
      return generation;
    },

    /**
     * Join a pending read for this key's current generation, or start a new one.
     * Explicit reloads pass force; invalidation also retires the shared record.
     * Callers sharing a key must use compatible loader semantics.
     * @param {string} key
     * @param {() => unknown|Promise<unknown>} loader
     * @param {{ force?: boolean }} options
     * @returns {{ generation: number, promise: Promise<unknown> }}
     */
    beginSharedFetch(key, loader, { force = false } = {}) {
      const pending = inFlight.get(key);
      if (!force && pending && entries.get(key)?.generation === pending.generation) {
        return pending;
      }

      const generation = this.beginFetch(key);
      let invokeLoader;
      const promise = new Promise((resolve, reject) => {
        invokeLoader = () => {
          try {
            resolve(loader());
          } catch (error) {
            reject(error);
          }
        };
      });
      const request = { generation, promise };
      // Install a usable promise before the loader can synchronously re-enter.
      inFlight.set(key, request);
      const release = () => {
        if (inFlight.get(key) === request) inFlight.delete(key);
      };
      promise.then(release, release);
      invokeLoader();
      return request;
    },

    clear() {
      inFlight.clear();
      // Keep tokens monotonic so pre-clear responses cannot match later fetches.
      entries.clear();
    },

    get size() {
      return entries.size;
    },
  };
}

/** Shared app-level cache instance. */
export const positionCache = createPositionCache();

export default {
  positionQueryKey,
  createPositionCache,
  positionCache,
};
