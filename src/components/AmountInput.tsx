import React, { useState, useEffect } from 'react';

interface AmountInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  min?: string;
  step?: string;
  id?: string;
  className?: string;
}

/**
 * Safely parse a string to a number, checking for precision loss.
 * Returns null if the value would lose precision.
 */
function safeParseNumber(value: string): number | null {
  if (!value || value.trim() === '') return null;
  
  const cleanNum = value.replace(/,/g, '');
  const num = parseFloat(cleanNum);
  
  if (isNaN(num)) return null;
  
  // Check if the number is within safe integer range
  if (Math.abs(num) > Number.MAX_SAFE_INTEGER) {
    return null;
  }
  
  return num;
}

/**
 * Amount input component with thousands separators.
 * Formats the display value with commas while maintaining the raw numeric value.
 * Guards against precision loss on large amounts.
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
}: AmountInputProps) {
  const [displayValue, setDisplayValue] = useState('');

  // Format number with thousands separators
  const formatWithSeparators = (numStr: string): string => {
    if (!numStr || numStr === '') return '';
    
    const num = safeParseNumber(numStr);
    
    if (num === null) return numStr;
    
    // Format with thousands separators
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 20,
    });
  };

  // Update display value when the actual value changes
  useEffect(() => {
    setDisplayValue(formatWithSeparators(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    
    // Remove all non-numeric characters except decimal point and minus
    const cleanValue = inputValue.replace(/[^0-9.-]/g, '');
    
    // Allow only one decimal point while preserving all entered digits.
    const decimalIndex = cleanValue.indexOf('.');
    const sanitized = decimalIndex === -1
      ? cleanValue
      : `${cleanValue.slice(0, decimalIndex + 1)}${cleanValue.slice(decimalIndex + 1).replace(/\./g, '')}`;
    
    // Update the actual value (without separators)
    onChange(sanitized);
  };

  const handleBlur = () => {
    // Re-apply formatting on blur to ensure consistent display
    setDisplayValue(formatWithSeparators(value));
  };

  const handleFocus = () => {
    // On focus, show the raw value without separators for easier editing
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
    />
  );
}
