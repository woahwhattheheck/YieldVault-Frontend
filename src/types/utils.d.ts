/**
 * Type declarations for JS utility modules that accept loose input types.
 */

declare module '../utils/validate.js' {
  export function validateDeposit(
    amount: string | number,
    balance: number,
  ): { valid: boolean; error: string | null };

  export function validateWithdraw(
    amount: string | number,
    deposited: number,
  ): { valid: boolean; error: string | null };

  export function isPositiveNumber(value: string): boolean;
  export function isStellarAddress(address: string): boolean;
  export function isValidPercent(value: string | number): boolean;
}

declare module '../utils/shares.js' {
  export function sharePrice(totalAssets: number, totalShares: number): number;
  export function previewDeposit(
    amount: string | number,
    totalAssets: number,
    totalShares: number,
  ): number;
  export function previewRedeem(
    shares: string | number,
    totalAssets: number,
    totalShares: number,
  ): number;
  export function previewWithdraw(
    amount: string | number,
    totalAssets: number,
    totalShares: number,
  ): number;
}

declare module '../utils/format.js' {
  export function formatAmount(value: number, decimals?: number): string;
  export function formatCompact(value: number): string;
  export function formatShares(value: number, decimals?: number): string;
  export function formatPercent(value: number, decimals?: number): string;
  export function formatUsd(value: number): string;
  export function formatApy(value: number, decimals?: number): string;
  export function projectedYield(principal: number, apy: number): number;
  export function formatSigned(value: number, decimals?: number): string;
  export function shortenAddress(address: string): string;
  export function clamp(value: number, min: number, max: number): number;
  export function formatDate(
    date: Date | string | number,
    timeZone?: string,
    options?: Intl.DateTimeFormatOptions,
  ): string;
}


declare module '../utils/sessionAuth.js' {
  export const SESSION_STORAGE_KEY: string;
  export const SESSION_CHANNEL_NAME: string;
  export const POSITIONS_CACHE_KEY: string;
  export const BALANCES_CACHE_KEY: string;
  export const DEPOSIT_DRAFT_KEY: string;
  export const WITHDRAW_DRAFT_KEY: string;
  export const SENSITIVE_STORAGE_KEYS: string[];
  export const SAFE_STORAGE_KEYS: string[];

  export class SessionExpiredError extends Error {
    code: string;
  }

  export type SessionRecord = {
    address: string;
    startedAt: number;
    expiresAt: number;
    version: number;
  };

  export function createSession(address: string, now?: number, timeoutMs?: number): SessionRecord;
  export function isSessionExpired(session: SessionRecord | null | undefined, now?: number): boolean;
  export function canSubmitVaultMutation(session: SessionRecord | null | undefined, now?: number): boolean;
  export function assertCanMutate(session: SessionRecord | null | undefined, now?: number): void;
  export function extendSession(session: SessionRecord, now?: number, timeoutMs?: number): SessionRecord | null;
  export function readSession(): SessionRecord | null;
  export function writeSession(session: SessionRecord | null): void;
  export function writeSafeDraft(key: string, value: string): void;
  export function readSafeDraft(key: string): string;
  export function clearSensitiveClientState(options?: { preserveDrafts?: boolean }): {
    cleared: string[];
    preserved: string[];
  };
  export function cachePositions(positions: unknown): void;
  export function readCachedPositions(): unknown[] | null;
  export function cacheBalances(balances: Record<string, number>): void;
  export function readCachedBalances(): Record<string, number> | null;
  export function openSessionChannel(
    onMessage: (event: MessageEvent) => void,
  ): { post: (data: object) => void; close: () => void } | null;
}
