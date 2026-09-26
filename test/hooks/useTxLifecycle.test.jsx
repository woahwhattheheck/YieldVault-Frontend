import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useTxLifecycle } from '../../src/hooks/useTxLifecycle.js';

const options = (getStatus) => ({
  kind: 'deposit',
  vaultId: 'vault-1',
  walletAddress: 'GOWNER',
  network: 'testnet',
  getStatus,
});

describe('useTxLifecycle', () => {
  beforeEach(() => sessionStorage.clear());

  it('signs only once for duplicate clicks and waits for status before success', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const submit = vi.fn(async () => { await gate; return { hash: 'h1' }; });
    const getStatus = vi.fn(async () => ({ status: 'pending', hash: 'h1' }));
    const { result } = renderHook(() => useTxLifecycle(options(getStatus)));

    let first, second;
    await act(async () => {
      first = result.current.run('10', submit);
      second = result.current.run('10', submit);
    });
    expect(submit).toHaveBeenCalledTimes(1);

    await act(async () => {
      release();
      await first;
      await second;
    });
    expect(result.current.operation.state).toBe('confirming');
    expect(result.current.status.canRetry).toBe(false);

    getStatus.mockResolvedValue({ status: 'confirmed', hash: 'h1' });
    await act(async () => { await result.current.checkStatus(); });
    expect(result.current.operation.state).toBe('confirmed');
  });

  it('reconciles a pending receipt on refresh without another signature', async () => {
    const submit = vi.fn(async () => ({ hash: 'h2' }));
    const getStatus = vi.fn(async () => ({ status: 'pending', hash: 'h2' }));
    const first = renderHook(() => useTxLifecycle(options(getStatus)));
    await act(async () => { await first.result.current.run('5', submit); });
    expect(first.result.current.operation.state).toBe('confirming');
    first.unmount();

    getStatus.mockResolvedValue({ status: 'confirmed', hash: 'h2' });
    const again = renderHook(() => useTxLifecycle(options(getStatus)));
    await waitFor(() => expect(again.result.current.operation?.state).toBe('confirmed'));
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('blocks retries after a lost response that may have executed on chain', async () => {
    const submit = vi.fn(async () => { throw new Error('Request timed out'); });
    const getStatus = vi.fn(async () => ({ status: 'unknown' }));
    const first = renderHook(() => useTxLifecycle(options(getStatus)));
    await act(async () => { await first.result.current.run('25', submit); });
    expect(first.result.current.operation.state).toBe('unknown');
    expect(first.result.current.status.canRetry).toBe(false);
    const id = first.result.current.operation.clientOpId;
    first.unmount();

    const again = renderHook(() => useTxLifecycle(options(getStatus)));
    await waitFor(() => expect(again.result.current.operation?.state).toBe('unknown'));
    await act(async () => { await again.result.current.run('26', submit); });
    await act(async () => { again.result.current.reset(); });
    expect(again.result.current.operation.clientOpId).toBe(id);
    expect(submit).toHaveBeenCalledTimes(1);

    getStatus.mockResolvedValue({ status: 'confirmed', hash: 'h3' });
    await act(async () => { await again.result.current.checkStatus(); });
    expect(again.result.current.operation.state).toBe('confirmed');
  });

  it('allows a new signature only after a definitive failure', async () => {
    const submit = vi.fn(async () => ({ hash: 'failed-hash' }));
    const getStatus = vi.fn(async () => ({ status: 'failed', hash: 'failed-hash' }));
    const { result } = renderHook(() => useTxLifecycle(options(getStatus)));
    await act(async () => { await result.current.run('7', submit); });
    const oldId = result.current.operation.clientOpId;
    expect(result.current.status.canRetry).toBe(true);

    getStatus.mockResolvedValue({ status: 'confirmed', hash: 'new-hash' });
    await act(async () => { await result.current.run('7', submit); });
    expect(result.current.operation.state).toBe('confirmed');
    expect(result.current.operation.clientOpId).not.toBe(oldId);
    expect(submit).toHaveBeenCalledTimes(2);
  });
  it('restores a confirmed demo receipt without re-signing after refresh', async () => {
    const submit = vi.fn(async () => ({ hash: 'mock-hash' }));
    const getStatus = vi.fn(async () => ({
      status: 'confirmed', hash: 'mock-hash', source: 'mock',
    }));
    const first = renderHook(() => useTxLifecycle(options(getStatus)));
    await act(async () => { await first.result.current.run('3', submit); });
    const opId = first.result.current.operation.clientOpId;
    expect(first.result.current.status.label).toBe('Demo confirmed');
    first.unmount();

    const again = renderHook(() => useTxLifecycle(options(getStatus)));
    await waitFor(() => expect(again.result.current.operation?.state).toBe('confirmed'));
    expect(again.result.current.operation.clientOpId).toBe(opId);
    expect(again.result.current.status.detail).toMatch(/no on-chain confirmation/i);
    expect(submit).toHaveBeenCalledTimes(1);
  });

});
