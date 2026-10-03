import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import * as walletService from '../services/wallet.js';
import { DEFAULT_NETWORK, NETWORKS } from '../lib/networks.js';
import { CONFIG } from '../constants/config.js';
import {
  createSession,
  isSessionExpired,
  extendSession as bumpSession,
  readSession,
  writeSession,
  clearSensitiveClientState,
  cacheBalances,
  openSessionChannel,
  canSubmitVaultMutation,
} from '../utils/sessionAuth.js';

/**
 * Global application context. Holds wallet connection state and balances,
 * shared across pages so the wallet only connects once.
 *
 * Session authorization: connect mints a time-bounded session. Expiry and
 * logout clear protected client state (balances / session / position cache)
 * while preserving safe drafts and preferences. Tabs stay consistent via
 * BroadcastChannel + the shared localStorage session record.
 */
const AppContext = createContext(null);

const SLIPPAGE_STORAGE_KEY = 'yieldvault:slippage-tolerance';
const ASSET_STORAGE_KEY = 'yieldvault:last-asset';
const NETWORK_STORAGE_KEY = 'yieldvault:network';
const TIMEZONE_STORAGE_KEY = 'yieldvault:timezone';

function loadSafePreference(key, fallback) {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const stored = localStorage.getItem(key);
    return stored == null ? fallback : stored;
  } catch {
    return fallback;
  }
}

