import { describe, it, expect } from 'vitest';
import {
  DEPENDENCY_POLICY,
  isLicenseAllowed,
} from '../../security/policy.mjs';

describe('dependency failure policy', () => {
  it('fails CI on critical findings only (high is warn)', () => {
    expect(DEPENDENCY_POLICY.failSeverities).toEqual(['critical']);
    expect(DEPENDENCY_POLICY.warnSeverities).toContain('high');
    expect(DEPENDENCY_POLICY.warnSeverities).not.toContain('critical');
  });

  it('allows common permissive licenses used by the toolchain', () => {
    for (const license of ['MIT', 'Apache-2.0', 'ISC', 'BSD-3-Clause', 'MPL-2.0', '0BSD']) {
      expect(isLicenseAllowed(license)).toBe(true);
    }
  });

  it('allows SPDX OR expressions when any clause is allowlisted', () => {
    expect(isLicenseAllowed('(MIT OR Apache-2.0)')).toBe(true);
    expect(isLicenseAllowed('MIT AND BSD-3-Clause')).toBe(true);
  });

  it.each([
    'MIT AND LicenseRef-NotApproved',
    'LicenseRef-NotApproved AND MIT',
    '(MIT OR Apache-2.0) AND LicenseRef-NotApproved',
    'MIT AND (LicenseRef-NotApproved OR LicenseRef-AlsoNotApproved)',
    '(MIT OR GPL-3.0) AND LicenseRef-NotApproved',
  ])('rejects an unapproved mandatory license in %s', (license) => {
    expect(isLicenseAllowed(license)).toBe(false);
  });

  it.each([
    '(MIT AND GPL-3.0) OR Apache-2.0',
    'MIT OR (Apache-2.0 AND GPL-3.0)',
    'MIT OR Apache-2.0 AND GPL-3.0',
    'GPL-3.0 AND Apache-2.0 OR MIT',
    'MIT AND (GPL-3.0 OR Apache-2.0)',
    '(MIT OR GPL-3.0) AND Apache-2.0',
    '((MIT))',
    'MIT AND(Apache-2.0 OR GPL-3.0)',
  ])('preserves a fully approved choice in %s', (license) => {
    expect(isLicenseAllowed(license)).toBe(true);
  });

  it('requires an exception to be approved with its license', () => {
    expect(isLicenseAllowed('MIT AND Apache-2.0 WITH LLVM-exception')).toBe(true);
    expect(isLicenseAllowed('MIT AND Apache-2.0 WITH LicenseRef-Unapproved')).toBe(false);
    expect(isLicenseAllowed('MIT OR Apache-2.0 WITH LicenseRef-Unapproved')).toBe(true);
  });

  it.each([
    '(MIT OR Apache-2.0',
    'MIT OR Apache-2.0)',
    'MIT OR',
    'OR MIT',
    'MIT OR ()',
    'MIT OR (GPL-3.0 AND)',
    'MIT OR OR Apache-2.0',
    'MIT OR Apache-2.0 WITH',
    'MIT OR Apache-2.0 WITH (LLVM-exception)',
    'MIT OR Apache-2.0 extra-token',
    'MIT OR !invalid',
  ])('rejects malformed expressions even with an allowed alternative: %s', (license) => {
    expect(isLicenseAllowed(license)).toBe(false);
  });

  it('rejects copyleft / proprietary licenses that are not dual-licensed', () => {
    expect(isLicenseAllowed('GPL-3.0')).toBe(false);
    expect(isLicenseAllowed('AGPL-3.0-only')).toBe(false);
    expect(isLicenseAllowed('SSPL-1.0')).toBe(false);
    expect(isLicenseAllowed('BUSL-1.1')).toBe(false);
    expect(isLicenseAllowed('UNKNOWN')).toBe(false);
  });

  it('package.json exposes audit:deps script for CI', async () => {
    const pkg = JSON.parse(
      await (await import('node:fs')).promises.readFile('package.json', 'utf8'),
    );
    expect(pkg.scripts['audit:deps']).toMatch(/check-deps/);
    expect(pkg.scripts['security:emit-headers']).toMatch(/emit-hosting-headers/);
    expect(pkg.scripts['smoke:headers']).toMatch(/smoke-headers/);
  });
});
