import { describe, it, expect } from 'vitest';
import {
  getLocaleSeparators,
  parseLocaleAmount,
  serializeAmount,
  formatLocaleAmount,
  roundTripCanonical,
} from '../../src/utils/localeAmount.js';

describe('localeAmount', () => {
  it('detects en-US and de-DE separators', () => {
    expect(getLocaleSeparators('en-US')).toEqual({ decimal: '.', group: ',' });
    const de = getLocaleSeparators('de-DE');
    expect(de.decimal).toBe(',');
    expect(de.group).toMatch(/\.|\u00a0|\s/);
  });

  it('parses en-US grouped input to canonical', () => {
    const result = parseLocaleAmount('1,234.50', { locale: 'en-US' });
    expect(result.ok).toBe(true);
    expect(result.canonical).toBe('1234.50');
    expect(result.value).toBe(1234.5);
  });

  it('parses de-DE decimal comma input to canonical', () => {
    const result = parseLocaleAmount('1234,56', { locale: 'de-DE' });
    expect(result.ok).toBe(true);
    expect(result.canonical).toBe('1234.56');
  });

  it('rejects negative, excess precision, and non-numeric input', () => {
    expect(parseLocaleAmount('-5', { locale: 'en-US' }).ok).toBe(false);
    expect(
      parseLocaleAmount('1.12345678', { locale: 'en-US', maxFractionDigits: 7 }).ok,
    ).toBe(false);
    expect(parseLocaleAmount('abc', { locale: 'en-US' }).ok).toBe(false);
  });

  it('serializeAmount is deterministic across locales for the same canonical', () => {
    const a = serializeAmount('1.25', { locale: 'en-US' });
    const b = serializeAmount('1,25', { locale: 'de-DE' });
    expect(a).toBe('1.25');
    expect(b).toBe('1.25');
  });

  it('formatLocaleAmount is display-only and does not alter serialize', () => {
    const displayed = formatLocaleAmount('1234.5', { locale: 'en-US', maxFractionDigits: 2 });
    expect(displayed).toContain('1');
    expect(serializeAmount('1234.5', { locale: 'en-US' })).toBe('1234.5');
  });

  it('round-trips en-US and de-DE inputs', () => {
    const en = roundTripCanonical('2,500.25', 'en-US');
    expect(en.ok).toBe(true);
    expect(en.canonical).toBe('2500.25');

    const de = roundTripCanonical('2500,25', 'de-DE');
    expect(de.ok).toBe(true);
    expect(de.canonical).toBe('2500.25');
  });

  it('rejects values outside the safe numeric range', () => {
    const result = parseLocaleAmount(String(Number.MAX_SAFE_INTEGER) + '0', {
      locale: 'en-US',
    });
    expect(result.ok).toBe(false);
  });
});
