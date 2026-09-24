import React from 'react';
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DepositForm from '../../src/components/DepositForm';
import { AppProvider, useAppContext } from '../../src/context/AppContext.jsx';
import { DEPOSIT_DRAFT_KEY, readSafeDraft } from '../../src/utils/sessionAuth.js';

vi.mock('../../src/services/wallet.js', () => ({
  connect: vi.fn(async () => ({ address: 'GTEST' })),
  disconnect: vi.fn(async () => undefined),
  getBalances: vi.fn(async () => ({ USDC: 100 })),
  getNetwork: vi.fn(async () => 'testnet'),
  signAndSubmit: vi.fn(async () => ({ hash: 'h1', summary: 'ok' })),
}));

vi.mock('../../src/services/vault.js', () => ({
  deposit: vi.fn(async () => ({ shares: 1, vaultId: 'v1' })),
  getPositions: vi.fn(async () => []),
}));

import * as walletService from '../../src/services/wallet.js';
import * as vaultService from '../../src/services/vault.js';

const vault = { id: 'v1', asset: 'USDC', totalAssets: 1000, totalShares: 1000 };

function Shell({ children }) {
  const ctx = useAppContext();
  React.useEffect(() => {
    void ctx.connect();
  }, []);
  return (
    <>
      {children}
      <button type="button" onClick={() => void ctx.expireSession()}>
        Expire
      </button>
    </>
  );
}

async function waitUntilConnected() {
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Deposit' })).toBeInTheDocument();
  });
}

describe('DepositForm session gate', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it('submits when the session is active', async () => {
    render(
      <AppProvider>
        <Shell>
          <DepositForm vault={vault} />
        </Shell>
      </AppProvider>,
    );

    await waitUntilConnected();
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '5' } });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Deposit' })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Deposit' }));

    await waitFor(() => {
      expect(vaultService.deposit).toHaveBeenCalledWith('v1', 5);
      expect(walletService.signAndSubmit).toHaveBeenCalled();
    });
  });

  it('regression: stale session cannot submit after expiry', async () => {
    render(
      <AppProvider>
        <Shell>
          <DepositForm vault={vault} />
        </Shell>
      </AppProvider>,
    );

    await waitUntilConnected();
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Expire' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Session expired/i })).toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Session expired/i }));
    expect(vaultService.deposit).not.toHaveBeenCalled();
    expect(walletService.signAndSubmit).not.toHaveBeenCalled();
    expect(readSafeDraft(DEPOSIT_DRAFT_KEY)).toBe('5');
  });
});
