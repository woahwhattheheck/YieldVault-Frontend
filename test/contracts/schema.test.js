import { describe, expect, it } from 'vitest';
import { check, enforce, names, version } from '../../src/contracts/index.js';
import { fixtures } from '../../src/contracts/fixtures/index.js';
import {
  authorizationError,
  depositSuccess,
  positionList,
  providerFailure,
  terminalError,
  transactionsPage,
  validationError,
  vaultList,
  withdrawFailed,
  withdrawPending,
} from '../../src/contracts/fixtures/index.js';

describe('v1 API contracts', () => {
  it('exposes the consumer-facing registry', () => {
    expect(version).toBe('v1');
    expect([...names()].sort()).toEqual(
      [
        'depositSuccess',
        'errorResponse',
        'positionList',
        'transactionPage',
        'vaultList',
        'withdrawSuccess',
      ].sort(),
    );
  });

  it('accepts every checked-in success and error fixture', () => {
    expect(check('vaultList', vaultList).valid).toBe(true);
    expect(check('positionList', positionList).valid).toBe(true);
    expect(check('depositSuccess', depositSuccess).valid).toBe(true);
    expect(check('withdrawSuccess', withdrawPending).valid).toBe(true);
    expect(check('withdrawSuccess', withdrawFailed).valid).toBe(true);
    expect(check('transactionPage', transactionsPage).valid).toBe(true);
    for (const fixture of [validationError, authorizationError, providerFailure, terminalError]) {
      expect(check('errorResponse', fixture).valid).toBe(true);
    }
  });

  it('fails incompatible shapes with actionable path diagnostics', () => {
    const result = check('transactionPage', { count: 1, pagination: {} });
    expect(result.valid).toBe(false);
    const paths = result.errors.map((e) => e.path);
    expect(paths).toContain('$.transactions');
    expect(paths).toContain('$.pagination.total');

    expect(() => enforce('errorResponse', { error: { status: 700 } })).toThrow(
      /v1\.errorResponse does not match contract/,
    );
    try {
      enforce('errorResponse', { error: { status: 700 } });
    } catch (err) {
      expect(err.code).toBe('CONTRACT_VALIDATION_FAILED');
      expect(Array.isArray(err.details)).toBe(true);
      expect(err.details.some((d) => d.path.includes('status') || d.path.includes('message'))).toBe(
        true,
      );
    }
  });

  it('enforces precision, status enums, and pagination bounds (regression)', () => {
    const invalid = structuredClone(transactionsPage);
    invalid.transactions[0].status = 'settled';
    invalid.transactions[0].amount = 1.1234567;
    invalid.pagination.limit = 0;
    const result = check('transactionPage', invalid);
    expect(result.valid).toBe(false);
    const paths = result.errors.map((e) => e.path);
    expect(paths).toContain('$.transactions[0].status');
    expect(paths).toContain('$.transactions[0].amount');
    expect(paths).toContain('$.pagination.limit');
  });

  it('rejects undocumented response fields', () => {
    const result = check('transactionPage', { ...transactionsPage, debug: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === '$.debug')).toBe(true);
  });

  it('keeps fixtures frozen behind the public export', () => {
    expect(Object.isFrozen(fixtures)).toBe(true);
    expect(Object.keys(fixtures)).toEqual(
      expect.arrayContaining([
        'validationError',
        'authorizationError',
        'providerFailure',
        'terminalError',
        'withdrawPending',
      ]),
    );
  });
});
