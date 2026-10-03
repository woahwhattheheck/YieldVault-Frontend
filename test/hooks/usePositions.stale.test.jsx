import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePositions } from '../../src/hooks/usePositions.js';
import { positionCache } from '../../src/utils/positionCache.js';

vi.mock('../../src/hooks/useWallet.js', () => ({
  useWallet: vi.fn(),
}));

vi.mock('../../src/hooks/useNetwork.js', () => ({
  useNetwork: vi.fn(),
}));

vi.mock('../../src/services/vault.js', () => ({
  getPositions: vi.fn(),
}));

import { useWallet } from '../../src/hooks/useWallet.js';
import { useNetwork } from '../../src/hooks/useNetwork.js';
import * as vaultService from '../../src/services/vault.js';

describe('usePositions stale-response guard', () => {
  beforeEach(() => {
    positionCache.clear();
    vi.mocked(vaultService.getPositions).mockReset();
  });

  it('drops a late response after the actor/network changes', async () => {
    let resolveFirst;
    const first = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    vi.mocked(useWallet).mockReturnValue({
      isConnected: true,
      address: 'GACTOR1',
    });
    vi.mocked(useNetwork).mockReturnValue({ network: 'testnet' });
    vi.mocked(vaultService.getPositions).mockImplementationOnce(() => first);

    const { result, rerender } = renderHook(() => usePositions());

    // Switch identity before the first request resolves.
    vi.mocked(useWallet).mockReturnValue({
      isConnected: true,
      address: 'GACTOR2',
    });
    vi.mocked(vaultService.getPositions).mockResolvedValueOnce([
      { vaultId: 'v2', value: 20 },
    ]);
    rerender();

    await waitFor(() => {
      expect(result.current.positions).toEqual([{ vaultId: 'v2', value: 20 }]);
    });

    // Late response for actor1 must not overwrite actor2.
    await act(async () => {
      resolveFirst([{ vaultId: 'v1', value: 999 }]);
    });

    await waitFor(() => {
      expect(result.current.positions).toEqual([{ vaultId: 'v2', value: 20 }]);
    });
  });

  it('reloads mounted consumers when a form invalidates the shared key', async () => {
    vi.mocked(useWallet).mockReturnValue({
      isConnected: true,
      address: 'GACTOR1',
    });
    vi.mocked(useNetwork).mockReturnValue({ network: 'testnet' });
    vi.mocked(vaultService.getPositions)
      .mockResolvedValueOnce([{ vaultId: 'v1', value: 10 }])
      .mockResolvedValueOnce([{ vaultId: 'v1', value: 15 }]);

    const { result } = renderHook(() => usePositions());
    await waitFor(() => {
      expect(result.current.positions).toEqual([{ vaultId: 'v1', value: 10 }]);
    });

    await act(async () => {
      positionCache.invalidate(result.current.queryKey);
    });

    await waitFor(() => {
      expect(result.current.positions).toEqual([{ vaultId: 'v1', value: 15 }]);
    });
    expect(vaultService.getPositions).toHaveBeenCalledTimes(2);
  });

  it('invalidate + reload refreshes after a mutation', async () => {
    vi.mocked(useWallet).mockReturnValue({
      isConnected: true,
      address: 'GACTOR1',
    });
    vi.mocked(useNetwork).mockReturnValue({ network: 'testnet' });
    vi.mocked(vaultService.getPositions)
      .mockResolvedValueOnce([{ vaultId: 'v1', value: 10 }])
      .mockResolvedValueOnce([{ vaultId: 'v1', value: 15 }]);

    const { result } = renderHook(() => usePositions());

    await waitFor(() => {
      expect(result.current.positions).toEqual([{ vaultId: 'v1', value: 10 }]);
    });

    await act(async () => {
      result.current.invalidate();
      await result.current.reload();
    });

    await waitFor(() => {
      expect(result.current.positions).toEqual([{ vaultId: 'v1', value: 15 }]);
    });
  });

  it('ignores an older consumer failure after another consumer refreshes the shared query', async () => {
    vi.mocked(useWallet).mockReturnValue({
      isConnected: true,
      address: 'GACTOR1',
    });
    vi.mocked(useNetwork).mockReturnValue({ network: 'testnet' });
    vi.mocked(vaultService.getPositions).mockResolvedValue([
      { vaultId: 'v1', value: 10 },
    ]);

    const first = renderHook(() => usePositions());
    const second = renderHook(() => usePositions());
    await waitFor(() => {
      expect(first.result.current.loading).toBe(false);
      expect(second.result.current.positions).toEqual([{ vaultId: 'v1', value: 10 }]);
    });

    let rejectOlder;
    let resolveNewer;
    const older = new Promise((_, reject) => { rejectOlder = reject; });
    const newer = new Promise((resolve) => { resolveNewer = resolve; });
    vi.mocked(vaultService.getPositions)
      .mockImplementationOnce(() => older)
      .mockImplementationOnce(() => newer);

    let olderReload;
    let newerReload;
    act(() => {
      olderReload = first.result.current.reload();
      newerReload = second.result.current.reload();
    });

    await act(async () => {
      resolveNewer([{ vaultId: 'v1', value: 20 }]);
      await newerReload;
    });
    expect(first.result.current.positions).toEqual([{ vaultId: 'v1', value: 20 }]);
    expect(second.result.current.positions).toEqual([{ vaultId: 'v1', value: 20 }]);

    await act(async () => {
      rejectOlder(new Error('obsolete request failed'));
      await olderReload;
    });

    expect(first.result.current.error).toBeNull();
    expect(second.result.current.error).toBeNull();
    expect(first.result.current.positions).toEqual([{ vaultId: 'v1', value: 20 }]);
    expect(second.result.current.positions).toEqual([{ vaultId: 'v1', value: 20 }]);
  });

  it('still reports a failure from the current shared query request', async () => {
    vi.mocked(useWallet).mockReturnValue({
      isConnected: true,
      address: 'GACTOR1',
    });
    vi.mocked(useNetwork).mockReturnValue({ network: 'testnet' });
    vi.mocked(vaultService.getPositions).mockRejectedValue(new Error('current request failed'));

    const { result } = renderHook(() => usePositions());
    await waitFor(() => {
      expect(result.current.error).toBe('current request failed');
      expect(result.current.loading).toBe(false);
    });
  });
});
