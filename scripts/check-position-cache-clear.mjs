import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export async function checkClearBoundary(source) {
  const { createPositionCache, positionQueryKey } = await import(
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
  );
  const key = positionQueryKey({ actor: 'GABC', network: 'testnet' });
  const checks = [];
  function check(name, run) {
    try {
      const observed = run();
      checks.push({ name, passed: true, observed });
    } catch (error) {
      checks.push({ name, passed: false, error: error.message });
    }
  }
  check('cleared cache rejects a retired response without notifying', () => {
    const cache = createPositionCache();
    const events = [];
    cache.subscribe(key, event => events.push(event));
    const retired = cache.beginFetch(key);
    cache.clear();
    const accepted = cache.setIfCurrent(key, [{ id: 'retired' }], retired);
    assert.equal(accepted, false);
    assert.equal(cache.size, 0);
    assert.equal(cache.get(key), undefined);
    assert.deepEqual(events, []);
    return { accepted, entries: cache.size, notifications: events.length };
  });
  check('a fresh response survives a retired pre-clear response', () => {
    const cache = createPositionCache();
    const retired = cache.beginFetch(key);
    cache.clear();
    const fresh = cache.beginFetch(key);
    assert.equal(cache.setIfCurrent(key, [{ id: 'fresh' }], fresh), true);
    const staleAccepted = cache.setIfCurrent(key, [{ id: 'retired' }], retired);
    assert.equal(staleAccepted, false);
    assert.ok(fresh > retired);
    assert.deepEqual(cache.get(key).data, [{ id: 'fresh' }]);
    // Normal invalidation must still retire the currently active token.
    cache.invalidate(key);
    assert.equal(cache.setIfCurrent(key, [{ id: 'late' }], fresh), false);
    const next = cache.beginFetch(key);
    assert.equal(cache.setIfCurrent(key, [{ id: 'next' }], next), true);
    assert.deepEqual(cache.get(key).data, [{ id: 'next' }]);
    return { retired, fresh, next, staleAccepted };
  });
  return {
    node: process.version,
    sourceBlob: createHash('sha1')
      .update(Buffer.from('blob ' + Buffer.byteLength(source) + '\0'))
      .update(source).digest('hex'),
    checks,
    passed: checks.every(check => check.passed),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length !== 0 && !(args.length === 2 && args[0] === '--baseline-ref')) {
    throw new Error('Usage: node scripts/check-position-cache-clear.mjs [--baseline-ref COMMIT]');
  }
  const source = args.length
    ? execFileSync('git', ['show', args[1] + ':src/utils/positionCache.js'], { encoding: 'utf8' })
    : readFileSync(new URL('../src/utils/positionCache.js', import.meta.url), 'utf8');
  const result = await checkClearBoundary(source);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exitCode = result.passed ? 0 : 1;
}
