import { CONFIG } from '../constants/config.js';

/**
 * Session authorization helpers for sensitive vault screens.
 *
 * A session is a time-bounded client authorization record created on wallet
 * connect. When it expires (or the user logs out) we clear protected client
 * state while preserving only safe, non-sensitive draft preferences.
 */

export const SESSION_STORAGE_KEY = 'yieldvault:session';
export const SESSION_CHANNEL_NAME = 'yieldvault:session';
export const POSITIONS_CACHE_KEY = 'yieldvault:positions-cache';
export const BALANCES_CACHE_KEY = 'yieldvault:balances-cache';
export const DEPOSIT_DRAFT_KEY = 'yieldvault:draft:deposit-amount';
export const WITHDRAW_DRAFT_KEY = 'yieldvault:draft:withdraw-amount';

/** Keys that hold protected financial / identity data and must be cleared. */
export const SENSITIVE_STORAGE_KEYS = [
  SESSION_STORAGE_KEY,
  POSITIONS_CACHE_KEY,
  BALANCES_CACHE_KEY,
];

/**
 * Safe preference / draft keys that survive logout and expiry.
 * Slippage, network, timezone, theme, and form amount drafts are not secrets.
 */
export const SAFE_STORAGE_KEYS = [
  'yieldvault:slippage-tolerance',
  'yieldvault:last-asset',
  'yieldvault:network',
  'yieldvault:timezone',
  'yieldvault:theme',
  'yieldvault:nav-collapsed',
  DEPOSIT_DRAFT_KEY,
  WITHDRAW_DRAFT_KEY,
];

export class SessionExpiredError extends Error {
  constructor(message = 'Session expired. Re-authenticate to continue.') {
    super(message);
    this.name = 'SessionExpiredError';
    this.code = 'SESSION_EXPIRED';
  }
}

/**
 * @param {string} address
 * @param {number} [now=Date.now()]
 * @param {number} [timeoutMs=CONFIG.sessionTimeoutMs]
 * @returns {{ address: string, startedAt: number, expiresAt: number, version: number }}
 */
export function createSession(address, now = Date.now(), timeoutMs = CONFIG.sessionTimeoutMs) {
  if (!address) throw new Error('Cannot create a session without an address');
  return {
    address,
    startedAt: now,
    expiresAt: now + timeoutMs,
    version: 1,
  };
}

/**
 * @param {{ expiresAt?: number }|null|undefined} session
 * @param {number} [now=Date.now()]
 */
export function isSessionExpired(session, now = Date.now()) {
  if (!session || typeof session.expiresAt !== 'number') return true;
  return now >= session.expiresAt;
}

/**
 * @param {{ expiresAt?: number }|null|undefined} session
 * @param {number} [now=Date.now()]
 */
export function canSubmitVaultMutation(session, now = Date.now()) {
  return Boolean(session?.address) && !isSessionExpired(session, now);
}

/**
 * Throws SessionExpiredError when the session cannot authorize a mutation.
 * @param {{ address?: string, expiresAt?: number }|null|undefined} session
 * @param {number} [now=Date.now()]
 */
export function assertCanMutate(session, now = Date.now()) {
  if (!canSubmitVaultMutation(session, now)) {
    throw new SessionExpiredError();
  }
}

/**
 * Extend an active session's expiry from the current moment.
 * Does not revive an already-expired session (prevents auth loops).
 * @param {{ address: string, startedAt: number, expiresAt: number, version?: number }} session
 * @param {number} [now=Date.now()]
 * @param {number} [timeoutMs=CONFIG.sessionTimeoutMs]
 */
export function extendSession(session, now = Date.now(), timeoutMs = CONFIG.sessionTimeoutMs) {
  if (!session?.address || isSessionExpired(session, now)) return null;
  return {
    ...session,
    expiresAt: now + timeoutMs,
    version: (session.version || 1) + 1,
  };
}

