# Transaction correlation storage recovery

Issue: [#259](https://github.com/YieldVault-Org/YieldVault-Frontend/issues/259).
Existing submission: [PR #266](https://github.com/YieldVault-Org/YieldVault-Frontend/pull/266).

## Correction

Correlation records are keyed by client operation ID in a JSON object. An array
passed the old object check, but JSON serialization drops named array properties.
Consequently, saving a new operation into an unexpected stored array returned
success while losing its ID. A subsequent read could neither recover the
operation nor find it through the duplicate-submission guard.

The reader now treats arrays like other invalid top-level storage shapes and
starts a record object. The next save retains the new correlation ID. This does
not recover prior contents of malformed arrays or introduce a new storage format.
Valid record objects and the existing status/retry rules are unchanged.

## Focused execution — October 4, 2026

The complete production utility was executed before and after the change using
Node 24.19.0 on Linux, built-in TypeScript stripping, and Node's native
`sessionStorage` with `--experimental-webstorage`. No storage adapter was substituted.

| Starting data | Previous source | Corrected source |
| --- | --- | --- |
| `[]` | New ID lost; guard cannot find it | ID recovered; guard finds it |
| `[null]` | New ID lost; guard cannot find it | ID recovered; guard finds it |
| `{}` | ID recovered; guard finds it | Same |
| Existing other-wallet record | New and prior IDs retained | Same |

Explicit clearing worked in all eight before/after executions, and the
other-wallet record stayed byte-equivalent in both corresponding controls.

Previous production blob: `869dde925cfa0deee1ba839a5a56dbab1414987f`, from
parent `e6f750cf10ba88e9a8adddbcfb344978df931a5e`.
Corrected production blob: `1c6ea2ce64dea539a9f7d6f638469c2453bca963`.

The two array cases extend the existing utility regression file. Its maintained
command is `npm test -- test/utils/txLifecycle.test.js`. Vitest and application
dependencies were unavailable in this execution environment, so this command,
mounted React hooks, the build, browser integration and current full CI were not
executed here. Earlier results in the original submission retain their original
source scope.

## Minimal production replay

Run this in the repository with Node 24:

```sh
node --experimental-webstorage --input-type=module <<'JS'
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source = readFileSync('src/utils/txLifecycle.ts', 'utf8');
const code = stripTypeScriptTypes(source);
const tx = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
sessionStorage.setItem('yieldvault.txOps', '[]');
const op = { clientOpId: 'op_replay', kind: 'deposit', vaultId: 'v1',
  amount: '10', walletAddress: 'GOWNER', network: 'testnet',
  state: 'submitted', updatedAt: new Date().toISOString() };
tx.saveTxOperation(op);
console.log(tx.getTxOperation(op.clientOpId)?.clientOpId);
console.log(tx.getActiveTxOperation(op)?.clientOpId);
JS
```

Both lines print `op_replay` with the correction; the preceding source prints
`undefined` twice.
