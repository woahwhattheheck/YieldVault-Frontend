import { withLatency, clone } from './api.js';
import { MOCK_BALANCES } from './mockData.js';
import { CONFIG } from '../constants/config.js';
import { getNetworkGuardState } from '../utils/networkGuard.js';

/**
 * Mock Stellar wallet service. Simulates connecting a Freighter-style
 * wallet and reading token balances without touching the network.
 */

const MOCK_ADDRESS = 'GAYV7XALOK6PTT5XJVMGCPTUEPFM4AVSRCJ55ZDRIPSXYLD7VAULT';

/** In-memory wallet network override for tests and switch-network flows. */
let mockWalletNetwork = null;
let walletNetworkRevision = 0;

function currentWalletNetwork() {
  return mockWalletNetwork ?? CONFIG.network;
}

function setWalletNetwork(network) {
  const previous = currentWalletNetwork();
  mockWalletNetwork = network;
  if (currentWalletNetwork() !== previous) walletNetworkRevision += 1;
}

/**
 * Reset mock wallet network state (tests only).
 */
export function __resetWalletNetworkForTests() {
  mockWalletNetwork = null;
  walletNetworkRevision += 1;
}

/**
 * Force the mock wallet onto a specific network (tests / switch path).
 * @param {string|null} network
 */
export function __setWalletNetworkForTests(network) {
  setWalletNetwork(network);
}

/**
 * Get the current network the wallet is connected to.
 * In a real implementation, this would query the wallet extension.
 * @returns {Promise<string>}
 */
export async function getNetwork() {
  // Default: mirror the configured deployment so a fresh connect matches.
  return withLatency(currentWalletNetwork());
}

/**
 * Ask the wallet to switch to the app's configured deployment network.
 * Resolves with the new network id, or rejects when the user cancels.
 * @param {string} [target=CONFIG.network]
 * @returns {Promise<string>}
 */
export async function switchNetwork(target = CONFIG.network) {
  if (!getNetworkGuardState(target, target).ready) {
    throw new Error(`Unsupported network: ${target}`);
  }
  // Simulate a user-approved switch. Tests can stub this to reject.
  setWalletNetwork(target);
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
  // Disconnect invalidates pending requests even if the default network matches.
  walletNetworkRevision += 1;
  return withLatency(undefined, 150);
}

/**
 * Fetch token balances for the connected account.
 * @returns {Promise<Record<string, number>>}
 */
export async function getBalances() {
  return withLatency(clone(MOCK_BALANCES));
}

function assertSubmissionNetwork(walletNetwork, expected, revision) {
  if (revision !== walletNetworkRevision) {
    const err = new Error('Wallet network changed while the transaction was pending. Please try again.');
    err.code = 'NETWORK_CHANGED';
    err.walletNetwork = currentWalletNetwork();
    err.expectedNetwork = expected;
    throw err;
  }
  if (!getNetworkGuardState(walletNetwork, expected).ready) {
    const err = new Error(
      `Wrong network: wallet is on ${walletNetwork}, app expects ${expected}`,
    );
    err.code = 'WRONG_NETWORK';
    err.walletNetwork = walletNetwork;
    err.expectedNetwork = expected;
    throw err;
  }
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
  const revision = walletNetworkRevision;
  // Re-read at submission time; a render-time network snapshot may already
  // be stale after a wallet event or app network switch.
  const walletNetwork = await getNetwork();
  assertSubmissionNetwork(walletNetwork, expected, revision);

  // Keep the existing simulated submission delay, but do not publish success
  // from a request invalidated while either asynchronous step was pending.
  await withLatency(undefined);
  assertSubmissionNetwork(currentWalletNetwork(), expected, revision);
  const hash = `mock-${Math.random().toString(16).slice(2, 10)}`;
  return { hash, summary };
}
