import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Link, useLocation } from 'react-router-dom';
import App from '../../src/App';
import { AppProvider } from '../../src/context/AppContext.jsx';
import * as vaultService from '../../src/services/vault.js';
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

// Use the real App, route boundaries, pages, hooks and navigation. Only service
// response leaves are injected; malformed JSON reaches the actual render path.
function RouteControls() {
  const { pathname, search, hash } = useLocation();
  return (
    <div>
      <Link to="/vault/healthy">Open healthy vault</Link>
      <Link to={`${pathname}?view=details#summary`}>Change route query</Link>
      <output data-testid="route-location">{pathname}{search}{hash}</output>
    </div>
  );
}

function renderApp(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppProvider>
        <App />
        <RouteControls />
      </AppProvider>
    </MemoryRouter>,
  );
}

function healthyVault(id) {
  return {
    id, name: `Vault ${id}`, asset: 'USDC', strategy: 'Local test vault',
    apy: 0, tvl: 1000, totalAssets: 1000, totalShares: 1000,
  };
}

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

describe('actual App navigation after route failures', () => {
  beforeEach(() => {
    localStorage.clear();
    clearTelemetry();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(vaultService, 'listVaults').mockResolvedValue([]);
    vi.spyOn(vaultService, 'getProtocolStats').mockResolvedValue({
      totalTvl: 1000, avgApy: 0, vaultCount: 0,
    });
    vi.spyOn(vaultService, 'getVault').mockImplementation(async (id) => healthyVault(id));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it.each([
    { link: /YieldVault/, heading: /Earn yield on your/, path: '/' },
    { link: 'Positions', heading: 'Connect your wallet', path: '/positions' },
    { link: 'Wizard', heading: 'Page not found', path: '/wizard-demo' },
  ])('recovers from a failed dashboard using the real navbar link to $path', async ({ link, heading, path }) => {
    vaultService.listVaults.mockResolvedValue([null]);
    renderApp('/dashboard');
    const fallback = await screen.findByTestId('error-boundary-fallback');
    expect(fallback).toHaveAttribute('data-feature', 'dashboard');
    expect(screen.getByTestId('error-correlation-id').textContent).toMatch(/^yv-/);
    const navbar = screen.getByRole('navigation');

    fireEvent.click(within(navbar).getByRole('link', { name: link }));

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    expect(screen.getByTestId('route-location')).toHaveTextContent(path);
    expect(screen.queryByTestId('error-boundary-fallback')).not.toBeInTheDocument();
    expect(screen.getByRole('navigation')).toBe(navbar);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('recovers a failed dashboard when navigating to a vault route', async () => {
    vaultService.listVaults.mockResolvedValue([null]);
    renderApp('/dashboard');
    expect(await screen.findByTestId('error-boundary-fallback')).toHaveAttribute('data-feature', 'dashboard');

    fireEvent.click(screen.getByRole('link', { name: 'Open healthy vault' }));

    expect(await screen.findByRole('heading', { name: 'Vault healthy' })).toBeInTheDocument();
    expect(vaultService.getVault).toHaveBeenCalledWith('healthy');
    expect(screen.queryByTestId('error-boundary-fallback')).not.toBeInTheDocument();
  });

  it('recovers from a failed vault using the real dashboard navbar link', async () => {
    vaultService.getVault.mockResolvedValue({ ...healthyVault('broken'), name: { invalid: 'provider value' } });
    renderApp('/vault/broken');
    expect(await screen.findByTestId('error-boundary-fallback')).toHaveAttribute('data-feature', 'vault-detail');

    fireEvent.click(within(screen.getByRole('navigation')).getByRole('link', { name: 'Dashboard' }));

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument();
    expect(vaultService.listVaults).toHaveBeenCalled();
    expect(screen.queryByTestId('error-boundary-fallback')).not.toBeInTheDocument();
  });

  it('recovers a failed vault when only the /vault/:id parameter changes', async () => {
    vaultService.getVault.mockImplementation(async (id) => (
      id === 'broken' ? { ...healthyVault(id), name: { invalid: 'provider value' } } : healthyVault(id)
    ));
    renderApp('/vault/broken');
    expect(await screen.findByTestId('error-boundary-fallback')).toHaveAttribute('data-feature', 'vault-detail');

    fireEvent.click(screen.getByRole('link', { name: 'Open healthy vault' }));

    expect(await screen.findByRole('heading', { name: 'Vault healthy' })).toBeInTheDocument();
    expect(screen.getByTestId('route-location')).toHaveTextContent('/vault/healthy');
    expect(vaultService.getVault).toHaveBeenCalledWith('healthy');
    expect(screen.queryByTestId('error-boundary-fallback')).not.toBeInTheDocument();
  });

  it('keeps a failed same-path route and its correlation reference when only search/hash change', async () => {
    vaultService.listVaults.mockResolvedValue([null]);
    renderApp('/dashboard');
    const fallback = await screen.findByTestId('error-boundary-fallback');
    const correlation = screen.getByTestId('error-correlation-id').textContent;
    const calls = vaultService.listVaults.mock.calls.length;

    fireEvent.click(screen.getByRole('link', { name: 'Change route query' }));

    expect(screen.getByTestId('route-location')).toHaveTextContent('/dashboard?view=details#summary');
    expect(screen.getByTestId('error-boundary-fallback')).toBe(fallback);
    expect(screen.getByTestId('error-correlation-id')).toHaveTextContent(correlation);
    expect(vaultService.listVaults).toHaveBeenCalledTimes(calls);
  });

  it('preserves healthy vault page state across search/hash and parameter navigation', async () => {
    renderApp('/vault/first');
    expect(await screen.findByRole('heading', { name: 'Vault first' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Withdraw' }));
    expect(screen.getByRole('tab', { name: 'Withdraw' })).toHaveAttribute('aria-selected', 'true');
    const calls = vaultService.getVault.mock.calls.length;

    fireEvent.click(screen.getByRole('link', { name: 'Change route query' }));
    expect(screen.getByTestId('route-location')).toHaveTextContent('/vault/first?view=details#summary');
    expect(screen.getByRole('tab', { name: 'Withdraw' })).toHaveAttribute('aria-selected', 'true');
    expect(vaultService.getVault).toHaveBeenCalledTimes(calls);

    fireEvent.click(screen.getByRole('link', { name: 'Open healthy vault' }));
    expect(await screen.findByRole('heading', { name: 'Vault healthy' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Withdraw' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('error-boundary-fallback')).not.toBeInTheDocument();
  });
});
