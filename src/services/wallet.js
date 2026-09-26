import { withLatency, clone } from './api.js';
import { MOCK_BALANCES } from './mockData.js';
import { CONFIG } from '../constants/config.js';
import { NETWORKS } from '../lib/networks.js';

/**
 * Mock Stellar wallet service. Simulates connecting a Freighter-style
 * wallet and reading token balances without touching the network.
 */

const MOCK_ADDRESS = 'GAYV7XALOK6PTT5XJVMGCPTUEPFM4AVSRCJ55ZDRIPSXYLD7VAULT';

/** In-memory wallet network override for tests and switch-network flows. */
let mockWalletNetwork = null;

/**
 * Reset mock wallet network state (tests only).
 */
export function __resetWalletNetworkForTests() {
  mockWalletNetwork = null;
}

/**
 * Force the mock wallet onto a specific network (tests / switch path).
 * @param {string|null} network
 */
export function __setWalletNetworkForTests(network) {
  mockWalletNetwork = network;
}

/**
 * Get the current network the wallet is connected to.
 * In a real implementation, this would query the wallet extension.
 * @returns {Promise<string>}
 */
export async function getNetwork() {
  if (mockWalletNetwork) {
    return withLatency(mockWalletNetwork);
  }
  // Default: mirror the configured deployment so a fresh connect matches.
  return withLatency(CONFIG.network);
}

/**
 * Ask the wallet to switch to the app's configured deployment network.
 * Resolves with the new network id, or rejects when the user cancels.
 * @param {string} [target=CONFIG.network]
 * @returns {Promise<string>}
 */
export async function switchNetwork(target = CONFIG.network) {
  if (!NETWORKS[target] && target !== 'testnet' && target !== 'mainnet') {
    throw new Error(`Unsupported network: ${target}`);
  }
  // Simulate a user-approved switch. Tests can stub this to reject.
  mockWalletNetwork = target;
  return withLatency(target);
}

/**
 * Connect the (mock) wallet and return the account address.
 * @returns {Promise<{ address: string }>}
 */
export async function connect() {
  return withLatency({ address: MOCK_ADDRESS });
}

/**
 * Disconnect the wallet. Resolves immediately.
 * @returns {Promise<void>}
 */
export async function disconnect() {
  mockWalletNetwork = null;
  return withLatency(undefined, 150);
}

/**
 * Fetch token balances for the connected account.
 * @returns {Promise<Record<string, number>>}
 */
export async function getBalances() {
  return withLatency(clone(MOCK_BALANCES));
}

/**
 * Sign and submit a transaction. Refuses when the wallet network does not
 * match the configured deployment so a valid signature cannot land on the
 * wrong chain.
 * @param {string} summary - human-readable description of the tx
 * @param {{ expectedNetwork?: string }} [opts]
 * @returns {Promise<{ hash: string, summary: string }>}
 */
export async function signAndSubmit(summary, opts = {}) {
  const expected = opts.expectedNetwork ?? CONFIG.network;
  // Re-read at submission time; a render-time network snapshot may already
  // be stale after a wallet event or app network switch.
  const walletNetwork = await getNetwork();

  if (walletNetwork !== expected) {
    const err = new Error(
      `Wrong network: wallet is on ${walletNetwork}, app expects ${expected}`,
    );
    err.code = 'WRONG_NETWORK';
    err.walletNetwork = walletNetwork;
    err.expectedNetwork = expected;
    throw err;
  }

  const hash = `mock-${Math.random().toString(16).slice(2, 10)}`;
  return withLatency({ hash, summary });
}
