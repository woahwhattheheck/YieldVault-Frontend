import React, { useEffect, useState } from 'react';
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
  const { isConnected, balanceOf, address, walletNetwork } = useWallet();
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const { operation, status, busy, checking, run, checkStatus, reset } = useTxLifecycle({
    kind: 'deposit',
    vaultId: vault.id,
    walletAddress: address ?? '',
    network: walletNetwork ?? '',
    getStatus: walletService.getTransactionStatus,
  });

  // After refresh, restore the persisted amount so retry stays available.
  useEffect(() => {
    if (operation?.amount && amount === '') {
      setAmount(String(operation.amount));
    }
  }, [operation?.amount]); // eslint-disable-line react-hooks/exhaustive-deps

  const balance = balanceOf(vault.asset);
  const { valid, error } = validateDeposit(amount, balance);
  const sharesOut = previewDeposit(amount as unknown as number, vault.totalAssets, vault.totalShares);
  const touched = amount !== '';

  const handleMax = () => setAmount(String(balance));

  const submitDeposit = async (value: string) => {
    setMessage(null);
    try {
      const result = await run(value, async (clientOpId) => {
        await vaultService.deposit(vault.id, Number(value));
        return walletService.signAndSubmit(`Deposit ${value} ${vault.asset}`, { clientOpId });
      });
      if (result?.state === 'confirmed') {
        setMessage(`Deposited ${value} ${vault.asset}`);
        setAmount('');
        onSuccess?.();
      }
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Deposit failed');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy || operation?.state === 'failed') return;
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
        <button type="button" className="max-btn" onClick={handleMax} disabled={busy}>
          MAX
        </button>
      </div>

      <div className="preview-row">
        <span className="muted">You receive</span>
        <span>{formatAmount(sharesOut)} shares</span>
      </div>

      {touched && error && <p className="field-error">{error}</p>}
      {message && (
        <p className="form-message">{message}</p>
      )}

      <TxStatus
        label={status.label}
        detail={status.detail}
        canRetry={status.canRetry}
        canCheckStatus={status.canCheckStatus}
        checking={checking}
        needsNewSignature={status.needsNewSignature}
        state={operation?.state}
        onRetry={
          status.canRetry && isConnected && valid
            ? () => {
                void submitDeposit(amount);
              }
            : undefined
        }
        onCheckStatus={status.canCheckStatus ? () => { void checkStatus(); } : undefined}
        onDismiss={status.canDismiss ? reset : undefined}
      />

      <Button type="submit" loading={checking || operation?.state === 'submitted' || operation?.state === 'confirming'} disabled={!isConnected || !valid || busy || operation?.state === 'failed'}>
        {isConnected ? 'Deposit' : 'Connect wallet to deposit'}
      </Button>
    </form>
  );
}
