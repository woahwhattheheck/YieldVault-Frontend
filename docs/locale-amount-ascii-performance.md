# ASCII amount parsing: measured continuation

## Change

On the existing cached primitive-locale path, ASCII input already contains canonical digits. Skip only the digit-localization allocation and per-character search; locale separator, grouping, precision, sign and exact-value checks still run. Non-ASCII inputs retain code-point localization. Locale arrays/objects, nonnumeric precision options and uncached long locale tags retain their original Intl construction path. The two bounded caches, display formatter and serialized amount contract are unchanged.

## Reproduce

Run with Node and no package installation:

```sh
git show cba76006680da5e49698ab0e7bb09c2299ea3dfc:src/utils/localeAmount.js > /tmp/locale-amount-before.js
node scripts/bench-ascii-amount.mjs /tmp/locale-amount-before.js src/utils/localeAmount.js
```

This loads the complete production modules, not copied parser functions. The emitted Git blob hashes identify the exact input bytes.

## Recorded result

Node v22.16.0, ICU 77.1, linux x64. Each workload has 5,000 warm-up calls per variant and 7 alternating paired samples of 30,000 calls. Values below are medians in microseconds per complete parse; ratios are ratios of medians.

| Workload | Before µs | After µs | Ratio |
| --- | ---: | ---: | ---: |
| ASCII plain | 2.406 | 0.920 | 2.62× |
| ASCII grouped | 2.928 | 1.378 | 2.13× |
| ASCII Indian grouping | 3.056 | 1.410 | 2.17× |
| French narrow-space grouping | 3.307 | 3.482 | 0.95× |
| Arabic digits | 3.095 | 3.220 | 0.96× |

French narrow-space and Arabic digit inputs remain on the general path; these observations show no gain there and are not a claim of zero overhead. No browser, rendering, network, deployed-throughput or end-to-end payment latency was measured. These results are separate from the earlier Intl-cache benchmark and must not be multiplied into a cumulative speedup.

## Compatibility and source identity

- Nineteen targeted input cases compared both parse and serialization outputs/errors, including ASCII, localized/astral digits, mixed digits, malformed grouping, negative amounts, excess precision, exact upper boundary, invalid locale and numeric input.
- An observable locale/precision getter trace matched between versions. An ASCII-then-native Arabic sequence confirms native digit handling still works. Intl digit-table construction is retained even for ASCII input, preserving existing construction-count checks.
- This was direct Node execution of the complete production module. No Vitest, repository suite, build, dependency installation or live provider operation ran. Existing maintained test files and earlier source-bound evidence are unchanged.

Baseline source blob: `23a07645d664e6e80fc2ecd9f6091d9b79c90eb8`.
Candidate source blob: `58ec72680f249a18b77b0d273d0ceba6725b7c83`.

Raw samples and exact expected outputs: [locale-amount-ascii-results.json](locale-amount-ascii-results.json).
Replay: [bench-ascii-amount.mjs](../scripts/bench-ascii-amount.mjs).