function safeGetItem(storage, key) {
  try {
    return storage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

function safeSetItem(storage, key, value) {
  try {
    storage?.setItem?.(key, value);
  } catch {
    /* storage unavailable */
  }
}

function safeRemoveItem(storage, key) {
  try {
    storage?.removeItem?.(key);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Read the persisted session record from localStorage (shared across tabs).
 * @returns {{ address: string, startedAt: number, expiresAt: number, version: number }|null}
 */
export function readSession() {
  if (typeof localStorage === 'undefined') return null;
  const raw = safeGetItem(localStorage, SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.address || typeof parsed.expiresAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Persist a session record (or clear when null).
 * @param {object|null} session
 */
export function writeSession(session) {
  if (typeof localStorage === 'undefined') return;
  if (!session) {
    safeRemoveItem(localStorage, SESSION_STORAGE_KEY);
    return;
  }
  safeSetItem(localStorage, SESSION_STORAGE_KEY, JSON.stringify(session));
}

/**
 * Persist a safe, non-sensitive form draft (amount strings only).
 * @param {string} key
 * @param {string} value
 */
export function writeSafeDraft(key, value) {
  if (typeof sessionStorage === 'undefined') return;
  if (!SAFE_STORAGE_KEYS.includes(key)) return;
  if (value == null || value === '') {
    safeRemoveItem(sessionStorage, key);
    return;
  }
  safeSetItem(sessionStorage, key, String(value));
}

/**
 * @param {string} key
 * @returns {string}
 */
export function readSafeDraft(key) {
  if (typeof sessionStorage === 'undefined') return '';
  if (!SAFE_STORAGE_KEYS.includes(key)) return '';
  return safeGetItem(sessionStorage, key) || '';
}

/**
 * Remove protected client caches while keeping safe preference / draft keys.
 * Clears both localStorage and sessionStorage sensitive keys.
 * @param {{ preserveDrafts?: boolean }} [options]
 * @returns {{ cleared: string[], preserved: string[] }}
 */
export function clearSensitiveClientState({ preserveDrafts = true } = {}) {
  const cleared = [];
  const preserved = [];

  const storages = [];
  if (typeof localStorage !== 'undefined') storages.push(localStorage);
  if (typeof sessionStorage !== 'undefined') storages.push(sessionStorage);

  for (const storage of storages) {
    for (const key of SENSITIVE_STORAGE_KEYS) {
      if (safeGetItem(storage, key) != null) {
        safeRemoveItem(storage, key);
        if (!cleared.includes(key)) cleared.push(key);
      }
    }

    // Sweep any other yieldvault keys that look sensitive (address/balance/position).
    const toRemove = [];
    try {
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (!key || !key.startsWith('yieldvault:')) continue;
        if (SAFE_STORAGE_KEYS.includes(key)) {
          if (!preserved.includes(key)) preserved.push(key);
          continue;
        }
        if (
          key.includes('balance') ||
          key.includes('position') ||
          key.includes('session') ||
          key.includes('address') ||
          key.includes('auth')
        ) {
          toRemove.push(key);
        }
      }
    } catch {
      /* ignore enumeration failures */
    }
    for (const key of toRemove) {
      safeRemoveItem(storage, key);
      if (!cleared.includes(key)) cleared.push(key);
    }
  }

  if (!preserveDrafts && typeof sessionStorage !== 'undefined') {
    for (const key of [DEPOSIT_DRAFT_KEY, WITHDRAW_DRAFT_KEY]) {
      safeRemoveItem(sessionStorage, key);
    }
  }

  return { cleared, preserved };
}

/**
 * Cache positions for the active session (memory + sessionStorage).
 * Cleared on expiry / logout via clearSensitiveClientState.
 * @param {unknown} positions
 */
export function cachePositions(positions) {
  if (typeof sessionStorage === 'undefined') return;
  safeSetItem(sessionStorage, POSITIONS_CACHE_KEY, JSON.stringify(positions ?? []));
}

/** @returns {Array|null} */
export function readCachedPositions() {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = safeGetItem(sessionStorage, POSITIONS_CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Cache balances for the active session. Cleared on expiry / logout.
 * @param {Record<string, number>} balances
 */
export function cacheBalances(balances) {
  if (typeof sessionStorage === 'undefined') return;
  safeSetItem(sessionStorage, BALANCES_CACHE_KEY, JSON.stringify(balances ?? {}));
}

/** @returns {Record<string, number>|null} */
export function readCachedBalances() {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = safeGetItem(sessionStorage, BALANCES_CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Open a BroadcastChannel for cross-tab session synchronization.
 * Returns null when BroadcastChannel is unavailable (e.g. some test envs).
 * @param {(event: MessageEvent) => void} onMessage
 * @returns {{ post: (data: object) => void, close: () => void }|null}
 */
export function openSessionChannel(onMessage) {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    const channel = new BroadcastChannel(SESSION_CHANNEL_NAME);
    channel.onmessage = onMessage;
    return {
      post: (data) => {
        try {
          channel.postMessage(data);
        } catch {
          /* ignore */
        }
      },
      close: () => {
        try {
          channel.close();
        } catch {
          /* ignore */
        }
      },
    };
  } catch {
    return null;
  }
}

export default {
  createSession,
  isSessionExpired,
  canSubmitVaultMutation,
  assertCanMutate,
  extendSession,
  readSession,
  writeSession,
  clearSensitiveClientState,
  writeSafeDraft,
  readSafeDraft,
  cachePositions,
  readCachedPositions,
  cacheBalances,
  readCachedBalances,
  openSessionChannel,
  SessionExpiredError,
};
