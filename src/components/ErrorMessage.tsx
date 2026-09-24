/**
 * Inline error banner with an optional retry action and correlation reference.
 */

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
  /** Support / telemetry join key from captureFailure. */
  correlationId?: string;
  /** When false, hide the retry control even if onRetry is provided. */
  retryable?: boolean;
}

export default function ErrorMessage({
  message,
  onRetry,
  correlationId,
  retryable = true,
}: ErrorMessageProps) {
  const showRetry = Boolean(onRetry) && retryable !== false;

  return (
    <div className="error-message" role="alert" data-testid="error-message">
      <span className="error-icon" aria-hidden="true">
        ⚠️
      </span>
      <div className="error-message-body">
        <span>{message}</span>
        {correlationId && (
          <span className="error-correlation">
            Reference: <code data-testid="error-correlation-id">{correlationId}</code>
          </span>
        )}
      </div>
      {showRetry && (
        <button type="button" className="error-retry" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
