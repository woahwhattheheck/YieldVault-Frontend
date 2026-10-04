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
