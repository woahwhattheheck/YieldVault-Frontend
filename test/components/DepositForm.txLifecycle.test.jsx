import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DepositForm from '../../src/components/DepositForm';

vi.mock('../../src/hooks/useWallet.js', () => ({
  useWallet: () => ({
    isConnected: true,
    address: 'GOWNER',
    walletNetwork: 'testnet',
    balanceOf: () => 1000,
  }),
}));

vi.mock('../../src/services/vault.js', () => ({
  deposit: vi.fn(async () => ({ ok: true })),
}));

vi.mock('../../src/services/wallet.js', () => ({
  signAndSubmit: vi.fn(),
  getTransactionStatus: vi.fn(),
}));

import * as walletService from '../../src/services/wallet.js';
import * as vaultService from '../../src/services/vault.js';

const vault = {
  id: 'vault-usdc',
  asset: 'USDC',
  totalAssets: 10000,
  totalShares: 10000,
};

describe('DepositForm tx lifecycle e2e', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    walletService.getTransactionStatus.mockResolvedValue({ status: 'confirmed' });
  });

  it('blocks duplicate submit clicks while a provider call is in flight', async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    walletService.signAndSubmit.mockImplementation(async () => {
      await gate;
      return { hash: 'dup-hash' };
    });

    render(<DepositForm vault={vault} />);
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '10' } });

    const submit = screen.getByRole('button', { name: /deposit/i });
    fireEvent.click(submit);
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => {
      expect(screen.getByTestId('tx-status')).toHaveAttribute('data-state', 'submitted');
    });

    release();
    await waitFor(() => {
      expect(screen.getByTestId('tx-status')).toHaveAttribute('data-state', 'confirmed');
    });

    expect(walletService.signAndSubmit).toHaveBeenCalledTimes(1);
    expect(vaultService.deposit).toHaveBeenCalledTimes(1);
  });

  it('holds a lost provider response as unknown without offering an unsafe retry', async () => {
    walletService.signAndSubmit.mockRejectedValue(new Error('Request timed out'));
    walletService.getTransactionStatus.mockResolvedValue({ status: 'unknown' });
    const onSuccess = vi.fn();

    render(<DepositForm vault={vault} onSuccess={onSuccess} />);
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: /deposit/i }));

    await waitFor(() => {
      expect(screen.getByTestId('tx-status')).toHaveAttribute('data-state', 'unknown');
    });
    expect(screen.getByText(/status unknown/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /check status/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^deposit$/i })).toBeDisabled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('marks user rejection as terminal (failed) without auto-retrying', async () => {
    walletService.signAndSubmit.mockRejectedValue(new Error('User rejected the request'));

    render(<DepositForm vault={vault} />);
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /deposit/i }));

    await waitFor(() => {
      expect(screen.getByTestId('tx-status')).toHaveAttribute('data-state', 'failed');
    });
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^deposit$/i })).toBeDisabled();
  });

  it('does not report success when a hash is still pending', async () => {
    walletService.signAndSubmit.mockResolvedValue({ hash: 'pending-hash' });
    walletService.getTransactionStatus.mockResolvedValue({ status: 'pending', hash: 'pending-hash' });
    const onSuccess = vi.fn();
    render(<DepositForm vault={vault} onSuccess={onSuccess} />);
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: /deposit/i }));
    await waitFor(() => expect(screen.getByTestId('tx-status')).toHaveAttribute('data-state', 'confirming'));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(screen.queryByText(/deposited 8/i)).not.toBeInTheDocument();
  });
  it('refreshes dependent views when a pending demo operation confirms after remount', async () => {
    walletService.signAndSubmit.mockResolvedValue({ hash: 'mock-restored' });
    walletService.getTransactionStatus.mockResolvedValue({
      status: 'pending', hash: 'mock-restored', source: 'mock',
    });
    const onSuccess = vi.fn();
    const first = render(<DepositForm vault={vault} onSuccess={onSuccess} />);
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /deposit/i }));
    await waitFor(() => expect(screen.getByTestId('tx-status')).toHaveAttribute('data-state', 'confirming'));
    expect(onSuccess).not.toHaveBeenCalled();
    first.unmount();

    walletService.getTransactionStatus.mockResolvedValue({
      status: 'confirmed', hash: 'mock-restored', source: 'mock',
    });
    render(<DepositForm vault={vault} onSuccess={onSuccess} />);
    await waitFor(() => expect(screen.getByText(/demo deposit simulated/i)).toBeInTheDocument());
    expect(screen.getAllByText(/no on-chain confirmation/i)).toHaveLength(2);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(walletService.signAndSubmit).toHaveBeenCalledTimes(1);
  });

});
