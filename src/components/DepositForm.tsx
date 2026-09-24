import React, { useState } from 'react';
import Button from './Button';
import AmountInput from './AmountInput';
import { useWallet } from '../hooks/useWallet.js';
import { validateDeposit } from '../utils/validate.js';
import { previewDeposit } from '../utils/shares.js';
import { formatAmount } from '../utils/format.js';
import * as vaultService from '../services/vault.js';
import * as walletService from '../services/wallet.js';

/**
 * Deposit form for a vault. Validates against wallet balance, previews the
 * shares to be minted, and submits a mock transaction.
 * Associates validation errors with the amount field and announces preview /
 * outcome updates via polite live regions for keyboard and screen-reader users.
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
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  
  const balance = balanceOf(vault.asset);
  const { valid, error } = validateDeposit(amount, balance);
  const sharesOut = previewDeposit(amount as unknown as number, vault.totalAssets, vault.totalShares);
  const showError = Boolean(error) && amount !== '';
  const errorId = 'deposit-amount-error';
  const previewId = 'deposit-preview';
  const balanceId = 'deposit-balance';
  const messageId = 'deposit-form-message';

  const handleMax = () => setAmount(String(balance));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await vaultService.deposit(vault.id, Number(amount));
      await walletService.signAndSubmit(`Deposit ${amount} ${vault.asset}`);
      setMessage(`Deposited ${amount} ${vault.asset}`);
      setAmount('');
      onSuccess?.();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Deposit failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="vault-form" onSubmit={handleSubmit} noValidate>
      <div className="form-row">
        <label htmlFor="deposit-amount">Amount</label>
        <span className="muted" id={balanceId}>
          Balance: {formatAmount(balance)} {vault.asset}
        </span>
      </div>
      <div className="input-group">
        <AmountInput
          id="deposit-amount"
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
          aria-label={`Deposit maximum ${formatAmount(balance)} ${vault.asset}`}
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
        <span className="muted">You receive</span>
        <span>{formatAmount(sharesOut)} shares</span>
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

      <Button type="submit" loading={submitting} disabled={!isConnected || !valid}>
        {isConnected ? 'Deposit' : 'Connect wallet to deposit'}
      </Button>
    </form>
  );
}
