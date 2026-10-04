import React, { useState } from 'react';
import Button from './Button';
import AmountInput from './AmountInput';
import ApiErrorState, { type ApiUiError } from './ApiErrorState';
import { useWallet } from '../hooks/useWallet.js';
import { usePositions } from '../hooks/usePositions.js';
import { validateWithdraw } from '../utils/validate.js';
import { previewWithdraw } from '../utils/shares.js';
import { formatAmount } from '../utils/format.js';
import * as vaultService from '../services/vault.js';
import * as walletService from '../services/wallet.js';
import {
  adaptCaughtError,
  adaptWithdrawSuccess,
  API_ERROR_KIND,
} from '../services/apiAdapter.js';

/**
 * Withdraw form for a vault. Contract pending/terminal outcomes and API errors
 * render through ApiErrorState so raw responses never leak into the UI.
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
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [apiError, setApiError] = useState<ApiUiError | null>(null);

  const position = positions.find((p: { vaultId: string }) => p.vaultId === vault.id);
  const deposited = position?.value ?? 0;
  const { valid, error } = validateWithdraw(amount, deposited);
  const sharesBurned = previewWithdraw(
    amount as unknown as number,
    vault.totalAssets,
    vault.totalShares,
  );
  const touched = amount !== '';
  const pendingWithdraw = apiError?.kind === API_ERROR_KIND.PENDING;

  const handleMax = () => setAmount(String(deposited));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || submitting || pendingWithdraw) return;
    setSubmitting(true);
    setMessage(null);
    setApiError(null);
    try {
      const result = await vaultService.withdraw(vault.id, Number(amount));
      if (result && typeof result === 'object' && 'tx' in result && 'withdrawnAssets' in result) {
        const adapted = adaptWithdrawSuccess(result);
        if (adapted.kind === API_ERROR_KIND.PENDING || adapted.kind === API_ERROR_KIND.TERMINAL) {
          setApiError({
            kind: adapted.kind,
            message: adapted.message || 'Transaction update',
            code: adapted.status === 'failed' ? 'TRANSACTION_FAILED' : 'TRANSACTION_PENDING',
            requestId: adapted.tx.txHash,
            retryable: false,
            status: adapted.kind === API_ERROR_KIND.TERMINAL ? 422 : 202,
          });
          return;
        }
        await walletService.signAndSubmit(`Withdraw ${amount} ${vault.asset}`);
        setMessage(`Withdrew ${amount} ${vault.asset} (${adapted.tx.status})`);
      } else {
        await walletService.signAndSubmit(`Withdraw ${amount} ${vault.asset}`);
        setMessage(`Withdrew ${amount} ${vault.asset}`);
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
    <form className="vault-form" onSubmit={handleSubmit} data-testid="withdraw-form">
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
          disabled={!isConnected || submitting || pendingWithdraw}
          placeholder="0.00"
          min="0"
          step="any"
        />
        <button type="button" className="max-btn" onClick={handleMax} disabled={pendingWithdraw}>
          MAX
        </button>
      </div>

      <div className="preview-row">
        <span className="muted">Shares burned</span>
        <span>{formatAmount(sharesBurned)} shares</span>
      </div>

      {touched && error && <p className="field-error">{error}</p>}
      {apiError && (
        <ApiErrorState error={apiError} onRetry={apiError.retryable ? () => setApiError(null) : undefined} />
      )}
      {message && !apiError && <p className="form-message">{message}</p>}

      <Button
        type="submit"
        variant="secondary"
        loading={submitting}
        disabled={!isConnected || !valid || pendingWithdraw}
      >
        {isConnected ? 'Withdraw' : 'Connect wallet to withdraw'}
      </Button>
    </form>
  );
}
