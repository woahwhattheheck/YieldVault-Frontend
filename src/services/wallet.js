import { withLatency, clone } from './api.js';
import { MOCK_BALANCES } from './mockData.js';
import { CONFIG } from '../constants/config.js';

/**
 * Mock Stellar wallet service. Simulates connecting a Freighter-style
 * wallet and reading token balances without touching the network.
 */

const MOCK_ADDRESS = 'GAYV7XALOK6PTT5XJVMGCPTUEPFM4AVSRCJ55ZDRIPSXYLD7VAULT';

/**
 * Get the current network the wallet is connected to.
 * In a real implementation, this would query the wallet extension.
 * For mock purposes, we simulate a mismatch based on environment.
 * @returns {Promise<string>}
 */
export async function getNetwork() {
  // Simulate network detection - in production this would come from the actual wallet
  // For testing, we return the configured network to simulate correct connection
  return withLatency(CONFIG.network);
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
 * Sign and submit a transaction. This mock records a final outcome before
 * returning the receipt, so callers can reconcile a lost response by op ID.
 * @param {string} summary - human-readable description of the tx
 * @param {{ clientOpId?: string }} [options]
 * @returns {Promise<{ hash: string, summary: string }>}
 */
export async function signAndSubmit(summary, { clientOpId } = {}) {
  const entries = readMockTransactions();
  if (clientOpId && entries[clientOpId]) {
    return withLatency({ hash: entries[clientOpId].hash, summary });
  }
  const hash = `mock-${Math.random().toString(16).slice(2, 10)}`;
  if (clientOpId) {
    entries[clientOpId] = { hash, status: 'confirmed' };
    sessionStorage.setItem(MOCK_TX_KEY, JSON.stringify(entries));
  }
  return withLatency({ hash, summary });
}

const MOCK_TX_KEY = 'yieldvault.mockTransactions';

function readMockTransactions() {
  try {
    return JSON.parse(sessionStorage.getItem(MOCK_TX_KEY) || '{}');
  } catch {
    return {};
  }
}

/**
 * A mock status source; the real wallet adapter must query chain finality.
 * Absence of a record is unknown, never evidence of a failed transaction.
 * @param {{ clientOpId: string, txHash?: string|null }} ref
 * @returns {Promise<{status: 'pending'|'confirmed'|'failed'|'unknown', hash?: string|null}>}
 */
export async function getTransactionStatus({ clientOpId, txHash }) {
  const record = readMockTransactions()[clientOpId];
  if (!record || (txHash && record.hash !== txHash)) {
    return withLatency({ status: 'unknown' });
  }
  return withLatency({ status: record.status, hash: record.hash });
}
