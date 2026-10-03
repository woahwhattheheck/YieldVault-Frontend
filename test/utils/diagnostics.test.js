import { describe, it, expect } from 'vitest';
import {
  REDACTED,
  createCorrelationId,
  redactString,
  redactSecrets,
  containsSensitiveValue,
  classifyError,
  buildSafeDiagnostic,
  captureFailure,
  assertWellFormedResponse,
  createAppError,
  createDependencyError,
} from '../../src/utils/diagnostics.js';

const WALLET = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';
const SECRET = 'SABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';
const CONTRACT = 'CABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';
const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.signature';
const HEX =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('diagnostics', () => {
  it('mints correlation ids with a stable prefix', () => {
    const id = createCorrelationId();
    expect(id).toMatch(/^yv-[a-z0-9]+-[a-z0-9]+$/i);
  });

  it('redacts wallet, secret, contract, bearer, jwt, and hex material', () => {
    const raw = `wallet=${WALLET} secret=${SECRET} contract=${CONTRACT} Bearer abc.def.ghi token=${JWT} key=${HEX}`;
    const safe = redactString(raw);
    expect(safe).not.toContain(WALLET);
    expect(safe).not.toContain(SECRET);
    expect(safe).not.toContain(CONTRACT);
    expect(safe).not.toContain(JWT);
    expect(safe).not.toContain(HEX);
    expect(safe).toContain(REDACTED);
  });

  it('redacts sensitive object keys deeply', () => {
    const safe = redactSecrets({
      address: WALLET,
      authorization: 'Bearer super-secret-token-value',
      nested: { apiKey: 'abc123', note: 'ok' },
      list: [{ privateKey: SECRET }],
    });
    expect(safe.address).toBe(REDACTED);
    expect(safe.authorization).toBe(REDACTED);
    expect(safe.nested.apiKey).toBe(REDACTED);
    expect(safe.nested.note).toBe('ok');
    expect(safe.list[0].privateKey).toBe(REDACTED);
    expect(containsSensitiveValue(safe)).toBe(false);
  });

  it('redacts provider URL credentials and recognizes them before redaction', () => {
    const cases = [
      ['https://demo-user:diagnostic-canary-password@rpc.example.test/v1',
        `https://${REDACTED}@rpc.example.test/v1`],
      ['wss://demo-user:encoded%40canary%3Apassword@rpc.example.test:443/socket',
        `wss://${REDACTED}@rpc.example.test:443/socket`],
      ['postgresql://demo-user:diagnostic-canary-password@[2001:db8::1]:5432/vault',
        `postgresql://${REDACTED}@[2001:db8::1]:5432/vault`],
      ['//demo-user:diagnostic-canary-password@rpc.example.test/v1',
        `//${REDACTED}@rpc.example.test/v1`],
    ];
    for (const [raw, expected] of cases) {
      expect(containsSensitiveValue(raw)).toBe(true);
      const safe = redactString(raw);
      expect(safe).toBe(expected);
      expect(redactString(safe)).toBe(safe);
      expect(containsSensitiveValue(safe)).toBe(false);
    }
  });

  it('keeps ordinary endpoint context and checks credential queries consistently', () => {
    const endpoint = 'https://rpc.example.test:443/users/contact@example.test?network=test';
    expect(redactString(endpoint)).toBe(endpoint);
    expect(containsSensitiveValue(endpoint)).toBe(false);
    const query = 'https://rpc.example.test/v1?api_key=diagnostic-canary-key&network=test';
    expect(containsSensitiveValue(query)).toBe(true);
    const safe = redactString(query);
    expect(safe).toContain(`api_key=${REDACTED}&network=test`);
    expect(containsSensitiveValue(safe)).toBe(false);
  });

  it('classifies dependency failures as retryable', () => {
    const network = classifyError(new TypeError('Failed to fetch'));
    expect(network.retryable).toBe(true);
    expect(network.kind).toBe('retryable');

    const dep = classifyError(createDependencyError('RPC timeout', 503));
    expect(dep.retryable).toBe(true);
    expect(dep.status).toBe(503);
  });

  it('classifies malformed responses as invalid_state', () => {
    expect(() =>
      assertWellFormedResponse(null, { label: 'vault list' }),
    ).toThrow(/Malformed/);

    try {
      assertWellFormedResponse({ foo: 1 }, {
        requireKeys: ['totalTvl', 'avgApy'],
        label: 'protocol stats',
      });
    } catch (err) {
      const classified = classifyError(err);
      expect(classified.kind).toBe('invalid_state');
      expect(classified.retryable).toBe(false);
    }
  });

  it('builds a safe diagnostic without leaking secrets', () => {
    const err = createAppError(`Provider failed for ${WALLET}`, {
      code: 'DEPENDENCY_FAILURE',
      retryable: true,
      status: 503,
    });
    const diagnostic = buildSafeDiagnostic(err, {
      feature: 'vaults',
      level: 'feature',
    });
    expect(diagnostic.correlationId).toMatch(/^yv-/);
    expect(diagnostic.retryable).toBe(true);
    expect(diagnostic.message).not.toContain(WALLET);
    expect(containsSensitiveValue(diagnostic)).toBe(false);
  });

  it('captureFailure returns UI-safe fields', () => {
    const failure = captureFailure(
      createAppError('Vault not found', {
        code: 'INVALID_STATE',
        retryable: false,
      }),
      { feature: 'vault', level: 'feature' },
    );
    expect(failure.retryable).toBe(false);
    expect(failure.correlationId).toMatch(/^yv-/);
    expect(failure.message.length).toBeGreaterThan(0);
    expect(failure.diagnostic.feature).toBe('vault');
  });

  it.each([
    ['string', 'provider maintenance'],
    ['number', 42],
    ['boolean', true],
    ['array', []],
  ])('rejects a %s where named response fields are required', (_shape, payload) => {
    const contracts = [
      ['vault', ['id', 'name', 'asset']],
      ['protocol stats', ['totalTvl', 'avgApy', 'vaultCount']],
      ['apy history', ['vaultId', 'history']],
    ];
    for (const [label, requireKeys] of contracts) {
      let error;
      try {
        assertWellFormedResponse(payload, { requireKeys, label });
      } catch (caught) {
        error = caught;
      }
      expect(error).toMatchObject({
        name: 'AppError',
        code: 'MALFORMED_RESPONSE',
        retryable: false,
        message: `Malformed ${label}: expected an object`,
      });
      expect(captureFailure(error)).toMatchObject({
        kind: 'invalid_state',
        retryable: false,
        message: 'The provider returned data we could not safely use.',
      });
    }
  });

  it('returns objects with their own required fields without copying them', () => {
    const payload = { id: 'vault-1', name: 'Vault One', asset: 'XLM' };
    expect(assertWellFormedResponse(payload, {
      requireKeys: ['id', 'name', 'asset'],
      label: 'vault',
    })).toBe(payload);
  });

  it('still rejects missing and inherited required fields', () => {
    const payload = { id: 'vault-1', name: 'Vault One', asset: 'XLM' };
    const options = { requireKeys: ['id', 'name', 'asset'], label: 'vault' };
    expect(() => assertWellFormedResponse({}, options)).toThrow(/missing/);
    expect(() => assertWellFormedResponse(Object.create(payload), options)).toThrow(/missing/);
  });

  it('preserves array-only and unconstrained response validation', () => {
    const list = [{ id: 'vault-1' }];
    expect(assertWellFormedResponse(list, { expectArray: true })).toBe(list);
    expect(() => assertWellFormedResponse('provider maintenance', {
      expectArray: true,
    })).toThrow(/expected an array/);
    expect(assertWellFormedResponse(42)).toBe(42);
    expect(assertWellFormedResponse(42, { requireKeys: [] })).toBe(42);
  });
});
