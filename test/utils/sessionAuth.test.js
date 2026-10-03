import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSession,
  isSessionExpired,
  canSubmitVaultMutation,
  assertCanMutate,
  extendSession,
  writeSession,
  readSession,
  clearSensitiveClientState,
  writeSafeDraft,
  readSafeDraft,
  cachePositions,
  readCachedPositions,
  cacheBalances,
  readCachedBalances,
  SessionExpiredError,
  SESSION_STORAGE_KEY,
  POSITIONS_CACHE_KEY,
  BALANCES_CACHE_KEY,
  DEPOSIT_DRAFT_KEY,
  WITHDRAW_DRAFT_KEY,
} from '../../src/utils/sessionAuth.js';

describe('sessionAuth', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('creates a time-bounded session', () => {
    const session = createSession('GABC', 1_000, 5_000);
    expect(session.address).toBe('GABC');
    expect(session.startedAt).toBe(1_000);
    expect(session.expiresAt).toBe(6_000);
  });

  it('detects expiry before sensitive reads/mutations', () => {
    const session = createSession('GABC', 0, 1_000);
    expect(isSessionExpired(session, 999)).toBe(false);
    expect(isSessionExpired(session, 1_000)).toBe(true);
    expect(canSubmitVaultMutation(session, 999)).toBe(true);
    expect(canSubmitVaultMutation(session, 1_000)).toBe(false);
    expect(canSubmitVaultMutation(null, 0)).toBe(false);
  });

  it('assertCanMutate throws SessionExpiredError when expired', () => {
    const session = createSession('GABC', 0, 100);
    expect(() => assertCanMutate(session, 50)).not.toThrow();
    expect(() => assertCanMutate(session, 100)).toThrow(SessionExpiredError);
  });

  it('extendSession renews active sessions but not expired ones', () => {
    const session = createSession('GABC', 0, 1_000);
    expect(extendSession(session, 500, 1_000)?.expiresAt).toBe(1_500);
    expect(extendSession(session, 1_000, 1_000)).toBeNull();
  });

  it('persists and clears the session record', () => {
    const session = createSession('GABC', 0, 5_000);
    writeSession(session);
    expect(readSession()?.address).toBe('GABC');
    writeSession(null);
    expect(readSession()).toBeNull();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('clears sensitive cached data while preserving safe drafts', () => {
    writeSession(createSession('GABC', 0, 5_000));
    cachePositions([{ vaultId: 'v1', value: 42 }]);
    cacheBalances({ USDC: 99 });
    writeSafeDraft(DEPOSIT_DRAFT_KEY, '12.5');
    writeSafeDraft(WITHDRAW_DRAFT_KEY, '3');
    localStorage.setItem('yieldvault:slippage-tolerance', '0.5');
    localStorage.setItem('yieldvault:network', 'testnet');

    const result = clearSensitiveClientState({ preserveDrafts: true });

    expect(readSession()).toBeNull();
    expect(readCachedPositions()).toBeNull();
    expect(readCachedBalances()).toBeNull();
    expect(sessionStorage.getItem(POSITIONS_CACHE_KEY)).toBeNull();
    expect(sessionStorage.getItem(BALANCES_CACHE_KEY)).toBeNull();
    expect(readSafeDraft(DEPOSIT_DRAFT_KEY)).toBe('12.5');
    expect(readSafeDraft(WITHDRAW_DRAFT_KEY)).toBe('3');
    expect(localStorage.getItem('yieldvault:slippage-tolerance')).toBe('0.5');
    expect(localStorage.getItem('yieldvault:network')).toBe('testnet');
    expect(result.cleared).toEqual(
      expect.arrayContaining([SESSION_STORAGE_KEY, POSITIONS_CACHE_KEY, BALANCES_CACHE_KEY]),
    );
  });

  it.each([NaN, Infinity, -Infinity])('expires a session with nonfinite expiry %s', (expiresAt) => {
    const session = { ...createSession('GABC', 0, 1_000), expiresAt };
    expect(isSessionExpired(session, 500)).toBe(true);
    expect(canSubmitVaultMutation(session, 500)).toBe(false);
    expect(() => assertCanMutate(session, 500)).toThrow(SessionExpiredError);
    expect(extendSession(session, 500, 1_000)).toBeNull();
  });

  it.each(['1e999', '-1e999'])('retains persisted expiry %s for expired-session cleanup', (expiresAt) => {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      `{"address":"GABC","startedAt":0,"expiresAt":${expiresAt},"version":1}`,
    );
    cachePositions([{ vaultId: 'v1', value: 42 }]);
    cacheBalances({ USDC: 99 });
    writeSafeDraft(DEPOSIT_DRAFT_KEY, '12.5');

    const session = readSession();
    expect(session).not.toBeNull();
    expect(isSessionExpired(session, 500)).toBe(true);
    expect(canSubmitVaultMutation(session, 500)).toBe(false);
    expect(() => assertCanMutate(session, 500)).toThrow(SessionExpiredError);
    expect(extendSession(session, 500, 1_000)).toBeNull();

    clearSensitiveClientState({ preserveDrafts: true });
    expect(readSession()).toBeNull();
    expect(readCachedPositions()).toBeNull();
    expect(readCachedBalances()).toBeNull();
    expect(readSafeDraft(DEPOSIT_DRAFT_KEY)).toBe('12.5');
  });
});
