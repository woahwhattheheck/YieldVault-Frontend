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

describe('usePositions shared reads', () => {
  beforeEach(() => {
    positionCache.clear();
    vi.mocked(vaultService.getPositions).mockReset();
  });


  it('shares one automatic read across mounted views and one fresh read after invalidation', async () => {
    vi.mocked(useWallet).mockReturnValue({ isConnected: true, address: 'GACTOR1' });
    vi.mocked(useNetwork).mockReturnValue({ network: 'testnet' });
    let resolveFirst;
    const first = new Promise((resolve) => { resolveFirst = resolve; });
    vi.mocked(vaultService.getPositions).mockReturnValue(first);
    const { result } = renderHook(() => [usePositions(), usePositions()]);
    expect(vaultService.getPositions).toHaveBeenCalledTimes(1);
    const original = [{ vaultId: 'v1', value: 10 }];
    await act(async () => { resolveFirst(original); });
    expect(result.current[0].positions).toBe(original);
    expect(result.current[1].positions).toBe(original);

    const updated = [{ vaultId: 'v1', value: 15 }];
    vi.mocked(vaultService.getPositions).mockResolvedValue(updated);
    await act(async () => { positionCache.invalidate(result.current[0].queryKey); });
    await waitFor(() => {
      expect(result.current[0].positions).toBe(updated);
      expect(result.current[1].positions).toBe(updated);
    });
    expect(vaultService.getPositions).toHaveBeenCalledTimes(2);
  });

  it('reports a shared failure to every mounted view and allows a fresh retry', async () => {
    vi.mocked(useWallet).mockReturnValue({ isConnected: true, address: 'GACTOR1' });
    vi.mocked(useNetwork).mockReturnValue({ network: 'testnet' });
    vi.mocked(vaultService.getPositions).mockRejectedValue(new Error('shared read failed'));
    const { result } = renderHook(() => [usePositions(), usePositions()]);
    await waitFor(() => {
      for (const view of result.current) {
        expect(view.error).toBe('shared read failed');
        expect(view.loading).toBe(false);
      }
    });
    expect(vaultService.getPositions).toHaveBeenCalledTimes(1);
    const recovered = [{ vaultId: 'v1', value: 25 }];
    vi.mocked(vaultService.getPositions).mockResolvedValue(recovered);
    await act(async () => { await result.current[0].reload(); });
    for (const view of result.current) {
      expect(view.positions).toBe(recovered);
      expect(view.error).toBeNull();
    }
    expect(vaultService.getPositions).toHaveBeenCalledTimes(2);
  });
});
