import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import WithdrawForm from '../../src/components/WithdrawForm';
import {
  __queueWithdrawResultForTests,
  __resetVaultFixturesForTests,
} from '../../src/services/vault.js';
import {
  authorizationError,
  terminalError,
  withdrawFailed,
  withdrawPending,
} from '../../src/contracts/fixtures/index.js';

vi.mock('../../src/constants/config.js', () => ({
  CONFIG: {
    network: 'testnet',
    vaultContract: 'CCONTRACT',
    mockLatency: 0,
    sessionTimeoutMs: 15 * 60 * 1000,
    sessionWarningMs: 60 * 1000,
  },
}));

vi.mock('../../src/hooks/useWallet.js', () => ({
  useWallet: () => ({
    isConnected: true,
    balanceOf: () => 1000,
  }),
}));

vi.mock('../../src/hooks/usePositions.js', () => ({
  usePositions: () => ({
    positions: [{ vaultId: 'vault_fixture_001', value: 1000, shares: 1000, asset: 'USDC' }],
    loading: false,
    error: null,
    reload: () => {},
  }),
}));

vi.mock('../../src/services/wallet.js', () => ({
  signAndSubmit: vi.fn(async () => ({ hash: 'mock-hash' })),
}));

import * as walletService from '../../src/services/wallet.js';

const vault = {
  id: 'vault_fixture_001',
  asset: 'USDC',
  totalAssets: 1250000,
  totalShares: 1250000,
};

describe('WithdrawForm contract fixtures', () => {
  beforeEach(() => {
    __resetVaultFixturesForTests();
    vi.clearAllMocks();
  });

  afterEach(() => {
    __resetVaultFixturesForTests();
  });

  it('renders pending withdraw fixtures without leaking raw responses', async () => {
    __queueWithdrawResultForTests(withdrawPending);
    __queueWithdrawResultForTests(withdrawFailed);
    render(<WithdrawForm vault={vault} />);
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /^withdraw$/i }));

    await waitFor(() => {
      expect(screen.getByTestId('api-error-state')).toHaveAttribute('data-kind', 'pending');
    });
    expect(screen.getByTestId('api-error-correlation')).toHaveTextContent(
      'tx_fixture_withdraw_001',
    );
    expect(document.body.textContent).not.toContain('GUSER_fixture_001');
    expect(screen.getByLabelText(/amount/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /^max$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^withdraw$/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();

    fireEvent.submit(screen.getByTestId('withdraw-form'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByTestId('api-error-state')).toHaveAttribute('data-kind', 'pending');
    expect(walletService.signAndSubmit).not.toHaveBeenCalled();
  });

  it('renders terminal failed withdraw fixtures', async () => {
    __queueWithdrawResultForTests(withdrawFailed);
    render(<WithdrawForm vault={vault} />);
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /^withdraw$/i }));

    await waitFor(() => {
      expect(screen.getByTestId('api-error-state')).toHaveAttribute('data-kind', 'terminal');
    });
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('renders authorization and terminal API error fixtures', async () => {
    __queueWithdrawResultForTests(authorizationError);
    const { unmount } = render(<WithdrawForm vault={vault} />);
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /^withdraw$/i }));
    await waitFor(() => {
      expect(screen.getByTestId('api-error-state')).toHaveAttribute('data-kind', 'authorization');
    });
    unmount();

    __queueWithdrawResultForTests(terminalError);
    render(<WithdrawForm vault={vault} />);
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /^withdraw$/i }));
    await waitFor(() => {
      expect(screen.getByTestId('api-error-state')).toHaveAttribute('data-kind', 'terminal');
    });
    expect(screen.getByTestId('api-error-state').textContent).not.toContain('"retryable":false');
  });
});
