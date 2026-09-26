import { beforeEach, describe, expect, it } from 'vitest';
import {
  classifyProviderError,
  createClientOpId,
  describeTxStatus,
  fingerprintMutation,
  getActiveTxOperation,
  getTxOperation,
  saveTxOperation,
  clearTxOperation,
  transitionTxState,
} from '../../src/utils/txLifecycle.js';

describe('txLifecycle state machine', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('transitions submitted → confirming → confirmed', () => {
    let state = 'idle';
    state = transitionTxState(state, 'submit');
    expect(state).toBe('submitted');
    state = transitionTxState(state, 'provider_ack');
    expect(state).toBe('confirming');
    state = transitionTxState(state, 'confirmed');
    expect(state).toBe('confirmed');
  });

  it('does not auto-duplicate while already submitted', () => {
    expect(transitionTxState('submitted', 'submit')).toBe('submitted');
    expect(transitionTxState('confirming', 'submit')).toBe('confirming');
  });

  it('maps provider timeouts to unknown (honest + recoverable)', () => {
    expect(transitionTxState('submitted', 'timeout')).toBe('unknown');
    const classified = classifyProviderError(new Error('Request timed out'));
    expect(classified.state).toBe('unknown');
    expect(classified.needsNewSignature).toBe(false);
    const desc = describeTxStatus({
      clientOpId: 'op_1',
      kind: 'deposit',
      vaultId: 'v1',
      amount: '10',
      walletAddress: 'GOWNER',
      network: 'testnet',
      state: 'unknown',
      updatedAt: new Date().toISOString(),
    });
    expect(desc.canRetry).toBe(false);
    expect(desc.canCheckStatus).toBe(true);
  });

  it('persists a correlation reference across reads (refresh-safe)', () => {
    const id = createClientOpId();
    saveTxOperation({
      clientOpId: id,
      kind: 'deposit',
      vaultId: 'vault-usdc',
      amount: '25',
      walletAddress: 'GOWNER',
      network: 'testnet',
      state: 'confirming',
      updatedAt: new Date().toISOString(),
    });
    expect(getTxOperation(id)?.state).toBe('confirming');
    expect(getActiveTxOperation({ kind: 'deposit', vaultId: 'vault-usdc', walletAddress: 'GOWNER', network: 'testnet' })?.clientOpId).toBe(
      id,
    );
    expect(getActiveTxOperation({ kind: 'deposit', vaultId: 'vault-usdc', walletAddress: 'OTHER', network: 'testnet' })).toBeNull();
    clearTxOperation(id);
    expect(getTxOperation(id)).toBeNull();
  });

  it('fingerprints mutation intents so edited amounts are distinct', () => {
    expect(
      fingerprintMutation({ kind: 'deposit', vaultId: 'v1', amount: '10' }),
    ).not.toEqual(
      fingerprintMutation({ kind: 'deposit', vaultId: 'v1', amount: '11' }),
    );
  });
});


  it('classifies user rejection as terminal non-retryable failure', () => {
    const classified = classifyProviderError(new Error('User rejected the request'));
    expect(classified.state).toBe('failed');
    expect(classified.retryable).toBe(false);
    const desc = describeTxStatus({
      clientOpId: 'op_rej',
      kind: 'deposit',
      vaultId: 'v1',
      amount: '1',
      walletAddress: 'GOWNER',
      network: 'testnet',
      state: 'failed',
      retryable: false,
      needsNewSignature: true,
      error: classified.error,
      updatedAt: new Date().toISOString(),
    });
    expect(desc.canRetry).toBe(false);
  });

  it('does not guess that an arbitrary provider error is a definitive failure', () => {
    const classified = classifyProviderError(new Error('Insufficient fee'));
    expect(classified.state).toBe('unknown');
    expect(classified.retryable).toBe(false);
  });
