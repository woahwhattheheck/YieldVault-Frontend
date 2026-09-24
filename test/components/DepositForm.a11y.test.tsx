import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DepositForm from '../../src/components/DepositForm';

const vault = {
  id: 'vault-1',
  asset: 'USDC',
  totalAssets: 10000,
  totalShares: 10000,
};

vi.mock('../../src/hooks/useWallet.js', () => ({
  useWallet: vi.fn(),
}));

vi.mock('../../src/services/vault.js', () => ({
  deposit: vi.fn(async () => ({ shares: 10 })),
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
});
