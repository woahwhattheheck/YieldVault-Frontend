import React, { useState, useRef } from 'react';
import Button from './Button';
import AmountInput from './AmountInput';
import { parseLocaleAmount } from '../utils/localeAmount.js';
import { useWallet } from '../hooks/useWallet.js';
import { validateDeposit } from '../utils/validate.js';
import { previewDeposit } from '../utils/shares.js';
import { formatAmount } from '../utils/format.js';
import * as vaultService from '../services/vault.js';
import * as walletService from '../services/wallet.js';

/**
 * Deposit form for a vault. Validates against wallet balance, previews the
 * shares to be minted, and submits a mock transaction.
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
  const [amountError, setAmountError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submissionInFlight = useRef(false);
  const [message, setMessage] = useState<string | null>(null);

  const balance = balanceOf(vault.asset);
  const { valid, error } = validateDeposit(amount, balance);
  const sharesOut = previewDeposit(amount as unknown as number, vault.totalAssets, vault.totalShares);
  const touched = amount !== '';
  const validationMessage = amountError || (touched ? error : null);

  const handleMax = () => {
    const maximum = parseLocaleAmount(balance);
    setAmount(maximum.ok ? maximum.canonical : String(balance));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected || !valid || amountError || submissionInFlight.current) return;
    // A ref closes reentrant submits before React commits the loading state.
    submissionInFlight.current = true;
    setSubmitting(true);
    setMessage(null);
    try {
      await vaultService.deposit(vault.id, amount);
      await walletService.signAndSubmit(`Deposit ${amount} ${vault.asset}`);
      setMessage(`Deposited ${amount} ${vault.asset}`);
      setAmount('');
      onSuccess?.();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Deposit failed');
    } finally {
      submissionInFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <form className="vault-form" onSubmit={handleSubmit}>
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
        <span className="muted">You receive</span>
        <span>{formatAmount(sharesOut)} shares</span>
      </div>

      {validationMessage && <p className="field-error">{validationMessage}</p>}
      {message && <p className="form-message">{message}</p>}

      <Button type="submit" loading={submitting} disabled={!isConnected || !valid || !!amountError}>
        {isConnected ? 'Deposit' : 'Connect wallet to deposit'}
      </Button>
    </form>
  );
}
