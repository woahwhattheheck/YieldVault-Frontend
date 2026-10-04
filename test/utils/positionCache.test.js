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

  it('clear rejects outstanding writes without repopulating or notifying', () => {
    const key = positionQueryKey({ actor: 'A', network: 'testnet' });
    const events = [];
    const unsubscribe = cache.subscribe(key, (event) => events.push(event));
    const retired = cache.beginFetch(key);

    cache.clear();

    expect(cache.setIfCurrent(key, [{ id: 'retired' }], retired)).toBe(false);
    expect(cache.size).toBe(0);
    expect(cache.get(key)).toBeUndefined();
    expect(events).toEqual([]);
    unsubscribe();
  });

  it('clear never reuses a token that can overwrite a fresh response', () => {
    const key = positionQueryKey({ actor: 'A', network: 'testnet' });
    const retired = cache.beginFetch(key);
    cache.clear();
    const fresh = cache.beginFetch(key);
    expect(fresh).toBeGreaterThan(retired);
    expect(cache.setIfCurrent(key, [{ id: 'fresh' }], fresh)).toBe(true);

    expect(cache.setIfCurrent(key, [{ id: 'retired' }], retired)).toBe(false);
    expect(cache.get(key).data).toEqual([{ id: 'fresh' }]);
  });

});
