# Exact decimal display and upper-bound admission

Issue #257 requires displayed amounts to reconcile with their canonical values. The existing formatter first converted canonical strings to binary `Number`, losing digits before Intl applied the requested precision. For example, `123456789012.1234567` displayed as `123,456,789,012.12346` in en-US.

The formatter now passes finite decimal strings directly to Intl, retaining configured rounding, grouping, numeric-input behavior and invalid-display handling. Exact string formatting is defined by [ECMA-402 ToIntlMathematicalValue](https://tc39.es/ecma402/2025/#sec-tointlmathematicalvalue). Supported clients need that exact-decimal Intl behavior; older engines which convert string arguments to Number are not validated by this run. No formatter polyfill or dependency was introduced.

The existing numeric upper bound also had a fractional hole: `9007199254740991.0000001` rounded down to MAX_SAFE_INTEGER before range validation. A text comparison at that precise integer boundary now rejects nonzero fractional excess. The exact maximum with zero fractional digits, values below it, existing precision limits and negative/invalid rejection remain unchanged.

## Source-bound result

[Run 37193513979](https://github.com/woahwhattheheck/YieldVault-Frontend/actions/runs/37193513979) used Node 24.19.0, npm 11.17.0 and the repository's locked `npm ci` dependencies, unchanged configuration, real Vitest and mounted React/jsdom input tests. Only these two maintained files ran:

```sh
npm test -- test/utils/localeAmount.test.js test/components/AmountInput.test.tsx
```

The same 124 tests produced **108 pass / 16 fail before**, **124 pass / 0 fail / 0 pending after**. Baseline `3939724e2fbc32c42ad87d532c93525dbfdb7952`; tested candidate `5311f69db89a9342925017001d0ae685fb5fa418`. Seventeen added cases cover six-locale exact round trips, the upper boundary, deliberate display rounding and mounted focus/edit/blur behavior. All earlier 107 cases remain unchanged, including prior grouping, invalid-draft and deposit/withdraw denial controls.

[Artifact 11299379029](https://github.com/woahwhattheheck/YieldVault-Frontend/actions/runs/37193513979/artifacts/11299379029) retains before/after JSON, stderr, install log, patch and complete changed source. Downloaded ZIP SHA-256: `683124102c7893f96e3d3275d4488a022dda5ba594614ef345e563d3689ea829`.

Tested blobs: utility `07e3dc22a4e3c78b7b2ad7e61e4b441f052d4a20`; utility tests `60307f7f68af426735a3ae12b294fba3e7b7cc50`; component tests `5aa0319b2ba8ec83f3b73a0bcfbcc2d6ebc2e127`. All match downloaded bytes. The validation workflow is isolated from the contribution branch.

This fixes canonical-text display and boundary admission. The parser's numeric convenience `value`, existing numeric mock vault services, wallet implementation and transaction schema are not redesigned. No full application build, all-browser compatibility, live signature/chain execution, performance improvement, bounty award or payment is claimed.

## Canonical minimum admission

`AmountInput` is a text input, so forwarding `min` alone does not enforce a minimum. It now checks that boundary before emitting an accepted canonical amount. The `min` prop uses a nonnegative canonical decimal string within `maxFractionDigits`; malformed minimums report `Minimum amount is invalid`. Integer lengths, integer digits and zero-padded fractional strings are compared without binary rounding. The existing default `min="0"` returns immediately after normal amount parsing.

Below-minimum edits clear the canonical value and preserve the localized draft and validation error through blur. Corrections and exact equality, including trailing fractional zeros, remain accepted. External values and changes to `min` are revalidated. Callers with externally managed values must continue consuming `onValidationError` before submission, as the existing forms do. No dependency, transaction schema, mock vault service or parser/cache behavior changes are included in this minimum repair.

[Run 37204590242](https://github.com/woahwhattheheck/YieldVault-Frontend/actions/runs/37204590242), validation commit `9a23a58c0d27cd7a1cbe3af5fed3c43b90cf4c12`, used Node 22.23.3 and npm 10.9.9. The seven new mounted cases all failed on original component blob `f85c82a6b0e90a77ffab77f2900077aa44bb571a`, then all passed with the repair. The candidate selection passed **51/51**: seven new minimum cases plus all 44 existing mounted-input cases, unchanged. The candidate's `npm run build` also passed TypeScript and Vite production compilation. Only this selection ran, not the entire test suite:

```sh
npm test -- test/components/AmountInput.minimum.test.tsx test/components/AmountInput.test.tsx --maxWorkers=1
npm run build
```

The initial `npm ci` attempt stopped before tests on missing esbuild lock entries. The successful run used the repository CI command `npm install --no-audit --no-fund`; its resolved lock and logs are retained, not substituted into the contribution. [Artifact 11304177196](https://github.com/woahwhattheheck/YieldVault-Frontend/actions/runs/37204590242/artifacts/11304177196) contains the exact before/after source, seven-case file, result JSON, build/install logs and resolved lock. Archive SHA-256: `0c489a3bfde49181e9c9303883a3773b4fd7b3a6b85392938863cb8efbf042f5`.

Tested component blob `faff1e6136a7a4d992ca2ad31ca5f4fbc5dfecd1` and minimum-test blob `05dcdecf66ff8f3c45f10dca9aca5c75a3a10d19` match the contributed bytes. This run used the parser at base `cba76006680da5e49698ab0e7bb09c2299ea3dfc`. Publication preserves the subsequent independent ASCII parser optimization at parent `f52191b46750a6fad508dc2af942e94048789c9a`; the full composed tree was not rerun. The validation workflow remains outside the contribution branch. No live-chain execution, browser-wide validation, award or payment is claimed.
