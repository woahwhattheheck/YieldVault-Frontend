import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Navbar from '../../src/components/Navbar';
import DepositForm from '../../src/components/DepositForm';
import { AppProvider } from '../../src/context/AppContext';
import * as walletService from '../../src/services/wallet.js';

describe('Navbar', () => {
  const STORAGE_KEY = 'yieldvault:nav-collapsed';

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Clean up after each test
    localStorage.clear();
  });

  it('renders navigation links and brand', () => {
    render(<Navbar />);
    expect(screen.getByText('YieldVault')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Positions')).toBeInTheDocument();
    expect(screen.getByText('Wizard')).toBeInTheDocument();
  });

  it('renders navigation toggle button', () => {
    render(<Navbar />);
    const toggleButton = screen.getByRole('button', { name: /collapse navigation/i });
    expect(toggleButton).toBeInTheDocument();
  });

  it('shares wallet connection and disconnection with forms in the enclosing app provider', async () => {
    vi.spyOn(walletService, 'connect').mockResolvedValue({ address: 'GSHAREDWALLET' });
    vi.spyOn(walletService, 'getBalances').mockResolvedValue({ USDC: 12500, XLM: 48000, EURC: 3200 });
    vi.spyOn(walletService, 'getNetwork').mockResolvedValue('testnet');
    vi.spyOn(walletService, 'disconnect').mockResolvedValue(undefined);
    render(
      <AppProvider>
        <Navbar />
        <DepositForm vault={{ id: 'usdc-vault', asset: 'USDC', totalAssets: 4820000, totalShares: 4600000 }} />
      </AppProvider>,
    );
    const amount = screen.getByRole('textbox', { name: 'Amount' });
    expect(amount).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Connect Wallet', exact: true }));
    await screen.findByRole('button', { name: 'Disconnect', exact: true });
    await waitFor(() => expect(amount).toBeEnabled());
    expect(screen.getByText('Balance: 12,500.00 USDC')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deposit maximum 12,500.00 USDC' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect', exact: true }));
    await waitFor(() => expect(amount).toBeDisabled());
    expect(screen.getByText('Balance: 0.00 USDC')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect wallet to deposit', exact: true })).toBeDisabled();
  });

  it('toggles navigation collapse state on button click', () => {
    render(<Navbar />);
    const toggleButton = screen.getByRole('button', { name: /collapse navigation/i });
    const navLinks = screen.getByRole('navigation').querySelector('.nav-links');

    // Initially expanded
    expect(navLinks).not.toHaveClass('nav-links-collapsed');

    // Click to collapse
    fireEvent.click(toggleButton);
    expect(navLinks).toHaveClass('nav-links-collapsed');

    // Click to expand
    fireEvent.click(toggleButton);
    expect(navLinks).not.toHaveClass('nav-links-collapsed');
  });

  it('persists collapse state to localStorage', () => {
    render(<Navbar />);
    const toggleButton = screen.getByRole('button', { name: /collapse navigation/i });

    // Collapse the navigation
    fireEvent.click(toggleButton);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');

    // Expand the navigation
    fireEvent.click(toggleButton);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false');
  });

  it('loads initial state from localStorage', () => {
    // Set collapsed state in localStorage before rendering
    localStorage.setItem(STORAGE_KEY, 'true');
    render(<Navbar />);
    const navLinks = screen.getByRole('navigation').querySelector('.nav-links');
    expect(navLinks).toHaveClass('nav-links-collapsed');
  });

  it('defaults to expanded state when localStorage is empty', () => {
    render(<Navbar />);
    const navLinks = screen.getByRole('navigation').querySelector('.nav-links');
    expect(navLinks).not.toHaveClass('nav-links-collapsed');
  });

  it('updates aria-expanded attribute on toggle', () => {
    render(<Navbar />);
    const toggleButton = screen.getByRole('button', { name: /collapse navigation/i });

    // Initially expanded
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true');

    // Click to collapse
    fireEvent.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');

    // Click to expand
    fireEvent.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
  });

  it('updates aria-label on toggle', () => {
    render(<Navbar />);
    const toggleButton = screen.getByRole('button', { name: /collapse navigation/i });

    // Initially shows "Collapse navigation"
    expect(toggleButton).toHaveAttribute('aria-label', 'Collapse navigation');

    // Click to collapse - should show "Expand navigation"
    fireEvent.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-label', 'Expand navigation');
  });

  it('handles localStorage errors gracefully', () => {
    // Mock localStorage to throw an error
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = () => {
      throw new Error('Storage unavailable');
    };

    render(<Navbar />);
    const toggleButton = screen.getByRole('button', { name: /collapse navigation/i });

    // Should not throw error when toggling
    expect(() => fireEvent.click(toggleButton)).not.toThrow();

    // Restore original localStorage.setItem
    localStorage.setItem = originalSetItem;
  });
});
