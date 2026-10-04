# Locale amount formatter reuse

Repeated valid amount parsing constructed two `Intl.NumberFormat` objects per call and a third for grouped input. Display formatting constructed another formatter on every call. The utility now reuses locale metadata and display formatters through two FIFO caches, each capped at 32 entries. Digit and grouping metadata remain lazy.

## Measurement

Baseline: commit `0d4900088c257cb55f18faf324f2aeade9e03d42`, file `src/utils/localeAmount.js`, Git blob `93a396ca89f6b7d42868e92901215e0298b712bc`.

Candidate source Git blob: `bed027a8a5a44d438aae575869f2b36734129cbb`.

Runtime: Node 24.19.0, ICU 78.3, Linux x64, AMD EPYC 9V74. Seven paired rounds alternated execution order. Each hot round performed 2,000 operations across `en-US`, `de-DE`, `hi-IN`, and `ar-EG`. Each cache-miss round used 256 distinct supported private-use locale tags, exceeding cache capacity. The harness warms each workload first and calls the actual modules with the normal Intl implementation during timing.

| Workload | Baseline median µs/op | Candidate median µs/op | Median paired speedup |
|---|---:|---:|---:|
| Repeated grouped parse | 150.430 | 5.525 | 32.086× |
| Repeated exact-decimal display | 27.902 | 1.626 | 14.522× |
| Cache-miss grouped parse | 105.081 | 113.496 | 1.007× |
| Cache-miss exact-decimal display | 24.259 | 26.824 | 0.956× |

Each latency column is its own median; paired speedup is the median of the seven within-pair baseline/candidate ratios. These statistics need not divide to the same value. The ratios of latency medians are 27.23× for repeated parsing and 17.16× for repeated display.

[All raw rounds and source hashes](validation/locale-amount-cache-20261004.json) are retained, including the slow first baseline parsing round. Cold measurements establish no reliable gain. The improvement targets repeated use of a small set of locales and precisions; cache misses retain construction work and add bounded cache bookkeeping. Cache-miss measurements are not process-startup timings. These are utility measurements on one shared runtime, not browser or application-wide latency claims.

A separate instrumentation check forwarded every construction to the real `Intl.NumberFormat`: 50 grouped parses required 150 constructions before and 2 after; 50 displays required 50 and 1 respectively. The original constructor was restored before timing.

## Compatibility

Four focused check groups cover locale/native-digit and exact-boundary parity; observable coercion and error order; fresh exported separator objects; and bounded reuse/eviction.

Coverage includes Hindi grouping, French spaces, Arabic and Persian digits, supplementary-code-point digits, exact decimal strings, numeric boundaries, unusual supported Intl inputs, and invalid options. Nonprimitive locales and coercing precision/value inputs retain the uncached path. The cache optimizes primitive string locales and numeric precisions. Public separator results remain fresh objects.

Existing canonical serialization, validation, and exact-string display logic is retained. The [earlier exact-decimal and input validation](locale-amount-exact-decimals.md) remains tied to its original source checkpoint. This performance pass did not rerun or claim a full application suite.

## Reproduce

From a checkout containing the pinned baseline commit:

```sh
node scripts/benchmark-locale-amount.mjs --baseline-ref 0d4900088c257cb55f18faf324f2aeade9e03d42 --source src/utils/localeAmount.js --json
```

The script uses only Node built-ins, reads the baseline with `git show`, and imports the exact source bytes as data modules so the package's CommonJS mode requires no modification. It performs no network calls or repository writes.

`--baseline path/to/baseline.js --candidate path/to/candidate.js` also supports saved files. Run on Node 24.19.0 or another runtime supporting the baseline's exact-decimal Intl behavior. JSON output includes every paired round, source hashes, constructor counts, and the four check-group receipts.

## Bounding retained locale key length

The caches now also limit retained locale keys to 256 characters. Intl accepts
valid private-use locale tags much longer than ordinary language tags, so an
entry-count limit alone did not bound the memory retained by raw keys. Both
the locale metadata cache and the display formatter cache use the same length
limit. Longer tags remain accepted through the existing uncached paths; the
32-entry FIFO policy, lazy metadata and ordinary formatter reuse are preserved.

The added maintained regression exercises 256-, 257- and 32,772-character
valid tags independently through parsing, separator lookup and display. It
forwards constructor calls to real Intl, confirms unchanged canonical/display
results, confirms reuse at the limit, and confirms that each path recomputes
longer keys. On parent `df843531b2aa4808bd45964a49f12b09ca98185e` the selected
new regression fails because a long key is reused. With utility blob
`23a07645d664e6e80fc2ecd9f6091d9b79c90eb8`, the complete maintained
`test/utils/localeAmountDigits.test.js` selection passes **4/4**, including its
three existing locale-digit, exact-boundary and deterministic round-trip cases.

This focused run used Node 24.19.0 and real Vitest 4.1.10 with the unchanged
pinned Vite configuration/setup and retained installed dependencies. The
selection was `vitest run test/utils/localeAmountDigits.test.js --cache=false`;
the baseline selected only the new case. No dependency installation, full
application suite, browser build or performance benchmark was repeated for
this small memory-bound correction. Earlier timings remain bound to the
original measured source identified above.
