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
    const canonical = trimCanonical(String(input));
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
  // Strip group separators, then normalize the locale decimal to `.`.
  let normalized = '';
  for (const ch of trimmed) {
    if (ch === group) continue;
    if (ch === decimal) {
      normalized += '.';
      continue;
    }
    if (ch === ' ' || ch === '\u00a0') continue;
    normalized += ch;
  }

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
  if (Math.abs(value) > Number.MAX_SAFE_INTEGER) {
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
  }).format(num);
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
