import React, { useEffect, useState } from 'react';
import Button from './Button';
import AmountInput from './AmountInput';
import { useWallet } from '../hooks/useWallet.js';
import { useAppContext } from '../context/AppContext';
import { validateDeposit } from '../utils/validate.js';
import { previewDeposit } from '../utils/shares.js';
import { formatAmount } from '../utils/format.js';
import {
  assertCanMutate,
  SessionExpiredError,
  writeSafeDraft,
  readSafeDraft,
  DEPOSIT_DRAFT_KEY,
} from '../utils/sessionAuth.js';
import * as vaultService from '../services/vault.js';
import * as walletService from '../services/wallet.js';

/**
 * Deposit form for a vault. Validates against wallet balance, previews the
 * shares to be minted, and submits a mock transaction.
 *
 * Expired sessions cannot submit: we re-check authorization immediately
 * before the mutation and abort with an explicit re-auth message. Amount
 * drafts are safe and survive expiry via sessionStorage.
 */

interface DepositFormVault {
  id: string;
  asset: string;
  totalAssets: number;
  totalShares: number;
}

interface DepositFormProps {
  vault: DepositFormVault;
  onSuccess?: () => void;
}

export default function DepositForm({ vault, onSuccess }: DepositFormProps) {
  const { isConnected, balanceOf } = useWallet();
  const { mutationsAllowed, ensureSessionActive, sessionExpired } = useAppContext() as {
    mutationsAllowed: boolean;
    ensureSessionActive: (now?: number) => Promise<{ address: string; expiresAt: number } | null>;
    sessionExpired: boolean;
  };
  const [amount, setAmount] = useState(() => readSafeDraft(DEPOSIT_DRAFT_KEY));
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const balance = balanceOf(vault.asset);
  const { valid, error } = validateDeposit(amount, balance);
  const sharesOut = previewDeposit(amount as unknown as number, vault.totalAssets, vault.totalShares);
  const touched = amount !== '';
  const canSubmit = isConnected && mutationsAllowed && valid && !sessionExpired;

  useEffect(() => {
    writeSafeDraft(DEPOSIT_DRAFT_KEY, amount);
  }, [amount]);

  const handleMax = () => setAmount(String(balance));

  const handleAmountChange = (next: string) => {
    setAmount(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    setMessage(null);
    try {
      // Detect expiry before the sensitive mutation and clear protected state.
      const activeSession = await ensureSessionActive();
      if (!activeSession) {
        throw new SessionExpiredError();
      }
      assertCanMutate(activeSession);
      await vaultService.deposit(vault.id, Number(amount));
      // Re-check after the async vault call so a concurrent expiry/tab logout
      // cannot race a signature request past the authorization gate.
      const stillActive = await ensureSessionActive();
      if (!stillActive) throw new SessionExpiredError();
      assertCanMutate(stillActive);
      await walletService.signAndSubmit(`Deposit ${amount} ${vault.asset}`);
      setMessage(`Deposited ${amount} ${vault.asset}`);
      setAmount('');
      writeSafeDraft(DEPOSIT_DRAFT_KEY, '');
      onSuccess?.();
    } catch (err: unknown) {
      if (err instanceof SessionExpiredError || (err as { code?: string })?.code === 'SESSION_EXPIRED') {
        setMessage('Session expired. Re-authenticate to deposit.');
      } else {
        setMessage(err instanceof Error ? err.message : 'Deposit failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="vault-form" onSubmit={handleSubmit} data-testid="deposit-form">
      <div className="form-row">
        <label htmlFor="deposit-amount">Amount</label>
        <span className="muted">
          Balance: {formatAmount(balance)} {vault.asset}
        </span>
      </div>
      <div className="input-group">
        <AmountInput
          id="deposit-amount"
          value={amount}
          onChange={handleAmountChange}
          disabled={!isConnected || submitting || sessionExpired}
          placeholder="0.00"
          min="0"
          step="any"
        />
        <button type="button" className="max-btn" onClick={handleMax} disabled={!isConnected || sessionExpired}>
          MAX
        </button>
      </div>

      <div className="preview-row">
        <span className="muted">You receive</span>
        <span>{formatAmount(sharesOut)} shares</span>
      </div>

      {touched && error && <p className="field-error">{error}</p>}
      {message && <p className="form-message" data-testid="deposit-message">{message}</p>}
      {sessionExpired && (
        <p className="field-error" data-testid="deposit-session-expired">
          Session expired. Re-authenticate to continue.
        </p>
      )}

      <Button type="submit" loading={submitting} disabled={!canSubmit}>
        {sessionExpired
          ? 'Session expired'
          : isConnected
            ? 'Deposit'
            : 'Connect wallet to deposit'}
      </Button>
    </form>
  );
}
