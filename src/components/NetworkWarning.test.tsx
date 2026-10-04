import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
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
import { useAppContext } from '../context/AppContext.jsx';

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
  const switchWalletNetwork = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAppContext).mockReturnValue({
      switchWalletNetwork,
      switchingNetwork: false,
    });
  });

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

  it.each([null, undefined, ''])('shows recovery when the connected network is %s', (walletNetwork) => {
    vi.mocked(useWallet).mockReturnValue(walletState({ isConnected: true, walletNetwork }));
    render(<NetworkWarning />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByText(/actions are blocked until the networks match/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Switch wallet to Testnet/i })).toBeEnabled();
  });

  it('keeps recovery visible when an unknown-network switch is rejected', async () => {
    vi.mocked(useWallet).mockReturnValue(walletState({ isConnected: true, walletNetwork: null }));
    switchWalletNetwork.mockRejectedValueOnce(new Error('User rejected the request'));
    render(<NetworkWarning />);
    fireEvent.click(screen.getByRole('button', { name: /Switch wallet to Testnet/i }));
    expect(await screen.findByText(/Network switch was rejected/)).toBeInTheDocument();
    expect(switchWalletNetwork).toHaveBeenCalledWith('testnet');
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('shows an invalidated network and clears the warning only after a matching reading', () => {
    vi.mocked(useWallet).mockReturnValue(walletState({ isConnected: true, walletNetwork: 'testnet' }));
    const { container, rerender } = render(<NetworkWarning />);
    expect(container.firstChild).toBeNull();
    vi.mocked(useWallet).mockReturnValue(walletState({ isConnected: true, walletNetwork: null }));
    rerender(<NetworkWarning />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    vi.mocked(useWallet).mockReturnValue(walletState({ isConnected: true, walletNetwork: 'mainnet' }));
    rerender(<NetworkWarning />);
    expect(screen.getByText('Mainnet')).toBeInTheDocument();
    vi.mocked(useWallet).mockReturnValue(walletState({ isConnected: true, walletNetwork: 'testnet' }));
    rerender(<NetworkWarning />);
    expect(container.firstChild).toBeNull();
  });

  it('renders inherited network names as unsupported text', () => {
    vi.mocked(useWallet).mockReturnValue(walletState({ isConnected: true, walletNetwork: 'constructor' }));
    render(<NetworkWarning />);
    expect(screen.getByText('constructor')).toBeInTheDocument();
    expect(screen.getByText(/Connected network is not supported/)).toBeInTheDocument();
  });

  it('disables repeated switching while the provider request is pending', () => {
    vi.mocked(useWallet).mockReturnValue(walletState({ isConnected: true, walletNetwork: null }));
    vi.mocked(useAppContext).mockReturnValue({ switchWalletNetwork, switchingNetwork: true });
    render(<NetworkWarning />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
