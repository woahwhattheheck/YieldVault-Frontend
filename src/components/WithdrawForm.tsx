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
import { CONFIG } from '../constants/config.js';
import { shouldBlockMutations, getNetworkGuardState } from '../utils/networkGuard.js';

/**
 * Withdraw form for a vault. Mutations are blocked when the connected wallet
 * network does not match the configured deployment.
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
  const { isConnected, walletNetwork } = useWallet();
  const { positions } = usePositions();
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const networkBlocked = shouldBlockMutations(isConnected, walletNetwork, CONFIG.network);
  const networkGuard = getNetworkGuardState(walletNetwork, CONFIG.network);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || networkBlocked) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await vaultService.withdraw(vault.id, Number(amount));
      await walletService.signAndSubmit(`Withdraw ${amount} ${vault.asset}`, {
        expectedNetwork: CONFIG.network,
        walletNetwork,
      });
      setMessage(`Withdrew ${amount} ${vault.asset}`);
      setAmount('');
      onSuccess?.();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Withdraw failed');
    } finally {
      setSubmitting(false);
    }
  };

  let submitLabel = 'Connect wallet to withdraw';
  if (isConnected && networkBlocked) {
    submitLabel = 'Switch network to withdraw';
  } else if (isConnected) {
    submitLabel = 'Withdraw';
  }

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
        <span className="muted">Shares burned</span>
        <span>{formatAmount(sharesBurned)} shares</span>
      </div>

      {touched && error && <p className="field-error">{error}</p>}
      {networkBlocked && isConnected && (
        <p className="field-error" role="alert">
          Wrong network: wallet is on {networkGuard.connectedLabel || 'unknown'}, app expects{' '}
          {networkGuard.expectedLabel}. Switch network to withdraw.
        </p>
      )}
      {message && <p className="form-message">{message}</p>}

      <Button
        type="submit"
        variant="secondary"
        loading={submitting}
        disabled={!isConnected || !valid || networkBlocked}
      >
        {submitLabel}
      </Button>
    </form>
  );
}
