import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DepositForm from '../../src/components/DepositForm';

vi.mock('../../src/hooks/useWallet.js', () => ({
  useWallet: vi.fn(),
}));
vi.mock('../../src/services/vault.js', () => ({
  deposit: vi.fn(),
}));
vi.mock('../../src/services/wallet.js', () => ({
  signAndSubmit: vi.fn(),
}));
vi.mock('../../src/constants/config.js', () => ({
  CONFIG: { network: 'testnet' },
}));

import { useWallet } from '../../src/hooks/useWallet.js';
import * as walletService from '../../src/services/wallet.js';

const vault = { id: 'v1', asset: 'USDC', totalAssets: 1000, totalShares: 1000 };

describe('DepositForm network guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disables submit and shows wrong-network messaging', () => {
    vi.mocked(useWallet).mockReturnValue({
      isConnected: true,
      balanceOf: () => 100,
      walletNetwork: 'mainnet',
      connect: async () => {},
      disconnect: async () => {},
      address: 'G...',
      balances: {},
      connecting: false,
      error: null,
    });

    render(<DepositForm vault={vault} />);
    expect(screen.getByRole('button', { name: /Switch network to deposit/i })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/Wrong network/i);
  });

  it('does not call signAndSubmit when blocked', async () => {
    vi.mocked(useWallet).mockReturnValue({
      isConnected: true,
      balanceOf: () => 100,
      walletNetwork: 'mainnet',
      connect: async () => {},
      disconnect: async () => {},
      address: 'G...',
      balances: {},
      connecting: false,
      error: null,
    });

    render(<DepositForm vault={vault} />);
    expect(walletService.signAndSubmit).not.toHaveBeenCalled();
  });
});
