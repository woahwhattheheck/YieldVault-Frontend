import React, { useState } from 'react';
import Button from './Button';
import AmountInput from './AmountInput';
import PreflightStatus from './PreflightStatus';
import { useWallet } from '../hooks/useWallet.js';
import { useNetwork } from '../hooks/useNetwork.js';
import { usePositions } from '../hooks/usePositions.js';
import { usePreflight } from '../hooks/usePreflight.js';
import { validateWithdraw } from '../utils/validate.js';
import { previewWithdraw } from '../utils/shares.js';
import { formatAmount } from '../utils/format.js';
import { shouldRequestSignature } from '../utils/preflight.js';
import * as vaultService from '../services/vault.js';
import * as walletService from '../services/wallet.js';

/**
 * Withdraw form for a vault. Validates against the user's deposited amount,
 * runs a read-only preflight before requesting a signature, and submits a
 * mock transaction. Preflight success is advisory only.
 */

interface WithdrawFormVault {
  id: string;
  asset: string;
  totalAssets: number;
  totalShares: number;
  paused?: boolean;
  minAmount?: number;
  maxAmount?: number;
}

interface WithdrawFormProps {
  vault: WithdrawFormVault;
  onSuccess?: () => void;
}

export default function WithdrawForm({ vault, onSuccess }: WithdrawFormProps) {
  const { isConnected, address, walletNetwork } = useWallet();
  const { network } = useNetwork();
  const { positions } = usePositions();
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const position = positions.find((p: { vaultId: string }) => p.vaultId === vault.id);
  const deposited = position?.value ?? 0;
  const connectedNetwork = walletNetwork ?? network;
  const { valid, error } = validateWithdraw(amount, deposited);
  const sharesBurned = previewWithdraw(
    amount as unknown as number,
    vault.totalAssets,
    vault.totalShares,
  );
  const touched = amount !== '';

  const preflight = usePreflight({
    kind: 'withdraw',
    vaultId: vault.id,
    amount,
    asset: vault.asset,
    walletAddress: address,
    network: connectedNetwork,
    expectedNetwork: network,
    position: deposited,
    vault,
  });

  const handleMax = () => setAmount(String(deposited));

  const handleAmountChange = (next: string) => {
    setAmount(next);
    setMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || submitting || preflight.running) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const result = await preflight.run();
      if (!shouldRequestSignature(result, result.serializedTx ?? '', result.network)) {
        return;
      }

      await vaultService.withdraw(vault.id, Number(amount));
      await walletService.signAndSubmit(`Withdraw ${amount} ${vault.asset}`);
      setMessage(`Withdrew ${amount} ${vault.asset}`);
      setAmount('');
      preflight.reset();
      onSuccess?.();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Withdraw failed');
    } finally {
      setSubmitting(false);
    }
  };

  const busy = submitting || preflight.running;

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
          onChange={handleAmountChange}
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
      <PreflightStatus
        status={preflight.result?.status}
        message={preflight.message}
        retryable={preflight.retryable}
        onRetry={() => {
          void preflight.run();
        }}
      />
      {message && <p className="form-message">{message}</p>}

      <Button
        type="submit"
        variant="secondary"
        loading={busy}
        disabled={!isConnected || !valid || busy}
      >
        {isConnected
          ? busy
            ? preflight.running
              ? 'Running preflight…'
              : 'Withdrawing…'
            : 'Withdraw'
          : 'Connect wallet to withdraw'}
      </Button>
    </form>
  );
}
