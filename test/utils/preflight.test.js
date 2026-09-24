import { describe, expect, it } from 'vitest';
import {
  PREFLIGHT_STATUS,
  buildTxPayload,
  fingerprintTx,
  isPreflightBoundTo,
  isRetryablePreflight,
  preflightUserMessage,
  serializeTxPayload,
  shouldRequestSignature,
} from '../../src/utils/preflight.js';

const baseInput = {
  kind: 'deposit',
  vaultId: 'usdc-vault',
  amount: '100',
  asset: 'USDC',
  walletAddress: 'GTEST',
  network: 'testnet',
  contractId: 'CCONTRACT',
};

describe('preflight utils', () => {
  it('serializes payloads with stable key order and fingerprints with network', () => {
    const payload = buildTxPayload(baseInput);
    const serialized = serializeTxPayload(payload);
    expect(serialized).toContain('"kind":"deposit"');
    expect(serialized).toContain('"amount":"100"');
    expect(fingerprintTx(serialized, 'testnet')).toBe(`testnet::${serialized}`);
    expect(fingerprintTx(serialized, 'mainnet')).not.toBe(
      fingerprintTx(serialized, 'testnet'),
    );
  });

  it('binds preflight results to the exact serialized tx and network', () => {
    const payload = buildTxPayload(baseInput);
    const serialized = serializeTxPayload(payload);
    const result = {
      status: PREFLIGHT_STATUS.OK,
      fingerprint: fingerprintTx(serialized, 'testnet'),
      network: 'testnet',
      serializedTx: serialized,
    };
    expect(isPreflightBoundTo(result, serialized, 'testnet')).toBe(true);
    expect(isPreflightBoundTo(result, serialized, 'mainnet')).toBe(false);

    const changed = serializeTxPayload(buildTxPayload({ ...baseInput, amount: '101' }));
    expect(isPreflightBoundTo(result, changed, 'testnet')).toBe(false);
  });

  it('only allows signature when status is ok and still bound', () => {
    const payload = buildTxPayload(baseInput);
    const serialized = serializeTxPayload(payload);
    const ok = {
      status: PREFLIGHT_STATUS.OK,
      fingerprint: fingerprintTx(serialized, 'testnet'),
      network: 'testnet',
    };
    expect(shouldRequestSignature(ok, serialized, 'testnet')).toBe(true);
    expect(
      shouldRequestSignature(
        { ...ok, status: PREFLIGHT_STATUS.REJECTED },
        serialized,
        'testnet',
      ),
    ).toBe(false);
    expect(shouldRequestSignature(ok, serialized, 'mainnet')).toBe(false);
  });

  it('marks timeout and unsupported as retryable', () => {
    expect(isRetryablePreflight({ status: PREFLIGHT_STATUS.TIMEOUT })).toBe(true);
    expect(isRetryablePreflight({ status: PREFLIGHT_STATUS.UNSUPPORTED })).toBe(true);
    expect(isRetryablePreflight({ status: PREFLIGHT_STATUS.REJECTED })).toBe(false);
  });

  it('never frames ok simulation as confirmation', () => {
    const msg = preflightUserMessage({ status: PREFLIGHT_STATUS.OK });
    expect(msg.toLowerCase()).toContain('authoritative');
    expect(msg.toLowerCase()).not.toContain('confirmed');
  });
});
