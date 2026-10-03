import React, { useState, useEffect, useRef } from 'react';
import {
  getLocaleSeparators,
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
  const [validationError, setValidationError] = useState<string | null>(null);
  const pendingEdit = useRef<{
    value: string;
    locale: string;
    maxFractionDigits: number;
  } | null>(null);

  useEffect(() => {
    const pending = pendingEdit.current;
    if (
      pending?.value === value &&
      pending.locale === locale &&
      pending.maxFractionDigits === maxFractionDigits &&
      (focused || validationError !== null)
    ) {
      // A controlled-parent echo must preserve the localized draft, including
      // a trailing decimal separator or a rejected edit whose canonical value
      // was cleared. External value/locale changes still resynchronize below.
      return;
    }
    pendingEdit.current = null;
    if (!value) {
      setDisplayValue('');
      setValidationError(null);
      return;
    }
    try {
      const canonical = serializeAmount(value, { locale: 'en-US', maxFractionDigits });
      setDisplayValue(
        focused
          ? canonical.replace('.', getLocaleSeparators(locale).decimal)
          : formatLocaleAmount(canonical, { locale, maxFractionDigits }),
      );
      setValidationError(null);
    } catch (error) {
      setDisplayValue(value);
      setValidationError(error instanceof Error ? error.message : 'Amount format is invalid');
    }
  }, [value, locale, maxFractionDigits, focused, validationError]);

  useEffect(() => {
    onValidationError?.(validationError);
  }, [onValidationError, validationError]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    if (inputValue.trim() === '') {
      pendingEdit.current = { value: '', locale, maxFractionDigits };
      onChange('');
      setValidationError(null);
      setDisplayValue('');
      return;
    }

    const parsed = parseLocaleAmount(inputValue, { locale, maxFractionDigits });
    if (!parsed.ok) {
      // Reject the canonical value too, so callers cannot submit an earlier
      // valid amount while the field displays a different, invalid draft.
      pendingEdit.current = { value: '', locale, maxFractionDigits };
      onChange('');
      setDisplayValue(inputValue);
      setValidationError(parsed.error);
      return;
    }

    pendingEdit.current = { value: parsed.canonical, locale, maxFractionDigits };
    setValidationError(null);
    onChange(parsed.canonical);
    setDisplayValue(focused ? inputValue : formatLocaleAmount(parsed.canonical, { locale, maxFractionDigits }));
  };

  const handleBlur = () => {
    setFocused(false);
  };

  const handleFocus = () => {
    setFocused(true);
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
      aria-invalid={validationError ? true : undefined}
    />
  );
}
