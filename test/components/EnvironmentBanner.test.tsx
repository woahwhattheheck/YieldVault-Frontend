import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import EnvironmentBanner from '../../src/components/EnvironmentBanner';

describe('EnvironmentBanner', () => {
  it('renders banner when network is testnet', () => {
    render(<EnvironmentBanner network="testnet" />);
    expect(screen.getByText('⚠️ Testnet Environment')).toBeInTheDocument();
  });

  it('has correct banner role and aria-label', () => {
    render(<EnvironmentBanner network="testnet" />);
    const banner = screen.getByRole('banner');
    expect(banner).toHaveAttribute('aria-label', 'Testnet environment');
  });

  it('does not render when network is mainnet', () => {
    const { container } = render(<EnvironmentBanner network="mainnet" />);
    expect(container.firstChild).toBeNull();
  });
});
