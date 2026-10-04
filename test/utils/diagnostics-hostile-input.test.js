import { describe, it, expect } from 'vitest';
import {
  captureFailure,
  containsSensitiveValue,
} from '../../src/utils/diagnostics.js';

describe('diagnostics hostile provider input', () => {
  it('contains throwing getters and preserves an accessible retryable status', () => {
    const providerError = {
      get message() {
        throw new Error('message getter failed');
      },
      get code() {
        throw new Error('code getter failed');
      },
      status: 503,
    };

    const failure = captureFailure(providerError, {
      feature: 'vaults',
      level: 'feature',
    });

    expect(failure).toMatchObject({
      retryable: true,
      kind: 'retryable',
      diagnostic: {
        status: 503,
        message: 'Unknown error',
      },
    });
    expect(containsSensitiveValue(failure.diagnostic)).toBe(false);
  });
});
