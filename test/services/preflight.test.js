import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetSimulationBehaviorForTests,
  __setSimulationBehaviorForTests,
  runPreflight,
} from '../../src/services/preflight.js';
import { PREFLIGHT_CODE, PREFLIGHT_STATUS } from '../../src/utils/preflight.js';

vi.mock('../../src/constants/config.js', () => ({
  CONFIG: {
    network: 'testnet',
    vaultContract: 'CCONTRACT',
    mockLatency: 0,
    preflightTimeoutMs: 50,
  },
}));

const base = {
  kind: 'deposit',
  vaultId: 'usdc-vault',
  amount: '25',
  asset: 'USDC',
  walletAddress: 'GTEST',
  network: 'testnet',
  expectedNetwork: 'testnet',
  balance: 100,
  vault: { id: 'usdc-vault', paused: false },
};

describe('runPreflight service', () => {
  beforeEach(() => {
    __resetSimulationBehaviorForTests();
  });
  afterEach(() => {
    __resetSimulationBehaviorForTests();
  });

  it('returns ok for a valid deposit (advisory only)', async () => {
    const result = await runPreflight(base);
    expect(result.status).toBe(PREFLIGHT_STATUS.OK);
    expect(result.advisoryOnly).toBe(true);
    expect(result.fingerprint).toContain('testnet::');
    expect(result.serializedTx).toContain('"amount":"25"');
    expect(result.network).toBe('testnet');
  });

  it('rejects when the contract simulation reports rejection', async () => {
    __setSimulationBehaviorForTests({
      mode: 'reject',
      reason: 'contract paused by admin',
      code: PREFLIGHT_CODE.CONTRACT_REJECTED,
    });
    const result = await runPreflight(base);
    expect(result.status).toBe(PREFLIGHT_STATUS.REJECTED);
    expect(result.code).toBe(PREFLIGHT_CODE.CONTRACT_REJECTED);
    expect(result.retryable).toBe(false);
    expect(result.reason).toMatch(/paused/i);
  });

  it('returns retryable timeout when the provider times out', async () => {
    __setSimulationBehaviorForTests({ mode: 'timeout', delayMs: 10 });
    const result = await runPreflight(base, { timeoutMs: 50 });
    expect(result.status).toBe(PREFLIGHT_STATUS.TIMEOUT);
    expect(result.retryable).toBe(true);
    expect(result.code).toBe(PREFLIGHT_CODE.PROVIDER_TIMEOUT);
  });

  it('returns retryable unsupported when simulation is unavailable', async () => {
    __setSimulationBehaviorForTests({ mode: 'unsupported' });
    const result = await runPreflight(base);
    expect(result.status).toBe(PREFLIGHT_STATUS.UNSUPPORTED);
    expect(result.retryable).toBe(true);
  });

  it('detects stale balance for deposits', async () => {
    const result = await runPreflight({ ...base, amount: '150', balance: 100 });
    expect(result.status).toBe(PREFLIGHT_STATUS.REJECTED);
    expect(result.code).toBe(PREFLIGHT_CODE.STALE_BALANCE);
  });

  it('rejects paused vaults', async () => {
    const result = await runPreflight({
      ...base,
      vault: { id: 'usdc-vault', paused: true },
    });
    expect(result.status).toBe(PREFLIGHT_STATUS.REJECTED);
    expect(result.code).toBe(PREFLIGHT_CODE.VAULT_PAUSED);
  });

  it('rejects network mismatch', async () => {
    const result = await runPreflight({
      ...base,
      network: 'mainnet',
      expectedNetwork: 'testnet',
    });
    expect(result.status).toBe(PREFLIGHT_STATUS.REJECTED);
    expect(result.code).toBe(PREFLIGHT_CODE.NETWORK_MISMATCH);
  });
});


import { shouldRequestSignature } from '../../src/utils/preflight.js';

describe('finite preflight account state', () => {
  beforeEach(() => { __resetSimulationBehaviorForTests(); });
  afterEach(() => { __resetSimulationBehaviorForTests(); });

  it.each(['deposit', 'withdraw'].flatMap((kind) =>
    [NaN, Infinity, -Infinity, 'unavailable', 'Infinity', '1e999'].map((available) => ({ kind, available })),
  ))('does not permit a $kind signature with unusable account state $available', async ({ kind, available }) => {
    const input = { ...base, kind, balance: 100, position: 100, [kind === 'deposit' ? 'balance' : 'position']: available };
    const result = await runPreflight(input);
    expect(result.status).toBe(PREFLIGHT_STATUS.REJECTED);
    expect(result.code).toBe(PREFLIGHT_CODE.MISSING_CONTEXT);
    expect(result.reason).toMatch(/refresh/i);
    expect(result.advisoryOnly).toBe(true);
    expect(shouldRequestSignature(result, result.serializedTx, result.network)).toBe(false);
  });

  it.each(['deposit', 'withdraw'])('allows a $kind after a fresh finite account value arrives', async (kind) => {
    const field = kind === 'deposit' ? 'balance' : 'position';
    const rejected = await runPreflight({ ...base, kind, [field]: NaN });
    expect(shouldRequestSignature(rejected, rejected.serializedTx, rejected.network)).toBe(false);
    const fresh = await runPreflight({ ...base, kind, [field]: 100 });
    expect(fresh.status).toBe(PREFLIGHT_STATUS.OK);
    expect(shouldRequestSignature(fresh, fresh.serializedTx, fresh.network)).toBe(true);
    expect(fresh.serializedTx).toBe(rejected.serializedTx);
  });

  it.each(['deposit', 'withdraw'].flatMap((kind) =>
    [0, 24, 25, 100, '100'].map((available) => ({ kind, available })),
  ))('preserves finite $kind amount checks for available $available', async ({ kind, available }) => {
    const field = kind === 'deposit' ? 'balance' : 'position';
    const result = await runPreflight({ ...base, kind, [field]: available });
    if (Number(available) < 25) {
      expect(result.status).toBe(PREFLIGHT_STATUS.REJECTED);
      expect(result.code).toBe(kind === 'deposit' ? PREFLIGHT_CODE.STALE_BALANCE : PREFLIGHT_CODE.INSUFFICIENT_POSITION);
    } else {
      expect(result.status).toBe(PREFLIGHT_STATUS.OK);
    }
    expect(shouldRequestSignature(result, result.serializedTx, result.network)).toBe(Number(available) >= 25);
  });
});
