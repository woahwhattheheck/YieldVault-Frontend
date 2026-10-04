import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useTxLifecycle } from '../../src/hooks/useTxLifecycle.js';
import { getTxOperation, saveTxOperation } from '../../src/utils/txLifecycle.js';

const options = { kind: 'deposit', vaultId: 'recovery-vault' };
function deferred() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release };
}

beforeEach(() => sessionStorage.clear());
afterEach(cleanup);

describe('pending transaction recovery', () => {
  it('retains a pending record on dismiss and blocks resubmission after remount', async () => {
    const gate = deferred();
    const submit = vi.fn(() => gate.promise);
    const first = renderHook(() => useTxLifecycle(options));
    let firstRun;
    await act(async () => { firstRun = first.result.current.run('10', submit); });
    const id = first.result.current.operation.clientOpId;
    act(() => first.result.current.reset());
    const retained = getTxOperation(id);
    first.unmount();
    const again = renderHook(() => useTxLifecycle(options));
    let duplicate;
    await act(async () => { duplicate = again.result.current.run('10', submit); });
    const calls = submit.mock.calls.length;
    await act(async () => { gate.release({ hash: 'h1' }); await firstRun; await duplicate; });
    expect(retained?.state).toBe('submitted');
    expect(calls).toBe(1);
  });

  it('checks persisted pending state in another already-mounted instance', async () => {
    const gate = deferred();
    const submit = vi.fn(() => gate.promise);
    const first = renderHook(() => useTxLifecycle(options));
    const second = renderHook(() => useTxLifecycle(options));
    let pending, duplicate;
    await act(async () => { pending = first.result.current.run('12', submit); });
    await act(async () => { duplicate = second.result.current.run('12', submit); });
    const calls = submit.mock.calls.length;
    const observed = second.result.current.operation;
    await act(async () => { gate.release({ hash: 'h2' }); await pending; await duplicate; });
    expect(calls).toBe(1);
    expect(observed?.state).toBe('submitted');
    expect(observed?.clientOpId).toBe(first.result.current.operation.clientOpId);
  });

  it('cannot dismiss a restored confirming record with no local request lock', () => {
    saveTxOperation({ ...options, clientOpId: 'restored', amount: '5', state: 'confirming', updatedAt: new Date().toISOString() });
    const { result } = renderHook(() => useTxLifecycle(options));
    act(() => result.current.reset());
    expect(getTxOperation('restored')?.state).toBe('confirming');
    expect(result.current.operation?.clientOpId).toBe('restored');
  });

  it('still dismisses a terminal completed record', async () => {
    const { result } = renderHook(() => useTxLifecycle(options));
    await act(async () => { await result.current.run('5', async () => ({ hash: 'done' })); });
    const id = result.current.operation.clientOpId;
    act(() => result.current.reset());
    expect(result.current.operation).toBeNull();
    expect(getTxOperation(id)).toBeNull();
  });
});
