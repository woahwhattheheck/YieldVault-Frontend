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
