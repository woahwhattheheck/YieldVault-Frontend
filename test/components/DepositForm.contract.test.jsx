import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DepositForm from '../../src/components/DepositForm';
import {
  __queueDepositResultForTests,
  __resetVaultFixturesForTests,
} from '../../src/services/vault.js';
import {
  depositSuccess,
  providerFailure,
  validationError,
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

describe('DepositForm contract fixtures', () => {
  beforeEach(() => {
    __resetVaultFixturesForTests();
    vi.clearAllMocks();
  });

  afterEach(() => {
    __resetVaultFixturesForTests();
  });

  it('renders validation API errors without leaking raw details', async () => {
    __queueDepositResultForTests(validationError);
    render(<DepositForm vault={vault} />);
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /^deposit$/i }));

    await waitFor(() => {
      expect(screen.getByTestId('api-error-state')).toHaveAttribute('data-kind', 'validation');
    });
    expect(screen.getByTestId('api-error-state').textContent).not.toContain('vaultId is required');
    expect(screen.getByTestId('api-error-correlation')).toHaveTextContent(
      'req_fixture_validation_001',
    );
    expect(walletService.signAndSubmit).not.toHaveBeenCalled();
  });

  it('renders provider failures as retryable', async () => {
    __queueDepositResultForTests(providerFailure);
    render(<DepositForm vault={vault} />);
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /^deposit$/i }));

    await waitFor(() => {
      expect(screen.getByTestId('api-error-state')).toHaveAttribute('data-kind', 'provider');
    });
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(walletService.signAndSubmit).not.toHaveBeenCalled();
  });

  it('accepts a contract depositSuccess payload and signs', async () => {
    __queueDepositResultForTests(depositSuccess);
    render(<DepositForm vault={vault} />);
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /^deposit$/i }));

    await waitFor(() => {
      expect(walletService.signAndSubmit).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText(/Deposited 10 USDC \(confirmed\)/i)).toBeInTheDocument();
  });

  it('blocks signing when a response amount exceeds precision in exponent notation', async () => {
    const invalid = structuredClone(depositSuccess);
    invalid.tx.amount = 1e-7;
    __queueDepositResultForTests(invalid);
    const onSuccess = vi.fn();
    render(<DepositForm vault={vault} onSuccess={onSuccess} />);
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /^deposit$/i }));

    await waitFor(() => {
      expect(screen.getByTestId('api-error-state')).toHaveAttribute(
        'data-code',
        'CONTRACT_VALIDATION_FAILED',
      );
    });
    expect(screen.getByTestId('api-error-state')).toHaveTextContent(/unexpected response/i);
    expect(screen.getByTestId('api-error-state').textContent).not.toContain('tx.amount');
    expect(walletService.signAndSubmit).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/amount/i)).toHaveValue('10');
  });
});
