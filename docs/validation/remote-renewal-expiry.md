# Remote renewal cannot revive an expired local session

The remote `renewed` handler now requires the local same-address session to remain unexpired. A tab resumed after its local deadline must re-authenticate even when another tab sends an unexpired renewal before the queued expiry timer runs. Valid same-address renewals still apply, and the synchronous session reference is updated together with React state.

This preserves the existing finite-expiry check, connection-generation fence, protected-cache cleanup and safe draft retention. It changes only the remote-renewal branch in `AppContext.jsx`; no wallet, backend or contract behavior is replaced.

## Reproduction

Connect the real `AppProvider` through the maintained wallet fixture. Retain its local expiry, populate the protected positions cache and save an amount draft. Advance `Date.now()` to the expiry without executing the scheduled timer, then deliver a valid later same-address renewal through either a `storage` event or the maintained `BroadcastChannel` fixture. Finally call the real `ensureSessionActive()` gate.

On the original source, both transports restore an authorized session. On the repair, both return no authorization; the gate clears the expired session, balances and protected positions cache while preserving the amount draft. Neither path reconnects automatically. Two controls confirm that active same-address renewal still works through both transports.

## Executed result

Base: `2b5530f3a46276bceb08fcf4f5e1ab430630fe55`.
Tested source commit: `e0babb4571f5437763bc87fcb22f2d98bb9a8625`.
AppContext blob: `0dede93ccc6bcc6a83212662477f5d82520292e4`.
Integration-test blob: `cbebe9704941361d53334cc4091daead44258881`.
Runtime: Node `v24.21.0`, Linux, unchanged locked dependencies and the repository's existing test configuration.

The four new cases on the original production source returned **2 failed / 2 passed**, exit 1; the 35 existing cases were deselected for that baseline. The repaired integration file returned **39 passed / 0 failed / 0 skipped**, exit 0, with 314.236 ms recorded for the file.

```sh
node node_modules/vitest/vitest.mjs run \
  test/integration/sessionTimeout.test.jsx --maxWorkers=1
```

[Execution and artifact](https://github.com/woahwhattheheck/YieldVault-Frontend/actions/runs/37192448507). Artifact `11299468852`, ZIP SHA-256 `2f6d4c263bc33825f8b3d3313b804ce9d7337ceae66402429d25618e179a131a`, retains the before/after reports, commands, exact source files and patch. The isolated job published only a validation ref; the original contribution head was read separately before integration.

These results exercise the actual React context and helpers with the existing mocked wallet and channel transport. They do not establish real-wallet signing, browser/device suspension behavior, backend authorization, a full-suite result or a production build. Earlier PR results remain tied to their own source revisions.
