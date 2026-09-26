import { describe, it, expect, beforeEach } from 'vitest';
import {
  signAndSubmit,
  switchNetwork,
  __setWalletNetworkForTests,
  __resetWalletNetworkForTests,
} from '../../src/services/wallet.js';
import { CONFIG } from '../../src/constants/config.js';

describe('wallet network guard', () => {
  beforeEach(() => {
    __resetWalletNetworkForTests();
  });

  it('rejects signAndSubmit on the wrong network', async () => {
    __setWalletNetworkForTests('mainnet');
    await expect(
      signAndSubmit('Deposit 1', { expectedNetwork: 'testnet' }),
    ).rejects.toMatchObject({ code: 'WRONG_NETWORK' });
  });

  it('rejects a stale matching network snapshot after the wallet switches', async () => {
    __setWalletNetworkForTests('mainnet');
    await expect(
      signAndSubmit('Deposit 1', { expectedNetwork: 'testnet', walletNetwork: 'testnet' }),
    ).rejects.toMatchObject({ code: 'WRONG_NETWORK' });
  });

  it('allows signAndSubmit when networks match', async () => {
    __setWalletNetworkForTests(CONFIG.network);
    const result = await signAndSubmit('Deposit 1', {
      expectedNetwork: CONFIG.network,
    });
    expect(result.hash).toMatch(/^mock-/);
  });

  it('switchNetwork updates the mock wallet network', async () => {
    const next = await switchNetwork('mainnet');
    expect(next).toBe('mainnet');
  });
});
