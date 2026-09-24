import React, { useState } from 'react';
import Button from './Button';
import AmountInput from './AmountInput';
import PreflightStatus from './PreflightStatus';
import { useWallet } from '../hooks/useWallet.js';
import { useNetwork } from '../hooks/useNetwork.js';
import { usePreflight } from '../hooks/usePreflight.js';
import { validateDeposit } from '../utils/validate.js';
import { previewDeposit } from '../utils/shares.js';
import { formatAmount } from '../utils/format.js';
import { shouldRequestSignature } from '../utils/preflight.js';
import * as vaultService from '../services/vault.js';
import * as walletService from '../services/wallet.js';

/**
 * Deposit form for a vault. Validates against wallet balance, runs a
 * read-only preflight before requesting a signature, and submits a mock
 * transaction. Preflight success is advisory only — on-chain validation
 * remains authoritative.
 */

interface DepositFormVault {
  id: string;
  asset: string;
  totalAssets: number;
  totalShares: number;
  paused?: boolean;
  minAmount?: number;
  maxAmount?: number;
}

interface DepositFormProps {
  vault: DepositFormVault;
  onSuccess?: () => void;
}

export default function DepositForm({ vault, onSuccess }: DepositFormProps) {
  const { isConnected, balanceOf, address, walletNetwork } = useWallet();
  const { network } = useNetwork();
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const balance = balanceOf(vault.asset);
  const connectedNetwork = walletNetwork ?? network;
  const { valid, error } = validateDeposit(amount, balance);
  const sharesOut = previewDeposit(amount as unknown as number, vault.totalAssets, vault.totalShares);
  const touched = amount !== '';

  const preflight = usePreflight({
    kind: 'deposit',
    vaultId: vault.id,
    amount,
    asset: vault.asset,
    walletAddress: address,
    network: connectedNetwork,
    expectedNetwork: network,
    balance,
    vault,
  });

  const handleMax = () => setAmount(String(balance));

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
        // Deterministic failure, timeout, or unsupported — never request a signature.
        return;
      }

      await vaultService.deposit(vault.id, Number(amount));
      await walletService.signAndSubmit(`Deposit ${amount} ${vault.asset}`);
      setMessage(`Deposited ${amount} ${vault.asset}`);
      setAmount('');
      preflight.reset();
      onSuccess?.();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Deposit failed');
    } finally {
      setSubmitting(false);
    }
  };

  const busy = submitting || preflight.running;

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
        <span className="muted">You receive</span>
        <span>{formatAmount(sharesOut)} shares</span>
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

      <Button type="submit" loading={busy} disabled={!isConnected || !valid || busy}>
        {isConnected
          ? busy
            ? preflight.running
              ? 'Running preflight…'
              : 'Depositing…'
            : 'Deposit'
          : 'Connect wallet to deposit'}
      </Button>
    </form>
  );
}
