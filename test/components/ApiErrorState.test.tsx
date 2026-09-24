import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ApiErrorState from '../../src/components/ApiErrorState';
import { adaptErrorPayload } from '../../src/services/apiAdapter.js';
import {
  authorizationError,
  providerFailure,
  terminalError,
  validationError,
} from '../../src/contracts/fixtures/index.js';

describe('ApiErrorState', () => {
  it('renders each supported error kind without leaking raw payloads', () => {
    const cases = [
      { fixture: validationError, kind: 'validation' },
      { fixture: authorizationError, kind: 'authorization' },
      { fixture: providerFailure, kind: 'provider' },
      { fixture: terminalError, kind: 'terminal' },
    ] as const;

    for (const { fixture, kind } of cases) {
      const adapted = adaptErrorPayload(fixture);
      const { unmount } = render(<ApiErrorState error={adapted} />);
      const root = screen.getByTestId('api-error-state');
      expect(root).toHaveAttribute('data-kind', kind);
      expect(screen.getByTestId('api-error-state').textContent).not.toContain('"details"');
      expect(screen.getByTestId('api-error-state').textContent).not.toContain(
        JSON.stringify(fixture.error.details),
      );
      if (adapted.requestId) {
        expect(screen.getByTestId('api-error-correlation')).toHaveTextContent(adapted.requestId);
      }
      unmount();
    }
  });

  it('offers retry only for retryable provider errors', () => {
    const onRetry = vi.fn();
    const provider = adaptErrorPayload(providerFailure);
    const { rerender } = render(<ApiErrorState error={provider} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    const terminal = adaptErrorPayload(terminalError);
    rerender(<ApiErrorState error={terminal} onRetry={onRetry} />);
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });
});
