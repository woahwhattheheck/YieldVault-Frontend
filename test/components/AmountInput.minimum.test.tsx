import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AmountInput from '../../src/components/AmountInput';

function ControlledMinimum({ min, locale = 'en-US', initialValue = '6' }: {
  min: string;
  locale?: string;
  initialValue?: string;
}) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  return <>
    <AmountInput value={value} onChange={setValue} onValidationError={setError}
      min={min} locale={locale} />
    <output data-testid="canonical">{value}</output>
    <output data-testid="error">{error}</output>
  </>;
}

describe('AmountInput canonical minimum', () => {
  it.each([
    ['en-US', '5.24', '5.250', '5.25'],
    ['de-DE', '5,24', '5,250', '5,25'],
    ['fr-FR', '5,24', '5,250', '5,25'],
  ])('rejects a below-minimum %s draft and accepts the exact boundary', (locale, below, equal, displayMin) => {
    render(<ControlledMinimum min="5.25" locale={locale} />);
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: below } });
    fireEvent.blur(input);
    expect(input).toHaveValue(below);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('canonical')).toBeEmptyDOMElement();
    expect(screen.getByTestId('error')).toHaveTextContent(`Amount must be at least ${displayMin}`);

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: equal } });
    expect(input).toHaveValue(equal);
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(screen.getByTestId('canonical')).toHaveTextContent('5.250');
    expect(screen.getByTestId('error')).toBeEmptyDOMElement();
  });

  it('distinguishes fractional bounds which become the same binary number', () => {
    const below = '123456789012.1234567';
    const minimum = '123456789012.1234568';
    expect(Number(below)).toBe(Number(minimum));
    render(<ControlledMinimum min={minimum} initialValue="" />);
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: below } });
    expect(screen.getByTestId('canonical')).toBeEmptyDOMElement();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(input, { target: { value: minimum } });
    expect(screen.getByTestId('canonical')).toHaveTextContent(minimum);
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('compares integer lengths and treats trailing fractional zeros as equal', () => {
    render(<ControlledMinimum min="10.000" initialValue="" />);
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '9.99' } });
    expect(screen.getByTestId('canonical')).toBeEmptyDOMElement();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(input, { target: { value: '10' } });
    expect(screen.getByTestId('canonical')).toHaveTextContent('10');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('revalidates the same controlled value when its minimum changes while focused', () => {
    const { rerender } = render(<ControlledMinimum min="1" initialValue="1" />);
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '2' } });
    expect(input).not.toHaveAttribute('aria-invalid');
    rerender(<ControlledMinimum min="3" initialValue="1" />);
    expect(input).toHaveValue('2');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('error')).toHaveTextContent('Amount must be at least 3');
    rerender(<ControlledMinimum min="1" initialValue="1" />);
    expect(input).toHaveValue('2');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(screen.getByTestId('error')).toBeEmptyDOMElement();
  });

  it('validates external values and reports an invalid minimum without keeping a submitted edit', () => {
    const { rerender } = render(<ControlledMinimum min="10" initialValue="5" />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('5');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('error')).toHaveTextContent('Amount must be at least 10');
    rerender(<ControlledMinimum min="not-an-amount" initialValue="5" />);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '20' } });
    expect(input).toHaveValue('20');
    expect(screen.getByTestId('canonical')).toBeEmptyDOMElement();
    expect(screen.getByTestId('error')).toHaveTextContent('Minimum amount is invalid');
    fireEvent.change(input, { target: { value: '' } });
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(screen.getByTestId('error')).toBeEmptyDOMElement();
  });
});
