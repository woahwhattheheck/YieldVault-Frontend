import React, { useState } from 'react';
import Button from './Button';
import AmountInput from './AmountInput';
import TxStatus from './TxStatus';
import { useWallet } from '../hooks/useWallet.js';
import { useTxLifecycle } from '../hooks/useTxLifecycle.js';
import { validateDeposit } from '../utils/validate.js';
import { previewDeposit } from '../utils/shares.js';
import { formatAmount } from '../utils/format.js';
import * as vaultService from '../services/vault.js';
import * as walletService from '../services/wallet.js';

/**
 * Deposit form for a vault. Validates against wallet balance, previews the
 * shares to be minted, and submits through a refresh-safe tx lifecycle.
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
  const [message, setMessage] = useState<string | null>(null);
  const { operation, status, busy, run, reset } = useTxLifecycle({
    kind: 'deposit',
    vaultId: vault.id,
  });

  const balance = balanceOf(vault.asset);
  const { valid, error } = validateDeposit(amount, balance);
  const sharesOut = previewDeposit(amount as unknown as number, vault.totalAssets, vault.totalShares);
  const touched = amount !== '';

  const handleMax = () => setAmount(String(balance));

  const submitDeposit = async (value: string) => {
    setMessage(null);
    try {
      await run(value, async () => {
        await vaultService.deposit(vault.id, Number(value));
        return walletService.signAndSubmit(`Deposit ${value} ${vault.asset}`);
      });
      setMessage(`Deposited ${value} ${vault.asset}`);
      setAmount('');
      onSuccess?.();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Deposit failed');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    await submitDeposit(amount);
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
          disabled={!isConnected || busy}
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

      {touched && error && <p className="field-error">{error}</p>}
      {message && operation?.state === 'confirmed' && (
        <p className="form-message">{message}</p>
      )}

      <TxStatus
        label={status.label}
        detail={status.detail}
        canRetry={status.canRetry}
        needsNewSignature={status.needsNewSignature}
        state={operation?.state}
        onRetry={
          status.canRetry && amount
            ? () => {
                void submitDeposit(amount);
              }
            : undefined
        }
        onDismiss={operation ? reset : undefined}
      />

      <Button type="submit" loading={busy} disabled={!isConnected || !valid || busy}>
        {isConnected ? (busy ? 'Submitting…' : 'Deposit') : 'Connect wallet to deposit'}
      </Button>
    </form>
  );
}
