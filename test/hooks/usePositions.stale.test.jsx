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

  it.each([
    { change: 'wallet', phase: 'loading' },
    { change: 'wallet', phase: 'settled' },
    { change: 'network', phase: 'loading' },
    { change: 'network', phase: 'settled' },
  ])('ignores a retired reload after a $change change while the current request is $phase', async ({ change, phase }) => {
    vi.mocked(useWallet).mockReturnValue({ isConnected: true, address: 'GACTOR1' });
    vi.mocked(useNetwork).mockReturnValue({ network: 'testnet' });
    vi.mocked(vaultService.getPositions).mockResolvedValueOnce([
      { vaultId: 'old-scope', value: 10 },
    ]);
    const { result, rerender } = renderHook(() => usePositions());
    await waitFor(() => {
      expect(result.current.positions).toEqual([{ vaultId: 'old-scope', value: 10 }]);
    });
    const retiredReload = result.current.reload;

    let resolveCurrent;
    const currentRequest = new Promise((resolve) => { resolveCurrent = resolve; });
    vi.mocked(vaultService.getPositions).mockImplementationOnce(() => currentRequest);
    if (change === 'wallet') {
      vi.mocked(useWallet).mockReturnValue({ isConnected: true, address: 'GACTOR2' });
    } else {
      vi.mocked(useNetwork).mockReturnValue({ network: 'mainnet' });
    }
    rerender();
    const currentData = [{ vaultId: 'current-scope', value: 20 }];
    if (phase === 'settled') {
      await act(async () => { resolveCurrent(currentData); });
      expect(result.current.positions).toEqual(currentData);
    } else {
      expect(result.current.loading).toBe(true);
    }

    // An async caller may retain the earlier callback even after rerender.
    // It must not start old-scope work or retire the current request.
    vi.mocked(vaultService.getPositions).mockResolvedValue([
      { vaultId: 'obsolete-reload', value: 999 },
    ]);
    await act(async () => { await retiredReload(); });
    if (phase === 'loading') {
      await act(async () => { resolveCurrent(currentData); });
    }

    expect(result.current.positions).toEqual(currentData);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(positionCache.get(result.current.queryKey)?.data).toEqual(currentData);
    expect(vaultService.getPositions).toHaveBeenCalledTimes(2);
  });

  it('does not revive a retired reload when the original actor returns', async () => {
    vi.mocked(useWallet).mockReturnValue({ isConnected: true, address: 'GACTOR1' });
    vi.mocked(useNetwork).mockReturnValue({ network: 'testnet' });
    vi.mocked(vaultService.getPositions)
      .mockResolvedValueOnce([{ vaultId: 'first-visit', value: 10 }])
      .mockResolvedValueOnce([{ vaultId: 'other-actor', value: 20 }])
      .mockResolvedValueOnce([{ vaultId: 'current-visit', value: 30 }]);
    const { result, rerender } = renderHook(() => usePositions());
    await waitFor(() => {
      expect(result.current.positions).toEqual([{ vaultId: 'first-visit', value: 10 }]);
    });
    const retiredReload = result.current.reload;
    vi.mocked(useWallet).mockReturnValue({ isConnected: true, address: 'GACTOR2' });
    rerender();
    await waitFor(() => {
      expect(result.current.positions).toEqual([{ vaultId: 'other-actor', value: 20 }]);
    });
    vi.mocked(useWallet).mockReturnValue({ isConnected: true, address: 'GACTOR1' });
    rerender();
    await waitFor(() => {
      expect(result.current.positions).toEqual([{ vaultId: 'current-visit', value: 30 }]);
    });
    vi.mocked(vaultService.getPositions).mockResolvedValue([
      { vaultId: 'obsolete-reload', value: 999 },
    ]);
    await act(async () => { await retiredReload(); });
    expect(result.current.positions).toEqual([{ vaultId: 'current-visit', value: 30 }]);
    expect(vaultService.getPositions).toHaveBeenCalledTimes(3);
  });

  it('does not let a retired reload publish after its consumer unmounts', async () => {
    vi.mocked(useWallet).mockReturnValue({ isConnected: true, address: 'GACTOR1' });
    vi.mocked(useNetwork).mockReturnValue({ network: 'testnet' });
    const currentData = [{ vaultId: 'current', value: 10 }];
    vi.mocked(vaultService.getPositions).mockResolvedValueOnce(currentData);
    const { result, unmount } = renderHook(() => usePositions());
    await waitFor(() => { expect(result.current.positions).toEqual(currentData); });
    const { reload: retiredReload, queryKey } = result.current;
    unmount();
    vi.mocked(vaultService.getPositions).mockResolvedValue([
      { vaultId: 'obsolete-reload', value: 999 },
    ]);
    await act(async () => { await retiredReload(); });
    expect(positionCache.get(queryKey)?.data).toEqual(currentData);
    expect(vaultService.getPositions).toHaveBeenCalledTimes(1);
  });
});
