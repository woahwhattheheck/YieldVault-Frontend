import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DepositForm from '../../src/components/DepositForm';
import VaultDetail from '../../src/pages/VaultDetail';
import { AppProvider } from '../../src/context/AppContext';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import * as vaultService from '../../src/services/vault.js';

const vault = {
  id: 'vault-1',
  asset: 'USDC',
  totalAssets: 10000,
  totalShares: 10000,
  name: 'USDC review vault',
  apy: 0.08,
  tvl: 10000,
  strategy: 'Existing mock vault',
};

vi.mock('../../src/hooks/useWallet.js', () => ({
  useWallet: vi.fn(),
}));

vi.mock('../../src/services/vault.js', () => ({
  deposit: vi.fn(async () => ({ shares: 10 })),
  getVault: vi.fn(async () => vault),
}));

vi.mock('../../src/services/wallet.js', () => ({
  signAndSubmit: vi.fn(async () => ({})),
}));

import { useWallet } from '../../src/hooks/useWallet.js';

describe('DepositForm accessibility', () => {
  beforeEach(() => {
    vi.mocked(useWallet).mockReturnValue({
      isConnected: true,
      balanceOf: () => 1000,
    } as ReturnType<typeof useWallet>);
  });

  it('wires aria-invalid and aria-describedby when the amount is invalid', () => {
    render(<DepositForm vault={vault} />);
    const input = screen.getByLabelText('Amount');

    fireEvent.change(input, { target: { value: '0' } });

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby') || '').toContain('deposit-amount-error');
    expect(screen.getByRole('alert')).toHaveTextContent(/greater than zero/i);
  });

  it('exposes labelled MAX and a polite shares preview', () => {
    render(<DepositForm vault={vault} />);
    expect(screen.getByRole('button', { name: /Deposit maximum/i })).toBeInTheDocument();
    const preview = document.getElementById('deposit-preview');
    expect(preview).toHaveAttribute('aria-live', 'polite');
    expect(preview).toHaveAttribute('role', 'status');
  });

  it('keeps the submit control disabled while invalid (disabled-state baseline)', () => {
    render(<DepositForm vault={vault} />);
    expect(screen.getByRole('button', { name: /^Deposit$/i })).toBeDisabled();
  });

  it('retains the success live region while the routed vault refreshes', async () => {
    let finishRefresh: (value: typeof vault) => void = () => {};
    const refresh = new Promise<typeof vault>((resolve) => { finishRefresh = resolve; });
    vi.mocked(vaultService.getVault).mockResolvedValueOnce(vault).mockImplementationOnce(() => refresh);
    render(
      <MemoryRouter initialEntries={['/vault/vault-1']}>
        <AppProvider>
          <Routes><Route path="/vault/:id" element={<VaultDetail />} /></Routes>
        </AppProvider>
      </MemoryRouter>,
    );
    const input = await screen.findByLabelText('Amount');
    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Deposit', exact: true }));

    const message = await screen.findByText('Deposited 10 USDC');
    expect(message).toHaveAttribute('role', 'status');
    expect(message).toHaveAttribute('aria-live', 'polite');
    expect(input).toBeInTheDocument();
    expect(input).toBeDisabled();

    await act(async () => { finishRefresh(vault); });
    await waitFor(() => expect(input).toBeEnabled());
    expect(screen.getByText('Deposited 10 USDC')).toBe(message);
  });
});
