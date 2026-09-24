import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ErrorBoundary from '../../src/components/ErrorBoundary';
import ErrorMessage from '../../src/components/ErrorMessage';
import {
  clearTelemetry,
  getTelemetryEvents,
  reportDiagnostic,
} from '../../src/utils/telemetry.js';
import {
  assertWellFormedResponse,
  captureFailure,
  createAppError,
  containsSensitiveValue,
} from '../../src/utils/diagnostics.js';

const WALLET = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';

describe('error boundary integration', () => {
  beforeEach(() => {
    clearTelemetry();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps shell navigation when a routed page feature crashes', () => {
    function CrashPage() {
      throw new Error('injected page failure');
    }

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <div className="app">
          <nav data-testid="navbar">Dashboard Positions</nav>
          <main>
            <ErrorBoundary level="route" feature="dashboard">
              <CrashPage />
            </ErrorBoundary>
          </main>
          <footer data-testid="footer">footer</footer>
        </div>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('navbar')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();
    expect(screen.getByTestId('error-correlation-id').textContent).toMatch(/^yv-/);
  });

  it('surfaces correlation ids on async error banners without leaking wallets', () => {
    const failure = captureFailure(
      createAppError(`RPC failed for ${WALLET}`, {
        code: 'DEPENDENCY_FAILURE',
        retryable: true,
        status: 503,
      }),
      { feature: 'vaults', level: 'feature' },
    );
    reportDiagnostic(failure.diagnostic);

    render(
      <ErrorMessage
        message={failure.message}
        correlationId={failure.correlationId}
        retryable={failure.retryable}
        onRetry={() => {}}
      />,
    );

    expect(screen.getByTestId('error-message')).toBeInTheDocument();
    expect(screen.getByTestId('error-correlation-id')).toHaveTextContent(
      failure.correlationId,
    );
    expect(screen.getByTestId('error-message').textContent).not.toContain(WALLET);
    expect(containsSensitiveValue(getTelemetryEvents())).toBe(false);
  });

  it('rejects malformed provider payloads as non-retryable', () => {
    expect(() =>
      assertWellFormedResponse(
        { broken: true },
        {
          requireKeys: ['totalTvl', 'avgApy', 'vaultCount'],
          label: 'protocol stats',
        },
      ),
    ).toThrow(/missing/);

    const failure = captureFailure(
      createAppError('Malformed protocol stats: missing totalTvl', {
        code: 'MALFORMED_RESPONSE',
        retryable: false,
      }),
      { feature: 'vaults' },
    );
    expect(failure.retryable).toBe(false);
    expect(failure.kind).toBe('invalid_state');
  });

  it('isolates one feature crash from sibling content (regression)', () => {
    function Boom() {
      throw new Error('feature boom');
    }

    render(
      <MemoryRouter>
        <div>
          <ErrorBoundary level="feature" feature="apy-chart">
            <Boom />
          </ErrorBoundary>
          <section data-testid="vault-grid">vault cards</section>
        </div>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();
    expect(screen.getByTestId('vault-grid')).toHaveTextContent('vault cards');
  });
});
