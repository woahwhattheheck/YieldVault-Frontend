import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import WalletButton from '../../src/components/WalletButton';

// Mock the hooks
vi.mock('../../src/hooks/useWallet.js', () => ({
  useWallet: () => ({
    isConnected: true,
    address: 'GABC123XYZ789',
    connecting: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

vi.mock('../../src/hooks/useClipboard.js', () => ({
  useClipboard: () => ({
    copied: false,
    copy: vi.fn(),
  }),
}));

describe('WalletButton', () => {
  it('renders wallet address button with aria-label', () => {
    render(<WalletButton />);
    const addressButton = screen.getByRole('button', { name: /Copy GABC123XYZ789/i });
    expect(addressButton).toBeInTheDocument();
    expect(addressButton).toHaveAttribute('aria-label', 'Copy GABC123XYZ789');
  });

  it('updates aria-label when address is copied', () => {
    const { useClipboard } = require('../../src/hooks/useClipboard.js');
    useClipboard.mockReturnValue({
      copied: true,
      copy: vi.fn(),
    });

    render(<WalletButton />);
    const addressButton = screen.getByRole('button', { name: /Copied!/i });
    expect(addressButton).toBeInTheDocument();
    expect(addressButton).toHaveAttribute('aria-label', 'Copied!');
  });
});
