# Amount form submission admission

Deposit and withdrawal now check the connected state inside the submit handler and hold one synchronous per-form admission flag across both service awaits. The ref blocks reentrant submit events before React commits the loading state, while `finally` releases admission for a later explicit retry. Existing amount validation, canonical serialization, service ordering and success/error handling are unchanged.

## Recorded execution

[Run 37205107398](https://github.com/woahwhattheheck/YieldVault-Frontend/actions/runs/37205107398) completed successfully on Ubuntu 24.04.5, Node 22.23.3 and npm 10.9.9. It checked out source `7111df28e7de1a8f9e4173dcbc602c625e5f550c`, used the repository CI install command `npm install --no-audit --no-fund`, and ran the same six mounted cases before and after the two-file patch:

```sh
npm test -- test/components/AmountForm.admission.test.tsx --maxWorkers=1
```

Original: **2 passed, 4 failed, 0 pending**. Repaired: **6 passed, 0 failed, 0 pending**. For each form the cases cover repeated submit events during the unresolved vault and signing promises, submission after disconnect, and an explicit retry following a rejected vault operation. German `1,25` input still produces the canonical `1.25` signing text.

The actual React forms, AmountInput and amount helpers ran with controlled wallet hooks and mocked service boundaries. This is not live signing, chain execution, a production build, a whole-application test result, or persistent idempotency across remounts. The existing mock service ordering was not redesigned.

| Source | Before Git blob | Repaired Git blob |
| --- | --- | --- |
| DepositForm.tsx | `835999ca284a95a9a69826932ace76e7b519bd56` | `b60ab220be97871f7ee7aa31dcdfbae0bc6c500e` |
| WithdrawForm.tsx | `cb50246e63fbd8a24d764e3c264da025538d49cb` | `ee1ed0dea28f4f7987c9396cfbde1d90bb761158` |

Test blob: `c1234a6c08b91470152447286fdc63d2b3e54326`. The isolated validation workflow and guarded patch are retained at control commit `e98ff23090937e73103c99e4b96447d986493683`; they are not added to the application branch.

[Artifact 11304351566](https://github.com/woahwhattheheck/YieldVault-Frontend/actions/runs/37205107398/artifacts/11304351566) retains both source postimages, the test, result JSON, logs, runtime/dependency versions and resolved install lock. Runner-reported ZIP SHA-256: `5ced1c1b709ce8de3321969adaf9ef3e2c6bdacb6b94289dc50e979fcee2e61d`. The install-resolved lock is evidence only; application dependency manifests and lockfiles remain unchanged.
