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
  const expectedNetwork = Object.prototype.hasOwnProperty.call(NETWORKS, expected)
    ? NETWORKS[expected]
    : null;
  const connectedNetwork = Object.prototype.hasOwnProperty.call(NETWORKS, connected)
    ? NETWORKS[connected]
    : null;
  const expectedLabel = expectedNetwork?.label || expected;
  const connectedLabel = connected ? connectedNetwork?.label || connected : null;
  const unsupported = Boolean(connected && !connectedNetwork);
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
