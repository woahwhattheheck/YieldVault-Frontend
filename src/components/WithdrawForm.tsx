import React, { useEffect, useState } from 'react';
import Button from './Button';
import AmountInput from './AmountInput';
import { useWallet } from '../hooks/useWallet.js';
import { useAppContext } from '../context/AppContext';
import { usePositions } from '../hooks/usePositions.js';
import { validateWithdraw } from '../utils/validate.js';
import { previewWithdraw } from '../utils/shares.js';
import { formatAmount } from '../utils/format.js';
import {
  assertCanMutate,
  SessionExpiredError,
  writeSafeDraft,
  readSafeDraft,
  WITHDRAW_DRAFT_KEY,
} from '../utils/sessionAuth.js';
import * as vaultService from '../services/vault.js';
import * as walletService from '../services/wallet.js';

/**
 * Withdraw form for a vault. Validates against the user's deposited amount,
 * previews the shares to be burned, and submits a mock transaction.
 *
 * Expired sessions cannot submit vault mutations; amount drafts are preserved
 * as safe, non-sensitive data across expiry / re-auth.
 */

interface WithdrawFormVault {
  id: string;
  asset: string;
  totalAssets: number;
  totalShares: number;
}

interface WithdrawFormProps {
  vault: WithdrawFormVault;
  onSuccess?: () => void;
}

export default function WithdrawForm({ vault, onSuccess }: WithdrawFormProps) {
  const { isConnected } = useWallet();
  const { mutationsAllowed, ensureSessionActive, sessionExpired } = useAppContext() as {
    mutationsAllowed: boolean;
    ensureSessionActive: (now?: number) => Promise<{ address: string; expiresAt: number } | null>;
    sessionExpired: boolean;
  };
  const { positions } = usePositions();
  const [amount, setAmount] = useState(() => readSafeDraft(WITHDRAW_DRAFT_KEY));
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const position = positions.find((p: { vaultId: string }) => p.vaultId === vault.id);
  const deposited = position?.value ?? 0;
  const { valid, error } = validateWithdraw(amount, deposited);
  const sharesBurned = previewWithdraw(
    amount as unknown as number,
    vault.totalAssets,
    vault.totalShares,
  );
  const touched = amount !== '';
  const canSubmit = isConnected && mutationsAllowed && valid && !sessionExpired;

  useEffect(() => {
    writeSafeDraft(WITHDRAW_DRAFT_KEY, amount);
  }, [amount]);

  const handleMax = () => setAmount(String(deposited));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const activeSession = await ensureSessionActive();
      if (!activeSession) {
        throw new SessionExpiredError();
      }
      assertCanMutate(activeSession);
      await vaultService.withdraw(vault.id, Number(amount));
      const stillActive = await ensureSessionActive();
      if (!stillActive) throw new SessionExpiredError();
      assertCanMutate(stillActive);
      await walletService.signAndSubmit(`Withdraw ${amount} ${vault.asset}`);
      setMessage(`Withdrew ${amount} ${vault.asset}`);
      setAmount('');
      writeSafeDraft(WITHDRAW_DRAFT_KEY, '');
      onSuccess?.();
    } catch (err: unknown) {
      if (err instanceof SessionExpiredError || (err as { code?: string })?.code === 'SESSION_EXPIRED') {
        setMessage('Session expired. Re-authenticate to withdraw.');
      } else {
        setMessage(err instanceof Error ? err.message : 'Withdraw failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="vault-form" onSubmit={handleSubmit} data-testid="withdraw-form">
      <div className="form-row">
        <label htmlFor="withdraw-amount">Amount</label>
        <span className="muted">
          Position: {formatAmount(deposited)} {vault.asset}
        </span>
      </div>
      <div className="input-group">
        <AmountInput
          id="withdraw-amount"
          value={amount}
          onChange={setAmount}
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
        <span className="muted">Shares burned</span>
        <span>{formatAmount(sharesBurned)} shares</span>
      </div>

      {touched && error && <p className="field-error">{error}</p>}
      {message && <p className="form-message" data-testid="withdraw-message">{message}</p>}
      {sessionExpired && (
        <p className="field-error" data-testid="withdraw-session-expired">
          Session expired. Re-authenticate to continue.
        </p>
      )}

      <Button
        type="submit"
        variant="secondary"
        loading={submitting}
        disabled={!canSubmit}
      >
        {sessionExpired
          ? 'Session expired'
          : isConnected
            ? 'Withdraw'
            : 'Connect wallet to withdraw'}
      </Button>
    </form>
  );
}
