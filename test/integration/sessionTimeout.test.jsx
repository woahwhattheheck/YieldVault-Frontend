import React from 'react';
import { act, render, renderHook, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider, useAppContext } from '../../src/context/AppContext.jsx';
import { usePositions } from '../../src/hooks/usePositions.js';
import DepositForm from '../../src/components/DepositForm';
import SessionExpiredBanner from '../../src/components/SessionExpiredBanner';
import {
  SESSION_STORAGE_KEY,
  POSITIONS_CACHE_KEY,
  BALANCES_CACHE_KEY,
  DEPOSIT_DRAFT_KEY,
  createSession,
  writeSession,
  cachePositions,
  cacheBalances,
  writeSafeDraft,
  readSafeDraft,
  canSubmitVaultMutation,
} from '../../src/utils/sessionAuth.js';

vi.mock('../../src/services/wallet.js', () => ({
  connect: vi.fn(async () => ({ address: 'GTESTADDRESS' })),
  disconnect: vi.fn(async () => undefined),
  getBalances: vi.fn(async () => ({ USDC: 250 })),
  getNetwork: vi.fn(async () => 'testnet'),
  signAndSubmit: vi.fn(async (summary) => ({ hash: 'mock-hash', summary })),
}));

vi.mock('../../src/services/vault.js', () => ({
  deposit: vi.fn(async () => ({ shares: 10, vaultId: 'v1' })),
  withdraw: vi.fn(async () => ({ shares: 5, vaultId: 'v1' })),
  getPositions: vi.fn(async () => [{ vaultId: 'v1', value: 100 }]),
}));

import * as walletService from '../../src/services/wallet.js';
import * as vaultService from '../../src/services/vault.js';

const vault = { id: 'v1', asset: 'USDC', totalAssets: 1000, totalShares: 1000 };

