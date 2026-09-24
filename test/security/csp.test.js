import { describe, it, expect } from 'vitest';
import {
  CSP_DIRECTIVES,
  CSP_EXCEPTIONS,
  WALLET_CONNECT_ORIGINS,
  buildCspHeader,
  buildSecurityHeaders,
} from '../../security/policy.mjs';
import { NETWORKS } from '../../src/lib/networks.js';

describe('CSP policy', () => {
  const csp = buildCspHeader();
  const headers = buildSecurityHeaders();

  it('builds a non-empty Content-Security-Policy', () => {
    expect(csp.length).toBeGreaterThan(40);
    expect(headers['Content-Security-Policy']).toBe(csp);
  });

  it('denies by default and blocks plugins / framing', () => {
    expect(CSP_DIRECTIVES['default-src']).toEqual(["'self'"]);
    expect(CSP_DIRECTIVES['object-src']).toEqual(["'none'"]);
    expect(CSP_DIRECTIVES['frame-ancestors']).toEqual(["'none'"]);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('regression: script-src must not allow unsafe-inline or unsafe-eval', () => {
    const scriptSrc = CSP_DIRECTIVES['script-src'].join(' ');
    expect(scriptSrc).toBe("'self'");
    expect(scriptSrc).not.toMatch(/unsafe-inline/);
    expect(scriptSrc).not.toMatch(/unsafe-eval/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-eval/);
  });

  it('allows Stellar wallet/network origins required by NETWORKS catalog', () => {
    for (const network of Object.values(NETWORKS)) {
      expect(WALLET_CONNECT_ORIGINS).toContain(network.horizonUrl);
      expect(WALLET_CONNECT_ORIGINS).toContain(network.sorobanRpcUrl);
      expect(csp).toContain(network.horizonUrl);
      expect(csp).toContain(network.sorobanRpcUrl);
    }
  });

  it('documents every exception with a non-empty justification', () => {
    expect(CSP_EXCEPTIONS.length).toBeGreaterThan(0);
    for (const exception of CSP_EXCEPTIONS) {
      expect(exception.directive).toBeTruthy();
      expect(exception.value).toBeTruthy();
      expect(exception.reason.length).toBeGreaterThan(20);
    }
  });

  it('includes related hardening headers', () => {
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['Strict-Transport-Security']).toMatch(/max-age=31536000/);
    expect(headers['Permissions-Policy']).toMatch(/camera=\(\)/);
    expect(headers['Cross-Origin-Opener-Policy']).toBe('same-origin');
  });
});
