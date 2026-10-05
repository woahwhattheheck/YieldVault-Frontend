# Position-cache clear boundary

## Failure and repair

Clearing the cache removed its entries and reset its generation counter. The
next request could therefore reuse the token of a request started before the
clear. A late response could repopulate an otherwise empty cache or overwrite a
fresh response. Both failures reproduced against the actual utility at
`d200655d0aa3c50bf3570abe08f7b051dc0bb10c`.

The cache now accepts a response only if its key still has the exact generation
that authorized it. Clearing removes those entries without resetting the
counter, so a later fetch receives a strictly newer token. A rejected response
does not insert data or notify subscribers.

Query-key encoding, scope invalidation, hook lifecycles, mutation handling,
network behavior and the existing clear-notification behavior are preserved.
This is an in-memory request-token change, with no persisted-data migration.
Callers must use the current token returned by `beginFetch` or `invalidate`;
missing, superseded or fabricated generations are rejected.

## Focused execution

Node **24.19.0** executed the exact preceding and repaired utility bytes on
4 October 2026. Two focused scenarios failed before the repair and passed
afterward:

| Scenario | Preceding utility | Repaired utility |
| --- | --- | --- |
| Retired response arrives after clear, before any new fetch | Accepted; repopulates the cache | Rejected; zero entries and zero data notifications |
| Fresh response arrives, followed by a pre-clear response | Token 1 is reused; retired data overwrites fresh data | Fresh token 2 survives; retired token 1 is rejected |

The second scenario also checks that normal invalidation still rejects the
retired active token and that the subsequent current token remains writable.
The same two regressions are added to the existing utility test file.

The executed check imports the actual utility through a data URL and uses Node
assertions. It substitutes no cache, token, listener or timing implementation.
It installs no dependencies and makes no provider requests. This establishes the
cache-clear boundary; it is not a newly executed mounted-hook, complete Vitest,
browser, CI or application-performance result. Earlier PR validation remains
tied to the source at which it ran.

## Reproduce

From the repository root, the preceding source is expected to fail both cases:

```sh
node scripts/check-position-cache-clear.mjs --baseline-ref d200655d0aa3c50bf3570abe08f7b051dc0bb10c
```

The repaired source should pass:

```sh
node scripts/check-position-cache-clear.mjs
```

With the project's existing dependencies installed, the maintained utility
selection is `npm test -- test/utils/positionCache.test.js`. It was not rerun
during this focused check.

## Exact execution record

- Preceding utility blob: `f8f17676296537b2de4ef7580e3603ee8324e09a`.
- Repaired utility blob: `499773da1f189277a5e3ecab97c777d28437511a`.
- Executed reproduction-script blob: `488ae3455dc062063493c0c13755a191d16fe142`.

```json
{
  "before": {
    "node": "v24.19.0",
    "sourceBlob": "f8f17676296537b2de4ef7580e3603ee8324e09a",
    "checks": [
      {
        "name": "cleared cache rejects a retired response without notifying",
        "passed": false,
        "error": "Expected values to be strictly equal:\n\ntrue !== false\n"
      },
      {
        "name": "a fresh response survives a retired pre-clear response",
        "passed": false,
        "error": "Expected values to be strictly equal:\n\ntrue !== false\n"
      }
    ],
    "passed": false
  },
  "after": {
    "node": "v24.19.0",
    "sourceBlob": "499773da1f189277a5e3ecab97c777d28437511a",
    "checks": [
      {
        "name": "cleared cache rejects a retired response without notifying",
        "passed": true,
        "observed": {
          "accepted": false,
          "entries": 0,
          "notifications": 0
        }
      },
      {
        "name": "a fresh response survives a retired pre-clear response",
        "passed": true,
        "observed": {
          "retired": 1,
          "fresh": 2,
          "next": 4,
          "staleAccepted": false
        }
      }
    ],
    "passed": true
  }
}
```

## Shared in-flight reads — 5 October 2026 source continuation

Canonical contribution: [YieldVault-Frontend PR #268](https://github.com/YieldVault-Org/YieldVault-Frontend/pull/268),
for [issue #256](https://github.com/YieldVault-Org/YieldVault-Frontend/issues/256).
This continues `YV268-SHARED-INFLIGHT-COPPER-D520`, whose original source task
identified concurrent consumers allocating competing generations for the same
position read. The starting contribution head was
`fa97ec5b06dd00a6b99097a9e7123a9590415c41`; cache and hook preimages were
`02b65a1961f180e6781674cb6117a6923a307b51` and
`622baec1ca45e0a9488537e794bef006848a2ddf`.

`beginSharedFetch(key, loader, { force })` returns a generation and a promise.
An automatic refresh joins a pending request only while its generation remains
current for that exact key. The complete request is registered before invoking
the loader, so synchronous re-entry can receive the same usable promise.
A synchronous loader exception rejects that promise. Success and failure remove
only their own request record; an older settlement cannot remove a replacement.

The hook binds its existing lifecycle and generation guards to the returned
shared generation. Automatic invalidation refreshes can share that request.
Public `reload()` always starts a fresh generation, as do direct `beginFetch`
calls. Invalidation and clear retire the shared record without resetting the
monotonic counter or canceling the underlying loader. Existing stale result and
error checks remain responsible for rejecting retired work.

This is pending-read sharing, with no TTL or completed-result cache. It assumes
the existing query key identifies compatible loader semantics. Independent
mount effects still invalidate their scope, so this does not promise one request
across every simultaneous mount. Joining hooks retain their existing cache
writes and notifications; reduced renders are not claimed. The current
`vaultService.getPositions` reads the demo position store through its latency
helper, so no production network-request reduction is asserted.

This continuation was checked by source inspection and exact publication
readbacks only. No utility, hook, browser, test suite or workflow was executed,
and no performance measurement was made. The earlier execution record above
remains historical evidence for its original cache-clear source, not acceptance
of this later sharing change.
