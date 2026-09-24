import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DepositForm from '../../src/components/DepositForm';
import {
  __resetSimulationBehaviorForTests,
  __setSimulationBehaviorForTests,
} from '../../src/services/preflight.js';

vi.mock('../../src/constants/config.js', () => ({
  CONFIG: {
    network: 'testnet',
    vaultContract: 'CCONTRACT',
    mockLatency: 0,
    preflightTimeoutMs: 50,
  },
}));

vi.mock('../../src/hooks/useWallet.js', () => ({
  useWallet: vi.fn(),
}));

vi.mock('../../src/hooks/useNetwork.js', () => ({
  useNetwork: vi.fn(() => ({
    network: 'testnet',
    networkConfig: { id: 'testnet', label: 'Testnet' },
    isMainnet: false,
    setNetwork: vi.fn(),
    toggleNetwork: vi.fn(),
  })),
}));

vi.mock('../../src/services/vault.js', () => ({
  deposit: vi.fn(async () => ({ shares: 1, vaultId: 'usdc-vault' })),
}));

vi.mock('../../src/services/wallet.js', () => ({
  signAndSubmit: vi.fn(async () => ({ hash: 'mock-hash', summary: 'ok' })),
}));

import { useWallet } from '../../src/hooks/useWallet.js';
import { useNetwork } from '../../src/hooks/useNetwork.js';
import * as walletService from '../../src/services/wallet.js';
import * as vaultService from '../../src/services/vault.js';

const vault = {
  id: 'usdc-vault',
  asset: 'USDC',
  totalAssets: 10000,
  totalShares: 10000,
};

function mockConnectedWallet(overrides = {}) {
  vi.mocked(useWallet).mockReturnValue({
    isConnected: true,
    balanceOf: () => 1000,
    address: 'GTESTADDRESS',
    walletNetwork: 'testnet',
    connect: async () => {},
    disconnect: async () => {},
    balances: { USDC: 1000 },
    connecting: false,
    error: null,
    ...overrides,
  });
}

describe('DepositForm preflight gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetSimulationBehaviorForTests();
    mockConnectedWallet();
    vi.mocked(useNetwork).mockReturnValue({
      network: 'testnet',
      networkConfig: { id: 'testnet', label: 'Testnet' },
      isMainnet: false,
      setNetwork: vi.fn(),
      toggleNetwork: vi.fn(),
    });
  });

  afterEach(() => {
    __resetSimulationBehaviorForTests();
  });

  it('requests a signature after successful preflight', async () => {
    render(<DepositForm vault={vault} />);
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /^deposit$/i }));

    await waitFor(() => {
      expect(walletService.signAndSubmit).toHaveBeenCalledTimes(1);
    });
    expect(vaultService.deposit).toHaveBeenCalledTimes(1);
  });

  it('does not request a signature on contract rejection', async () => {
    __setSimulationBehaviorForTests({
      mode: 'reject',
      reason: 'Simulation rejected by contract',
    });
    render(<DepositForm vault={vault} />);
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /^deposit$/i }));

    await waitFor(() => {
      expect(screen.getByTestId('preflight-status')).toHaveAttribute('data-status', 'rejected');
    });
    expect(walletService.signAndSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/Simulation rejected by contract/i)).toBeInTheDocument();
  });

  it('does not request a signature on provider timeout and offers retry', async () => {
    __setSimulationBehaviorForTests({ mode: 'timeout', delayMs: 5 });
    render(<DepositForm vault={vault} />);
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /^deposit$/i }));

    await waitFor(() => {
      expect(screen.getByTestId('preflight-status')).toHaveAttribute('data-status', 'timeout');
    });
    expect(walletService.signAndSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /retry preflight/i })).toBeInTheDocument();
  });

  it('does not request a signature when balance is stale', async () => {
    __setSimulationBehaviorForTests({
      mode: 'reject',
      code: 'STALE_BALANCE',
      reason: 'Balance changed since you entered this amount. Refresh and try a smaller deposit.',
    });
    render(<DepositForm vault={vault} />);
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /^deposit$/i }));

    await waitFor(() => {
      expect(screen.getByTestId('preflight-status')).toHaveAttribute('data-status', 'rejected');
    });
    expect(walletService.signAndSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/Balance changed/i)).toBeInTheDocument();
  });

  it('blocks signature when wallet network does not match app network', async () => {
    mockConnectedWallet({ walletNetwork: 'mainnet' });
    render(<DepositForm vault={vault} />);
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /^deposit$/i }));

    await waitFor(() => {
      expect(screen.getByTestId('preflight-status')).toHaveAttribute('data-status', 'rejected');
    });
    expect(walletService.signAndSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/does not match/i)).toBeInTheDocument();
  });
});
