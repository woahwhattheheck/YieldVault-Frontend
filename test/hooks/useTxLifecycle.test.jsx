import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useTxLifecycle } from '../../src/hooks/useTxLifecycle.js';
import { getTxOperation } from '../../src/utils/txLifecycle.js';

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
    // Records created before source tagging came from this repository's demo provider.
    expect(result.current.status.label).toBe('Demo confirmed');
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

  it('allows a new signature only after a definitive failure for the same mutation', async () => {
    const submit = vi.fn(async () => ({ hash: 'failed-hash' }));
    const getStatus = vi.fn(async () => ({ status: 'failed', hash: 'failed-hash' }));
    const { result } = renderHook(() => useTxLifecycle(options(getStatus)));
    await act(async () => { await result.current.run('7', submit); });
    const oldId = result.current.operation.clientOpId;
    expect(result.current.status.canRetry).toBe(true);

    await act(async () => { await result.current.run('8', submit); });
    expect(result.current.operation.state).toBe('failed');
    expect(result.current.operation.clientOpId).toBe(oldId);
    expect(submit).toHaveBeenCalledTimes(1);

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

  it.each([
    ['confirmed', 'receipt'],
    ['confirmed', 'error'],
    ['failed', 'receipt'],
    ['failed', 'error'],
  ])('preserves a %s status after a late submission %s', async (state, outcome) => {
    let resolveSubmit, rejectSubmit;
    const submission = new Promise((resolve, reject) => {
      resolveSubmit = resolve;
      rejectSubmit = reject;
    });
    const submit = vi.fn(() => submission);
    const getStatus = vi.fn(async () => ({ status: state, hash: 'status-hash', source: 'mock' }));
    const { result } = renderHook(() => useTxLifecycle(options(getStatus)));
    let pending;
    await act(async () => { pending = result.current.run('10', submit); });
    expect(result.current.operation.state).toBe('submitted');
    const id = result.current.operation.clientOpId;

    await act(async () => { await result.current.checkStatus(); });
    const settled = getTxOperation(id);
    expect(settled.state).toBe(state);
    getStatus.mockResolvedValue({ status: 'unknown', source: 'mock' });

    let completed;
    await act(async () => {
      if (outcome === 'receipt') resolveSubmit({ hash: 'late-hash' });
      else rejectSubmit(new Error('Request timed out'));
      completed = await pending;
    });

    expect(getTxOperation(id)).toEqual(settled);
    expect(result.current.operation.state).toBe(state);
    expect(result.current.operation.txHash).toBe('status-hash');
    expect(result.current.operation.statusSource).toBe('mock');
    expect(completed).toEqual(settled);
    expect(getStatus).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it.each(['receipt', 'error'])('keeps a dismissed operation cleared after a late submission %s', async (outcome) => {
    let resolveSubmit, rejectSubmit;
    const submission = new Promise((resolve, reject) => {
      resolveSubmit = resolve;
      rejectSubmit = reject;
    });
    const getStatus = vi.fn(async () => ({ status: 'confirmed', hash: 'status-hash', source: 'mock' }));
    const { result } = renderHook(() => useTxLifecycle(options(getStatus)));
    let pending;
    await act(async () => { pending = result.current.run('10', () => submission); });
    const id = result.current.operation.clientOpId;
    await act(async () => { await result.current.checkStatus(); });
    expect(result.current.operation.state).toBe('confirmed');
    await act(async () => { result.current.reset(); });
    expect(getTxOperation(id)).toBeNull();
    expect(result.current.operation).toBeNull();

    let completed;
    await act(async () => {
      if (outcome === 'receipt') resolveSubmit({ hash: 'late-hash' });
      else rejectSubmit(new Error('Request timed out'));
      completed = await pending;
    });

    expect(getTxOperation(id)).toBeNull();
    expect(result.current.operation).toBeNull();
    expect(completed).toBeNull();
    expect(getStatus).toHaveBeenCalledTimes(1);
  });

});
