import Button from './Button';

interface PreflightStatusProps {
  status?: string | null;
  message?: string | null;
  retryable?: boolean;
  onRetry?: () => void;
}

/**
 * User-visible preflight states for value-moving transactions.
 * Successful simulation is labeled as advisory — never as confirmation.
 */
export default function PreflightStatus({
  status,
  message,
  retryable = false,
  onRetry,
}: PreflightStatusProps) {
  if (!status || status === 'idle' || !message) return null;

  const tone =
    status === 'ok'
      ? 'ok'
      : status === 'running'
        ? 'running'
        : status === 'timeout' || status === 'unsupported' || status === 'stale'
          ? 'retry'
          : 'error';

  return (
    <div
      className={`preflight-status preflight-status--${tone}`}
      data-testid="preflight-status"
      data-status={status}
      role={tone === 'error' || tone === 'retry' ? 'alert' : 'status'}
    >
      <p className="preflight-status__message">{message}</p>
      {retryable && onRetry && (
        <Button type="button" variant="secondary" onClick={onRetry}>
          Retry preflight
        </Button>
      )}
    </div>
  );
}
