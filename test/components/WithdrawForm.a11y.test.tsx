import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WithdrawForm from '../../src/components/WithdrawForm';
import * as vaultService from '../../src/services/vault.js';

const vault = {
  id: 'vault-1',
  asset: 'USDC',
  totalAssets: 10000,
  totalShares: 10000,
};

vi.mock('../../src/hooks/useWallet.js', () => ({
  useWallet: vi.fn(),
}));

vi.mock('../../src/hooks/usePositions.js', () => ({
  usePositions: vi.fn(),
}));

vi.mock('../../src/services/vault.js', () => ({
  withdraw: vi.fn(async () => ({ shares: 10 })),
}));

vi.mock('../../src/services/wallet.js', () => ({
  signAndSubmit: vi.fn(async () => ({})),
}));

import { useWallet } from '../../src/hooks/useWallet.js';
import { usePositions } from '../../src/hooks/usePositions.js';

function focusPageBody() {
  document.body.setAttribute('tabindex', '-1');
  document.body.focus();
  document.body.removeAttribute('tabindex');
}

describe('WithdrawForm accessibility', () => {
  beforeEach(() => {
    vi.mocked(useWallet).mockReturnValue({
      isConnected: true,
      balanceOf: () => 1000,
    } as ReturnType<typeof useWallet>);
    vi.mocked(usePositions).mockReturnValue({
      positions: [{ vaultId: 'vault-1', value: 400 }],
    } as ReturnType<typeof usePositions>);
  });

  it('associates field errors for oversize withdrawals', () => {
    render(<WithdrawForm vault={vault} />);
    const input = screen.getByLabelText('Amount');
    fireEvent.change(input, { target: { value: '9999' } });

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent(/exceeds your position/i);
  });

  it('labels MAX and announces burned-share previews', () => {
    render(<WithdrawForm vault={vault} />);
    expect(screen.getByRole('button', { name: /Withdraw maximum/i })).toBeInTheDocument();
    const preview = document.getElementById('withdraw-preview');
    expect(preview).toHaveAttribute('aria-live', 'polite');
  });

  it.each(['success', 'failure'])('restores lost submission focus to the %s outcome', async (outcome) => {
    let finish!: () => void;
    const pending = new Promise<{ shares: number; vaultId: string }>((resolve, reject) => {
      finish = () => outcome === 'success'
        ? resolve({ shares: 10, vaultId: vault.id })
        : reject(new Error('Withdrawal rejected'));
    });
    vi.mocked(vaultService.withdraw).mockImplementationOnce(() => pending);
    render(<WithdrawForm vault={vault} />);
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '10' } });
    const submit = screen.getByRole('button', { name: /^Withdraw$/i });
    submit.focus();
    fireEvent.click(submit);
    expect(submit).toBeDisabled();
    // JSDOM does not blur disabled controls as the routed Chromium flow does.
    focusPageBody();
    expect(document.body).toHaveFocus();

    await act(async () => { finish(); });

    const message = screen.getByText(outcome === 'success' ? 'Withdrew 10 USDC' : 'Withdrawal rejected');
    expect(message).toHaveFocus();
    expect(message).toHaveAttribute('tabindex', '-1');
  });

  it.each([false, true])('preserves focus moved while pending, even if later blurred: %s', async (blur) => {
    let finish!: () => void;
    const pending = new Promise<{ shares: number; vaultId: string }>((resolve) => {
      finish = () => resolve({ shares: 10, vaultId: vault.id });
    });
    vi.mocked(vaultService.withdraw).mockImplementationOnce(() => pending);
    render(<><WithdrawForm vault={vault} /><button>Another action</button></>);
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '10' } });
    const submit = screen.getByRole('button', { name: /^Withdraw$/i });
    submit.focus();
    fireEvent.click(submit);
    focusPageBody();
    const other = screen.getByRole('button', { name: 'Another action' });
    other.focus();
    if (blur) other.blur();

    await act(async () => { finish(); });

    expect(blur ? document.body : other).toHaveFocus();
    expect(screen.getByText('Withdrew 10 USDC')).not.toHaveFocus();
  });
});
