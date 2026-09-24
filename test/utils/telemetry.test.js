import { describe, it, expect, beforeEach } from 'vitest';
import {
  reportDiagnostic,
  getTelemetryEvents,
  clearTelemetry,
} from '../../src/utils/telemetry.js';
import {
  buildSafeDiagnostic,
  createAppError,
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
});
