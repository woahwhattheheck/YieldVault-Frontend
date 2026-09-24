#!/usr/bin/env node
/**
 * Emit production hosting header configs from security/policy.mjs.
 * Writes public/_headers (Netlify / Cloudflare Pages style) and vercel.json.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSecurityHeaders } from './policy.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const headers = buildSecurityHeaders();

function emitNetlifyHeaders() {
  const lines = ['/*'];
  for (const [name, value] of Object.entries(headers)) {
    lines.push(`  ${name}: ${value}`);
  }
  lines.push('');
  const out = join(root, 'public', '_headers');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, lines.join('\n'), 'utf8');
  return out;
}

function emitVercelJson() {
  const path = join(root, 'vercel.json');
  let existing = {};
  if (existsSync(path)) {
    try {
      existing = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      existing = {};
    }
  }

  const headerList = Object.entries(headers).map(([key, value]) => ({ key, value }));
  const next = {
    ...existing,
    headers: [
      {
        source: '/(.*)',
        headers: headerList,
      },
    ],
  };

  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return path;
}

const netlify = emitNetlifyHeaders();
const vercel = emitVercelJson();
console.log(`Wrote ${netlify}`);
console.log(`Wrote ${vercel}`);
