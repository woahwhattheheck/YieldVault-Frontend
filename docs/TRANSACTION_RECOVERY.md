# Pending transaction recovery

The lifecycle follow-up in `ae766724ea38ab79a75fed5ac8d5e72379fad3e1`
repairs three related frontend completion defects without changing the existing
mock wallet/vault services, lifecycle state machine, or storage format.

## Behavior

A submitted or confirming operation cannot be dismissed. The status component
hides that action, and the hook independently refuses to erase the persisted
correlation while a local request or restored operation is pending. This keeps
a remount from losing the evidence that a submission already exists.

Each `run` rereads pending state for the same vault and mutation kind. Another
already-mounted hook in the same browsing context therefore adopts the pending
operation rather than invoking a second submission callback. This is not a
cross-tab, cross-device, or server-side idempotency guarantee.

Deposit and withdrawal forms only display success, clear the input and invoke
`onSuccess` when `run` returns a confirmed operation. A duplicate/no-op return
of `null`, submitted or confirming is not a completed mutation. Terminal
operation dismissal and confirmed completion remain available.

## Executed evidence

[Run 37192524938](https://github.com/woahwhattheheck/YieldVault-Frontend/actions/runs/37192524938)
completed successfully using Node v24.21.0, locked existing dependencies, and
the repository's Vitest/React/jsdom configuration. Baseline production source
was `cff7616156d3942651c0695dccd14943c7af176b`; both runs used the same additive
regression files. No existing test was weakened, removed, or skipped.

```text
node node_modules/vitest/vitest.mjs run test/hooks/useTxLifecycle.test.jsx test/utils/txLifecycle.test.js test/hooks/useTxLifecycle.recovery.test.jsx test/components/TransactionForms.lifecycle.test.jsx
```

| Source | Passed | Failed | Pending |
| --- | ---: | ---: | ---: |
| Original | 11 | 11 | 0 |
| Repaired | 22 | 0 | 0 |

The original failures cover pending-record deletion followed by remount and
resubmission; a second already-mounted hook submitting again; dismissal of a
restored confirming record; pending Dismiss buttons; and both forms announcing
success for duplicate/no-op results. Successful completion and terminal
dismissal controls passed before and after.

Hook cases execute the real hook and persistence utility with controlled
provider promises. Component cases execute the real forms and status component
with controlled lifecycle returns and presentation/service collaborators. This
is focused frontend evidence, not a full browser-wallet end-to-end test,
application build, live-chain confirmation or backend reconciliation result.
The mock provider's acknowledgement/confirmation semantics are unchanged.

[Raw reports, source patch and source files, artifact 11299523750](https://github.com/woahwhattheheck/YieldVault-Frontend/actions/runs/37192524938/artifacts/11299523750).
Downloaded archive SHA-256:
`94fec54ef4b7b2f379d99b1a044cddec676b96729c23c833f41572e5f36ea15e`.
The validation workflow is isolated outside this contribution branch.

Validated production blobs:

- `src/hooks/useTxLifecycle.js`: `fe5e5dfd2471426b17b686bb09a532501bdb9d3c`
- `src/components/TxStatus.tsx`: `c58e63f818534e7b2e6d9479e067f51c357197b1`
- `src/components/DepositForm.tsx`: `39222c10c575936a52ffbfce110197aa7c6105eb`
- `src/components/WithdrawForm.tsx`: `62803561ba3eef90bd5e50713613cc6bc51497b2`

Regression blobs are `8581916a77e6a196f899f58cdec3647c385fc777` and
`389222e2254fbaec9601d5941641ee15966ca109`, respectively. No new dependency or
provider request is required for this repair.
