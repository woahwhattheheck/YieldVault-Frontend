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
});
