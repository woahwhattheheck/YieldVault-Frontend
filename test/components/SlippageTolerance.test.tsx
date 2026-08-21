import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AppProvider } from '../../src/context/AppContext';
import SlippageTolerance from '../../src/components/SlippageTolerance';

describe('SlippageTolerance', () => {
  const STORAGE_KEY = 'yieldvault:slippage-tolerance';

  const renderWithProvider = () => {
    return render(
      <AppProvider>
        <SlippageTolerance />
      </AppProvider>
    );
  };

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders slippage label and preset buttons', () => {
    renderWithProvider();
    expect(screen.getByText('Slippage')).toBeInTheDocument();
    expect(screen.getByText('0.1%')).toBeInTheDocument();
    expect(screen.getByText('0.5%')).toBeInTheDocument();
    expect(screen.getByText('1.0%')).toBeInTheDocument();
  });

  it('renders custom input field', () => {
    renderWithProvider();
    const customInput = screen.getByLabelText('Custom slippage tolerance');
    expect(customInput).toBeInTheDocument();
    expect(customInput).toHaveAttribute('type', 'number');
  });

  it('selects preset button on click', () => {
    renderWithProvider();
    const preset0_1 = screen.getByText('0.1%');
    const preset0_5 = screen.getByText('0.5%');
    
    // Initially 0.5% should be active (default)
    expect(preset0_5).toHaveClass('slippage-preset-active');
    
    // Click 0.1% preset
    fireEvent.click(preset0_1);
    expect(preset0_1).toHaveClass('slippage-preset-active');
    expect(preset0_5).not.toHaveClass('slippage-preset-active');
  });

  it('updates custom input value on change', () => {
    renderWithProvider();
    const customInput = screen.getByLabelText('Custom slippage tolerance');
    
    fireEvent.change(customInput, { target: { value: '2.5' } });
    expect(customInput).toHaveValue(2.5);
  });

  it('activates custom mode when focusing input', () => {
    renderWithProvider();
    const customInput = screen.getByLabelText('Custom slippage tolerance');
    const preset0_5 = screen.getByText('0.5%');
    
    // Initially preset should be active
    expect(preset0_5).toHaveClass('slippage-preset-active');
    
    // Focus custom input
    fireEvent.focus(customInput);
    expect(customInput.parentElement).toHaveClass('slippage-custom-active');
  });

  it('clamps custom value to valid range on blur', () => {
    renderWithProvider();
    const customInput = screen.getByLabelText('Custom slippage tolerance');
    
    // Test value above max
    fireEvent.change(customInput, { target: { value: '60' } });
    fireEvent.blur(customInput);
    expect(customInput).toHaveValue(50);
    
    // Test value below min
    fireEvent.change(customInput, { target: { value: '-5' } });
    fireEvent.blur(customInput);
    expect(customInput).toHaveValue(0.5);
  });

  it('persists slippage tolerance to localStorage', () => {
    renderWithProvider();
    const preset1_0 = screen.getByText('1.0%');
    
    fireEvent.click(preset1_0);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('1');
  });

  it('loads initial state from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, '0.1');
    renderWithProvider();
    const preset0_1 = screen.getByText('0.1%');
    expect(preset0_1).toHaveClass('slippage-preset-active');
  });

  it('defaults to 0.5% when localStorage is empty', () => {
    renderWithProvider();
    const preset0_5 = screen.getByText('0.5%');
    expect(preset0_5).toHaveClass('slippage-preset-active');
  });

  it('handles invalid custom input on blur', () => {
    renderWithProvider();
    const customInput = screen.getByLabelText('Custom slippage tolerance');
    
    // Enter invalid value
    fireEvent.change(customInput, { target: { value: 'abc' } });
    fireEvent.blur(customInput);
    expect(customInput).toHaveValue(0.5);
  });

  it('switches between preset and custom modes', () => {
    renderWithProvider();
    const preset0_5 = screen.getByText('0.5%');
    const customInput = screen.getByLabelText('Custom slippage tolerance');
    
    // Start with preset
    expect(preset0_5).toHaveClass('slippage-preset-active');
    
    // Switch to custom
    fireEvent.focus(customInput);
    fireEvent.change(customInput, { target: { value: '3.0' } });
    expect(preset0_5).not.toHaveClass('slippage-preset-active');
    
    // Switch back to preset
    fireEvent.click(preset0_5);
    expect(preset0_5).toHaveClass('slippage-preset-active');
  });
});
