/**
 * Renders a contract-classified API error without leaking raw responses.
 * Supported kinds: validation, authorization, provider, pending, terminal.
 */

import ErrorMessage from './ErrorMessage';

export type ApiErrorKind =
  | 'validation'
  | 'authorization'
  | 'provider'
  | 'pending'
  | 'terminal'
  | 'unknown';

export interface ApiUiError {
  kind: ApiErrorKind;
  message: string;
  code?: string | null;
  requestId?: string | null;
  retryable?: boolean;
  status?: number | null;
}

interface ApiErrorStateProps {
  error: ApiUiError;
  onRetry?: () => void;
}

const KIND_LABEL: Record<ApiErrorKind, string> = {
  validation: 'Validation error',
  authorization: 'Authorization required',
  provider: 'Provider unavailable',
  pending: 'Transaction pending',
  terminal: 'Transaction failed',
  unknown: 'Error',
};

export default function ApiErrorState({ error, onRetry }: ApiErrorStateProps) {
  const showRetry = Boolean(onRetry) && (error.retryable || error.kind === 'provider');
  const title = KIND_LABEL[error.kind] || KIND_LABEL.unknown;

  return (
    <div
      className={`api-error-state api-error-state--${error.kind}`}
      data-testid="api-error-state"
      data-kind={error.kind}
      data-code={error.code || undefined}
    >
      <ErrorMessage message={`${title}: ${error.message}`} onRetry={showRetry ? onRetry : undefined} />
      {error.requestId ? (
        <p className="api-error-correlation muted" data-testid="api-error-correlation">
          Reference: {error.requestId}
        </p>
      ) : null}
    </div>
  );
}
