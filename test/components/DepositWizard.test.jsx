import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DepositWizard from '../../src/components/DepositWizard.jsx';

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

vi.mock('../../src/context/AppContext', () => ({
  useAppContext: () => ({
    slippageTolerance: 0.5,
    timezone: 'UTC',
  }),
}));

vi.mock('../../src/services/vault.js', () => ({
  deposit: vi.fn(async () => ({ vaultId: 'vault-1', shares: 50 })),
}));

vi.mock('../../src/services/wallet.js', () => ({
  signAndSubmit: vi.fn(async () => ({ hash: 'abc' })),
}));

import { useWallet } from '../../src/hooks/useWallet.js';
import * as vaultService from '../../src/services/vault.js';

describe('DepositWizard accessibility', () => {
  beforeEach(() => {
    vi.mocked(useWallet).mockReturnValue({
      isConnected: true,
      balanceOf: () => 1000,
    });
    vi.clearAllMocks();
  });

  it('associates validation errors with the amount field and announces them', async () => {
    render(<DepositWizard vault={vault} />);

    fireEvent.click(screen.getByRole('button', { name: /Continue to step 2/i }));

    const input = document.getElementById('wizard-deposit-amount');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Amount is required/i);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby') || '').toContain('wizard-deposit-amount-error');
    expect(input.getAttribute('aria-errormessage')).toBe('wizard-deposit-amount-error');

    const live = screen.getByTestId('wizard-live-region');
    await waitFor(() => {
      expect(live).toHaveTextContent(/Validation error/i);
    });
  });

  it('labels the MAX control and exposes a live preview region', () => {
    render(<DepositWizard vault={vault} />);

    const maxBtn = screen.getByRole('button', { name: /Deposit maximum/i });
    expect(maxBtn).toBeInTheDocument();

    const previewRow = document.getElementById('wizard-deposit-preview');
    expect(previewRow).toHaveAttribute('aria-live', 'polite');
    expect(previewRow).toHaveTextContent(/shares/i);

    fireEvent.click(maxBtn);
    expect(document.getElementById('wizard-deposit-amount')).toHaveValue(1000);
  });

  it('completes the deposit flow without a pointer (keyboard-operable steps)', async () => {
    const onSuccess = vi.fn();
    render(<DepositWizard vault={vault} onSuccess={onSuccess} />);

    fireEvent.change(document.getElementById('wizard-deposit-amount'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: /Continue to step 2/i }));

    expect(screen.getByRole('region', { name: /Deposit review summary/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Continue to step 3/i }));

    fireEvent.click(screen.getByRole('button', { name: /Confirm Deposit/i }));

    await waitFor(() => {
      expect(vaultService.deposit).toHaveBeenCalledWith('vault-1', 50);
    });
    await waitFor(() => {
      expect(screen.getByText(/Deposit successful/i)).toBeInTheDocument();
    });
    const outcome = screen.getByText(/Deposit successful/i).closest('.wizard-success');
    expect(outcome).toHaveAttribute('role', 'status');
    expect(outcome).toHaveAttribute('aria-live', 'polite');
  });

  it('prompts to connect wallet when disconnected', () => {
    vi.mocked(useWallet).mockReturnValue({
      isConnected: false,
      balanceOf: () => 0,
    });
    render(<DepositWizard vault={vault} />);
    expect(screen.getByText(/Connect your wallet to deposit/i)).toBeInTheDocument();
  });
});
