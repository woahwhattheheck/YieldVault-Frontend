import React, { useState } from 'react';
import Button from './Button';
import AmountInput from './AmountInput';
import { useWallet } from '../hooks/useWallet.js';
import { validateDeposit } from '../utils/validate.js';
import { previewDeposit } from '../utils/shares.js';
import { formatAmount } from '../utils/format.js';
import * as vaultService from '../services/vault.js';
import * as walletService from '../services/wallet.js';
import { CONFIG } from '../constants/config.js';
import { shouldBlockMutations, getNetworkGuardState } from '../utils/networkGuard.js';

/**
 * Deposit form for a vault. Validates against wallet balance, previews the
 * shares to be minted, and submits a mock transaction. Mutations are blocked
 * when the connected wallet network does not match the configured deployment.
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
  const { isConnected, balanceOf, walletNetwork } = useWallet();
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const balance = balanceOf(vault.asset);
  const networkBlocked = shouldBlockMutations(isConnected, walletNetwork, CONFIG.network);
  const networkGuard = getNetworkGuardState(walletNetwork, CONFIG.network);
  const { valid, error } = validateDeposit(amount, balance);
  const sharesOut = previewDeposit(amount as unknown as number, vault.totalAssets, vault.totalShares);
  const touched = amount !== '';

  const handleMax = () => setAmount(String(balance));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || networkBlocked) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await vaultService.deposit(vault.id, Number(amount));
      await walletService.signAndSubmit(`Deposit ${amount} ${vault.asset}`, {
        expectedNetwork: CONFIG.network,
      });
      setMessage(`Deposited ${amount} ${vault.asset}`);
      setAmount('');
      onSuccess?.();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Deposit failed');
    } finally {
      setSubmitting(false);
    }
  };

  let submitLabel = 'Connect wallet to deposit';
  if (isConnected && networkBlocked) {
    submitLabel = 'Switch network to deposit';
  } else if (isConnected) {
    submitLabel = 'Deposit';
  }

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
          disabled={!isConnected || submitting || networkBlocked}
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
      {networkBlocked && isConnected && (
        <p className="field-error" role="alert">
          Wrong network: wallet is on {networkGuard.connectedLabel || 'unknown'}, app expects{' '}
          {networkGuard.expectedLabel}. Switch network to deposit.
        </p>
      )}
      {message && <p className="form-message">{message}</p>}

      <Button type="submit" loading={submitting} disabled={!isConnected || !valid || networkBlocked}>
        {submitLabel}
      </Button>
    </form>
  );
}
