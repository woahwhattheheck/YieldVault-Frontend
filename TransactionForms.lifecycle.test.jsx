import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DepositForm from '../../src/components/DepositForm';
import WithdrawForm from '../../src/components/WithdrawForm';
import TxStatus from '../../src/components/TxStatus';

const { run } = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('../../src/hooks/useTxLifecycle.js', () => ({ useTxLifecycle: () => ({
  operation: null, busy: false, run, reset: vi.fn(),
  status: { label: null, detail: null, canRetry: false, needsNewSignature: false },
}) }));
vi.mock('../../src/hooks/useWallet.js', () => ({ useWallet: () => ({ isConnected: true, balanceOf: () => 100 }) }));
vi.mock('../../src/hooks/usePositions.js', () => ({ usePositions: () => ({ positions: [{ vaultId: 'vault', value: 100 }] }) }));
vi.mock('../../src/utils/validate.js', () => ({ validateDeposit: () => ({ valid: true }), validateWithdraw: () => ({ valid: true }) }));
vi.mock('../../src/utils/shares.js', () => ({ previewDeposit: () => 10, previewWithdraw: () => 10 }));
vi.mock('../../src/utils/format.js', () => ({ formatAmount: (value) => String(value) }));
vi.mock('../../src/services/vault.js', () => ({ deposit: vi.fn(), withdraw: vi.fn() }));
vi.mock('../../src/services/wallet.js', () => ({ signAndSubmit: vi.fn() }));

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);
const vault = { id: 'vault', asset: 'USDC', totalAssets: 100, totalShares: 100, pricePerShare: 1 };

describe.each([['deposit', DepositForm], ['withdraw', WithdrawForm]])('%s completion', (name, Form) => {
  it.each([null, { state: 'submitted' }, { state: 'confirming' }])('does not announce success for a duplicate/no-op result %j', async (outcome) => {
    run.mockResolvedValue(outcome);
    const onSuccess = vi.fn();
    const { container } = render(<Form vault={vault} onSuccess={onSuccess} />);
    fireEvent.change(container.querySelector('input'), { target: { value: '10' } });
    fireEvent.submit(container.querySelector('form'));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(container.querySelector('input').value).toBe('10');
  });
  it('still invokes success for a confirmed completion', async () => {
    run.mockResolvedValue({ state: 'confirmed' });
    const onSuccess = vi.fn();
    const { container } = render(<Form vault={vault} onSuccess={onSuccess} />);
    fireEvent.change(container.querySelector('input'), { target: { value: '10' } });
    fireEvent.submit(container.querySelector('form'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });
});
it.each(['submitted', 'confirming'])('hides Dismiss while %s', (state) => {
  render(<TxStatus label={state} detail={null} canRetry={false} needsNewSignature={false} state={state} onDismiss={vi.fn()} />);
  expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
});
it('keeps Dismiss available for confirmed status', () => {
  const onDismiss = vi.fn();
  render(<TxStatus label="Confirmed" detail={null} canRetry={false} needsNewSignature={false} state="confirmed" onDismiss={onDismiss} />);
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(onDismiss).toHaveBeenCalledTimes(1);
});
