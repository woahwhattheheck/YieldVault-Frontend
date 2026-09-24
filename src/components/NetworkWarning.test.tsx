import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import NetworkWarning from './NetworkWarning';

vi.mock('../hooks/useWallet.js', () => ({
  useWallet: vi.fn(),
}));
vi.mock('../context/AppContext.jsx', () => ({
  useAppContext: vi.fn(() => ({
    switchWalletNetwork: vi.fn(),
    switchingNetwork: false,
  })),
}));

import { useWallet } from '../hooks/useWallet.js';

vi.mock('../constants/config', () => ({
  CONFIG: { network: 'testnet' },
}));

const walletState = (overrides = {}) => ({
  address: null,
  balances: {},
  connecting: false,
  error: null,
  walletNetwork: null,
  isConnected: false,
  connect: async () => {},
  disconnect: async () => {},
  balanceOf: () => 0,
  ...overrides,
});

describe('NetworkWarning', () => {
  it('does not render when wallet is not connected', () => {
    vi.mocked(useWallet).mockReturnValue(walletState({ isConnected: false }));
    const { container } = render(<NetworkWarning />);
    expect(container.firstChild).toBeNull();
  });

  it('does not render when networks match', () => {
    vi.mocked(useWallet).mockReturnValue(
      walletState({ isConnected: true, walletNetwork: 'testnet' }),
    );
    const { container } = render(<NetworkWarning />);
    expect(container.firstChild).toBeNull();
  });

  it('renders warning and switch action when networks differ', () => {
    vi.mocked(useWallet).mockReturnValue(
      walletState({ isConnected: true, walletNetwork: 'mainnet' }),
    );
    render(<NetworkWarning />);
    expect(screen.getByText('Wrong Network')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Switch wallet to Testnet/i })).toBeInTheDocument();
  });
});
