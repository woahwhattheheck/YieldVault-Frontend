import { withLatency, clone } from './api.js';
import { MOCK_VAULTS, MOCK_POSITIONS, MOCK_APY_HISTORY } from './mockData.js';
import { previewDeposit, previewWithdraw } from '../utils/shares.js';
import { ContractApiError } from './apiAdapter.js';

/**
 * Mock vault service. Reads vault stats and user positions, and simulates
 * deposit/withdraw flows by computing the resulting shares locally.
 *
 * Test hooks can queue contract fixtures so UI tests exercise API error and
 * precision paths without a live wallet or chain.
 */

/** @type {unknown[]} */
let queuedDepositResults = [];
/** @type {unknown[]} */
let queuedWithdrawResults = [];
/** @type {unknown[]} */
let queuedPositionResults = [];

/**
 * Test-only: queue the next deposit() outcomes (payload or ContractApiError-ready errorResponse).
 * @param {unknown} result
 */
export function __queueDepositResultForTests(result) {
  queuedDepositResults.push(result);
}

/**
 * Test-only: queue the next withdraw() outcomes.
 * @param {unknown} result
 */
export function __queueWithdrawResultForTests(result) {
  queuedWithdrawResults.push(result);
}

/**
 * Test-only: queue the next getPositions() outcomes.
 * @param {unknown} result
 */
export function __queuePositionsResultForTests(result) {
  queuedPositionResults.push(result);
}

/** Test-only reset of queued contract fixtures. */
export function __resetVaultFixturesForTests() {
  queuedDepositResults = [];
  queuedWithdrawResults = [];
  queuedPositionResults = [];
}

function takeQueued(queue) {
  return queue.length ? queue.shift() : null;
}

function resolveOrThrow(queued) {
  if (!queued) return null;
  if (queued && typeof queued === 'object' && queued.error) {
    throw new ContractApiError(queued);
  }
  return queued;
}

/**
 * List all available vaults with their stats.
 * @returns {Promise<Array>}
 */
export async function listVaults() {
  return withLatency(clone(MOCK_VAULTS));
}

/**
 * Fetch a single vault by id.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getVault(id) {
  const vault = MOCK_VAULTS.find((v) => v.id === id) || null;
  return withLatency(vault ? clone(vault) : null);
}

/**
 * Fetch the connected user's open positions.
 * @returns {Promise<Array|object>}
 */
export async function getPositions() {
  const queued = resolveOrThrow(takeQueued(queuedPositionResults));
  if (queued) return withLatency(clone(queued));
  return withLatency(clone(MOCK_POSITIONS));
}

/**
 * Aggregate protocol-wide stats from all vaults.
 * @returns {Promise<{ totalTvl: number, avgApy: number, vaultCount: number }>}
 */
export async function getProtocolStats() {
  const totalTvl = MOCK_VAULTS.reduce((sum, v) => sum + v.tvl, 0);
  const avgApy =
    MOCK_VAULTS.reduce((sum, v) => sum + v.apy, 0) / MOCK_VAULTS.length;
  return withLatency({ totalTvl, avgApy, vaultCount: MOCK_VAULTS.length });
}

/**
 * Fetch APY history for a single vault, most recent entry last. Mirrors
 * YieldVault-Backend's GET /api/vaults/:id/apy-history response shape
 * ({ vaultId, count, history }, history entries as { date, apy }).
 * @param {string} vaultId
 * @param {number} [days=30]
 * @returns {Promise<{ vaultId: string, count: number, history: Array<{date: string, apy: number}> }>}
 */
export async function getVaultApyHistory(vaultId, days = 30) {
  const vault = MOCK_VAULTS.find((v) => v.id === vaultId);
  if (!vault) throw new Error('Vault not found');
  const full = MOCK_APY_HISTORY[vaultId] || [];
  const history = full.slice(-days);
  return withLatency({ vaultId, count: history.length, history: clone(history) });
}

/**
 * Simulate a deposit and return the minted shares plus a receipt.
 * @param {string} vaultId
 * @param {number} amount
 * @returns {Promise<object>}
 */
export async function deposit(vaultId, amount) {
  const queued = resolveOrThrow(takeQueued(queuedDepositResults));
  if (queued) return withLatency(clone(queued));

  const vault = MOCK_VAULTS.find((v) => v.id === vaultId);
  if (!vault) throw new Error('Vault not found');
  const shares = previewDeposit(amount, vault.totalAssets, vault.totalShares);
  return withLatency({ shares, vaultId });
}

/**
 * Simulate a withdrawal and return the burned shares plus a receipt.
 * @param {string} vaultId
 * @param {number} amount
 * @returns {Promise<object>}
 */
export async function withdraw(vaultId, amount) {
  const queued = resolveOrThrow(takeQueued(queuedWithdrawResults));
  if (queued) return withLatency(clone(queued));

  const vault = MOCK_VAULTS.find((v) => v.id === vaultId);
  if (!vault) throw new Error('Vault not found');
  const shares = previewWithdraw(amount, vault.totalAssets, vault.totalShares);
  return withLatency({ shares, vaultId });
}
