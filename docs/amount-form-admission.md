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

## Canonical MAX follow-through

`String(0.0000001)` is scientific notation, which is not valid controlled amount text. Both MAX handlers now pass the numeric balance through the existing `parseLocaleAmount` path before setting the controlled value. Valid seven-digit amounts become canonical decimal strings; unsupported precision is left on the existing rejection path, not silently rounded or clamped.

[Run 37205531100](https://github.com/woahwhattheheck/YieldVault-Frontend/actions/runs/37205531100) checked out `7534c1706b5d7f721d26184e882c23845c491454`, then ran the four added MAX cases together with the six admission cases using the same command and runtime above. Before the MAX repair: **8 passed, 2 failed, 0 pending**. After: **10 passed, 0 failed, 0 pending**. Both deposit and withdrawal MAX controls displayed German `0,0000001` and produced canonical `0.0000001` signing text; `0.00000001` remained rejected without a service or signing call. The original admission and explicit-retry cases remained passing.

Repaired source blobs: Deposit `039cbee3029e95e638899f95ffa7e23f27e187ea`, Withdraw `7ad4c870779d20fc59bb3ccc7c045aca74c5cec7`; ten-case test blob `0362c7a343481bbe59ae2ce9abeecff2025790da`. Control commit: `b139b73a3c200acdd252135f97f3500d413a6cd6`. [Artifact 11304697335](https://github.com/woahwhattheheck/YieldVault-Frontend/actions/runs/37205531100/artifacts/11304697335) retains the exact before/after sources, reports, logs and resolved dependency record; runner-reported ZIP SHA-256 `517ec239dc10ae06637e849b4a346ee72405b97d413d2122993f6f1221e47498`. The same mocked-service and no-build limitations apply. No dependency or validation-workflow change enters the application branch.
