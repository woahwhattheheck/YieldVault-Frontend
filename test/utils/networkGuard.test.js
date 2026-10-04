import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/constants/config.js', () => ({
  CONFIG: { network: 'testnet' },
}));

import { NETWORKS } from '../../src/lib/networks.js';
import { getNetworkGuardState, shouldBlockMutations } from '../../src/utils/networkGuard.js';

describe('networkGuard', () => {
  it.each([
    ['testnet', 'Testnet'],
    ['mainnet', 'Mainnet'],
  ])('matches when wallet and deployment use %s', (network, label) => {
    const state = getNetworkGuardState(network, network);
    expect(state.ready).toBe(true);
    expect(state.matched).toBe(true);
    expect(state.unsupported).toBe(false);
    expect(state.expectedLabel).toBe(label);
    expect(state.connectedLabel).toBe(label);
    expect(shouldBlockMutations(true, network, network)).toBe(false);
  });

  it('blocks when wallet is on a different supported network', () => {
    const state = getNetworkGuardState('mainnet', 'testnet');
    expect(state.ready).toBe(false);
    expect(state.matched).toBe(false);
    expect(state.connectedLabel).toBe('Mainnet');
    expect(shouldBlockMutations(true, 'mainnet', 'testnet')).toBe(true);
  });

  it.each(['devnet', 'constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'marks %s as unsupported even when the configured network matches',
    (network) => {
      const state = getNetworkGuardState(network, 'testnet');
      expect(state.unsupported).toBe(true);
      expect(state.ready).toBe(false);
      expect(state.connectedLabel).toBe(network);

      const matchedName = getNetworkGuardState(network, network);
      expect(matchedName.unsupported).toBe(true);
      expect(matchedName.ready).toBe(false);
      expect(matchedName.matched).toBe(false);
      expect(matchedName.expectedLabel).toBe(network);
      expect(matchedName.connectedLabel).toBe(network);
      expect(shouldBlockMutations(true, network, network)).toBe(true);
    },
  );

  it('ignores inherited network definitions and their labels', () => {
    const originalPrototype = Object.getPrototypeOf(NETWORKS);
    const prototype = Object.create(originalPrototype);
    prototype.inheritedNetwork = { label: 'Inherited label' };
    Object.setPrototypeOf(NETWORKS, prototype);
    try {
      expect(getNetworkGuardState('inheritedNetwork', 'inheritedNetwork')).toEqual({
        ready: false,
        matched: false,
        unsupported: true,
        expected: 'inheritedNetwork',
        connected: 'inheritedNetwork',
        expectedLabel: 'inheritedNetwork',
        connectedLabel: 'inheritedNetwork',
      });
    } finally {
      Object.setPrototypeOf(NETWORKS, originalPrototype);
    }
  });

  it.each([null, undefined, ''])('preserves the disconnected state for %s', (network) => {
    expect(getNetworkGuardState(network, 'testnet')).toEqual({
      ready: false,
      matched: false,
      unsupported: false,
      expected: 'testnet',
      connected: network ?? null,
      expectedLabel: 'Testnet',
      connectedLabel: null,
    });
  });

  it('blocks mutations when disconnected even if networks would match', () => {
    expect(shouldBlockMutations(false, 'testnet', 'testnet')).toBe(true);
  });

  it('allows mutations only when connected and matched', () => {
    expect(shouldBlockMutations(true, 'testnet', 'testnet')).toBe(false);
  });
});
