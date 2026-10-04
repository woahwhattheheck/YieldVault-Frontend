import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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

describe('dependency audit execution', () => {
  const checker = resolve('security/check-deps.mjs');
  const report = (severity) => ({
    auditReportVersion: 2,
    vulnerabilities: severity ? {example: {severity, via: []}} : {},
    metadata: {
      vulnerabilities: {
        info: 0, low: 0, moderate: 0, high: 0, critical: 0,
        ...(severity ? {[severity]: 1} : {}), total: severity ? 1 : 0,
      },
    },
  });

  function runChecker(auditResult, setup = () => {}) {
    const dir = mkdtempSync(join(tmpdir(), 'yieldvault-audit-'));
    try {
      setup(dir);
      const preload = join(dir, 'audit-result.cjs');
      // Run the complete checker with a controlled npm process result, so
      // registry availability and today's advisories cannot change this check.
      writeFileSync(preload, `
        const childProcess = require('node:child_process');
        childProcess.spawnSync = () => (${JSON.stringify(auditResult)});
        require('node:module').syncBuiltinESMExports();
      `);
      return spawnSync(process.execPath, ['--require', preload, checker], {
        cwd: dir,
        encoding: 'utf8',
        timeout: 5000,
      });
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  }

  it('fails with tooling exit 2 when npm is genuinely unavailable', () => {
    const dir = mkdtempSync(join(tmpdir(), 'yieldvault-no-npm-'));
    try {
      const result = spawnSync(process.execPath, [checker], {
        cwd: dir, encoding: 'utf8', env: {...process.env, PATH: dir},
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('npm audit did not complete');
      expect(result.stdout).not.toContain('no critical vulnerability findings');
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it.each([
    ['terminated audit', {status: null, signal: 'SIGTERM', stdout: JSON.stringify(report())}],
    ['unexpected exit status', {status: 2, stdout: JSON.stringify(report())}],
    ['output buffer failure', {status: 0, error: {code: 'ENOBUFS'}, stdout: JSON.stringify(report())}],
    ['empty output', {status: 0, stdout: ''}],
    ['malformed JSON', {status: 1, stdout: '{'}],
    ['npm error response', {status: 1, stdout: JSON.stringify({error: {code: 'ENOAUDIT'}})}],
    ['incomplete report', {status: 0, stdout: JSON.stringify({vulnerabilities: {}})}],
  ])('fails with tooling exit 2 for %s', (_, auditResult) => {
    const result = runChecker(auditResult);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('dependency-gate:');
    expect(result.stdout).not.toContain('no critical vulnerability findings');
  });

  it.each([
    ['clean', undefined, 0, 0],
    ['high severity', 'high', 1, 0],
    ['critical severity', 'critical', 1, 1],
  ])('preserves %s policy for a completed audit', (_, severity, status, expected) => {
    const result = runChecker({status, stdout: JSON.stringify(report(severity))});
    expect(result.status).toBe(expected);
    if (severity === 'high') expect(result.stderr).toContain('WARN high');
    if (severity === 'critical') expect(result.stderr).toContain('FAIL');
  });

  function installPackage(dir, path, license) {
    const pkgDir = join(dir, 'node_modules', path);
    mkdirSync(pkgDir, {recursive: true});
    writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({
      name: path.split('/node_modules/').at(-1), version: '1.0.0', license,
    }));
    return pkgDir;
  }

  const cleanAudit = {status: 0, stdout: JSON.stringify(report())};

  it.each([
    ['parent', 'child'],
    ['@scope/parent', '@scope/child'],
  ])('rejects a disallowed nested license in %s', (parent, child) => {
    const result = runChecker(cleanAudit, (dir) => {
      installPackage(dir, parent, 'MIT');
      installPackage(dir, `${parent}/node_modules/${child}`, 'GPL-3.0');
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`${child}@1.0.0: GPL-3.0`);
    expect(result.stderr).toContain('1 package(s) with disallowed licenses');
  });

  it('scans multiple dependency levels and preserves allowed and UNKNOWN policy', () => {
    const result = runChecker(cleanAudit, (dir) => {
      installPackage(dir, 'parent', 'MIT');
      installPackage(dir, 'parent/node_modules/child', 'Apache-2.0');
      installPackage(dir, 'parent/node_modules/child/node_modules/leaf', undefined);
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('3 packages scanned, no disallowed licenses');
    expect(result.stderr).toContain('WARN UNKNOWN license — leaf@1.0.0');
  });

  it('scans linked packages once and terminates on a dependency cycle', () => {
    const result = runChecker(cleanAudit, (dir) => {
      const parent = installPackage(dir, 'parent', 'MIT');
      const child = installPackage(dir, 'parent/node_modules/child', undefined);
      symlinkSync(parent, join(dir, 'node_modules/alias'), 'junction');
      mkdirSync(join(child, 'node_modules'));
      symlinkSync(parent, join(child, 'node_modules/back'), 'junction');
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('2 packages scanned, no disallowed licenses');
    expect(result.stderr.match(/WARN UNKNOWN license/g)).toHaveLength(1);
  });
});
