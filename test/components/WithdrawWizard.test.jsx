import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WithdrawWizard from '../../src/components/WithdrawWizard.jsx';

const vault = {
  id: 'vault-1',
  name: 'Yield Vault',
  asset: 'USDC',
  totalAssets: 10000,
  totalShares: 10000,
  apy: 0.085,
  risk: 'Low',
};

vi.mock('../../src/hooks/useWallet.js', () => ({
  useWallet: vi.fn(),
}));

vi.mock('../../src/hooks/usePositions.js', () => ({
  usePositions: vi.fn(),
}));

vi.mock('../../src/context/AppContext', () => ({
  useAppContext: () => ({
    slippageTolerance: 0.5,
    timezone: 'UTC',
  }),
}));

vi.mock('../../src/services/vault.js', () => ({
  withdraw: vi.fn(async () => ({ vaultId: 'vault-1', shares: 25 })),
}));

vi.mock('../../src/services/wallet.js', () => ({
  signAndSubmit: vi.fn(async () => ({ hash: 'def' })),
}));

import { useWallet } from '../../src/hooks/useWallet.js';
import { usePositions } from '../../src/hooks/usePositions.js';
import * as vaultService from '../../src/services/vault.js';

describe('WithdrawWizard accessibility', () => {
  beforeEach(() => {
    vi.mocked(useWallet).mockReturnValue({
      isConnected: true,
      balanceOf: () => 1000,
    });
    vi.mocked(usePositions).mockReturnValue({
      positions: [{ vaultId: 'vault-1', value: 500 }],
    });
    vi.clearAllMocks();
  });

  it('associates validation errors with the amount field (regression for silent empty submit)', async () => {
    render(<WithdrawWizard vault={vault} />);

    fireEvent.click(screen.getByRole('button', { name: /Continue to step 2/i }));

    const input = document.getElementById('wizard-withdraw-amount');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Amount is required/i);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-errormessage')).toBe('wizard-withdraw-amount-error');
  });

  it('labels MAX and announces share burn previews via a live region', () => {
    render(<WithdrawWizard vault={vault} />);

    expect(
      screen.getByRole('button', { name: /Withdraw maximum/i }),
    ).toBeInTheDocument();

    const previewRow = document.getElementById('wizard-withdraw-preview');
    expect(previewRow).toHaveAttribute('aria-live', 'polite');
    expect(previewRow).toHaveAttribute('role', 'status');
  });

  it('does not announce processing before the user confirms', () => {
    render(<WithdrawWizard vault={vault} />);

    fireEvent.change(document.getElementById('wizard-withdraw-amount'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: /Continue to step 2/i }));
    fireEvent.click(screen.getByRole('button', { name: /Continue to step 3/i }));

    const ready = screen.getByText(/Ready to withdraw/i).closest('.wizard-success');
    expect(ready).not.toHaveAttribute('role');
    expect(ready).not.toHaveAttribute('aria-busy');
    expect(screen.queryByText(/Processing withdrawal/i)).not.toBeInTheDocument();
    expect(vaultService.withdraw).not.toHaveBeenCalled();
  });

  it('completes the withdraw flow keyboard-only through Confirm', async () => {
    render(<WithdrawWizard vault={vault} />);

    fireEvent.change(document.getElementById('wizard-withdraw-amount'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: /Continue to step 2/i }));
    expect(screen.getByRole('region', { name: /Withdrawal review summary/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Continue to step 3/i }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm Withdrawal/i }));

    await waitFor(() => {
      expect(vaultService.withdraw).toHaveBeenCalledWith('vault-1', 25);
    });
    await waitFor(() => {
      expect(screen.getByText(/Withdrawal successful/i)).toBeInTheDocument();
    });
  });

  it('shows an empty-state when the user has no position', () => {
    vi.mocked(usePositions).mockReturnValue({ positions: [] });
    render(<WithdrawWizard vault={vault} />);
    expect(screen.getByText(/don't have any USDC deposited/i)).toBeInTheDocument();
  });
});
