import { describe, it, expect } from 'vitest';
import {
  getLocaleSeparators,
  parseLocaleAmount,
  serializeAmount,
  formatLocaleAmount,
  roundTripCanonical,
} from '../../src/utils/localeAmount.js';

describe('localeAmount', () => {
  it.each([
    [0, 7, '0'],
    [1.25, 7, '1.25'],
    [1e-6, 7, '0.000001'],
    [1e-7, 7, '0.0000001'],
    [1.25e-7, 9, '0.000000125'],
    [1e-8, 8, '0.00000001'],
    [Number.MIN_VALUE, 324, `0.${'0'.repeat(323)}5`],
    [Number.MAX_SAFE_INTEGER, 7, '9007199254740991'],
  ])('serializes numeric %s as decimal text at precision %s', (input, maxFractionDigits, canonical) => {
    for (const locale of ['en-US', 'de-DE', 'fr-FR', 'hi-IN']) {
      const options = { locale, maxFractionDigits };
      expect(parseLocaleAmount(input, options)).toEqual({ ok: true, canonical, value: input });
      expect(serializeAmount(input, options)).toBe(canonical);
    }
  });

  it.each([
    [1e-8, 7],
    [1.25e-7, 7],
    [1e-7, 0],
    [Number.MIN_VALUE, 7],
  ])('rejects numeric %s beyond precision %s without rounding', (input, maxFractionDigits) => {
    const error = `Amount supports at most ${maxFractionDigits} decimal places`;
    expect(parseLocaleAmount(input, { maxFractionDigits })).toEqual({ ok: false, error });
    expect(() => serializeAmount(input, { maxFractionDigits })).toThrow(error);
  });

  it.each([
    [NaN, 'Amount must be a finite number'],
    [Infinity, 'Amount must be a finite number'],
    [-Infinity, 'Amount must be a finite number'],
    [-1e-7, 'Amount cannot be negative'],
    [Number.MAX_VALUE, 'Amount supports at most 7 decimal places'],
    [Number.MAX_SAFE_INTEGER + 1, 'Amount is outside the supported numeric range'],
  ])('preserves numeric rejection for %s', (input, error) => {
    expect(parseLocaleAmount(input)).toEqual({ ok: false, error });
    expect(() => serializeAmount(input)).toThrow(error);
  });

  it.each([
    ['en-US', '1,25'], ['en-US', '1,2,3'], ['en-US', ',123'],
    ['en-US', '123,'], ['en-US', '1,,234'], ['en-US', '1234,567'],
    ['en-US', '1,23,456'], ['en-US', '1.2,5'], ['en-US', '1 234'],
    ['en-US', '1\u00a0234'], ['de-DE', '1.25'], ['de-DE', '1..234'],
    ['de-DE', '1,2.5'], ['de-DE', '1234.567'], ['fr-FR', '1 2'],
    ['fr-FR', '1\u202f23'], ['fr-FR', '1\u00a0\u00a0234'],
    ['fr-FR', '1,2\u202f5'], ['hi-IN', '123,456'],
    ['hi-IN', '1,234,567'],
  ])('rejects malformed grouping in %s: %s', (locale, input) => {
    expect(parseLocaleAmount(input, { locale })).toEqual({
      ok: false, error: 'Amount format is invalid',
    });
    expect(() => serializeAmount(input, { locale })).toThrow('Amount format is invalid');
  });

  it.each([
    ['en-US', '1,234,567.125', '1234567.125'],
    ['de-DE', '1.234.567,125', '1234567.125'],
    ['fr-FR', '1\u202f234\u202f567,125', '1234567.125'],
    ['fr-FR', '1 234 567,125', '1234567.125'],
    ['fr-FR', '1\u00a0234\u00a0567,125', '1234567.125'],
    ['hi-IN', '12,34,567.125', '1234567.125'],
    ['sv-SE', '1\u00a0234,125', '1234.125'],
    ['de-CH', new Intl.NumberFormat('de-CH').format(1234.125), '1234.125'],
    ['en-US', '0001234.50', '1234.50'],
    ['de-DE', '1234,50', '1234.50'],
    ['en-US', '0.0000001', '0.0000001'],
    ['de-DE', '0,0000001', '0.0000001'],
    ['en-US', '  1,234.50  ', '1234.50'],
    ['en-US', '9,007,199,254,740,991', '9007199254740991'],
  ])('preserves valid grouping and precision in %s: %s', (locale, input, canonical) => {
    expect(serializeAmount(input, { locale })).toBe(canonical);
    expect(parseLocaleAmount(input, { locale })).toEqual({ ok: true, canonical, value: Number(canonical) });
  });

  it.each(['en-US', 'de-DE', 'fr-FR', 'hi-IN', 'sv-SE', 'de-CH'])('round-trips formatted grouped amounts in %s', (locale) => {
    for (const canonical of ['0', '12.125', '1234.125', '1234567.125', '123456789.125']) {
      const display = formatLocaleAmount(canonical, { locale, maxFractionDigits: 7 });
      expect(serializeAmount(display, { locale })).toBe(canonical);
    }
  });

  it.each([['en-US', '-1,234.5'], ['de-DE', '-1.234,5'], ['fr-FR', '-1\u202f234,5']])('keeps the negative-amount rejection in %s', (locale, input) => {
    expect(parseLocaleAmount(input, { locale })).toEqual({ ok: false, error: 'Amount cannot be negative' });
  });

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
