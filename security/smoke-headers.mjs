#!/usr/bin/env node
/**
 * Production header smoke test.
 * Builds (if dist missing), starts `vite preview`, and asserts security headers.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { buildSecurityHeaders } from './policy.mjs';

const PORT = Number(process.env.SMOKE_PORT || 4173);
const BASE = `http://127.0.0.1:${PORT}/`;
const expected = buildSecurityHeaders();

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok || res.status === 404 || res.status === 200) return;
    } catch {
      /* retry */
    }
    await wait(250);
  }
  throw new Error(`Server did not become ready at ${url}`);
}

async function main() {
  if (!existsSync('dist/index.html')) {
    console.log('smoke-headers: dist/ missing — running npm run build...');
    const build = spawn('npm', ['run', 'build'], { stdio: 'inherit' });
    const code = await new Promise((resolve) => build.on('exit', resolve));
    if (code !== 0) process.exit(code ?? 1);
  }

  const preview = spawn(
    'npx',
    ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  let stderr = '';
  preview.stderr.on('data', (c) => {
    stderr += c.toString();
  });
  preview.stdout.on('data', () => {});

  try {
    await waitForServer(BASE);
    const res = await fetch(BASE, { method: 'GET' });
    const missing = [];
    const mismatched = [];

    for (const [name, value] of Object.entries(expected)) {
      const actual = res.headers.get(name.toLowerCase());
      if (actual == null) {
        missing.push(name);
        continue;
      }
      // Header values should match exactly for CSP and most hardening headers.
      if (actual.replace(/\s+/g, ' ').trim() !== String(value).replace(/\s+/g, ' ').trim()) {
        mismatched.push({ name, expected: value, actual });
      }
    }

    if (missing.length || mismatched.length) {
      console.error('smoke-headers: FAIL');
      if (missing.length) console.error('  missing:', missing.join(', '));
      for (const m of mismatched) {
        console.error(`  mismatch ${m.name}`);
        console.error(`    expected: ${m.expected}`);
        console.error(`    actual:   ${m.actual}`);
      }
      process.exit(1);
    }

    // Regression: no secrets-shaped tokens in HTML shell.
    const html = await res.text();
    const secretPatterns = [
      /(?:sk|pk)_live_[A-Za-z0-9]+/,
      /BEGIN (?:RSA |EC )?PRIVATE KEY/,
      /api[_-]?key\s*[:=]\s*['\"][A-Za-z0-9_\-]{16,}/i,
    ];
    for (const re of secretPatterns) {
      if (re.test(html)) {
        console.error(`smoke-headers: FAIL — secret-like pattern in HTML: ${re}`);
        process.exit(1);
      }
    }

    // Regression: production index must not use inline script bodies.
    if (/<script(?![^>]*\bsrc=)[^>]*>\s*\S+/i.test(html)) {
      console.error('smoke-headers: FAIL — inline <script> body detected in production HTML');
      process.exit(1);
    }

    console.log('smoke-headers: OK — CSP and related headers present; no inline script bodies');
    process.exit(0);
  } catch (err) {
    console.error('smoke-headers: ERROR', err.message);
    if (stderr) console.error(stderr);
    process.exit(1);
  } finally {
    preview.kill('SIGTERM');
  }
}

main();
