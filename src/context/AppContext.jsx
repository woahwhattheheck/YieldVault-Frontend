import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import * as walletService from '../services/wallet.js';
import { DEFAULT_NETWORK, NETWORKS } from '../lib/networks.js';

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
      const network = await walletService.getNetwork();
      setAddress(addr);
      setBalances(bal);
      setWalletNetwork(network);
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

  const value = {
    address,
    balances,
    connecting,
    error,
    walletNetwork,
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
