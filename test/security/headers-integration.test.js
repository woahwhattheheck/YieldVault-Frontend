import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildSecurityHeaders } from '../../security/policy.mjs';

const root = join(process.cwd());

function parseNetlifyHeaders(text) {
  const lines = text.split('\n');
  const headers = {};
  let inBlock = false;
  for (const line of lines) {
    if (line.trim() === '/*') {
      inBlock = true;
      continue;
    }
    if (!inBlock) continue;
    if (!line.startsWith('  ')) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(2, idx).trim();
    const value = line.slice(idx + 1).trim();
    headers[key] = value;
  }
  return headers;
}

describe('hosting header integration', () => {
  const expected = buildSecurityHeaders();

  it('public/_headers matches the policy source of truth', () => {
    const path = join(root, 'public', '_headers');
    expect(existsSync(path)).toBe(true);
    const actual = parseNetlifyHeaders(readFileSync(path, 'utf8'));
    for (const [key, value] of Object.entries(expected)) {
      expect(actual[key], key).toBe(value);
    }
  });

  it('vercel.json headers match the policy source of truth', () => {
    const path = join(root, 'vercel.json');
    expect(existsSync(path)).toBe(true);
    const config = JSON.parse(readFileSync(path, 'utf8'));
    expect(Array.isArray(config.headers)).toBe(true);
    const route = config.headers.find((h) => h.source === '/(.*)');
    expect(route).toBeTruthy();
    const actual = Object.fromEntries(route.headers.map((h) => [h.key, h.value]));
    for (const [key, value] of Object.entries(expected)) {
      expect(actual[key], key).toBe(value);
    }
  });

  it('regression: CI workflow runs the dependency audit gate', () => {
    const ci = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
    expect(ci).toMatch(/npm run audit:deps/);
    expect(ci).toMatch(/smoke:headers/);
  });
});
