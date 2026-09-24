import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useTxLifecycle } from '../../src/hooks/useTxLifecycle.js';

describe('useTxLifecycle', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('ignores duplicate clicks while a submission is in flight', async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const submitFn = vi.fn(async () => {
      await gate;
      return { hash: 'mock-abc' };
    });

    const { result } = renderHook(() =>
      useTxLifecycle({ kind: 'deposit', vaultId: 'vault-1' }),
    );

    let first;
    await act(async () => {
      first = result.current.run('10', submitFn);
    });
    await waitFor(() => {
      expect(result.current.operation?.state).toBe('submitted');
    });

    let second;
    await act(async () => {
      second = result.current.run('10', submitFn);
    });

    await act(async () => {
      release({ hash: 'mock-abc' });
      await first;
      await second;
    });

    expect(submitFn).toHaveBeenCalledTimes(1);
    expect(result.current.operation?.state).toBe('confirmed');
  });

  it('restores in-flight status after remount without resubmitting', async () => {
    const submitFn = vi.fn(async () => ({ hash: 'h1' }));
    const { result, unmount } = renderHook(() =>
      useTxLifecycle({ kind: 'withdraw', vaultId: 'vault-2' }),
    );

    // Force a persisted confirming op, then remount.
    await act(async () => {
      const pending = result.current.run('5', async () => {
        throw new Error('Request timed out');
      });
      await pending.catch(() => {});
    });
    expect(result.current.operation?.state).toBe('unknown');
    const opId = result.current.operation?.clientOpId;
    unmount();

    const { result: again } = renderHook(() =>
      useTxLifecycle({ kind: 'withdraw', vaultId: 'vault-2' }),
    );
    await waitFor(() => {
      expect(again.current.operation?.clientOpId).toBe(opId);
    });
    expect(submitFn).not.toHaveBeenCalled();
    expect(again.current.status.needsNewSignature).toBe(true);
  });
});
