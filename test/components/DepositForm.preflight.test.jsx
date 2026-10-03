import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DepositForm from '../../src/components/DepositForm';
import WithdrawForm from '../../src/components/WithdrawForm';
import DepositWizard from '../../src/components/DepositWizard.jsx';
import WithdrawWizard from '../../src/components/WithdrawWizard.jsx';
import * as preflightService from '../../src/services/preflight.js';
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

vi.mock('../../src/hooks/usePositions.js', () => ({
  usePositions: () => ({ positions: [{ vaultId: 'usdc-vault', value: 100 }] }),
}));

vi.mock('../../src/context/AppContext', () => ({
  useAppContext: () => ({ network: 'testnet', slippageTolerance: 0.5, timezone: 'UTC' }),
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
  withdraw: vi.fn(async () => ({ shares: 1, vaultId: 'usdc-vault' })),
}));

vi.mock('../../src/services/wallet.js', () => ({
  signAndSubmit: vi.fn(async () => ({ hash: 'mock-hash', summary: 'ok' })),
  getNetwork: vi.fn(async () => 'testnet'),
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
  name: 'USDC vault',
  apy: 0.05,
  risk: 'Low',
};

const realRunPreflight = preflightService.runPreflight;

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function submitFlow(kind, wizard) {
  fireEvent.change(screen.getByLabelText(/^amount$/i, { selector: 'input' }), { target: { value: '10' } });
  if (wizard) {
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
  } else {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${kind}$`, 'i') }));
  }
}

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

describe('value-moving preflight gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(vaultService.deposit).mockReset().mockResolvedValue({ shares: 1, vaultId: vault.id });
    vi.mocked(vaultService.withdraw).mockReset().mockResolvedValue({ shares: 1, vaultId: vault.id });
    vi.mocked(walletService.getNetwork).mockReset().mockResolvedValue('testnet');
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
    vi.restoreAllMocks();
  });

  describe.each([
    ['deposit form', DepositForm, 'deposit', false],
    ['withdraw form', WithdrawForm, 'withdraw', false],
    ['deposit wizard', DepositWizard, 'deposit', true],
    ['withdraw wizard', WithdrawWizard, 'withdraw', true],
  ])('%s', (_name, Component, kind, wizard) => {
    if (wizard || kind === 'withdraw') {
      it('still signs once when the intent and provider network remain current', async () => {
        render(<Component vault={vault} />);
        submitFlow(kind, wizard);
        await waitFor(() => expect(walletService.signAndSubmit).toHaveBeenCalledTimes(1));
        expect(vaultService[kind]).toHaveBeenCalledTimes(1);
        expect(walletService.getNetwork).toHaveBeenCalledTimes(1);
      });
    }

    it('does not prepare or sign after the wallet network changes during preflight', async () => {
      const pending = deferred();
      let simulation;
      vi.spyOn(preflightService, 'runPreflight').mockImplementationOnce((input) => {
        simulation = realRunPreflight(input).then(async (result) => {
          await pending.promise;
          return result;
        });
        return simulation;
      });
      const view = render(<Component vault={vault} />);
      submitFlow(kind, wizard);
      await waitFor(() => expect(preflightService.runPreflight).toHaveBeenCalledTimes(1));
      mockConnectedWallet({ walletNetwork: 'mainnet' });
      view.rerender(<Component vault={vault} />);
      await act(async () => { pending.resolve(); await simulation; });

      expect(vaultService[kind]).not.toHaveBeenCalled();
      expect(walletService.signAndSubmit).not.toHaveBeenCalled();
    });

    it('rechecks the current wallet after asynchronous vault preparation', async () => {
      const pending = deferred();
      vi.mocked(vaultService[kind]).mockReturnValueOnce(pending.promise);
      const view = render(<Component vault={vault} />);
      submitFlow(kind, wizard);
      await waitFor(() => expect(vaultService[kind]).toHaveBeenCalledTimes(1));
      mockConnectedWallet({ address: 'GOTHERADDRESS' });
      view.rerender(<Component vault={vault} />);
      await act(async () => {
        pending.resolve({ shares: 1, vaultId: vault.id });
        await pending.promise;
      });

      expect(walletService.signAndSubmit).not.toHaveBeenCalled();
    });

    it('rechecks the wallet provider network immediately before signing', async () => {
      vi.mocked(walletService.getNetwork).mockResolvedValueOnce('mainnet');
      render(<Component vault={vault} />);
      submitFlow(kind, wizard);
      await waitFor(() => expect(vaultService[kind]).toHaveBeenCalledTimes(1));
      await act(async () => {});

      expect(walletService.getNetwork).toHaveBeenCalledTimes(1);
      expect(walletService.signAndSubmit).not.toHaveBeenCalled();
    });

    it('does not sign when the screen unmounts during vault preparation', async () => {
      const pending = deferred();
      vi.mocked(vaultService[kind]).mockReturnValueOnce(pending.promise);
      const view = render(<Component vault={vault} />);
      submitFlow(kind, wizard);
      await waitFor(() => expect(vaultService[kind]).toHaveBeenCalledTimes(1));
      view.unmount();
      await act(async () => {
        pending.resolve({ shares: 1, vaultId: vault.id });
        await pending.promise;
      });

      expect(walletService.signAndSubmit).not.toHaveBeenCalled();
    });
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
