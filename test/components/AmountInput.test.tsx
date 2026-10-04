import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import AmountInput from '../../src/components/AmountInput';
import DepositForm from '../../src/components/DepositForm';
import WithdrawForm from '../../src/components/WithdrawForm';
import * as vaultService from '../../src/services/vault.js';
import * as walletService from '../../src/services/wallet.js';

vi.mock('../../src/hooks/useWallet.js', () => ({
  useWallet: () => ({ isConnected: true, balanceOf: () => 1000 }),
}));
vi.mock('../../src/hooks/usePositions.js', () => ({
  usePositions: () => ({ positions: [{ vaultId: 'locale-vault', value: 1000 }] }),
}));
vi.mock('../../src/services/vault.js', () => ({
  deposit: vi.fn().mockResolvedValue({}),
  withdraw: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../src/services/wallet.js', () => ({
  signAndSubmit: vi.fn().mockResolvedValue({}),
}));

function ControlledAmountInput({ locale, initialValue = '' }: {
  locale: string;
  initialValue?: string;
}) {
  const [value, setValue] = useState(initialValue);
  return <>
    <AmountInput value={value} onChange={setValue} locale={locale} />
    <output data-testid="canonical-amount">{value}</output>
  </>;
}

describe('AmountInput', () => {
  it('renders with default props', () => {
    render(<AmountInput value="" onChange={() => {}} />);
    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('placeholder', '0.00');
  });

  it('displays value with thousands separators', () => {
    render(<AmountInput value="1000" onChange={() => {}} />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('1,000');
  });

  it('displays large numbers with separators', () => {
    render(<AmountInput value="1000000" onChange={() => {}} />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('1,000,000');
  });

  it('displays decimal values correctly', () => {
    render(<AmountInput value="1234.56" onChange={() => {}} />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('1,234.56');
  });

  it('handles empty value', () => {
    render(<AmountInput value="" onChange={() => {}} />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('');
  });

  it('calls onChange with sanitized value', () => {
    const handleChange = vi.fn();
    render(<AmountInput value="" onChange={handleChange} />);
    
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '1,000' } });
    
    expect(handleChange).toHaveBeenCalledWith('1000');
  });

  it('rejects non-numeric text without silently changing the entered amount', () => {
    const handleChange = vi.fn();
    const handleError = vi.fn();
    render(<AmountInput value="" onChange={handleChange} onValidationError={handleError} />);
    
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'abc123.45def' } });
    
    expect(handleChange).toHaveBeenCalledWith('');
    expect(input).toHaveValue('abc123.45def');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(handleError).toHaveBeenLastCalledWith('Amount format is invalid');
  });

  it('rejects multiple decimal points without merging their digits', () => {
    const handleChange = vi.fn();
    const handleError = vi.fn();
    render(<AmountInput value="" onChange={handleChange} onValidationError={handleError} />);
    
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '123.45.67' } });
    
    expect(handleChange).toHaveBeenCalledWith('');
    expect(input).toHaveValue('123.45.67');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(handleError).toHaveBeenLastCalledWith('Amount format is invalid');
  });

  it('shows raw value on focus', () => {
    render(<AmountInput value="1000" onChange={() => {}} />);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('1,000');
    
    fireEvent.focus(input);
    expect(input).toHaveValue('1000');
  });

  it('reformats on blur', () => {
    render(<AmountInput value="1000" onChange={() => {}} />);
    
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    expect(input).toHaveValue('1000');
    
    fireEvent.blur(input);
    expect(input).toHaveValue('1,000');
  });

  it('can be disabled', () => {
    render(<AmountInput value="1000" onChange={() => {}} disabled />);
    const input = screen.getByRole('textbox');
    expect(input).toBeDisabled();
  });

  it('accepts custom placeholder', () => {
    render(<AmountInput value="" onChange={() => {}} placeholder="Enter amount" />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('placeholder', 'Enter amount');
  });

  it('accepts custom id', () => {
    render(<AmountInput value="" onChange={() => {}} id="custom-id" />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('id', 'custom-id');
  });

  it('marks an externally supplied negative amount as invalid', () => {
    const handleError = vi.fn();
    render(<AmountInput value="-1000" onChange={() => {}} onValidationError={handleError} />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('-1000');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(handleError).toHaveBeenLastCalledWith('Amount cannot be negative');
  });

  it('handles zero', () => {
    render(<AmountInput value="0" onChange={() => {}} />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('0');
  });

  it('guards against precision loss on very large numbers', () => {
    const maxSafe = Number.MAX_SAFE_INTEGER;
    render(<AmountInput value={String(maxSafe)} onChange={() => {}} />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('9,007,199,254,740,991');
  });

  it('does not format numbers exceeding MAX_SAFE_INTEGER', () => {
    const tooLarge = String(Number.MAX_SAFE_INTEGER + 1);
    render(<AmountInput value={tooLarge} onChange={() => {}} />);
    const input = screen.getByRole('textbox');
    // Should display the raw string since it cannot be safely parsed
    expect(input).toHaveValue(tooLarge);
  });

  it('handles large numbers within safe range', () => {
    render(<AmountInput value="9007199254740990" onChange={() => {}} />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('9,007,199,254,740,990');
  });

  it.each(['en-US', 'de-DE', 'fr-FR'])('keeps the amount unchanged when editing an existing decimal in %s', (locale) => {
    render(<ControlledAmountInput locale={locale} initialValue="12.3" />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: `${input.value}4` } });

    expect(screen.getByTestId('canonical-amount')).toHaveTextContent('12.34');
    expect(input).toHaveValue(locale === 'en-US' ? '12.34' : '12,34');
  });

  it('keeps the locale radix through consecutive controlled keystrokes', () => {
    render(<ControlledAmountInput locale="de-DE" />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.focus(input);
    for (const character of '1,23') {
      fireEvent.change(input, { target: { value: input.value + character } });
    }

    expect(input).toHaveValue('1,23');
    expect(screen.getByTestId('canonical-amount')).toHaveTextContent('1.23');
  });

  it('keeps a rejected draft visible on blur and accepts its correction', () => {
    render(<ControlledAmountInput locale="de-DE" initialValue="1" />);
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '1,12345678' } });
    fireEvent.blur(input);

    expect(input).toHaveValue('1,12345678');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('canonical-amount')).toBeEmptyDOMElement();

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '1,1234567' } });
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(screen.getByTestId('canonical-amount')).toHaveTextContent('1.1234567');
  });

  it('resynchronizes external values and locale changes while focused', () => {
    const handleChange = vi.fn();
    const { rerender } = render(<AmountInput value="12.3" onChange={handleChange} locale="en-US" />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.focus(input);
    rerender(<AmountInput value="25.67" onChange={handleChange} locale="de-DE" />);

    expect(input).toHaveValue('25,67');
    fireEvent.change(input, { target: { value: input.value + '8' } });
    expect(handleChange).toHaveBeenLastCalledWith('25.678');
  });

  it.each([
    ['en-US', '1,25', '1.25'], ['de-DE', '1.25', '1,25'],
    ['fr-FR', '1 25', '1,25'], ['en-US', '1.2,5', '1.25'],
    ['de-DE', '1,2.5', '1,25'], ['fr-FR', '1,2\u202f5', '1,25'],
  ])('keeps malformed %s grouping visible, clears its canonical value and accepts correction', (locale, invalid, valid) => {
    render(<ControlledAmountInput locale={locale} initialValue="10" />);
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: invalid } });
    fireEvent.blur(input);
    expect(input).toHaveValue(invalid);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('canonical-amount')).toBeEmptyDOMElement();

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: valid } });
    expect(input).toHaveValue(valid);
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(screen.getByTestId('canonical-amount')).toHaveTextContent('1.25');
  });
});

