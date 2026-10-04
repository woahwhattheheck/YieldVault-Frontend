import React, { useState } from 'react';
import Button from './Button';
import AmountInput from './AmountInput';
import ApiErrorState, { type ApiUiError } from './ApiErrorState';
import { useWallet } from '../hooks/useWallet.js';
import { validateDeposit } from '../utils/validate.js';
import { previewDeposit } from '../utils/shares.js';
import { formatAmount } from '../utils/format.js';
import * as vaultService from '../services/vault.js';
import * as walletService from '../services/wallet.js';
import { adaptCaughtError, adaptDepositSuccess, API_ERROR_KIND } from '../services/apiAdapter.js';

/**
 * Deposit form for a vault. Validates against wallet balance, previews the
 * shares to be minted, and submits a mock transaction. Contract API errors
 * render through ApiErrorState so raw payloads never reach the DOM.
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
  const [apiError, setApiError] = useState<ApiUiError | null>(null);

  const balance = balanceOf(vault.asset);
  const { valid, error } = validateDeposit(amount, balance);
  const sharesOut = previewDeposit(amount as unknown as number, vault.totalAssets, vault.totalShares);
  const touched = amount !== '';
  const pendingDeposit = apiError?.kind === API_ERROR_KIND.PENDING;

  const handleMax = () => setAmount(String(balance));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || submitting || pendingDeposit) return;
    setSubmitting(true);
    setMessage(null);
    setApiError(null);
    try {
      const result = await vaultService.deposit(vault.id, Number(amount));
      // When the service returns a v1 depositSuccess payload, adapt it.
      if (result && typeof result === 'object' && 'position' in result && 'tx' in result) {
        const adapted = adaptDepositSuccess(result);
        if (adapted.status !== 'confirmed') {
          const pending = adapted.status === 'pending' || adapted.status === 'submitted';
          setApiError({
            kind: pending ? API_ERROR_KIND.PENDING : API_ERROR_KIND.TERMINAL,
            message: pending
              ? 'Your deposit is pending confirmation. Do not submit it again.'
              : 'The deposit failed. Check its transaction status before trying again.',
            code: pending ? 'TRANSACTION_PENDING' : 'TRANSACTION_FAILED',
            requestId: adapted.tx.txHash,
            retryable: false,
            status: pending ? 202 : 422,
          });
          return;
        }
        await walletService.signAndSubmit(`Deposit ${amount} ${vault.asset}`);
        setMessage(`Deposited ${amount} ${vault.asset} (${adapted.tx.status})`);
      } else {
        await walletService.signAndSubmit(`Deposit ${amount} ${vault.asset}`);
        setMessage(`Deposited ${amount} ${vault.asset}`);
      }
      setAmount('');
      onSuccess?.();
    } catch (err: unknown) {
      setApiError(adaptCaughtError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="vault-form" onSubmit={handleSubmit} data-testid="deposit-form">
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
          disabled={!isConnected || submitting || pendingDeposit}
          placeholder="0.00"
          min="0"
          step="any"
        />
        <button type="button" className="max-btn" onClick={handleMax} disabled={pendingDeposit}>
          MAX
        </button>
      </div>

      <div className="preview-row">
        <span className="muted">You receive</span>
        <span>{formatAmount(sharesOut)} shares</span>
      </div>

      {touched && error && <p className="field-error">{error}</p>}
      {apiError && (
        <ApiErrorState error={apiError} onRetry={apiError.retryable ? () => setApiError(null) : undefined} />
      )}
      {message && !apiError && <p className="form-message">{message}</p>}

      <Button type="submit" loading={submitting} disabled={!isConnected || !valid || pendingDeposit}>
        {isConnected ? 'Deposit' : 'Connect wallet to deposit'}
      </Button>
    </form>
  );
}
