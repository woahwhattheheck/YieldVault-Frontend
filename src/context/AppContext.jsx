import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import * as walletService from '../services/wallet.js';
import { DEFAULT_NETWORK, NETWORKS } from '../lib/networks.js';
import { CONFIG } from '../constants/config.js';
import { getNetworkGuardState } from '../utils/networkGuard.js';

/**
 * Global application context. Holds wallet connection state and balances,
 * shared across pages so the wallet only connects once.
 */
const AppContext = createContext(null);

const SLIPPAGE_STORAGE_KEY = 'yieldvault:slippage-tolerance';
const ASSET_STORAGE_KEY = 'yieldvault:last-asset';
const NETWORK_STORAGE_KEY = 'yieldvault:network';
const TIMEZONE_STORAGE_KEY = 'yieldvault:timezone';

export function AppProvider({ children }) {
  const [address, setAddress] = useState(null);
  const [balances, setBalances] = useState({});
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [walletNetwork, setWalletNetwork] = useState(null);
  const [switchingNetwork, setSwitchingNetwork] = useState(false);
  const [slippageTolerance, setSlippageTolerance] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(SLIPPAGE_STORAGE_KEY);
      if (stored) return Number(stored);
    }
    return 0.5; // Default 0.5%
  });
  const [lastAsset, setLastAsset] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(ASSET_STORAGE_KEY);
      if (stored) return stored;
    }
    return null; // No default asset
  });
  const [network, setNetworkState] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(NETWORK_STORAGE_KEY);
      if (stored === 'mainnet' || stored === 'testnet') return stored;
    }
    return DEFAULT_NETWORK;
  });
  const [timezone, setTimezoneState] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(TIMEZONE_STORAGE_KEY) || Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
    return 'UTC';
  });

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
    setConnecting(true);
    setError(null);
    try {
      const { address: addr } = await walletService.connect();
      const bal = await walletService.getBalances();
      const detected = await walletService.getNetwork();
      setAddress(addr);
      setBalances(bal);
      setWalletNetwork(detected);
    } catch (err) {
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    await walletService.disconnect();
    setAddress(null);
    setBalances({});
    setWalletNetwork(null);
  }, []);

  const refreshWalletNetwork = useCallback(async () => {
    if (!address) {
      setWalletNetwork(null);
      return null;
    }
    const next = await walletService.getNetwork();
    setWalletNetwork(next);
    return next;
  }, [address]);

  /**
   * Ask the wallet to switch onto the configured deployment network.
   * Rejected switches leave walletNetwork unchanged and surface a safe error.
   */
  const switchWalletNetwork = useCallback(async (target = CONFIG.network) => {
    setSwitchingNetwork(true);
    setError(null);
    try {
      const next = await walletService.switchNetwork(target);
      setWalletNetwork(next);
      return next;
    } catch (err) {
      // User rejection / provider failure — do not mutate walletNetwork.
      setError(err.message || 'Network switch rejected');
      throw err;
    } finally {
      setSwitchingNetwork(false);
    }
  }, []);

  // When the app's selected network changes, drop stale wallet-network
  // assumptions so a previous match cannot authorize mutations on the new
  // deployment. Re-probe the wallet if still connected.
  useEffect(() => {
    let cancelled = false;
    async function refreshWalletNetwork() {
      if (!address) return;
      try {
        const detected = await walletService.getNetwork();
        if (!cancelled) setWalletNetwork(detected);
      } catch {
        if (!cancelled) setWalletNetwork(null);
      }
    }
    refreshWalletNetwork();
    return () => {
      cancelled = true;
    };
  }, [network, address]);

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

  const expectedNetwork = CONFIG.network;
  const networkGuard = getNetworkGuardState(walletNetwork, expectedNetwork);
  const mutationsAllowed = Boolean(address) && networkGuard.ready;

  const value = {
    address,
    balances,
    connecting,
    error,
    walletNetwork,
    switchingNetwork,
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
    isConnected: Boolean(address),
    connect,
    disconnect,
    switchWalletNetwork,
    refreshWalletNetwork,
    expectedNetwork,
    networkGuard,
    mutationsAllowed,
    isWrongNetwork: Boolean(address && walletNetwork && !networkGuard.ready),
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