describe('amount rejection reaches deposit and withdrawal', () => {
  const vault = { id: 'locale-vault', asset: 'USDC', totalAssets: 1000, totalShares: 1000 };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    { Form: DepositForm, label: 'Deposit', operation: vaultService.deposit },
    { Form: WithdrawForm, label: 'Withdraw', operation: vaultService.withdraw },
  ].flatMap((form) => [
    { ...form, locale: 'en-US', invalid: '1,25', valid: '1.25' },
    { ...form, locale: 'de-DE', invalid: '1.25', valid: '1,25' },
    { ...form, locale: 'fr-FR', invalid: '1 25', valid: '1,25' },
  ]))('$label blocks malformed $locale grouping until corrected', async ({ Form, label, operation, locale, invalid, valid }) => {
    const language = vi.spyOn(navigator, 'language', 'get').mockReturnValue(locale);
    try {
      render(<Form vault={vault} />);
      const input = screen.getByRole('textbox');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: '10' } });
      expect(screen.getByRole('button', { name: label })).toBeEnabled();
      fireEvent.change(input, { target: { value: invalid } });
      fireEvent.blur(input);
      expect(input).toHaveValue(invalid);
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByText('Amount format is invalid')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: label })).toBeDisabled();
      fireEvent.submit(input.closest('form')!);
      expect(operation).not.toHaveBeenCalled();
      expect(walletService.signAndSubmit).not.toHaveBeenCalled();

      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: valid } });
      expect(screen.getByRole('button', { name: label })).toBeEnabled();
      fireEvent.click(screen.getByRole('button', { name: label }));
      await waitFor(() => {
        expect(operation).toHaveBeenCalledWith('locale-vault', 1.25);
        expect(walletService.signAndSubmit).toHaveBeenCalledWith(`${label} 1.25 USDC`);
      });
    } finally {
      language.mockRestore();
    }
  });

  it.each([
    { Form: DepositForm, label: 'Deposit', operation: vaultService.deposit },
    { Form: WithdrawForm, label: 'Withdraw', operation: vaultService.withdraw },
  ])('$label cannot submit an earlier valid amount after an invalid edit', async ({ Form, label, operation }) => {
    render(<Form vault={vault} />);
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '10' } });
    expect(screen.getByRole('button', { name: label })).toBeEnabled();

    fireEvent.change(input, { target: { value: '10x' } });
    fireEvent.click(screen.getByRole('button', { name: label }));

    expect(operation).not.toHaveBeenCalled();
    expect(walletService.signAndSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: label })).toBeDisabled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Amount format is invalid')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '11' } });
    expect(screen.getByRole('button', { name: label })).toBeEnabled();
    expect(screen.queryByText('Amount format is invalid')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() => {
      expect(operation).toHaveBeenCalledWith('locale-vault', 11);
      expect(walletService.signAndSubmit).toHaveBeenCalledWith(`${label} 11 USDC`);
    });
  });
});


