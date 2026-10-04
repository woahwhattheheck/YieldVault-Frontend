import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  formatLocaleAmount,
  parseLocaleAmount,
  roundTripCanonical,
  serializeAmount,
} from '../../src/utils/localeAmount.js';

const locales = [
  'en-US', 'de-DE', 'fr-FR', 'hi-IN', 'sv-SE', 'de-CH',
  'ar-EG', 'fa-IR', 'bn-BD', 'my-MM', 'zh-Hans-u-nu-hanidec', 'en-u-nu-mathbold',
];

test('locale digits normalize to ASCII without accepting foreign grouping', () => {
  for (const [locale, input, expected] of [
    ['ar-EG', '١٬٢٣٤٫١٢٥', '1234.125'],
    ['fa-IR', '۱٬۲۳۴٫۱۲۵', '1234.125'],
    ['bn-BD', '১,২৩,৪৫৬.১২৫', '123456.125'],
    ['en-u-nu-mathbold', '𝟏,𝟐𝟑𝟒.𝟏𝟐𝟓', '1234.125'],
    ['ar-EG', '1234٫125', '1234.125'],
  ]) {
    assert.equal(serializeAmount(input, { locale }), expected);
  }
  for (const [locale, input] of [
    ['ar-EG', '١٬٢٣'], ['ar-EG', '١٫١٢٣٤٥٦٧٨'], ['ar-EG', '-١٫٢'],
    ['bn-BD', '১,২৩৪,৫৬৭'], ['en-US', '١٢٣٤.٥'],
  ]) {
    assert.equal(parseLocaleAmount(input, { locale }).ok, false);
  }
});

test('the exact safe-range boundary cannot be crossed by fractional rounding', () => {
  for (const canonical of ['9007199254740991.0000001', '9007199254740991.1', '9007199254740992']) {
    for (const locale of locales) {
      const input = new Intl.NumberFormat(locale, { maximumFractionDigits: 7 }).format(canonical);
      assert.deepEqual(parseLocaleAmount(input, { locale }), {
        ok: false, error: 'Amount is outside the supported numeric range',
      });
    }
  }
  for (const canonical of ['9007199254740990.9999999', '9007199254740991', '9007199254740991.0000000']) {
    assert.equal(serializeAmount(canonical), canonical);
  }
});

test('deterministic locale matrix preserves canonical decimal value on round trip', () => {
  const values = ['0', '0.0000001', '12.125', '1234.125', '1234567.125', '1234567890123.4567891'];
  for (let i = 1; i <= 64; i += 1) {
    const whole = 9007199254740990n - BigInt(i) * 7919n;
    const fraction = String((i * 104729) % 1000000).padStart(6, '0') + '1';
    values.push(`${whole}.${fraction}`);
  }
  for (const locale of locales) {
    for (const canonical of values) {
      const displayed = formatLocaleAmount(canonical, { locale, maxFractionDigits: 7 });
      assert.equal(serializeAmount(displayed, { locale }), canonical, `${locale}: ${canonical}`);
      assert.equal(roundTripCanonical(displayed, locale).canonical, canonical);
    }
  }
});
