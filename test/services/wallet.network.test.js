import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  signAndSubmit,
  switchNetwork,
  disconnect,
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

  describe('network changes while a submission is pending', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      __setWalletNetworkForTests('testnet');
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const submit = () => signAndSubmit('Deposit 1', { expectedNetwork: 'testnet' })
      .then((value) => ({ value }), (error) => ({ error }));

    it('rejects a network switch before the network read resolves', async () => {
      const result = submit();
      const switched = switchNetwork('mainnet');
      await vi.runAllTimersAsync();
      await switched;
      expect((await result).error).toMatchObject({ code: 'NETWORK_CHANGED' });
    });

    it('rejects a network switch after the read but before submission completes', async () => {
      const result = submit();
      await vi.advanceTimersByTimeAsync(CONFIG.mockLatency);
      const switched = switchNetwork('mainnet');
      await vi.runAllTimersAsync();
      await switched;
      expect((await result).error).toMatchObject({ code: 'NETWORK_CHANGED' });
    });

    it('invalidates the old request even if the wallet switches back', async () => {
      const result = submit();
      const away = switchNetwork('mainnet');
      const back = switchNetwork('testnet');
      await vi.runAllTimersAsync();
      await Promise.all([away, back]);
      expect((await result).error).toMatchObject({ code: 'NETWORK_CHANGED' });
    });

    it('rejects a disconnect even when the default network still matches', async () => {
      const result = submit();
      const disconnected = disconnect();
      await vi.runAllTimersAsync();
      await disconnected;
      expect((await result).error).toMatchObject({ code: 'NETWORK_CHANGED' });
    });

    it('keeps an unchanged supported network usable', async () => {
      const result = submit();
      const switched = switchNetwork('testnet');
      await vi.runAllTimersAsync();
      await switched;
      expect((await result).value).toMatchObject({ hash: expect.stringMatching(/^mock-/) });
    });

    it.each(['devnet', 'constructor', 'toString', '__proto__'])(
      'rejects matching but unsupported network %s', async (network) => {
        __setWalletNetworkForTests(network);
        const result = signAndSubmit('Deposit 1', { expectedNetwork: network })
          .then((value) => ({ value }), (error) => ({ error }));
        await vi.runAllTimersAsync();
        expect((await result).error).toMatchObject({ code: 'WRONG_NETWORK' });
      },
    );

    it.each(['constructor', 'toString', '__proto__'])(
      'rejects switching to inherited network name %s without changing the wallet', async (network) => {
        const switched = switchNetwork(network)
          .then((value) => ({ value }), (error) => ({ error }));
        await vi.runAllTimersAsync();
        expect((await switched).error).toMatchObject({ message: `Unsupported network: ${network}` });
        const result = submit();
        await vi.runAllTimersAsync();
        expect((await result).value).toMatchObject({ hash: expect.stringMatching(/^mock-/) });
      },
    );
  });
});
