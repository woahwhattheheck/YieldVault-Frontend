/**
 * Production security policy for the YieldVault frontend.
 *
 * Single source of truth for:
 * - Content-Security-Policy (and justified exceptions)
 * - Related hardening headers
 * - Dependency vulnerability / license CI gates
 *
 * Hosting configs (public/_headers, vercel.json) and the Vite preview
 * plugin are derived from this module so production and local smoke
 * checks cannot drift.
 */

/** Stellar RPC / Horizon origins required for Freighter-style wallet flows. */
export const WALLET_CONNECT_ORIGINS = Object.freeze([
  // Horizon (account + classic tx submission)
  'https://horizon-testnet.stellar.org',
  'https://horizon.stellar.org',
  // Soroban RPC (smart-contract simulate / submit)
  'https://soroban-testnet.stellar.org',
  'https://soroban-rpc.mainnet.stellar.gateway.fm',
  // Optional Futurenet for contributor testing
  'https://soroban-rpc-futurenet.stellar.org',
  'https://horizon-futurenet.stellar.org',
]);

/**
 * Justified CSP exceptions. Each entry must stay narrow and documented —
 * do not widen without updating tests and this table.
 */
export const CSP_EXCEPTIONS = Object.freeze([
  {
    directive: 'style-src',
    value: "'unsafe-inline'",
    reason:
      'React components set dynamic inline styles (e.g. ChartContainer aspect-ratio). ' +
      'Nonce/hash migration is deferred until style extraction covers those call sites.',
  },
  {
    directive: 'img-src',
    value: 'data: blob:',
    reason:
      'html2canvas chart export creates blob: object URLs; some SVG/icon paths use data: URIs.',
  },
  {
    directive: 'connect-src',
    value: WALLET_CONNECT_ORIGINS.join(' '),
    reason:
      'Freighter (and compatible Stellar wallets) talk to the page via an extension ' +
      'content-script bridge, so chrome-extension: origins are not required here. ' +
      'The page itself must reach Horizon + Soroban RPC for network reads/submits once ' +
      'mock services are replaced. Origins are pinned to the NETWORKS catalog in ' +
      'src/lib/networks.js plus Futurenet for contributor testing.',
  },
  {
    directive: 'worker-src',
    value: 'blob:',
    reason:
      'Vite production chunks and some Stellar SDK helpers may spawn blob: workers; ' +
      'keeping worker-src off default-src avoids accidental remote worker loads.',
  },
]);

/**
 * Restrictive CSP directives. script-src intentionally omits 'unsafe-inline'
 * and 'unsafe-eval' — production Vite emits module scripts under 'self' only.
 */
export const CSP_DIRECTIVES = Object.freeze({
  'default-src': ["'self'"],
  'base-uri': ["'self'"],
  'object-src': ["'none'"],
  'frame-ancestors': ["'none'"],
  'form-action': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:'],
  'font-src': ["'self'", 'data:'],
  'connect-src': ["'self'", ...WALLET_CONNECT_ORIGINS],
  'worker-src': ["'self'", 'blob:'],
  'manifest-src': ["'self'"],
  'upgrade-insecure-requests': [],
});

/** Build the Content-Security-Policy header value. */
export function buildCspHeader(directives = CSP_DIRECTIVES) {
  return Object.entries(directives)
    .map(([name, values]) => {
      if (!values || values.length === 0) return name;
      return `${name} ${values.join(' ')}`;
    })
    .join('; ');
}

/** Related production security headers (CSP included). */
export function buildSecurityHeaders() {
  return Object.freeze({
    'Content-Security-Policy': buildCspHeader(),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy':
      'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'X-DNS-Prefetch-Control': 'off',
  });
}

/**
 * Dependency CI failure policy.
 *
 * - Vulnerabilities at `failSeverities` fail the build (exit 1).
 * - Lower severities are reported as warnings and do not fail CI.
 * - Disallowed licenses fail the build; UNKNOWN is warned (nested stub
 *   package.json files often omit a license field).
 */
