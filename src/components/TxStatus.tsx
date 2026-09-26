import Button from './Button';

interface TxStatusProps {
  label: string | null;
  detail: string | null;
  canRetry: boolean;
  canCheckStatus: boolean;
  checking: boolean;
  needsNewSignature: boolean;
  onRetry?: () => void;
  onCheckStatus?: () => void;
  onDismiss?: () => void;
  state?: string | null;
}

/**
 * Surfaces vault mutation lifecycle status with explicit recovery actions.
 */
export default function TxStatus({
  label,
  detail,
  canRetry,
  canCheckStatus,
  checking,
  needsNewSignature,
  onRetry,
  onCheckStatus,
  onDismiss,
  state,
}: TxStatusProps) {
  if (!label) return null;

  const tone =
    state === 'confirmed'
      ? 'success'
      : state === 'failed'
        ? 'danger'
        : state === 'unknown'
          ? 'warning'
          : 'info';

  return (
    <div
      className={`tx-status tx-status--${tone}`}
      role="status"
      aria-live="polite"
      data-testid="tx-status"
      data-state={state ?? undefined}
    >
      <strong className="tx-status__label">{label}</strong>
      {detail && <p className="tx-status__detail">{detail}</p>}
      {needsNewSignature && canRetry && (
        <p className="tx-status__hint">
          The previous transaction definitively failed. Retrying requires a new wallet signature.
        </p>
      )}
      <div className="tx-status__actions">
        {canCheckStatus && onCheckStatus && (
          <Button type="button" onClick={onCheckStatus} disabled={checking}>
            {checking ? 'Checking…' : 'Check status'}
          </Button>
        )}
        {canRetry && onRetry && (
          <Button type="button" onClick={onRetry}>
            Retry
          </Button>
        )}
        {onDismiss && (
          <Button type="button" variant="secondary" onClick={onDismiss}>
            Dismiss
          </Button>
        )}
      </div>
    </div>
  );
}
