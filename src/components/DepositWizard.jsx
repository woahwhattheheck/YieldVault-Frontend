import { useState } from 'react';
import FormWizard from './FormWizard.jsx';
import { useWallet } from '../hooks/useWallet.js';
import { useAppContext } from '../context/AppContext';
import { validateDeposit } from '../utils/validate.js';
import { previewDeposit } from '../utils/shares.js';
import { formatAmount, formatDate } from '../utils/format.js';
import * as vaultService from '../services/vault.js';
import * as walletService from '../services/wallet.js';

/**
 * Multi-step deposit wizard for a vault. Guides the user through
 * entering an amount, reviewing the deposit, and confirming the transaction.
 * Keyboard-complete with labelled controls, error association, and live
 * announcements for balance/fee previews and transaction outcomes.
 * @param {object} props
 * @param {object} props.vault
 * @param {() => void} [props.onSuccess]
 */
export default function DepositWizard({ vault, onSuccess }) {
  const { isConnected, balanceOf } = useWallet();
  const { slippageTolerance, timezone } = useAppContext();
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState(null);

  const balance = balanceOf(vault.asset);

  const validate = (_stepIndex, data) => {
    const errors = {};
    if (!data.amount || data.amount === '') {
      errors.amount = 'Amount is required';
    } else {
      const { valid, error } = validateDeposit(data.amount, balance);
      if (!valid) errors.amount = error;
    }
    return errors;
  };

  const steps = [
    {
      id: 'amount',
      title: 'Amount',
      description: 'Enter the amount to deposit',
      icon: '💰',
      content: AmountStep,
    },
    {
      id: 'review',
      title: 'Review',
      description: 'Review your deposit details',
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
      const result = await vaultService.deposit(vault.id, Number(data.amount));
      await walletService.signAndSubmit(`Deposit ${data.amount} ${vault.asset}`);
      // Set receipt first so the success UI renders before the parent
      // re-renders. Use a microtask delay to ensure the state update flushes.
      setReceipt({ ...result, amount: data.amount, asset: vault.asset, timestamp: Date.now() });
      await new Promise((r) => setTimeout(r, 50));
      onSuccess?.();
    } catch (err) {
      setReceipt({ error: err.message || 'Deposit failed' });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Amount step ──
  function AmountStep({ data, setData, errors }) {
    const handleMax = () => setData({ amount: String(balance) });
    const sharesOut = previewDeposit(data.amount, vault.totalAssets, vault.totalShares);
    const hasError = Boolean(errors.amount);
    const errorId = 'wizard-deposit-amount-error';
    const previewId = 'wizard-deposit-preview';
    const balanceId = 'wizard-deposit-balance';

    return (
      <div className="vault-form">
        <div className="form-row">
          <label htmlFor="wizard-deposit-amount">Amount</label>
          <span className="muted" id={balanceId}>
            Balance: {formatAmount(balance)} {vault.asset}
          </span>
        </div>
        <div className="input-group">
          <input
            id="wizard-deposit-amount"
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
            aria-label={`Deposit maximum ${formatAmount(balance)} ${vault.asset}`}
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
          <span className="muted">You receive</span>
          <span>{formatAmount(sharesOut)} shares</span>
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
    const sharesOut = previewDeposit(data.amount, vault.totalAssets, vault.totalShares);

    return (
      <div className="wizard-review" role="region" aria-label="Deposit review summary">
        <div className="wizard-review-row">
          <span className="wizard-review-label">Vault</span>
          <span className="wizard-review-value">{vault.name}</span>
        </div>
        <div className="wizard-review-row">
          <span className="wizard-review-label">Deposit amount</span>
          <span className="wizard-review-value">
            {formatAmount(data.amount)} {vault.asset}
          </span>
        </div>
        <div className="wizard-review-row">
          <span className="wizard-review-label">Shares to receive</span>
          <span className="wizard-review-value wizard-review-total">
            {formatAmount(sharesOut)}
          </span>
        </div>
        <div className="wizard-review-divider" />
        <div className="wizard-review-row">
          <span className="wizard-review-label">Slippage tolerance</span>
          <span className="wizard-review-value">{slippageTolerance}%</span>
        </div>
        <div className="wizard-review-row">
          <span className="wizard-review-label">Estimated APY</span>
          <span className="wizard-review-value" style={{ color: 'var(--accent)' }}>
            {(vault.apy * 100).toFixed(2)}%
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
  function ConfirmStep({ isSubmitting }) {
    if (!receipt && !isSubmitting) {
      return (
        <div className="wizard-success">
          <span className="wizard-success-icon" aria-hidden="true">✅</span>
          <div className="wizard-success-title">Ready to deposit</div>
          <div className="wizard-success-desc">
            Activate Confirm Deposit to submit this transaction.
          </div>
        </div>
      );
    }

    if (!receipt) {
      return (
        <div className="wizard-success" role="status" aria-live="polite" aria-busy="true">
          <span className="wizard-success-icon" aria-hidden="true">⏳</span>
          <div className="wizard-success-title">Processing deposit…</div>
          <div className="wizard-success-desc">Please wait while your transaction is confirmed.</div>
        </div>
      );
    }

    if (receipt.error) {
      return (
        <div className="wizard-success" role="alert" aria-live="assertive">
          <span className="wizard-success-icon" aria-hidden="true">❌</span>
          <div className="wizard-success-title" style={{ color: 'var(--loss)' }}>Deposit failed</div>
          <div className="wizard-success-desc">{receipt.error}</div>
        </div>
      );
    }

    return (
      <div className="wizard-success" role="status" aria-live="polite">
        <span className="wizard-success-icon" aria-hidden="true">🎉</span>
        <div className="wizard-success-title">Deposit successful!</div>
        <div className="wizard-success-desc">
          You deposited {formatAmount(receipt.amount)} {receipt.asset}
        </div>
        <div className="wizard-success-desc">
          and received {formatAmount(receipt.shares)} shares.
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
        <p className="empty-message">Connect your wallet to deposit into this vault.</p>
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
      completeLabel="Confirm Deposit"
      completingLabel="Depositing…"
    />
  );
}
