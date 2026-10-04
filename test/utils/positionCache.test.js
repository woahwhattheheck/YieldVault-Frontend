import { describe, it, expect, beforeEach } from 'vitest';
import { createPositionCache, positionQueryKey } from '../../src/utils/positionCache.js';

describe('positionQueryKey', () => {
  it('encodes actor, network, vault, and asset', () => {
    expect(
      positionQueryKey({
        actor: 'GABC',
        network: 'testnet',
        vaultId: 'vault-1',
        asset: 'USDC',
      }),
    ).toBe('positions:GABC:testnet:vault-1:USDC');
  });

  it('uses stable placeholders for missing parts', () => {
    expect(positionQueryKey({})).toBe('positions:anon:unknown:*:*');
  });
});

describe('positionCache races', () => {
  /** @type {ReturnType<typeof createPositionCache>} */
  let cache;

  beforeEach(() => {
    cache = createPositionCache();
  });

  it('rejects stale writes after a newer generation', () => {
    const key = positionQueryKey({ actor: 'A', network: 'testnet' });
    const gen1 = cache.beginFetch(key);
    const gen2 = cache.beginFetch(key);
    expect(gen2).toBeGreaterThan(gen1);

    expect(cache.setIfCurrent(key, [{ id: 'stale' }], gen1)).toBe(false);
    expect(cache.setIfCurrent(key, [{ id: 'fresh' }], gen2)).toBe(true);
    expect(cache.get(key).data).toEqual([{ id: 'fresh' }]);
  });

  it('invalidate bumps generation so late responses cannot land', () => {
    const key = positionQueryKey({ actor: 'A', network: 'mainnet' });
    const gen = cache.beginFetch(key);
    cache.invalidate(key);
    expect(cache.setIfCurrent(key, [{ id: 'late' }], gen)).toBe(false);
  });

  it('invalidateScope clears actor/network positions', () => {
    const keyA = positionQueryKey({ actor: 'A', network: 'testnet' });
    const keyB = positionQueryKey({ actor: 'B', network: 'testnet' });
    cache.setIfCurrent(keyA, [1], cache.beginFetch(keyA));
    cache.setIfCurrent(keyB, [2], cache.beginFetch(keyB));
    cache.invalidateScope({ actor: 'A', network: 'testnet' });
    expect(cache.get(keyA).data).toBeUndefined();
  });

  it('shares only in-flight reads and publishes one data event for all consumers', async () => {
    const key = positionQueryKey({ actor: 'A', network: 'testnet' });
    let resolve;
    let calls = 0;
    let publications = 0;
    cache.subscribe(key, (event) => { if (event.type === 'data') publications += 1; });
    const loader = () => { calls += 1; return new Promise((done) => { resolve = done; }); };
    const requests = Array.from({ length: 32 }, () => cache.startFetch(key, loader));
    expect(calls).toBe(1);
    expect(requests.every((request) => request === requests[0])).toBe(true);
    const data = [{ id: 'fresh' }];
    resolve(data);
    for (const request of requests) {
      expect(request.commit(await request.promise)).toBe(true);
    }
    expect(publications).toBe(1);
    expect(cache.hasInFlight(key)).toBe(false);
    const next = cache.startFetch(key, loader);
    expect(calls).toBe(2);
    resolve(data);
    await next.promise;
  });

  it('separates scopes and fences invalidated, superseded and cleared requests', async () => {
    const key = positionQueryKey({ actor: 'A', network: 'testnet' });
    const otherKey = positionQueryKey({ actor: 'B', network: 'testnet' });
    const releases = [];
    const loader = () => new Promise((resolve) => { releases.push(resolve); });
    const old = cache.startFetch(key, loader);
    const other = cache.startFetch(otherKey, loader);
    expect(other).not.toBe(old);
    cache.invalidate(key);
    const fresh = cache.startFetch(key, loader);
    const explicit = cache.startFetch(key, loader, { share: false });
    expect(cache.startFetch(key, loader)).toBe(explicit);
    expect(releases).toHaveLength(4);
    releases[0](['old']);
    releases[1](['other']);
    releases[2](['superseded']);
    expect(old.commit(await old.promise)).toBe(false);
    expect(other.commit(await other.promise)).toBe(true);
    expect(fresh.commit(await fresh.promise)).toBe(false);
    expect(cache.hasInFlight(key)).toBe(true);
    cache.clear();
    const afterClear = cache.startFetch(key, () => Promise.resolve(['current']));
    expect(afterClear.generation).toBeGreaterThan(explicit.generation);
    expect(afterClear.commit(await afterClear.promise)).toBe(true);
    releases[3](['cleared']);
    expect(explicit.commit(await explicit.promise)).toBe(false);
    expect(cache.get(key).data).toEqual(['current']);
  });

  it('releases rejected reads, including synchronous failures, for an explicit retry', async () => {
    const key = positionQueryKey({ actor: 'A', network: 'testnet' });
    const failure = new Error('unavailable');
    const first = cache.startFetch(key, () => { throw failure; });
    const joined = cache.startFetch(key, () => Promise.resolve('must not run'));
    expect(joined).toBe(first);
    await expect(first.promise).rejects.toBe(failure);
    expect(cache.hasInFlight(key)).toBe(false);
    const retry = cache.startFetch(key, () => Promise.resolve(['recovered']));
    expect(retry.commit(await retry.promise)).toBe(true);
    expect(cache.get(key).data).toEqual(['recovered']);
  });
});
