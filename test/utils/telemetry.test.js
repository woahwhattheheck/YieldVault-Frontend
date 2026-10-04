import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  reportDiagnostic,
  getTelemetryEvents,
  clearTelemetry,
} from '../../src/utils/telemetry.js';
import {
  buildSafeDiagnostic,
  captureFailure,
  createAppError,
  createDependencyError,
  REDACTED,
} from '../../src/utils/diagnostics.js';

const WALLET = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';

describe('telemetry', () => {
  beforeEach(() => {
    clearTelemetry();
  });

  it('stores redacted diagnostics and never retains wallet secrets', () => {
    const diagnostic = buildSafeDiagnostic(
      createAppError(`boom ${WALLET}`, {
        code: 'DEPENDENCY_FAILURE',
        retryable: true,
      }),
      { feature: 'vaults', level: 'feature' },
    );
    const stored = reportDiagnostic(diagnostic);
    expect(stored).toBeTruthy();
    expect(JSON.stringify(getTelemetryEvents())).not.toContain(WALLET);
    expect(getTelemetryEvents()).toHaveLength(1);
    expect(getTelemetryEvents()[0].correlationId).toBe(diagnostic.correlationId);
  });

  it('drops events that still look sensitive after redaction', () => {
    // Bypass buildSafeDiagnostic to simulate a buggy caller.
    const stored = reportDiagnostic({
      correlationId: 'yv-test',
      feature: 'vaults',
      level: 'feature',
      kind: 'retryable',
      retryable: true,
      message: `leaked ${WALLET}`,
    });
    expect(stored?.dropped || stored?.message === `leaked ${REDACTED}` || !JSON.stringify(getTelemetryEvents()).includes(WALLET)).toBe(true);
    expect(JSON.stringify(getTelemetryEvents())).not.toContain(WALLET);
  });

  it('keeps provider URL credentials out of UI failures and stored diagnostics', () => {
    const password = 'diagnostic-canary-password';
    const failure = captureFailure(createDependencyError(
      `RPC failed at https://demo-user:${password}@rpc.example.test/v1`,
    ), { feature: 'vaults' });
    const stored = reportDiagnostic(failure.diagnostic);
    expect(stored).toBeTruthy();
    expect(stored.correlationId).toBe(failure.correlationId);
    expect(JSON.stringify(failure)).not.toContain(password);
    expect(JSON.stringify(getTelemetryEvents())).not.toContain(password);
    expect(stored.message).toContain('rpc.example.test/v1');
  });

  it('fails closed when nested Error metadata cannot be inspected', () => {
    const secret = 'diagnostic-canary-password';
    const error = new Error('safe');
    error.code = new Proxy({ token: secret }, {
      ownKeys() {
        throw new Error(`blocked ${secret}`);
      },
    });

    const stored = reportDiagnostic({
      correlationId: 'yv-proxy',
      feature: 'vaults',
      level: 'feature',
      error,
    });

    expect(stored).toBeTruthy();
    expect(stored.error).toMatchObject({
      name: 'Error',
      message: 'safe',
      code: REDACTED,
    });
    expect(JSON.stringify(stored)).not.toContain(secret);
    expect(JSON.stringify(getTelemetryEvents())).not.toContain(secret);
  });

  it('does not reintroduce raw metadata when dropping an unsafe event', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      const error = new Error('safe');
      error.code = { secret: 'diagnostic-canary-password' };
      const stored = reportDiagnostic({
        correlationId: WALLET,
        feature: WALLET,
        level: WALLET,
        error,
      });
      expect(stored.dropped).toBe(true);
      expect(JSON.stringify(getTelemetryEvents())).not.toContain(WALLET);
      expect(JSON.stringify(info.mock.calls)).not.toContain(WALLET);
      expect(JSON.stringify(stored)).not.toContain('diagnostic-canary-password');
    } finally {
      info.mockRestore();
    }
  });
});
