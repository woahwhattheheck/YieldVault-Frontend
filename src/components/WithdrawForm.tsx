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
  const [amountError, setAmountError] = useState<string | null>(null);
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
  const validationMessage = amountError || (touched ? error : null);

  const handleMax = () => setAmount(String(deposited));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || amountError) return;
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
    <form className="vault-form" onSubmit={handleSubmit}>
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
          onValidationError={setAmountError}
          disabled={!isConnected || submitting}
          placeholder="0.00"
          min="0"
          step="any"
        />
        <button type="button" className="max-btn" onClick={handleMax}>
          MAX
        </button>
      </div>

      <div className="preview-row">
        <span className="muted">Shares burned</span>
        <span>{formatAmount(sharesBurned)} shares</span>
      </div>

      {validationMessage && <p className="field-error">{validationMessage}</p>}
      {message && <p className="form-message">{message}</p>}

      <Button
        type="submit"
        variant="secondary"
        loading={submitting}
        disabled={!isConnected || !valid || !!amountError}
      >
        {isConnected ? 'Withdraw' : 'Connect wallet to withdraw'}
      </Button>
    </form>
  );
}
