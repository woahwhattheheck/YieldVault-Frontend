from pathlib import Path
import hashlib
import json
import sys

PRODUCT = {
    'src/services/apiAdapter.js': (
        "  const retryable =\n    kind === API_ERROR_KIND.PROVIDER ||\n    (verified.error.details &&\n      typeof verified.error.details === 'object' &&\n      !Array.isArray(verified.error.details) &&\n      verified.error.details.retryable === true);",
        "  const details = verified.error.details;\n  const retryable =\n    kind === API_ERROR_KIND.PROVIDER &&\n    !(details &&\n      typeof details === 'object' &&\n      !Array.isArray(details) &&\n      details.retryable === false);",
    ),
    'src/components/ApiErrorState.tsx': (
        "  const showRetry = Boolean(onRetry) && (error.retryable || error.kind === 'provider');",
        "  const showRetry = Boolean(onRetry) && (error.retryable ?? error.kind === 'provider');",
    ),
}

SERVICE_TESTS = '''  it('honors an explicit provider retry veto without changing its kind or correlation', () => {
    const payload = structuredClone(providerFailure);
    payload.error.details = { ...payload.error.details, retryable: false };
    expect(adaptErrorPayload(payload)).toMatchObject({
      kind: API_ERROR_KIND.PROVIDER,
      retryable: false,
      requestId: providerFailure.error.requestId,
    });

    delete payload.error.details;
    expect(adaptErrorPayload(payload).retryable).toBe(true);
  });

  it('does not let a retry hint enable retries for non-provider error kinds', () => {
    for (const fixture of [validationError, authorizationError, terminalError]) {
      const payload = structuredClone(fixture);
      payload.error.details = { retryable: true };
      const adapted = adaptErrorPayload(payload);
      expect(adapted.kind).toBe(adaptErrorPayload(fixture).kind);
      expect(adapted.retryable).toBe(false);
      expect(adapted).not.toHaveProperty('details');
    }
  });

'''

COMPONENT_TESTS = '''  it('honors an explicit retry veto while retaining the legacy provider default', () => {
    const onRetry = vi.fn();
    const provider = adaptErrorPayload(providerFailure);
    const { rerender } = render(
      <ApiErrorState error={{ ...provider, retryable: false }} onRetry={onRetry} />,
    );
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('api-error-correlation')).toHaveTextContent(provider.requestId!);

    rerender(
      <ApiErrorState error={{ ...provider, retryable: undefined }} onRetry={onRetry} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(<ApiErrorState error={{ ...provider, retryable: false }} onRetry={onRetry} />);
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

'''

TESTS = {
    'test/services/apiAdapter.test.js': (
        "describe('apiAdapter', () => {\n",
        "describe('apiAdapter', () => {\n" + SERVICE_TESTS,
    ),
    'test/components/ApiErrorState.test.tsx': (
        "describe('ApiErrorState', () => {\n",
        "describe('ApiErrorState', () => {\n" + COMPONENT_TESTS,
    ),
}

def apply(changes):
    for name, (before, after) in changes.items():
        path = Path(name)
        content = path.read_text()
        if content.count(before) != 1:
            raise SystemExit(f'Expected one matching source section: {name}')
        path.write_text(content.replace(before, after, 1))

if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'tests':
        apply(TESTS)
    elif mode == 'product':
        apply(PRODUCT)
    elif mode == 'record':
        result = {}
        for name in [*PRODUCT, *TESTS]:
            data = Path(name).read_bytes()
            result[name] = hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest()
        print(json.dumps(result, indent=2))
    else:
        raise SystemExit('mode must be tests, product or record')