export const DEPENDENCY_POLICY = Object.freeze({
  failSeverities: Object.freeze(['critical']),
  warnSeverities: Object.freeze(['high', 'moderate', 'low', 'info']),
  allowedLicenses: Object.freeze([
    'MIT',
    'MIT-0',
    'Apache-2.0',
    'Apache-2.0 WITH LLVM-exception',
    'BSD-2-Clause',
    'BSD-3-Clause',
    'BSD-3-Clause-Clear',
    'ISC',
    '0BSD',
    'CC0-1.0',
    'CC-BY-3.0',
    'CC-BY-4.0',
    'Unlicense',
    'MPL-2.0',
    'BlueOak-1.0.0',
    'Python-2.0',
    'Artistic-2.0',
    'Zlib',
    'WTFPL',
  ]),
  /** SPDX / name patterns that always fail CI when present alone. */
  disallowedLicensePatterns: Object.freeze([
    /^AGPL/i,
    /^GPL/i,
    /^SSPL/i,
    /Commons Clause/i,
    /^BUSL/i,
    /^Commercial/i,
    /^Proprietary/i,
  ]),
});

/** True when a license expression has a complete choice allowed by policy. */
export function isLicenseAllowed(license, policy = DEPENDENCY_POLICY) {
  if (!license || license === 'UNKNOWN') return false;
  const tokens = String(license).trim().match(/[()]|[^()\s]+/g) || [];
  const values = [];
  const operators = [];
  const precedence = { OR: 1, AND: 2 };
  let expectLicense = true;

  const isIdentifier = (token) =>
    typeof token === 'string' &&
    /^[A-Za-z0-9.-]+$/.test(token) &&
    !/^(AND|OR|WITH)$/i.test(token);
  const isSimpleExpression = (token) => {
    if (/^(?:DocumentRef-|LicenseRef-)/.test(token || '')) {
      return /^(?:DocumentRef-[A-Za-z0-9.-]+:)?LicenseRef-[A-Za-z0-9.-]+$/.test(token);
    }
    return isIdentifier(token?.replace(/\+$/, ''));
  };
  const applyOperator = () => {
    const right = values.pop();
    const left = values.pop();
    const operator = operators.pop();
    values.push(operator === 'AND' ? left && right : left || right);
  };

  // SPDX groups bind first, then AND, then OR. Evaluate every operand so an
  // allowed left-hand choice cannot hide a malformed remainder. Explicit stacks
  // also avoid recursion through dependency-supplied parentheses.
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const operator = token.toUpperCase();

    if (expectLicense) {
      if (token === '(') {
        operators.push(token);
        continue;
      }
      if (!isSimpleExpression(token)) return false;

      let term = token;
      if (tokens[index + 1]?.toUpperCase() === 'WITH') {
        const exception = tokens[index + 2];
        if (!isIdentifier(exception)) return false;
        term += ` WITH ${exception}`;
        index += 2;
      }
      values.push(
        policy.allowedLicenses.includes(term) &&
          !policy.disallowedLicensePatterns.some((pattern) => pattern.test(term)),
      );
      expectLicense = false;
      continue;
    }

    if (token === ')') {
      while (operators.length && operators.at(-1) !== '(') applyOperator();
      if (operators.pop() !== '(') return false;
      continue;
    }
    if (operator !== 'AND' && operator !== 'OR') return false;
    while (
      operators.length &&
      operators.at(-1) !== '(' &&
      precedence[operators.at(-1)] >= precedence[operator]
    ) {
      applyOperator();
    }
    operators.push(operator);
    expectLicense = true;
  }

  if (expectLicense) return false;
  while (operators.length) {
    if (operators.at(-1) === '(') return false;
    applyOperator();
  }
  return values.length === 1 && values[0];
}
