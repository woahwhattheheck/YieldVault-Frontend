import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DepositForm from '../../src/components/DepositForm';

vi.mock('../../src/hooks/useWallet.js', () => ({
  useWallet: () => ({
    isConnected: true,
    balanceOf: () => 1000,
  }),
}));

vi.mock('../../src/services/vault.js', () => ({
  deposit: vi.fn(async () => ({ ok: true })),
}));

vi.mock('../../src/services/wallet.js', () => ({
  signAndSubmit: vi.fn(),
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

  it('surfaces mocked provider timeout as unknown with recoverable retry', async () => {
    walletService.signAndSubmit.mockRejectedValue(new Error('Request timed out'));

    render(<DepositForm vault={vault} />);
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: /deposit/i }));

    await waitFor(() => {
      expect(screen.getByTestId('tx-status')).toHaveAttribute('data-state', 'unknown');
    });
    expect(screen.getByText(/status unknown/i)).toBeInTheDocument();
    expect(screen.getByText(/new wallet signature/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
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
  });
});
