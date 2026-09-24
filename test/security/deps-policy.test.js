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
