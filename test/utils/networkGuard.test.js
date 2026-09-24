import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/constants/config.js', () => ({
  CONFIG: { network: 'testnet' },
}));

import { getNetworkGuardState, shouldBlockMutations } from '../../src/utils/networkGuard.js';

describe('networkGuard', () => {
  it('matches when wallet is on the configured network', () => {
    const state = getNetworkGuardState('testnet', 'testnet');
    expect(state.ready).toBe(true);
    expect(state.matched).toBe(true);
    expect(state.unsupported).toBe(false);
    expect(state.expectedLabel).toBe('Testnet');
  });

  it('blocks when wallet is on a different supported network', () => {
    const state = getNetworkGuardState('mainnet', 'testnet');
    expect(state.ready).toBe(false);
    expect(state.matched).toBe(false);
    expect(state.connectedLabel).toBe('Mainnet');
    expect(shouldBlockMutations(true, 'mainnet', 'testnet')).toBe(true);
  });

  it('marks unknown networks as unsupported', () => {
    const state = getNetworkGuardState('devnet', 'testnet');
    expect(state.unsupported).toBe(true);
    expect(state.ready).toBe(false);
  });

  it('blocks mutations when disconnected even if networks would match', () => {
    expect(shouldBlockMutations(false, 'testnet', 'testnet')).toBe(true);
  });

  it('allows mutations only when connected and matched', () => {
    expect(shouldBlockMutations(true, 'testnet', 'testnet')).toBe(false);
  });
});