describe('exact canonical amount remains visible', () => {
  it.each([
    ['en-US', '123,456,789,012.1234567', '123456789012.1234567', '123,456,789,012.1234568'],
    ['de-DE', '123.456.789.012,1234567', '123456789012,1234567', '123.456.789.012,1234568'],
    ['fr-FR', '123\u202f456\u202f789\u202f012,1234567', '123456789012,1234567', '123\u202f456\u202f789\u202f012,1234568'],
    ['hi-IN', '1,23,45,67,89,012.1234567', '123456789012.1234567', '1,23,45,67,89,012.1234568'],
  ])('preserves all seven decimal digits through focus, edit and blur in %s', (locale, display, editing, editedDisplay) => {
    render(<ControlledAmountInput locale={locale} initialValue="123456789012.1234567" />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue(display);
    expect(screen.getByTestId('canonical-amount')).toHaveTextContent('123456789012.1234567');
    fireEvent.focus(input);
    expect(input).toHaveValue(editing);
    fireEvent.change(input, { target: { value: `${editing.slice(0, -1)}8` } });
    fireEvent.blur(input);
    expect(input).toHaveValue(editedDisplay);
    expect(screen.getByTestId('canonical-amount')).toHaveTextContent('123456789012.1234568');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it.each([['en-US', '.'], ['de-DE', ',']])('clears a fractional out-of-range amount in %s', (locale, decimal) => {
    render(<ControlledAmountInput locale={locale} initialValue="10" />);
    const input = screen.getByRole('textbox');
    const invalid = `9007199254740991${decimal}0000001`;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: invalid } });
    fireEvent.blur(input);
    expect(input).toHaveValue(invalid);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('canonical-amount')).toBeEmptyDOMElement();
  });
});
