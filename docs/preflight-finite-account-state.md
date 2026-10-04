# Preflight requires finite account state

The existing deposit and withdrawal simulations converted the available wallet balance or position using Number and checked only whether the requested amount exceeded it. NaN comparisons are false, and positive Infinity is not exceeded by a finite amount, so unusable account state could receive an advisory OK and pass the signature-admission helper.

Both paths now reject a nonfinite available value before the sufficiency comparison. They use the existing `MISSING_CONTEXT` code and direct the user to refresh the affected balance before signing. Finite numeric values and numeric strings, exact-balance requests, insufficient-funds codes, binding, network checks, paused-vault checks and simulation test controls are unchanged. No automatic submission or retry was added. Once a fresh finite value is supplied, the same transaction intent can pass a new preflight normally.

## Actual scoped result

[Run 37193813134](https://github.com/woahwhattheheck/YieldVault-Frontend/actions/runs/37193813134) completed on Node 24.19.0 / npm 11.17.0 using unchanged repository configuration and locked `npm ci` dependencies. Baseline: `c20bbca63ba7600b219a3157d556c784c521c1e9`. Tested candidate: `c3808c1804044634ae1be9475e6f315d7037825f`.

```sh
npm test -- test/services/preflight.test.js test/utils/preflight.test.js \
  test/hooks/usePreflight.test.jsx test/components/DepositForm.preflight.test.jsx
```

The same selected 67 cases produced **53 pass / 14 fail before** and **67 pass / 0 fail / 0 pending after**. Twenty-four added service cases cover unusable account values on both mutation types, the actual signature helper, fresh-value recovery and finite insufficient/equal/sufficient controls. The 43 existing selected utility, service, hook and mounted-form cases were retained unchanged. Negative Infinity already rejected as insufficient on the baseline; its new regression also requires the more accurate missing-context classification. The failure count is not a count of distinct unauthorized signatures.

[Artifact 11300047517](https://github.com/woahwhattheheck/YieldVault-Frontend/actions/runs/37193813134/artifacts/11300047517) retains raw before/after JSON, install output, stderr, patch and source. Independently downloaded ZIP SHA-256: `22e59cb9d14836d238b91bc17d0cd326a7977359bb0a68341f5c08584352f44d`. Tested source blob `c8744a02792e7f025dd802ebdf0ab102c7f2bd74`; maintained test blob `664ac41d2754d20546f8eb0986eef3769b02d827`; downloaded files match both.

Only the two seven-line account-state checks and their maintained service regressions change runtime/test source. The existing mock simulation remains advisory; this is not live wallet/chain execution, an all-tests build result, a new monetary policy, an upstream acceptance or a reward receipt. The validation workflow remains outside the original contribution branch.
