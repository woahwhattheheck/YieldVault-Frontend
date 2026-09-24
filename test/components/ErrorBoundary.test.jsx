import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ErrorBoundary from '../../src/components/ErrorBoundary';
import { clearTelemetry, getTelemetryEvents } from '../../src/utils/telemetry.js';
import { createAppError } from '../../src/utils/diagnostics.js';

function Boom({ message = 'render boom' }) {
  throw new Error(message);
}

function Ok({ label = 'ok' }) {
  return <div data-testid="ok">{label}</div>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    clearTelemetry();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('catches injected render failures and shows a correlation reference', () => {
    render(
      <MemoryRouter>
        <ErrorBoundary level="feature" feature="apy-chart">
          <Boom message="chart crashed" />
        </ErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();
    expect(screen.getByTestId('error-correlation-id').textContent).toMatch(/^yv-/);
    expect(screen.getByTestId('error-reload')).toBeInTheDocument();
    expect(screen.getByTestId('error-go-home')).toBeInTheDocument();
    expect(getTelemetryEvents().length).toBeGreaterThan(0);
    expect(getTelemetryEvents()[0].feature).toBe('apy-chart');
  });

  it('retries remount the child after a transient failure', () => {
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) throw new Error('temporary network glitch');
      return <Ok label="recovered" />;
    }

    render(
      <MemoryRouter>
        <ErrorBoundary level="feature" feature="flaky">
          <Flaky />
        </ErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('error-retry')).toBeInTheDocument();
    shouldThrow = false;
    fireEvent.click(screen.getByTestId('error-retry'));
    expect(screen.getByTestId('ok')).toHaveTextContent('recovered');
  });

  it('hides try-again for invalid application state', () => {
    function Invalid() {
      throw createAppError('malformed vault payload', {
        code: 'MALFORMED_RESPONSE',
        retryable: false,
      });
    }

    render(
      <MemoryRouter>
        <ErrorBoundary level="route" feature="dashboard">
          <Invalid />
        </ErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('error-boundary-fallback')).toHaveAttribute(
      'data-error-kind',
      'invalid_state',
    );
    expect(screen.queryByTestId('error-retry')).not.toBeInTheDocument();
    expect(screen.getByTestId('error-reload')).toBeInTheDocument();
  });

  it('isolates a feature failure so siblings keep rendering', () => {
    render(
      <MemoryRouter>
        <div>
          <nav data-testid="shell-nav">YieldVault</nav>
          <ErrorBoundary level="feature" feature="apy-chart">
            <Boom />
          </ErrorBoundary>
          <div data-testid="vault-grid">vaults still here</div>
        </div>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('shell-nav')).toBeInTheDocument();
    expect(screen.getByTestId('vault-grid')).toHaveTextContent('vaults still here');
    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();
  });
});
