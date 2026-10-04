/**
 * Locale-aware amount parsing and display helpers.
 *
 * Display formatting is kept separate from transaction serialization:
 * - `parseLocaleAmount` → canonical decimal string (ASCII digits + `.`)
 * - `serializeAmount` → the string that should be signed / submitted
 * - `formatLocaleAmount` → human display only
 */

const DEFAULT_MAX_FRACTION = 7;

/**
 * Resolve decimal / group separators for a locale via Intl.
 * @param {string} [locale]
 * @returns {{ decimal: string, group: string }}
 */
export function getLocaleSeparators(locale = 'en-US') {
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
  const decimal = parts.find((p) => p.type === 'decimal')?.value ?? '.';
  const group = parts.find((p) => p.type === 'group')?.value ?? ',';
  return { decimal, group };
}

/**
 * Parse a user-entered amount for `locale` into a canonical decimal string
 * (no group separators, `.` as the radix). Returns null when invalid.
 *
 * @param {string|number|null|undefined} input
 * @param {{ locale?: string, maxFractionDigits?: number }} [options]
 * @returns {{ ok: true, canonical: string, value: number } | { ok: false, error: string }}
 */
export function parseLocaleAmount(input, options = {}) {
  const locale = options.locale || 'en-US';
  const maxFraction = options.maxFractionDigits ?? DEFAULT_MAX_FRACTION;

  if (input === null || input === undefined) {
    return { ok: false, error: 'Amount is required' };
  }

  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      return { ok: false, error: 'Amount must be a finite number' };
    }
    if (input < 0) {
      return { ok: false, error: 'Amount cannot be negative' };
    }
    const numeric = String(input);
    const [coefficient, exponent] = numeric.split('e-');
    // Expand small values without rounding. Keep large positive exponents on
    // their existing rejection path.
    const canonical = trimCanonical(
      exponent === undefined
        ? numeric
        : `0.${'0'.repeat(Number(exponent) - 1)}${coefficient.replace('.', '')}`,
    );
    return finalizeCanonical(canonical, maxFraction);
  }

  if (typeof input !== 'string') {
    return { ok: false, error: 'Amount must be a string or number' };
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: 'Amount is required' };
  }

  const { decimal, group } = getLocaleSeparators(locale);
  const parts = trimmed.split(decimal);
  if (parts.length > 2 || (parts.length === 2 && !/^\d+$/.test(parts[1]))) {
    return { ok: false, error: 'Amount format is invalid' };
  }
  const sign = parts[0].startsWith('-') ? '-' : '';
  let integer = sign ? parts[0].slice(1) : parts[0];
  // Space-grouping locales commonly receive regular/NBSP/narrow-NBSP input
  // from keyboards and copied text. Accept them only at valid group boundaries.
  if (/^[ \u00a0\u202f]$/.test(group)) {
    integer = integer.replace(/[ \u00a0\u202f]/g, group);
  }
  const groups = integer.split(group);
  if (!groups.every((part) => /^\d+$/.test(part))) {
    return { ok: false, error: 'Amount format is invalid' };
  }
  if (groups.length > 1) {
    // The rightmost and preceding groups may differ (e.g. 12,34,567 in hi-IN).
    const widths = new Intl.NumberFormat(locale).formatToParts(1234567890123)
      .filter((part) => part.type === 'integer').map((part) => part.value.length);
    const primary = widths[widths.length - 1];
    const secondary = widths[widths.length - 2] ?? primary;
    if (groups[0].length > secondary || groups[groups.length - 1].length !== primary ||
        groups.slice(1, -1).some((part) => part.length !== secondary)) {
      return { ok: false, error: 'Amount format is invalid' };
    }
  }
  // Normalize only after validating the original grouping and fractional part.
  const normalized = sign + groups.join('') + (parts.length === 2 ? `.${parts[1]}` : '');

  // After normalization only ASCII digits, optional leading sign, one `.`.
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    return { ok: false, error: 'Amount format is invalid' };
  }

  if (normalized.startsWith('-')) {
    return { ok: false, error: 'Amount cannot be negative' };
  }

  return finalizeCanonical(trimCanonical(normalized), maxFraction);
}

/**
 * @param {string} canonical
 * @param {number} maxFraction
 */
function finalizeCanonical(canonical, maxFraction) {
  const fraction = canonical.includes('.') ? canonical.split('.')[1] : '';
  if (fraction.length > maxFraction) {
    return {
      ok: false,
      error: `Amount supports at most ${maxFraction} decimal places`,
    };
  }

  const value = Number(canonical);
  if (!Number.isFinite(value)) {
    return { ok: false, error: 'Amount is outside the supported numeric range' };
  }
  // A fraction above the largest supported integer can round back down
  // during Number conversion. Compare that exact decimal boundary as text.
  const aboveExactMaximum = canonical.split('.')[0] === String(Number.MAX_SAFE_INTEGER)
    && /[1-9]/.test(fraction);
  if (Math.abs(value) > Number.MAX_SAFE_INTEGER || aboveExactMaximum) {
    return { ok: false, error: 'Amount is outside the supported numeric range' };
  }
  if (value < 0) {
    return { ok: false, error: 'Amount cannot be negative' };
  }

  return { ok: true, canonical, value };
}

function trimCanonical(s) {
  if (!s.includes('.')) return s.replace(/^0+(?=\d)/, '') || '0';
  let [i, f] = s.split('.');
  i = i.replace(/^0+(?=\d)/, '') || '0';
  return `${i}.${f}`;
}

/**
 * Canonical string used for transaction serialization. Never use locale
 * formatted display output for signing.
 *
 * @param {string|number} input
 * @param {{ locale?: string, maxFractionDigits?: number }} [options]
 * @returns {string}
 */
export function serializeAmount(input, options = {}) {
  const parsed = parseLocaleAmount(input, options);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.canonical;
}

/**
 * Display-only formatting. Does not affect serialization.
 *
 * @param {string|number} value - canonical amount or number
 * @param {{ locale?: string, maxFractionDigits?: number, minFractionDigits?: number }} [options]
 * @returns {string}
 */
export function formatLocaleAmount(value, options = {}) {
  const locale = options.locale || 'en-US';
  const maxFraction = options.maxFractionDigits ?? 2;
  const minFraction = options.minFractionDigits ?? 0;
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return '';
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: minFraction,
    maximumFractionDigits: maxFraction,
    useGrouping: true,
  // Intl accepts exact decimal strings; converting them to Number first
  // would discard supported digits before the configured display rounding.
  }).format(typeof value === 'string' ? value : num);
}

/**
 * Round-trip check: parse → format → parse should yield the same canonical.
 * @param {string} input
 * @param {string} locale
 * @param {number} [maxFractionDigits]
 */
export function roundTripCanonical(input, locale, maxFractionDigits = DEFAULT_MAX_FRACTION) {
  const first = parseLocaleAmount(input, { locale, maxFractionDigits });
  if (!first.ok) return first;
  const displayed = formatLocaleAmount(first.canonical, {
    locale,
    maxFractionDigits,
    minFractionDigits: 0,
  });
  return parseLocaleAmount(displayed, { locale, maxFractionDigits });
}

export default {
  getLocaleSeparators,
  parseLocaleAmount,
  serializeAmount,
  formatLocaleAmount,
  roundTripCanonical,
};