export function AppProvider({ children }) {
  const [address, setAddress] = useState(null);
  const [balances, setBalances] = useState({});
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [walletNetwork, setWalletNetwork] = useState(null);
  const [session, setSession] = useState(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [slippageTolerance, setSlippageTolerance] = useState(() => {
    const stored = loadSafePreference(SLIPPAGE_STORAGE_KEY, null);
    return stored != null ? Number(stored) : 0.5;
  });
  const [lastAsset, setLastAsset] = useState(() => loadSafePreference(ASSET_STORAGE_KEY, null));
  const [network, setNetworkState] = useState(() => {
    const stored = loadSafePreference(NETWORK_STORAGE_KEY, null);
    if (stored === 'mainnet' || stored === 'testnet') return stored;
    return DEFAULT_NETWORK;
  });
  const [timezone, setTimezoneState] = useState(() => {
    const stored = loadSafePreference(TIMEZONE_STORAGE_KEY, null);
    if (stored) return stored;
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return 'UTC';
    }
  });

  const channelRef = useRef(null);
  const applyingRemoteRef = useRef(false);
  const connectionRef = useRef({ generation: 0, pending: false });
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    const connection = connectionRef.current;
    return () => {
      connection.generation += 1;
      connection.pending = false;
    };
  }, []);

  const publishSessionEvent = useCallback((type, nextSession = null) => {
    if (applyingRemoteRef.current) return;
    channelRef.current?.post({ type, session: nextSession, at: Date.now() });
  }, []);

  const clearProtectedState = useCallback(() => {
    connectionRef.current.generation += 1;
    connectionRef.current.pending = false;
    setConnecting(false);
    clearSensitiveClientState({ preserveDrafts: true });
    setAddress(null);
    setBalances({});
    setWalletNetwork(null);
    setSession(null);
    sessionRef.current = null; // sync — do not wait for re-render
    writeSession(null);
  }, []);

  const applyAuthenticatedSession = useCallback((nextSession, addr, bal, detectedNetwork) => {
    setSession(nextSession);
    sessionRef.current = nextSession;
    writeSession(nextSession);
    setAddress(addr);
    setBalances(bal);
    cacheBalances(bal);
    setWalletNetwork(detectedNetwork);
    setSessionExpired(false);
    setError(null);
  }, []);

  const expireSession = useCallback(
    async ({ broadcast = true, reason = 'expiry' } = {}) => {
      // Already cleared — avoid re-entry loops when multiple tabs fire.
      if (!sessionRef.current && !connectionRef.current.pending) {
        setSessionExpired(true);
        return;
      }
      // Revoke local authority before waiting for the wallet to disconnect.
      // This also invalidates an unfinished connection when no session exists yet.
      clearProtectedState();
      setSessionExpired(true);
      if (broadcast) {
        publishSessionEvent(reason === 'logout' ? 'logout' : 'expired', null);
      }
      try {
        await walletService.disconnect();
      } catch {
        /* disconnect best-effort */
      }
    },
    [clearProtectedState, publishSessionEvent],
  );

  const setNetwork = useCallback((next) => {
    if (!NETWORKS[next]) return;
    setNetworkState(next);
    try {
      localStorage.setItem(NETWORK_STORAGE_KEY, next);
    } catch {
      /* storage unavailable — ignore */
    }
  }, []);

  const toggleNetwork = useCallback(() => {
    setNetwork(network === 'testnet' ? 'mainnet' : 'testnet');
  }, [network, setNetwork]);

  const setTimezone = useCallback((next) => {
    setTimezoneState(next);
    try {
      localStorage.setItem(TIMEZONE_STORAGE_KEY, next);
    } catch {
      /* storage unavailable — ignore */
    }
  }, []);

  const connect = useCallback(async () => {
    const generation = connectionRef.current.generation + 1;
    connectionRef.current.generation = generation;
    connectionRef.current.pending = true;
    const isCurrent = () => connectionRef.current.generation === generation;
    setConnecting(true);
    setError(null);
    try {
      const { address: addr } = await walletService.connect();
      if (!isCurrent()) return null;
      const bal = await walletService.getBalances();
      if (!isCurrent()) return null;
      const detected = await walletService.getNetwork();
      if (!isCurrent()) return null;
      const nextSession = createSession(addr);
      applyAuthenticatedSession(nextSession, addr, bal, detected);
      publishSessionEvent('authenticated', nextSession);
      return nextSession;
    } catch (err) {
      if (!isCurrent()) return null;
      setError(err.message || 'Failed to connect wallet');
      throw err;
    } finally {
      if (isCurrent()) {
        connectionRef.current.pending = false;
        setConnecting(false);
      }
    }
  }, [applyAuthenticatedSession, publishSessionEvent]);

  const disconnect = useCallback(async () => {
    await expireSession({ broadcast: true, reason: 'logout' });
  }, [expireSession]);

  /** Renew an active session from user activity / "Stay connected". */
  const renewSession = useCallback(() => {
    const current = sessionRef.current;
    if (!current || isSessionExpired(current)) return false;
    const next = bumpSession(current);
    if (!next) return false;
    setSession(next);
    sessionRef.current = next;
    writeSession(next);
    setSessionExpired(false);
    publishSessionEvent('renewed', next);
    return true;
  }, [publishSessionEvent]);

  /**
   * Explicit re-authentication path after expiry.
   * Clears any residual protected state then reconnects — no auth loops.
   */
  const reauthenticate = useCallback(async () => {
    clearProtectedState();
    setSessionExpired(false);
    return connect();
  }, [clearProtectedState, connect]);

  /**
   * Gate for sensitive reads / mutations. Detects expiry, clears protected
   * state, and returns false so callers abort without submitting.
   */
  const ensureSessionActive = useCallback(
    async (now = Date.now()) => {
      const current = sessionRef.current;
      if (canSubmitVaultMutation(current, now)) return current;
      await expireSession({ broadcast: true, reason: 'expiry' });
      return null;
    },
    [expireSession],
  );

  // Boot: never silently restore sensitive balances/positions from a
  // persisted session. Expired leftovers surface the re-auth banner;
  // still-valid leftovers are dropped so this tab must connect explicitly.
  useEffect(() => {
    const existing = readSession();
    if (!existing) return undefined;
    const expired = isSessionExpired(existing);
    clearSensitiveClientState({ preserveDrafts: true });
    writeSession(null);
    setSession(null);
    if (expired) setSessionExpired(true);
    return undefined;
  }, []);

  // Local expiry timer — fires when expiresAt elapses.
  useEffect(() => {
    if (!session?.expiresAt) return undefined;
    const remaining = session.expiresAt - Date.now();
    if (remaining <= 0) {
      expireSession({ broadcast: true, reason: 'expiry' });
      return undefined;
    }
    const id = window.setTimeout(() => {
      expireSession({ broadcast: true, reason: 'expiry' });
    }, remaining);
    return () => window.clearTimeout(id);
  }, [session, expireSession]);

  // Multi-tab: BroadcastChannel + storage events keep session changes consistent.
  useEffect(() => {
    const applyRemote = (type, remoteSession) => {
      applyingRemoteRef.current = true;
      try {
        if (type === 'authenticated' && remoteSession && !isSessionExpired(remoteSession)) {
          // Another tab authenticated — this tab still requires an explicit
          // local connect before sensitive data is loaded (no silent restore).
          setSessionExpired(false);
          writeSession(remoteSession);
          return;
        }
        if (type === 'renewed' && remoteSession && !isSessionExpired(remoteSession)) {
          if (sessionRef.current?.address === remoteSession.address) {
            setSession(remoteSession);
            writeSession(remoteSession);
          }
          return;
        }
        if (type === 'expired' || type === 'logout') {
          clearProtectedState();
          setSessionExpired(true);
        }
      } finally {
        applyingRemoteRef.current = false;
      }
    };

    const channel = openSessionChannel((event) => {
      const { type, session: remoteSession } = event.data || {};
      if (!type) return;
      applyRemote(type, remoteSession);
    });
    channelRef.current = channel;

    const onStorage = (event) => {
      if (event.key !== 'yieldvault:session') return;
      if (event.newValue == null) {
        applyRemote('logout', null);
        return;
      }
      try {
        const remoteSession = JSON.parse(event.newValue);
        applyRemote('renewed', remoteSession);
      } catch {
        /* ignore malformed */
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      channel?.close();
      channelRef.current = null;
      window.removeEventListener('storage', onStorage);
    };
  }, [clearProtectedState]);

  useEffect(() => {
    try {
      localStorage.setItem(SLIPPAGE_STORAGE_KEY, String(slippageTolerance));
    } catch {
      /* storage unavailable — ignore */
    }
  }, [slippageTolerance]);

  useEffect(() => {
    try {
      if (lastAsset) {
        localStorage.setItem(ASSET_STORAGE_KEY, lastAsset);
      }
    } catch {
      /* storage unavailable — ignore */
    }
  }, [lastAsset]);

  const isConnected = Boolean(address) && !sessionExpired && !isSessionExpired(session);
  const mutationsAllowed = canSubmitVaultMutation(session) && isConnected;

  const value = {
    address,
    balances,
    connecting,
    error,
    walletNetwork,
    session,
    sessionExpired,
    sessionExpiresAt: session?.expiresAt ?? null,
    slippageTolerance,
    setSlippageTolerance,
    lastAsset,
    setLastAsset,
    network,
    networkConfig: NETWORKS[network],
    isMainnet: network === 'mainnet',
    setNetwork,
    toggleNetwork,
    timezone,
    setTimezone,
    isConnected,
    mutationsAllowed,
    connect,
    disconnect,
    renewSession,
    reauthenticate,
    expireSession,
    ensureSessionActive,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/** Access the app context. Throws if used outside the provider. */
export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return ctx;
}

export default AppContext;
