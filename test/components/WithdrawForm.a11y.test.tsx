import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WithdrawForm from '../../src/components/WithdrawForm';

const vault = {
  id: 'vault-1',
  asset: 'USDC',
  totalAssets: 10000,
  totalShares: 10000,
};

vi.mock('../../src/hooks/useWallet.js', () => ({
  useWallet: vi.fn(),
}));

vi.mock('../../src/hooks/usePositions.js', () => ({
  usePositions: vi.fn(),
}));

vi.mock('../../src/services/vault.js', () => ({
  withdraw: vi.fn(async () => ({ shares: 10 })),
}));

vi.mock('../../src/services/wallet.js', () => ({
  signAndSubmit: vi.fn(async () => ({})),
}));

import { useWallet } from '../../src/hooks/useWallet.js';
import { usePositions } from '../../src/hooks/usePositions.js';

describe('WithdrawForm accessibility', () => {
  beforeEach(() => {
    vi.mocked(useWallet).mockReturnValue({
      isConnected: true,
      balanceOf: () => 1000,
    } as ReturnType<typeof useWallet>);
    vi.mocked(usePositions).mockReturnValue({
      positions: [{ vaultId: 'vault-1', value: 400 }],
    } as ReturnType<typeof usePositions>);
  });

  it('associates field errors for oversize withdrawals', () => {
    render(<WithdrawForm vault={vault} />);
    const input = screen.getByLabelText('Amount');
    fireEvent.change(input, { target: { value: '9999' } });

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent(/exceeds your position/i);
  });

  it('labels MAX and announces burned-share previews', () => {
    render(<WithdrawForm vault={vault} />);
    expect(screen.getByRole('button', { name: /Withdraw maximum/i })).toBeInTheDocument();
    const preview = document.getElementById('withdraw-preview');
    expect(preview).toHaveAttribute('aria-live', 'polite');
  });
});
