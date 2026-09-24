/**
 * Static app configuration. Values can be overridden via Vite env vars
 * (see .env.example) but sensible defaults keep the app working offline.
 */
export const CONFIG = {
  appName: 'YieldVault',
  network: import.meta.env?.VITE_NETWORK || 'testnet',
  rpcUrl: import.meta.env?.VITE_RPC_URL || 'https://soroban-testnet.stellar.org',
  vaultContract:
    import.meta.env?.VITE_VAULT_CONTRACT ||
    'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
  // Simulated network latency for mock services, in milliseconds.
  mockLatency: 600,
  // Read-only preflight simulation timeout (provider / RPC).
  preflightTimeoutMs: Number(import.meta.env?.VITE_PREFLIGHT_TIMEOUT_MS) || 8000,
  // End inactive wallet sessions after 15 minutes and warn one minute beforehand.
  sessionTimeoutMs: 15 * 60 * 1000,
  sessionWarningMs: 60 * 1000,
};

export default CONFIG;
