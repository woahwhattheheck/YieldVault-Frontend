import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { usePreflight } from '../../src/hooks/usePreflight.js';
import {
  __resetSimulationBehaviorForTests,
  __setSimulationBehaviorForTests,
} from '../../src/services/preflight.js';
import { PREFLIGHT_STATUS } from '../../src/utils/preflight.js';

vi.mock('../../src/constants/config.js', () => ({
  CONFIG: {
    network: 'testnet',
    vaultContract: 'CCONTRACT',
    mockLatency: 0,
    preflightTimeoutMs: 50,
  },
}));

function Probe(props) {
  const [amount, setAmount] = useState(props.amount);
  const [network, setNetwork] = useState(props.network);
  const preflight = usePreflight({
    kind: 'deposit',
    vaultId: 'usdc-vault',
    amount,
    asset: 'USDC',
    walletAddress: 'GTEST',
    network,
    expectedNetwork: 'testnet',
    balance: props.balance ?? 100,
    vault: { id: 'usdc-vault' },
  });

  return (
    <div>
      <button type="button" onClick={() => void preflight.run()}>
        run
      </button>
      <button type="button" onClick={() => setAmount('99')}>
        change-amount
      </button>
      <button type="button" onClick={() => setNetwork('mainnet')}>
        switch-network
      </button>
      <div data-testid="status">{preflight.result?.status || 'idle'}</div>
      <div data-testid="cansign">{String(preflight.canSign)}</div>
      <div data-testid="retryable">{String(preflight.retryable)}</div>
      <div data-testid="message">{preflight.message || ''}</div>
    </div>
  );
}

describe('usePreflight', () => {
  beforeEach(() => {
    __resetSimulationBehaviorForTests();
  });
  afterEach(() => {
    __resetSimulationBehaviorForTests();
  });

  it.each(['changed payload', 'invalidate', 'reset', 'newer run'])(
    'returns a stale result to the awaiting caller after %s',
    async (change) => {
      const input = {
        kind: 'deposit', vaultId: 'usdc-vault', amount: '10', asset: 'USDC',
        walletAddress: 'GTEST', network: 'testnet', expectedNetwork: 'testnet', balance: 100,
      };
      const { result, rerender } = renderHook((props) => usePreflight(props), { initialProps: input });
      let pending;
      act(() => { pending = result.current.run(); });
      let replacement;
      if (change === 'changed payload') rerender({ ...input, amount: '20' });
      else if (change === 'newer run') act(() => { replacement = result.current.run(); });
      else act(() => { result.current[change](); });

      let response;
      await act(async () => {
        response = await pending;
        if (replacement) await replacement;
      });
      expect(response.status).toBe(PREFLIGHT_STATUS.STALE);
      if (change === 'newer run') expect(result.current.canSign).toBe(true);
      else expect(result.current.canSign).toBe(false);
    },
  );

  it('invalidates on changed payload', async () => {
    render(<Probe amount="10" network="testnet" />);
    await act(async () => {
      screen.getByText('run').click();
    });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ok'));
    expect(screen.getByTestId('cansign')).toHaveTextContent('true');

    await act(async () => {
      screen.getByText('change-amount').click();
    });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('stale'));
    expect(screen.getByTestId('cansign')).toHaveTextContent('false');
    expect(screen.getByTestId('retryable')).toHaveTextContent('true');
  });

  it('invalidates on network switch', async () => {
    render(<Probe amount="10" network="testnet" />);
    await act(async () => {
      screen.getByText('run').click();
    });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ok'));

    await act(async () => {
      screen.getByText('switch-network').click();
    });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('stale'));
    expect(screen.getByTestId('cansign')).toHaveTextContent('false');
  });

  it('exposes retry path after provider timeout', async () => {
    __setSimulationBehaviorForTests({ mode: 'timeout', delayMs: 5 });
    render(<Probe amount="10" network="testnet" />);
    await act(async () => {
      screen.getByText('run').click();
    });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('timeout'));
    expect(screen.getByTestId('retryable')).toHaveTextContent('true');
    expect(screen.getByTestId('cansign')).toHaveTextContent('false');
  });
});
