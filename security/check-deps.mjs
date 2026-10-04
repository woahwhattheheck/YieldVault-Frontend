#!/usr/bin/env node
/**
 * Dependency vulnerability + license gate.
 *
 * Exit codes:
 *   0 — policy satisfied (critical-free; no disallowed licenses)
 *   1 — policy violation (critical vulns and/or disallowed licenses)
 *   2 — tooling failure (audit could not run)
 *
 * Warnings (high/moderate/low, UNKNOWN licenses) print to stderr but do not fail.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEPENDENCY_POLICY,
  isLicenseAllowed,
} from './policy.mjs';

function collectPackageLicenses(nodeModulesDir) {
  const findings = [];
  if (!existsSync(nodeModulesDir)) return findings;

  function considerPkg(pkgDir) {
    const manifestPath = join(pkgDir, 'package.json');
    if (!existsSync(manifestPath)) return;
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch {
      return;
    }
    if (!manifest.name || !manifest.version) return;

    let license = manifest.license;
    if (license && typeof license === 'object') {
      license = license.type || JSON.stringify(license);
    }
    if (Array.isArray(manifest.licenses)) {
      license = manifest.licenses
        .map((l) => (typeof l === 'object' ? l.type : l))
        .filter(Boolean)
        .join(' OR ');
    }
    if (!license) license = 'UNKNOWN';

    findings.push({
      name: manifest.name,
      version: manifest.version,
      license: String(license),
      path: pkgDir,
    });
  }

  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === '.bin' || entry === '.package-lock.json') continue;
      const full = join(dir, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (!st.isDirectory()) continue;

      if (entry.startsWith('@')) {
        // scoped packages
        let scopes;
        try {
          scopes = readdirSync(full);
        } catch {
          continue;
        }
        for (const scoped of scopes) {
          const scopedDir = join(full, scoped);
          try {
            if (statSync(scopedDir).isDirectory()) considerPkg(scopedDir);
          } catch {
            /* ignore */
          }
        }
        continue;
      }

      considerPkg(full);
      // Do not descend into nested node_modules of each package for license —
      // npm hoists; nested copies are rare and noisy. Production tree is enough
      // via top-level + scoped packages under node_modules.
    }
  }

  walk(nodeModulesDir);
  return findings;
}

function main() {
  const policy = DEPENDENCY_POLICY;
  let failed = false;

  console.log('dependency-gate: running npm audit (production tree)...');
  // Audit the full tree (prod+dev) so CI catches toolchain CVEs too; failure
  // still only trips on failSeverities (critical by default).
  const fullAudit = spawnSync('npm', ['audit', '--json'], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  // npm uses exit 1 for a completed audit with findings. Other failures must
  // never be interpreted as an empty, clean vulnerability report.
  if (fullAudit.error || fullAudit.signal || ![0, 1].includes(fullAudit.status)) {
    console.error(
      'dependency-gate: npm audit did not complete:',
      fullAudit.error?.code || fullAudit.signal || `exit ${fullAudit.status}`,
    );
    process.exit(2);
  }
  let report;
  try {
    report = JSON.parse(fullAudit.stdout);
  } catch (err) {
    console.error('dependency-gate: failed to parse npm audit JSON:', err.message);
    process.exit(2);
  }

  const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const severities = ['info', 'low', 'moderate', 'high', 'critical'];
  const vulns = report?.vulnerabilities;
  const counts = report?.metadata?.vulnerabilities;
  if (
    !isRecord(report) || report.error || report.auditReportVersion !== 2 ||
    !isRecord(vulns) || !isRecord(counts) ||
    ![...severities, 'total'].every((key) => Number.isSafeInteger(counts[key]) && counts[key] >= 0) ||
    !Object.values(vulns).every((entry) => isRecord(entry) && severities.includes(entry.severity))
  ) {
    console.error('dependency-gate: npm audit returned an error or an incomplete vulnerability report');
    process.exit(2);
  }
  console.log(
    `dependency-gate: vulnerability summary — critical=${counts.critical ?? 0} high=${counts.high ?? 0} moderate=${counts.moderate ?? 0} low=${counts.low ?? 0}`,
  );

  const criticalHits = [];
  const warnHits = [];

  for (const [name, entry] of Object.entries(vulns)) {
    const severity = entry.severity || 'info';
    if (policy.failSeverities.includes(severity)) {
      criticalHits.push({ name, severity, via: entry.via });
    } else if (policy.warnSeverities.includes(severity)) {
      warnHits.push({ name, severity });
    }
  }

  for (const hit of warnHits) {
    console.warn(`dependency-gate: WARN ${hit.severity} — ${hit.name}`);
  }

  if (criticalHits.length > 0) {
    failed = true;
    console.error(
      `dependency-gate: FAIL — ${criticalHits.length} critical finding(s) (policy: fail on ${policy.failSeverities.join(', ')})`,
    );
    for (const hit of criticalHits) {
      console.error(`  - ${hit.name} (${hit.severity})`);
    }
    console.error(
      'dependency-gate: actionable next step — upgrade or replace the listed packages, re-run `npm run audit:deps`, and commit the lockfile.',
    );
  } else {
    console.log('dependency-gate: OK — no critical vulnerability findings');
  }

  console.log('dependency-gate: scanning licenses in node_modules...');
  const licenses = collectPackageLicenses(join(process.cwd(), 'node_modules'));
  const disallowed = [];
  const unknown = [];

  for (const pkg of licenses) {
    if (pkg.license === 'UNKNOWN') {
      unknown.push(pkg);
      continue;
    }
    if (!isLicenseAllowed(pkg.license, policy)) {
      disallowed.push(pkg);
    }
  }

  for (const pkg of unknown) {
    console.warn(`dependency-gate: WARN UNKNOWN license — ${pkg.name}@${pkg.version}`);
  }

  if (disallowed.length > 0) {
    failed = true;
    console.error(
      `dependency-gate: FAIL — ${disallowed.length} package(s) with disallowed licenses`,
    );
    for (const pkg of disallowed) {
      console.error(`  - ${pkg.name}@${pkg.version}: ${pkg.license}`);
    }
    console.error(
      'dependency-gate: actionable next step — remove/replace the package or extend DEPENDENCY_POLICY.allowedLicenses with a documented justification.',
    );
  } else {
    console.log(
      `dependency-gate: OK — ${licenses.length} packages scanned, no disallowed licenses`,
    );
  }

  if (failed) process.exit(1);
  process.exit(0);
}

main();
