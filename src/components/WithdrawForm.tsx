import React, { useState } from 'react';
import Button from './Button';
import AmountInput from './AmountInput';
import TxStatus from './TxStatus';
import { useWallet } from '../hooks/useWallet.js';
import { usePositions } from '../hooks/usePositions.js';
import { useTxLifecycle } from '../hooks/useTxLifecycle.js';
import { validateWithdraw } from '../utils/validate.js';
import { previewWithdraw } from '../utils/shares.js';
import { formatAmount } from '../utils/format.js';
import * as vaultService from '../services/vault.js';
import * as walletService from '../services/wallet.js';

/**
 * Withdraw form for a vault. Validates against the user's deposited amount,
 * previews the shares to be burned, and submits through a refresh-safe tx lifecycle.
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
  const [message, setMessage] = useState<string | null>(null);
  const { operation, status, busy, run, reset } = useTxLifecycle({
    kind: 'withdraw',
    vaultId: vault.id,
  });

  const position = positions.find((p: { vaultId: string }) => p.vaultId === vault.id);
  const deposited = position?.value ?? 0;
  const { valid, error } = validateWithdraw(amount, deposited);
  const sharesBurned = previewWithdraw(
    amount as unknown as number,
    vault.totalAssets,
    vault.totalShares,
  );
  const touched = amount !== '';

  const handleMax = () => setAmount(String(deposited));

  const submitWithdraw = async (value: string) => {
    setMessage(null);
    try {
      const completed = await run(value, async () => {
        await vaultService.withdraw(vault.id, Number(value));
        return walletService.signAndSubmit(`Withdraw ${value} ${vault.asset}`);
      });
      if (completed?.state !== 'confirmed') return;
      setMessage(`Withdrew ${value} ${vault.asset}`);
      setAmount('');
      onSuccess?.();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Withdraw failed');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    await submitWithdraw(amount);
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
        <span className="muted">Shares burned</span>
        <span>{formatAmount(sharesBurned)} shares</span>
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
                void submitWithdraw(amount);
              }
            : undefined
        }
        onDismiss={operation ? reset : undefined}
      />

      <Button
        type="submit"
        variant="secondary"
        loading={busy}
        disabled={!isConnected || !valid || busy}
      >
        {isConnected ? (busy ? 'Submitting…' : 'Withdraw') : 'Connect wallet to withdraw'}
      </Button>
    </form>
  );
}
