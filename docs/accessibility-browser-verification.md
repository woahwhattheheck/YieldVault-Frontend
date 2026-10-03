# Routed deposit and withdrawal browser verification

Verified on 2026-10-03 for [PR #273](https://github.com/YieldVault-Org/YieldVault-Frontend/pull/273), continuing the existing author and `latch/yieldvault-255-a11y-wizards` branch from `d89d3346b65f6f317543d84441d2f8ce26530a72`.

The actual `/vault/usdc-vault` route now shares the navbar's wallet connection, retains transaction outcome live regions during a vault refresh, and fits the connected controls within a 390-pixel viewport. Light form text and validation messages pass the rendered form contrast checks described below.

## Defects reproduced and repaired

- **Connection did not reach the routed form.** On the original production build, keyboard activation changed the navbar to Disconnect while the deposit amount stayed disabled, the balance stayed zero, and the submit control still requested a connection. Navbar created a separate `AppProvider` inside the application's existing provider. It now consumes the enclosing provider, retaining its provider fallback for standalone use. The new integration regression failed before the repair and passes afterward; the nine existing standalone Navbar checks remain passing.
- **Success was removed before it could be announced.** Once connection worked, successful mock deposit and withdrawal triggered a parent loading branch that unmounted the form. DOM observation captured no success live-region update. `VaultDetail` now preserves the loaded same-ID form during refresh and disables its fieldset until the refresh finishes. A newly selected vault still waits for its own data. The new deferred-refresh regression failed before this repair and now verifies that the same polite success status remains mounted during and after refresh.
- **Light form text lacked contrast.** Rendered axe checks reported MAX at 1.71:1 and validation error text at 3.53:1. Scoped light-theme form colors repair MAX, validation and outcome text without changing the dark theme or global palette.
- **Connected navigation overflowed mobile.** At a 390-pixel viewport, the connected controls expanded the page to 525 pixels. Wrapping the existing controls reduces the final page scroll width to 390 pixels, with no overflowing elements in the observed state.

## Source and build provenance

The pristine source was copied into an isolated checkout at the parent commit above. Installed packages were reused from an existing runtime: package versions and integrity entries matched this checkout's lockfile, and the missing `axe-core` package was supplied at the exact locked version, 4.13.0. No dependency manifest or lockfile changed, and no package installation was required.

Rebuilding that pristine parent produced byte-identical output to the retained production build. Its four SHA-256 digests were:

| Parent build file | SHA-256 |
| --- | --- |
| `index.html` | `0b61793781dcb35b7272ff798ef9aa00290cbef0136189f88832a2127343ebdb` |
| `assets/index-DTabdM4n.css` | `bf2b44f8ac4b149109ef05b0c59557805372b8659a4d3005992d57dd7b20f9ab` |
| `assets/index-YTMMc-Gd.js` | `f9358c4232b976fac4ee84bd736f314186203a338800ba31dc974f0c10d05cad` |
| `vault.svg` | `e6dba1f2f7198c5beee3463074b3fcbd6ab396bb5814c44b818d2781f6ecabac` |

The repaired production build used for final browser execution has these SHA-256 digests:

| Final build file | SHA-256 |
| --- | --- |
| `index.html` | `f4a2471453f7a27f511cbb848b2ceca2dea4ee91ea03c26b69f593c77ebe745c` |
| `assets/index-dChgJaKv.css` | `c6684edd8b215acdce2599e1238e8a8c095b0f825f6324cfe747024ed678b7ae` |
| `assets/index-B6_7F-Mf.js` | `39443f4351bb9bf744854105731fa55a4d7afcb3e4c47295742fa64c24b32c24` |
| `vault.svg` | `e6dba1f2f7198c5beee3463074b3fcbd6ab396bb5814c44b818d2781f6ecabac` |

The generated build and `tsconfig.tsbuildinfo` are not part of this source change.

## Executed browser workflow

Runtime: Node 24.19.0, npm 11.9.0, Chromium 153.0.8010.0, Playwright Core, and axe-core 4.13.0. A temporary loopback HTTP server served the rebuilt production `dist`. This was the actual application route and its existing mock wallet/vault services; the browser did not replace application services or intercept their results.

Keyboard actions used Tab, Enter and Space, with amount entry at a 50 ms key cadence. The route was exercised in dark and light themes, then at 390 × 844 pixels.

| Action | Observed result |
| --- | --- |
| Tab to Connect Wallet, activate with Enter | Routed amount input enabled; balance became 12,500.00 USDC. |
| Enter deposit amount 13,000 | “Amount exceeds your balance”; `aria-invalid=true`; error ID present in both `aria-describedby` and `aria-errormessage`; submit disabled. |
| Activate deposit MAX with Space | Amount became 12,500. |
| Submit deposit amount 10 with Enter | Amount, MAX and submit disabled while processing; an additional Enter could not activate an enabled submit control. |
| Complete mock deposit | “Deposited 10 USDC” remained in `role=status`, `aria-live=polite`, including through the vault refresh. |
| Select Withdraw and enter 3,000 | “Amount exceeds your position”; associated invalid state and disabled submit. |
| Activate withdrawal MAX | Amount became 1,991, matching the displayed mock position. |
| Submit withdrawal amount 10 | Processing disabled the form controls; “Withdrew 10 USDC” remained in a polite status region through refresh. |
| Switch to light theme | Validation and valid form states remained readable and passed the scoped rendered scans below. |
| Inspect connected view at 390 × 844 | `innerWidth=390`, `scrollWidth=390`, no overflowing elements. |
| Disconnect with Enter | Routed withdrawal amount disabled; submit returned to “Connect wallet to withdraw”. |

Final execution recorded zero browser console errors, zero uncaught page errors, and zero requests outside the temporary loopback origin.

## Automated validation

```sh
npm run build
npm test -- test/components/Navbar.test.tsx test/components/DepositForm.a11y.test.tsx test/components/WithdrawForm.a11y.test.tsx
npm test -- --maxWorkers=2
git diff --check
```

- Production TypeScript/Vite build passed.
- Focused checks: 16 passed across 3 existing files.
- Full suite: 251 passed across 35 files. This adds two regression cases to the preceding 249-test branch; no new test suite or dependency was added.
- Diff whitespace check passed.
- Rendered axe scans scoped to `.vault-actions`, using WCAG 2 A/AA, 2.1 A/AA and 2.2 AA tags, produced **zero violations and zero incomplete checks** in each of four states: invalid dark deposit, invalid dark withdrawal, invalid light withdrawal, and valid light withdrawal. Color contrast was included.

To reproduce the operator flow after a production build, serve `dist` with a static server that supports the application's route fallback, open `/vault/usdc-vault`, and follow the action table. Run axe against `.vault-actions` in each stated form state. The application uses its existing mock services; this procedure does not require a wallet extension or a signed transaction.

## Boundaries and remaining acceptance

- The production router mounts `VaultDetail` with the single-page deposit and withdrawal forms. `WizardDemo` is not mounted in `App.jsx`; the navbar link does not establish a working demo route. This receipt makes no actual-browser claim for that unmounted component. Earlier component tests of the wizard remain separate evidence.
- No VoiceOver or NVDA runtime was available. Keyboard execution, DOM live-region updates and an accessibility snapshot do not establish spoken screen-reader output. Auditory screen-reader verification remains open.
- These results are bounded form checks, not a whole-page accessibility or WCAG conformance claim. An initial whole-page scan returned three color-contrast items requiring review outside the form scope: `.environment-banner-text`, `.brand-mark`, and `.last-updated > span[aria-hidden=true]`.
- After submission disables its focused control, the observed active element was `BODY`; this change does not claim post-submit focus restoration. Browser keyboard execution remained usable.
- Only the existing mock wallet and vault operations were exercised. Real wallet signing, network settlement, token precision changes and PR #274's contract work were outside this continuation.
- The upstream PR description still contains an older 236-test count and broader manual-verification wording. The earlier metadata update returned `403 Resource not accessible by integration`; it was not retried here. This receipt is the current source-linked verification record and can support an authorized description update.

Coordination: `YV273-ROUTED-BROWSER-20261003-A3DEA`, [original claim](https://tokenjunkielabs.slack.com/archives/C0BVANHNB26/p1791019699826509). This continuation preserves the original PR and contribution; it adds the routed execution repairs above.