function wrapper({ children }) {
  return <AppProvider>{children}</AppProvider>;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function useSessionPositions() {
  return { context: useAppContext(), positions: usePositions() };
}

describe('session timeout integration', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    vi.mocked(vaultService.getPositions)
      .mockReset()
      .mockResolvedValue([{ vaultId: 'v1', value: 100 }]);
    vi.useRealTimers();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each(['logout', 'expiry', 'another tab logout'])(
    'does not restore positions when a read finishes after %s',
    async (reason) => {
      const pending = deferred();
      vi.mocked(vaultService.getPositions).mockReturnValueOnce(pending.promise);
      writeSafeDraft(DEPOSIT_DRAFT_KEY, '42');
      const { result } = renderHook(useSessionPositions, { wrapper });
      await act(async () => { await result.current.context.connect(); });
      expect(vaultService.getPositions).toHaveBeenCalledTimes(1);

      await act(async () => {
        if (reason === 'logout') await result.current.context.disconnect();
        else if (reason === 'expiry') await result.current.context.expireSession();
        else window.dispatchEvent(new StorageEvent('storage', {
          key: SESSION_STORAGE_KEY,
          newValue: null,
        }));
      });
      await act(async () => { pending.resolve([{ vaultId: 'v1', value: 999 }]); });

      expect(result.current.positions.positions).toEqual([]);
      expect(result.current.positions.cached).toBeNull();
      expect(sessionStorage.getItem(POSITIONS_CACHE_KEY)).toBeNull();
      expect(result.current.positions.loading).toBe(false);
      expect(result.current.positions.lastUpdated).toBeNull();
      expect(readSafeDraft(DEPOSIT_DRAFT_KEY)).toBe('42');
    },
  );

  it.each(['GTESTADDRESS', 'GOTHERADDRESS'])(
    'keeps the new authenticated positions when the previous read finishes (%s)',
    async (address) => {
      const pending = deferred();
      const currentPositions = [{ vaultId: 'v2', value: 25 }];
      vi.mocked(vaultService.getPositions)
        .mockReturnValueOnce(pending.promise)
        .mockResolvedValueOnce(currentPositions);
      const { result } = renderHook(useSessionPositions, { wrapper });
      await act(async () => { await result.current.context.connect(); });
      expect(vaultService.getPositions).toHaveBeenCalledTimes(1);

      vi.mocked(walletService.connect).mockResolvedValueOnce({ address });
      await act(async () => { await result.current.context.reauthenticate(); });
      await act(async () => { pending.resolve([{ vaultId: 'old', value: 999 }]); });

      expect(vaultService.getPositions).toHaveBeenCalledTimes(2);
      expect(result.current.positions.positions).toEqual(currentPositions);
      expect(JSON.parse(sessionStorage.getItem(POSITIONS_CACHE_KEY))).toEqual(currentPositions);
      expect(result.current.positions.error).toBeNull();
      expect(result.current.positions.loading).toBe(false);
    },
  );

  it('discards a superseded read failure without clearing the successful reload', async () => {
    const pending = deferred();
    const currentPositions = [{ vaultId: 'v2', value: 25 }];
    vi.mocked(vaultService.getPositions)
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(currentPositions);
    const { result } = renderHook(useSessionPositions, { wrapper });
    await act(async () => { await result.current.context.connect(); });
    await act(async () => { await result.current.positions.reload(); });
    await act(async () => { pending.reject(new Error('Old request failed')); });

    expect(result.current.positions.positions).toEqual(currentPositions);
    expect(result.current.positions.error).toBeNull();
    expect(JSON.parse(sessionStorage.getItem(POSITIONS_CACHE_KEY))).toEqual(currentPositions);
    expect(result.current.positions.loading).toBe(false);
  });

  it('does not cache a positions response after the protected screen unmounts', async () => {
    const pending = deferred();
    vi.mocked(vaultService.getPositions).mockReturnValueOnce(pending.promise);
    const { result, unmount } = renderHook(useSessionPositions, { wrapper });
    await act(async () => { await result.current.context.connect(); });
    expect(vaultService.getPositions).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => { pending.resolve([{ vaultId: 'v1', value: 999 }]); });

    expect(sessionStorage.getItem(POSITIONS_CACHE_KEY)).toBeNull();
  });

  it('rechecks wall-clock expiry before accepting an in-flight positions response', async () => {
    const pending = deferred();
    vi.mocked(vaultService.getPositions).mockReturnValueOnce(pending.promise);
    const { result } = renderHook(useSessionPositions, { wrapper });
    await act(async () => { await result.current.context.connect(); });
    expect(vaultService.getPositions).toHaveBeenCalledTimes(1);

    // Simulate a resumed tab before its delayed expiry timer has run.
    vi.spyOn(Date, 'now').mockReturnValue(result.current.context.session.expiresAt);
    await act(async () => { pending.resolve([{ vaultId: 'v1', value: 999 }]); });

    expect(result.current.positions.positions).toEqual([]);
    expect(sessionStorage.getItem(POSITIONS_CACHE_KEY)).toBeNull();
    expect(result.current.context.sessionExpired).toBe(true);
    expect(result.current.positions.loading).toBe(false);
  });

  it('connect mints a session that authorizes vault mutations', async () => {
    const { result } = renderHook(() => useAppContext(), { wrapper });
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.isConnected).toBe(true);
    expect(result.current.mutationsAllowed).toBe(true);
    expect(result.current.session?.address).toBe('GTESTADDRESS');
    expect(canSubmitVaultMutation(result.current.session)).toBe(true);
    expect(JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)).address).toBe('GTESTADDRESS');
  });

  it('logout clears sensitive cached data and preserves safe drafts', async () => {
    writeSafeDraft(DEPOSIT_DRAFT_KEY, '42');
    const { result } = renderHook(() => useAppContext(), { wrapper });
    await act(async () => {
      await result.current.connect();
    });
    cachePositions([{ vaultId: 'v1', value: 9 }]);
    cacheBalances({ USDC: 1 });

    await act(async () => {
      await result.current.disconnect();
    });

    expect(result.current.address).toBeNull();
    expect(result.current.balances).toEqual({});
    expect(result.current.session).toBeNull();
    expect(result.current.sessionExpired).toBe(true);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(POSITIONS_CACHE_KEY)).toBeNull();
    expect(sessionStorage.getItem(BALANCES_CACHE_KEY)).toBeNull();
    expect(readSafeDraft(DEPOSIT_DRAFT_KEY)).toBe('42');
    expect(walletService.disconnect).toHaveBeenCalled();
  });

  it('expiry clears protected state and blocks further mutations', async () => {
    const { result } = renderHook(() => useAppContext(), { wrapper });

    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.mutationsAllowed).toBe(true);

    await act(async () => {
      await result.current.expireSession({ reason: 'expiry' });
    });

    expect(result.current.sessionExpired).toBe(true);
    expect(result.current.isConnected).toBe(false);
    expect(result.current.mutationsAllowed).toBe(false);
    expect(result.current.balances).toEqual({});
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('DepositForm refuses submit after expiry and never signs', async () => {
    function Harness() {
      const ctx = useAppContext();
      React.useEffect(() => {
        void ctx.connect();
      }, []);
      return (
        <>
          <SessionExpiredBanner />
          <DepositForm vault={vault} />
          <button type="button" onClick={() => void ctx.expireSession({ reason: 'expiry' })}>
            Force expire
          </button>
        </>
      );
    }

    render(
      <AppProvider>
        <Harness />
      </AppProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Deposit' })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Force expire' }));

    await waitFor(() => {
      expect(screen.getByTestId('session-expired-banner')).toBeInTheDocument();
    });

    const submit = screen.getByRole('button', { name: /Session expired/i });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(vaultService.deposit).not.toHaveBeenCalled();
    expect(walletService.signAndSubmit).not.toHaveBeenCalled();
    // Safe draft preserved
    expect(readSafeDraft(DEPOSIT_DRAFT_KEY)).toBe('10');
  });

  it('mutation-race: concurrent expiry blocks signAndSubmit', async () => {
    let releaseDeposit;
    const depositGate = new Promise((resolve) => {
      releaseDeposit = resolve;
    });
    vi.mocked(vaultService.deposit).mockImplementationOnce(async () => {
      await depositGate;
      return { shares: 10, vaultId: 'v1' };
    });

    let expireFn;
    function Harness() {
      const ctx = useAppContext();
      expireFn = () => ctx.expireSession({ reason: 'expiry' });
      React.useEffect(() => {
        void ctx.connect();
      }, []);
      return <DepositForm vault={vault} />;
    }

    render(
      <AppProvider>
        <Harness />
      </AppProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Deposit' })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '10' } });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Deposit' })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Deposit' }));

    await waitFor(() => {
      expect(vaultService.deposit).toHaveBeenCalled();
    });

    await act(async () => {
      await expireFn();
    });
    releaseDeposit();

    await waitFor(() => {
      expect(screen.getByTestId('deposit-message')).toHaveTextContent(/Session expired/i);
    });
    expect(walletService.signAndSubmit).not.toHaveBeenCalled();
  });

  it('multi-tab logout clears local protected state consistently', async () => {
    const { result } = renderHook(() => useAppContext(), { wrapper });
    await act(async () => {
      await result.current.connect();
    });
    cachePositions([{ vaultId: 'v1', value: 7 }]);

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: SESSION_STORAGE_KEY,
          newValue: null,
          oldValue: JSON.stringify(createSession('GTESTADDRESS', Date.now(), 60_000)),
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.sessionExpired).toBe(true);
    });
    expect(result.current.address).toBeNull();
    expect(result.current.balances).toEqual({});
    expect(sessionStorage.getItem(POSITIONS_CACHE_KEY)).toBeNull();
  });

  it('re-authenticate restores a valid authenticated state without loops', async () => {
    const { result } = renderHook(() => useAppContext(), { wrapper });
    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      await result.current.expireSession({ reason: 'expiry' });
    });
    expect(result.current.sessionExpired).toBe(true);

    await act(async () => {
      await result.current.reauthenticate();
    });

    expect(result.current.sessionExpired).toBe(false);
    expect(result.current.isConnected).toBe(true);
    expect(result.current.mutationsAllowed).toBe(true);
    expect(result.current.address).toBe('GTESTADDRESS');
    // Single reconnect — not an auth loop of repeated connect/disconnect.
    expect(walletService.connect).toHaveBeenCalledTimes(2);
  });

  it('boot with an already-expired persisted session surfaces re-auth and clears caches', async () => {
    const expired = createSession('GOLD', Date.now() - 10_000, 1_000);
    writeSession(expired);
    cachePositions([{ vaultId: 'v1', value: 1 }]);
    cacheBalances({ USDC: 5 });

    const { result } = renderHook(() => useAppContext(), { wrapper });

    await waitFor(() => {
      expect(result.current.sessionExpired).toBe(true);
    });
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(POSITIONS_CACHE_KEY)).toBeNull();
    expect(sessionStorage.getItem(BALANCES_CACHE_KEY)).toBeNull();
  });
  it('BroadcastChannel multi-tab expiry clears protected state consistently', async () => {
    const { result } = renderHook(() => useAppContext(), { wrapper });
    await act(async () => {
      await result.current.connect();
    });

    await act(async () => {
      const channel = new BroadcastChannel('yieldvault:session');
      channel.postMessage({ type: 'expired', session: null, at: Date.now() });
      channel.close();
    });

    await waitFor(() => {
      expect(result.current.sessionExpired).toBe(true);
    });
    expect(result.current.address).toBeNull();
    expect(result.current.balances).toEqual({});
    expect(result.current.mutationsAllowed).toBe(false);
  });

});
