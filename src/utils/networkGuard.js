import { CONFIG } from '../constants/config.js';
import { NETWORKS } from '../lib/networks.js';

/**
 * Compare the connected wallet network with the configured deployment.
 * @param {string|null|undefined} walletNetwork
 * @param {string} [expected=CONFIG.network]
 * @returns {{
 *   ready: boolean,
 *   matched: boolean,
 *   unsupported: boolean,
 *   expected: string,
 *   connected: string|null,
 *   expectedLabel: string,
 *   connectedLabel: string|null,
 * }}
 */
export function getNetworkGuardState(walletNetwork, expected = CONFIG.network) {
  const connected = walletNetwork ?? null;
  const expectedLabel = NETWORKS[expected]?.label || expected;
  const connectedLabel = connected ? NETWORKS[connected]?.label || connected : null;
  const unsupported = Boolean(connected && !NETWORKS[connected]);
  const matched = Boolean(connected && connected === expected && !unsupported);
  return {
    ready: matched,
    matched,
    unsupported,
    expected,
    connected,
    expectedLabel,
    connectedLabel,
  };
}

/**
 * True when mutations (deposit/withdraw/sign) must be blocked.
 * @param {boolean} isConnected
 * @param {string|null|undefined} walletNetwork
 * @param {string} [expected]
 */
export function shouldBlockMutations(isConnected, walletNetwork, expected = CONFIG.network) {
  if (!isConnected) return true;
  return !getNetworkGuardState(walletNetwork, expected).ready;
}

export default {
  getNetworkGuardState,
  shouldBlockMutations,
};
