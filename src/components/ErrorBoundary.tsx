import { Component, ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';
import { buildSafeDiagnostic } from '../utils/diagnostics.js';
import { reportDiagnostic } from '../utils/telemetry.js';

/**
 * Recoverable error boundary for route- and feature-level isolation.
 *
 * - Catches render failures so a single feature cannot blank the shell/nav
 * - Emits a redacted diagnostic with a correlation ID
 * - Offers retry (remount), full reload, and navigate-home recovery
 * - Surfaces retryable dependency failures differently from invalid state
 */

export type ErrorBoundaryLevel = 'route' | 'feature';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Isolation scope — feature failures stay inside the page. */
  level?: ErrorBoundaryLevel;
  /** Stable name used in telemetry and the recovery panel. */
  feature?: string;
  /** Where "Go home" sends the user. */
  homePath?: string;
  /** Optional controlled reset signal (e.g. route change). */
  resetKeys?: Array<string | number | boolean | null | undefined>;
  /** Invoked after a successful in-place retry. */
  onReset?: () => void;
}

interface SafeDiagnostic {
  correlationId: string;
  feature: string;
  level: string;
  kind: 'retryable' | 'invalid_state';
  retryable: boolean;
  userMessage: string;
  name: string;
  message: string;
  code?: string;
  status?: number;
  stack?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  diagnostic: SafeDiagnostic | null;
}

interface RecoveryPanelProps {
  diagnostic: SafeDiagnostic;
  level: ErrorBoundaryLevel;
  homePath: string;
  onRetry: () => void;
  onReload: () => void;
}

function HomeRecoveryAction({
  homePath,
  onRetry,
}: {
  homePath: string;
  onRetry: () => void;
}) {
  const inRouter = useInRouterContext();
  const className = 'btn btn-ghost';
  const label = 'Go home';

  if (inRouter) {
    return (
      <Link
        to={homePath}
        className={className}
        onClick={onRetry}
        data-testid="error-go-home"
      >
        {label}
      </Link>
    );
  }

  return (
    <a
      href={homePath}
      className={className}
      onClick={onRetry}
      data-testid="error-go-home"
    >
      {label}
    </a>
  );
}

function ErrorRecoveryPanel({
  diagnostic,
  level,
  homePath,
  onRetry,
  onReload,
}: RecoveryPanelProps) {
  const title =
    level === 'route'
      ? 'This page could not be displayed'
      : 'This section could not be displayed';

  const hint = diagnostic.retryable
    ? 'This looks like a temporary dependency problem. Retrying is usually safe.'
    : 'This looks like invalid application or provider state. Reload or go home to recover.';

  return (
    <div
      className={`error-boundary-fallback error-boundary-${level} empty-state`}
      role="alert"
      data-testid="error-boundary-fallback"
      data-error-kind={diagnostic.kind}
      data-feature={diagnostic.feature}
    >
      <span className="empty-icon" aria-hidden="true">
        {diagnostic.retryable ? '🔌' : '💥'}
      </span>
      <h3 className="empty-title">{title}</h3>
      <p className="empty-message">{diagnostic.userMessage}</p>
      <p className="error-boundary-hint">{hint}</p>
      <p className="error-boundary-correlation">
        Reference:{' '}
        <code data-testid="error-correlation-id">{diagnostic.correlationId}</code>
      </p>
      <div className="error-boundary-actions">
        {diagnostic.retryable && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={onRetry}
            data-testid="error-retry"
          >
            Try again
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onReload}
          data-testid="error-reload"
        >
          Reload page
        </button>
        <HomeRecoveryAction homePath={homePath} onRetry={onRetry} />
      </div>
    </div>
  );
}

export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, diagnostic: null };
  }

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    // Diagnostic is built in componentDidCatch where we have the error object.
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    const diagnostic = buildSafeDiagnostic(error, {
      feature: this.props.feature || 'app',
      level: this.props.level || 'feature',
    }) as SafeDiagnostic;
    reportDiagnostic(diagnostic as unknown as Record<string, unknown>);
    this.setState({ diagnostic });
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (!this.state.hasError || !this.props.resetKeys) return;
    const prev = prevProps.resetKeys || [];
    const next = this.props.resetKeys;
    if (
      prev.length !== next.length ||
      next.some((key, index) => key !== prev[index])
    ) {
      this.reset();
    }
  }

  reset = () => {
    this.setState({ hasError: false, diagnostic: null });
    this.props.onReset?.();
  };

  reload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      const diagnostic = this.state.diagnostic ?? {
        correlationId: 'yv-pending',
        feature: this.props.feature || 'app',
        level: this.props.level || 'feature',
        kind: 'retryable' as const,
        retryable: true,
        userMessage: 'Something went wrong while rendering this section.',
        name: 'Error',
        message: 'Something went wrong while rendering this section.',
      };

      return (
        <ErrorRecoveryPanel
          diagnostic={diagnostic}
          level={this.props.level || 'feature'}
          homePath={this.props.homePath || '/'}
          onRetry={this.reset}
          onReload={this.reload}
        />
      );
    }
    return this.props.children;
  }
}
