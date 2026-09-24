import { useState } from 'react';
import FormWizard from './FormWizard.jsx';
import { useWallet } from '../hooks/useWallet.js';
import { usePositions } from '../hooks/usePositions.js';
import { useAppContext } from '../context/AppContext';
import { validateWithdraw } from '../utils/validate.js';
import { previewWithdraw } from '../utils/shares.js';
import { formatAmount, formatDate } from '../utils/format.js';
import * as vaultService from '../services/vault.js';
import * as walletService from '../services/wallet.js';

/**
 * Multi-step withdraw wizard for a vault. Guides the user through
 * entering an amount, reviewing the withdrawal, and confirming.
 * Keyboard-complete with labelled controls, error association, and live
 * announcements for share burns and transaction outcomes.
 * @param {object} props
 * @param {object} props.vault
 * @param {() => void} [props.onSuccess]
 */
export default function WithdrawWizard({ vault, onSuccess }) {
  const { isConnected } = useWallet();
  const { positions } = usePositions();
  const { slippageTolerance, timezone } = useAppContext();
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState(null);

  const position = positions.find((p) => p.vaultId === vault.id);
  const deposited = position?.value ?? 0;

  const validate = (_stepIndex, data) => {
    const errors = {};
    if (!data.amount || data.amount === '') {
      errors.amount = 'Amount is required';
    } else {
      const { valid, error } = validateWithdraw(data.amount, deposited);
      if (!valid) errors.amount = error;
    }
    return errors;
  };

  const steps = [
    {
      id: 'amount',
      title: 'Amount',
      description: 'Enter the amount to withdraw',
      icon: '🏦',
      content: AmountStep,
    },
    {
      id: 'review',
      title: 'Review',
      description: 'Review your withdrawal details',
      icon: '📋',
      content: ReviewStep,
    },
    {
      id: 'confirm',
      title: 'Confirm',
      description: 'Transaction submitted',
      icon: '✅',
      content: ConfirmStep,
    },
  ];

  const handleComplete = async (data) => {
    setSubmitting(true);
    try {
      const result = await vaultService.withdraw(vault.id, Number(data.amount));
      await walletService.signAndSubmit(`Withdraw ${data.amount} ${vault.asset}`);
      // Set receipt first so the success UI renders before the parent
      // re-renders. Use a microtask delay to ensure the state update flushes.
      setReceipt({ ...result, amount: data.amount, asset: vault.asset, timestamp: Date.now() });
      await new Promise((r) => setTimeout(r, 50));
      onSuccess?.();
    } catch (err) {
      setReceipt({ error: err.message || 'Withdrawal failed' });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Amount step ──
  function AmountStep({ data, setData, errors }) {
    const handleMax = () => setData({ amount: String(deposited) });
    const sharesBurned = previewWithdraw(data.amount, vault.totalAssets, vault.totalShares);
    const hasError = Boolean(errors.amount);
    const errorId = 'wizard-withdraw-amount-error';
    const previewId = 'wizard-withdraw-preview';
    const balanceId = 'wizard-withdraw-balance';

    return (
      <div className="vault-form">
        <div className="form-row">
          <label htmlFor="wizard-withdraw-amount">Amount</label>
          <span className="muted" id={balanceId}>
            Position: {formatAmount(deposited)} {vault.asset}
          </span>
        </div>
        <div className="input-group">
          <input
            id="wizard-withdraw-amount"
            type="number"
            min="0"
            step="any"
            placeholder="0.00"
            value={data.amount || ''}
            onChange={(e) => setData({ amount: e.target.value })}
            disabled={!isConnected || submitting}
            autoFocus
            aria-invalid={hasError ? 'true' : 'false'}
            aria-describedby={[balanceId, previewId, hasError ? errorId : null]
              .filter(Boolean)
              .join(' ')}
            aria-errormessage={hasError ? errorId : undefined}
          />
          <button
            type="button"
            className="max-btn"
            onClick={handleMax}
            aria-label={`Withdraw maximum ${formatAmount(deposited)} ${vault.asset}`}
            disabled={!isConnected || submitting}
          >
            MAX
          </button>
        </div>
        <div
          className="preview-row"
          id={previewId}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="muted">Shares burned</span>
          <span>{formatAmount(sharesBurned)} shares</span>
        </div>
        {hasError && (
          <p id={errorId} className="field-error" role="alert">
            {errors.amount}
          </p>
        )}
      </div>
    );
  }

  // ── Review step ──
  function ReviewStep({ data }) {
    const sharesBurned = previewWithdraw(data.amount, vault.totalAssets, vault.totalShares);

    return (
      <div className="wizard-review" role="region" aria-label="Withdrawal review summary">
        <div className="wizard-review-row">
          <span className="wizard-review-label">Vault</span>
          <span className="wizard-review-value">{vault.name}</span>
        </div>
        <div className="wizard-review-row">
          <span className="wizard-review-label">Withdraw amount</span>
          <span className="wizard-review-value">
            {formatAmount(data.amount)} {vault.asset}
          </span>
        </div>
        <div className="wizard-review-row">
          <span className="wizard-review-label">Shares to burn</span>
          <span className="wizard-review-value wizard-review-total">
            {formatAmount(sharesBurned)}
          </span>
        </div>
        <div className="wizard-review-divider" />
        <div className="wizard-review-row">
          <span className="wizard-review-label">Slippage tolerance</span>
          <span className="wizard-review-value">{slippageTolerance}%</span>
        </div>
        <div className="wizard-review-row">
          <span className="wizard-review-label">Remaining position</span>
          <span className="wizard-review-value">
            {formatAmount(Math.max(0, deposited - Number(data.amount)))} {vault.asset}
          </span>
        </div>
        <div className="wizard-review-row">
          <span className="wizard-review-label">Risk level</span>
          <span className="wizard-review-value">{vault.risk}</span>
        </div>
      </div>
    );
  }

  // ── Confirm/Success step ──
  function ConfirmStep() {
    if (!receipt) {
      return (
        <div className="wizard-success" role="status" aria-live="polite" aria-busy="true">
          <span className="wizard-success-icon" aria-hidden="true">⏳</span>
          <div className="wizard-success-title">Processing withdrawal…</div>
          <div className="wizard-success-desc">Please wait while your transaction is confirmed.</div>
        </div>
      );
    }

    if (receipt.error) {
      return (
        <div className="wizard-success" role="alert" aria-live="assertive">
          <span className="wizard-success-icon" aria-hidden="true">❌</span>
          <div className="wizard-success-title" style={{ color: 'var(--loss)' }}>Withdrawal failed</div>
          <div className="wizard-success-desc">{receipt.error}</div>
        </div>
      );
    }

    return (
      <div className="wizard-success" role="status" aria-live="polite">
        <span className="wizard-success-icon" aria-hidden="true">🎉</span>
        <div className="wizard-success-title">Withdrawal successful!</div>
        <div className="wizard-success-desc">
          You withdrew {formatAmount(receipt.amount)} {receipt.asset}
        </div>
        <div className="wizard-success-desc">
          burning {formatAmount(receipt.shares)} shares.
        </div>
        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'center' }}>
          <span className="wizard-success-detail" style={{ margin: 0 }}>
            TX: {receipt.vaultId}::{receipt.timestamp?.toString(36) || Date.now().toString(36)}
          </span>
          <span className="wizard-success-detail" style={{ margin: 0, opacity: 0.85 }}>
            Time: {formatDate(receipt.timestamp || Date.now(), timezone)}
          </span>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="empty-state" style={{ padding: '2rem 1rem' }} role="status">
        <span style={{ fontSize: '2rem' }} aria-hidden="true">🔌</span>
        <p className="empty-message">Connect your wallet to withdraw from this vault.</p>
      </div>
    );
  }

  // If user has no position in this vault, show a message instead of the wizard
  if (deposited <= 0) {
    return (
      <div className="empty-state" style={{ padding: '2rem 1rem' }} role="status">
        <span style={{ fontSize: '2rem' }} aria-hidden="true">📭</span>
        <p className="empty-message">
          You don't have any {vault.asset} deposited in this vault yet.
        </p>
      </div>
    );
  }

  return (
    <FormWizard
      steps={steps}
      initialData={{ amount: '' }}
      onComplete={handleComplete}
      validate={validate}
      submitting={submitting}
      completeLabel="Confirm Withdrawal"
      completingLabel="Withdrawing…"
    />
  );
}
