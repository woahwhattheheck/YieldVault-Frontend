import React, { useState, useEffect } from 'react';
import {
  parseLocaleAmount,
  formatLocaleAmount,
  serializeAmount,
} from '../utils/localeAmount.js';

interface AmountInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  min?: string;
  step?: string;
  id?: string;
  className?: string;
  /** BCP-47 locale for display separators. Serialization stays canonical. */
  locale?: string;
  maxFractionDigits?: number;
  /** Optional callback when parse fails (negative, excess precision, etc.). */
  onValidationError?: (message: string | null) => void;
}

/**
 * Amount input with locale-aware display separators.
 * The value passed to `onChange` is always the canonical decimal string
 * (`.` radix, no grouping) so transaction serialization never depends on
 * the user's locale.
 */
export default function AmountInput({
  value,
  onChange,
  disabled = false,
  placeholder = '0.00',
  min = '0',
  step = 'any',
  id,
  className = '',
  locale = typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US',
  maxFractionDigits = 7,
  onValidationError,
}: AmountInputProps) {
  const [displayValue, setDisplayValue] = useState('');
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (focused) {
      setDisplayValue(value);
      return;
    }
    if (!value) {
      setDisplayValue('');
      return;
    }
    try {
      setDisplayValue(
        formatLocaleAmount(serializeAmount(value, { locale: 'en-US', maxFractionDigits }), {
          locale,
          maxFractionDigits,
        }),
      );
    } catch {
      setDisplayValue(value);
    }
  }, [value, locale, maxFractionDigits, focused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    if (inputValue.trim() === '') {
      onChange('');
      onValidationError?.(null);
      setDisplayValue('');
      return;
    }

    const parsed = parseLocaleAmount(inputValue, { locale, maxFractionDigits });
    if (!parsed.ok) {
      // Keep the raw keystrokes visible while editing, but do not promote
      // an invalid value into the serialized amount.
      setDisplayValue(inputValue);
      onValidationError?.(parsed.error);
      return;
    }

    onValidationError?.(null);
    onChange(parsed.canonical);
    setDisplayValue(focused ? parsed.canonical : formatLocaleAmount(parsed.canonical, { locale, maxFractionDigits }));
  };

  const handleBlur = () => {
    setFocused(false);
    if (!value) {
      setDisplayValue('');
      return;
    }
    try {
      setDisplayValue(
        formatLocaleAmount(serializeAmount(value, { locale: 'en-US', maxFractionDigits }), {
          locale,
          maxFractionDigits,
        }),
      );
    } catch {
      setDisplayValue(value);
    }
  };

  const handleFocus = () => {
    setFocused(true);
    setDisplayValue(value);
  };

  return (
    <input
      id={id}
      type="text"
      min={min}
      step={step}
      placeholder={placeholder}
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      disabled={disabled}
      className={className}
      inputMode="decimal"
      aria-invalid={undefined}
    />
  );
}
