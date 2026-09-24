import React, { useState } from 'react';
import Button from './Button';
import AmountInput from './AmountInput';
import { useWallet } from '../hooks/useWallet.js';
import { usePositions } from '../hooks/usePositions.js';
import { validateWithdraw } from '../utils/validate.js';
import { previewWithdraw } from '../utils/shares.js';
import { formatAmount } from '../utils/format.js';
import * as vaultService from '../services/vault.js';
import * as walletService from '../services/wallet.js';

/**
 * Withdraw form for a vault. Validates against the user's deposited amount,
 * previews the shares to be burned, and submits a mock transaction.
 * Associates validation errors with the amount field and announces preview /
 * outcome updates via polite live regions for keyboard and screen-reader users.
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
  const { positions } = usePositions();
  const [amount, setAmount] = useState('');
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
  const showError = Boolean(error) && amount !== '';
  const errorId = 'withdraw-amount-error';
  const previewId = 'withdraw-preview';
  const balanceId = 'withdraw-balance';
  const messageId = 'withdraw-form-message';

  const handleMax = () => setAmount(String(deposited));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await vaultService.withdraw(vault.id, Number(amount));
      await walletService.signAndSubmit(`Withdraw ${amount} ${vault.asset}`);
      setMessage(`Withdrew ${amount} ${vault.asset}`);
      setAmount('');
      onSuccess?.();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Withdraw failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="vault-form" onSubmit={handleSubmit} noValidate>
      <div className="form-row">
        <label htmlFor="withdraw-amount">Amount</label>
        <span className="muted" id={balanceId}>
          Position: {formatAmount(deposited)} {vault.asset}
        </span>
      </div>
      <div className="input-group">
        <AmountInput
          id="withdraw-amount"
          value={amount}
          onChange={setAmount}
          disabled={!isConnected || submitting}
          placeholder="0.00"
          min="0"
          step="any"
          aria-invalid={showError ? true : false}
          aria-describedby={[balanceId, previewId, showError ? errorId : null, message ? messageId : null]
            .filter(Boolean)
            .join(' ')}
          aria-errormessage={showError ? errorId : undefined}
        />
        <button
          type="button"
          className="max-btn"
          onClick={handleMax}
          aria-label={`Withdraw maximum ${formatAmount(deposited)} ${vault.asset}`}
          disabled={!isConnected || submitting}
        >
          MAX
        </button>
      </div>

      <div
        className="preview-row"
        id={previewId}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="muted">Shares burned</span>
        <span>{formatAmount(sharesBurned)} shares</span>
      </div>

      {showError && (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p id={messageId} className="form-message" role="status" aria-live="polite">
          {message}
        </p>
      )}

      <Button
        type="submit"
        variant="secondary"
        loading={submitting}
        disabled={!isConnected || !valid}
      >
        {isConnected ? 'Withdraw' : 'Connect wallet to withdraw'}
      </Button>
    </form>
  );
}
