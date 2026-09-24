import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Positions from '../../src/pages/Positions';
import {
  __queuePositionsResultForTests,
  __resetVaultFixturesForTests,
} from '../../src/services/vault.js';
import {
  authorizationError,
  positionList,
} from '../../src/contracts/fixtures/index.js';

vi.mock('../../src/constants/config.js', () => ({
  CONFIG: {
    network: 'testnet',
    vaultContract: 'CCONTRACT',
    mockLatency: 0,
    sessionTimeoutMs: 15 * 60 * 1000,
    sessionWarningMs: 60 * 1000,
  },
}));

vi.mock('../../src/hooks/useWallet.js', () => ({
  useWallet: () => ({
    isConnected: true,
    balanceOf: () => 1000,
  }),
}));

vi.mock('../../src/hooks/useDocumentTitle.js', () => ({
  useDocumentTitle: () => {},
}));

function renderPositions() {
  return render(
    <MemoryRouter>
      <Positions />
    </MemoryRouter>,
  );
}

describe('Positions contract fixtures', () => {
  beforeEach(() => {
    __resetVaultFixturesForTests();
  });

  afterEach(() => {
    __resetVaultFixturesForTests();
  });

  it('renders adapted position-list fixtures with precision-safe amounts', async () => {
    __queuePositionsResultForTests(positionList);
    renderPositions();

    await waitFor(() => {
      expect(screen.getByTestId('positions-view')).toBeInTheDocument();
    });
    expect(screen.getByText(/1,000\.00 shares/i)).toBeInTheDocument();
    expect(screen.getByText('1,000.00')).toBeInTheDocument();
  });

  it('renders authorization errors without leaking raw responses', async () => {
    __queuePositionsResultForTests(authorizationError);
    renderPositions();

    await waitFor(() => {
      expect(screen.getByTestId('positions-error')).toBeInTheDocument();
    });
    const alert = screen.getByTestId('api-error-state');
    expect(alert).toHaveAttribute('data-kind', 'authorization');
    expect(alert.textContent).not.toContain('"resource"');
    expect(alert.textContent).not.toContain('position');
    expect(screen.getByTestId('api-error-correlation')).toHaveTextContent(
      'req_fixture_auth_001',
    );
  });
});
