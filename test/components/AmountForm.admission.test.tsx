import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DepositForm from '../../src/components/DepositForm';
import WithdrawForm from '../../src/components/WithdrawForm';
import * as vaultService from '../../src/services/vault.js';
import * as walletService from '../../src/services/wallet.js';

const wallet = vi.hoisted(() => ({ connected: true }));
vi.mock('../../src/hooks/useWallet.js', () => ({
  useWallet: () => ({ isConnected: wallet.connected, balanceOf: () => 1000 }),
}));
vi.mock('../../src/hooks/usePositions.js', () => ({
  usePositions: () => ({ positions: [{ vaultId: 'admission-vault', value: 1000 }] }),
}));
vi.mock('../../src/services/vault.js', () => ({ deposit: vi.fn(), withdraw: vi.fn() }));
vi.mock('../../src/services/wallet.js', () => ({ signAndSubmit: vi.fn() }));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

const vault = { id: 'admission-vault', asset: 'USDC', totalAssets: 1000, totalShares: 1000 };
const forms = [
  { label: 'Deposit', Form: DepositForm, operation: vaultService.deposit },
  { label: 'Withdraw', Form: WithdrawForm, operation: vaultService.withdraw },
];

beforeEach(() => {
  wallet.connected = true;
  vi.resetAllMocks();
  vi.mocked(vaultService.deposit).mockResolvedValue({});
  vi.mocked(vaultService.withdraw).mockResolvedValue({});
  vi.mocked(walletService.signAndSubmit).mockResolvedValue({});
  vi.spyOn(navigator, 'language', 'get').mockReturnValue('de-DE');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function enterAmount() {
  const input = screen.getByRole('textbox');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: '1,25' } });
  return input.closest('form')!;
}

describe('amount form submission admission', () => {
  it.each(forms)('$label admits one operation across both unresolved awaits', async ({ Form, operation, label }) => {
    const vaultPending = deferred();
    const walletPending = deferred();
    vi.mocked(operation).mockImplementation(() => vaultPending.promise);
    vi.mocked(walletService.signAndSubmit).mockImplementation(() => walletPending.promise);
    const onSuccess = vi.fn();
    render(<Form vault={vault} onSuccess={onSuccess} />);
    const form = enterAmount();
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    const initialCalls = vi.mocked(operation).mock.calls.length;
    await act(async () => { vaultPending.resolve(); });
    fireEvent.submit(form);
    const callsWhileSigning = vi.mocked(operation).mock.calls.length;
    await act(async () => { walletPending.resolve(); });
    expect(initialCalls).toBe(1);
    expect(callsWhileSigning).toBe(1);
    expect(operation).toHaveBeenCalledExactlyOnceWith('admission-vault', 1.25);
    expect(walletService.signAndSubmit).toHaveBeenCalledExactlyOnceWith(`${label} 1.25 USDC`);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it.each(forms)('$label rejects form submission after a wallet disconnect', async ({ Form, operation }) => {
    const { rerender } = render(<Form vault={vault} />);
    const form = enterAmount();
    wallet.connected = false;
    rerender(<Form vault={vault} />);
    await act(async () => { fireEvent.submit(form); });
    expect(operation).not.toHaveBeenCalled();
    expect(walletService.signAndSubmit).not.toHaveBeenCalled();
  });

  it.each(forms)('$label releases admission after failure for an explicit retry', async ({ Form, operation, label }) => {
    vi.mocked(operation).mockRejectedValueOnce(new Error('Temporary vault failure'));
    const onSuccess = vi.fn();
    render(<Form vault={vault} onSuccess={onSuccess} />);
    const form = enterAmount();
    await act(async () => { fireEvent.submit(form); });
    expect(screen.getByText('Temporary vault failure')).toBeTruthy();
    expect(walletService.signAndSubmit).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    await act(async () => { fireEvent.submit(form); });
    expect(operation).toHaveBeenCalledTimes(2);
    expect(walletService.signAndSubmit).toHaveBeenCalledExactlyOnceWith(`${label} 1.25 USDC`);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});
