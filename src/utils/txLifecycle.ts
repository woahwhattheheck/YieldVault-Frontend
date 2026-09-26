/** A persisted correlation record. The ID is not a contract idempotency key. */
export const TX_STATES = [
  'idle', 'submitted', 'confirming', 'confirmed', 'failed', 'unknown',
] as const;

export type TxState = (typeof TX_STATES)[number];
const STORAGE_KEY = 'yieldvault.txOps';

export type TxOperation = {
  clientOpId: string;
  kind: 'deposit' | 'withdraw';
  vaultId: string;
  amount: string;
  walletAddress: string;
  network: string;
  state: TxState;
  txHash?: string | null;
  /** Whether a definitive status came from a real chain source or the local demo. */
  statusSource?: 'mock' | 'chain';
  error?: string | null;
  retryable?: boolean;
  needsNewSignature?: boolean;
  updatedAt: string;
};

export type TxStatusDescription = {
  label: string | null;
  detail: string | null;
  canRetry: boolean;
  canCheckStatus: boolean;
  canDismiss: boolean;
  needsNewSignature: boolean;
};

export type TxEvent = 'submit' | 'provider_ack' | 'confirmed' | 'failed' | 'timeout' | 'reset';

export function createClientOpId(): string {
  if (globalThis.crypto?.randomUUID) return `op_${globalThis.crypto.randomUUID()}`;
  return `op_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 10)}`;
}

export function fingerprintMutation({ kind, vaultId, amount }: {
  kind: string; vaultId: string; amount: string | number;
}): string {
  return [kind, vaultId, String(amount ?? '').trim()].join('|');
}

function readStore(): Record<string, TxOperation> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveTxOperation(op: TxOperation): void {
  const store = readStore();
  store[op.clientOpId] = { ...op, updatedAt: new Date().toISOString() };
  // A submission without durable correlation cannot be recovered safely.
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function getTxOperation(clientOpId: string): TxOperation | null {
  return readStore()[clientOpId] ?? null;
}

/** Restore the last status, including a confirmed receipt, after refresh. */
export function getLatestTxOperation({ kind, vaultId, walletAddress, network }: {
  kind: string; vaultId: string; walletAddress: string; network: string;
}): TxOperation | null {
  return Object.values(readStore())
    .filter((op) => op?.kind === kind && op.vaultId === vaultId &&
      op.walletAddress === walletAddress && op.network === network)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0] ?? null;
}

/** Only unresolved or failed work blocks another signature. */
export function getActiveTxOperation({ kind, vaultId, walletAddress, network }: {
  kind: string; vaultId: string; walletAddress: string; network: string;
}): TxOperation | null {
  return Object.values(readStore())
    .filter((op) => op?.kind === kind && op.vaultId === vaultId &&
      op.walletAddress === walletAddress && op.network === network &&
      op.state !== 'confirmed')
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0] ?? null;
}

export function clearTxOperation(clientOpId: string): void {
  const store = readStore();
  delete store[clientOpId];
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function transitionTxState(current: TxState, event: TxEvent): TxState {
  switch (event) {
    case 'submit': return current === 'submitted' || current === 'confirming' ? current : 'submitted';
    case 'provider_ack': return current === 'submitted' || current === 'unknown' ? 'confirming' : current;
    case 'confirmed': return current === 'submitted' || current === 'confirming' || current === 'unknown' ? 'confirmed' : current;
    case 'failed': return current === 'confirmed' ? current : 'failed';
    case 'timeout': return current === 'submitted' || current === 'confirming' ? 'unknown' : current;
    case 'reset': return 'idle';
  }
}

export function describeTxStatus(op: TxOperation | null): TxStatusDescription {
  const base = { canRetry: false, canCheckStatus: false, canDismiss: false, needsNewSignature: false };
  if (!op || op.state === 'idle') return { ...base, label: null, detail: null };
  const reference = op.txHash ? ` Transaction hash: ${op.txHash}.` : ` Reference: ${op.clientOpId}.`;
  switch (op.state) {
    case 'submitted':
      return { ...base, canCheckStatus: true, label: 'Submitted', detail: `Waiting for a provider response.${reference}` };
    case 'confirming':
      return { ...base, canCheckStatus: true, label: 'Confirming',
        detail: op.statusSource !== 'chain'
          ? `Checking the local demo status; no chain finality is available.${reference}`
          : `Submitted; waiting for a definitive network status.${reference}` };
    case 'confirmed':
      return op.statusSource !== 'chain'
        ? { ...base, canDismiss: true, label: 'Demo confirmed',
          detail: `The local mock recorded a simulated result. No on-chain confirmation was checked.${reference}` }
        : { ...base, canDismiss: true, label: 'Confirmed',
          detail: `The status provider reported confirmation.${reference}` };
    case 'failed':
      return { ...base, canRetry: Boolean(op.retryable), canDismiss: true,
        needsNewSignature: Boolean(op.retryable), label: 'Failed',
        detail: op.error || 'The transaction definitively failed.' };
    case 'unknown':
      return { ...base, canCheckStatus: true, label: 'Status unknown',
        detail: `The previous submission may have succeeded. Check its status before making another transaction.${reference}` };
  }
}

/** Only a known pre-submit wallet rejection is definitively safe to classify. */
export function classifyProviderError(err: unknown): {
  state: 'failed' | 'unknown'; retryable: boolean; needsNewSignature: boolean; error: string;
} {
  const message = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  const lower = message.toLowerCase();
  const rejected = lower.includes('user rejected') || lower.includes('user denied') ||
    lower.includes('user cancelled') || lower.includes('user canceled');
  return { state: rejected ? 'failed' : 'unknown', retryable: false,
    needsNewSignature: false, error: message };
}
