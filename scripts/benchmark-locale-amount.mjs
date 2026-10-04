import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({ options: {
  baseline: { type: 'string' }, candidate: { type: 'string' },
  'baseline-ref': { type: 'string' }, source: { type: 'string', default: 'src/utils/localeAmount.js' },
  rounds: { type: 'string', default: '7' }, iterations: { type: 'string', default: '2000' },
  json: { type: 'boolean', default: false },
} });
const rounds = Number(args.rounds);
const iterations = Number(args.iterations);
assert(Number.isInteger(rounds) && rounds >= 3 && rounds <= 15, 'rounds must be 3..15');
assert(Number.isInteger(iterations) && iterations >= 100 && iterations <= 20000, 'iterations must be 100..20000');
const baselineRef = args['baseline-ref'] ?? '0d4900088c257cb55f18faf324f2aeade9e03d42';
const baselineSource = args.baseline ? await readFile(args.baseline, 'utf8') :
  execFileSync('git', ['show', `${baselineRef}:${args.source}`], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
const candidateSource = await readFile(args.candidate ?? args.source, 'utf8');
let moduleId = 0;
const load = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#run${moduleId++}`);
const baseline = await load(baselineSource);
const candidate = await load(candidateSource);
const digest = (source) => ({
  sha256: createHash('sha256').update(source).digest('hex'),
  gitBlob: createHash('sha1').update(`blob ${Buffer.byteLength(source)}\0`).update(source).digest('hex'),
});
const outcome = (fn) => {
  try { return { result: fn() }; }
  catch (error) { return { error: error.name, message: error.message }; }
};
const checks = [];

// 1. Representative locale, native digit, grouping, and exact-boundary parity.
const locales = ['en-US', 'de-DE', 'fr-FR', 'hi-IN', 'ar-EG', 'fa-IR', 'en-US-u-nu-mathbold'];
for (const locale of locales) {
  const input = new Intl.NumberFormat(locale).format(1234567.5);
  assert.deepEqual(candidate.parseLocaleAmount(input, { locale }), baseline.parseLocaleAmount(input, { locale }));
  assert.deepEqual(candidate.roundTripCanonical(input, locale), baseline.roundTripCanonical(input, locale));
  assert.equal(candidate.formatLocaleAmount('9007199254740990.1234567', { locale, maxFractionDigits: 7 }),
    baseline.formatLocaleAmount('9007199254740990.1234567', { locale, maxFractionDigits: 7 }));
}
for (const [input, options] of [
  ['0001.2300', {}], ['9007199254740991.0000001', {}], [1e-7, {}],
  ['12,34.56', {}], ['1,234,567.5', { locale: 'hi-IN' }],
  ['1 234 567,5000', { locale: 'fr-FR' }], [-1, {}], [Infinity, {}],
]) assert.deepEqual(candidate.parseLocaleAmount(input, options), baseline.parseLocaleAmount(input, options));
assert.equal(candidate.serializeAmount('0001.2300'), '1.2300');
assert.equal(candidate.formatLocaleAmount('9007199254740990.1234567', { maxFractionDigits: 7 }),
  '9,007,199,254,740,990.1234567');
checks.push('locale / native digits / exact decimal and boundary parity');

// 2. Observable locale and precision coercions, supported unusual options, errors.
const trace = (module) => {
  const log = [];
  const locale = { get length() { log.push('length'); return 1; },
    get 0() { log.push('locale'); return 'en-US'; } };
  const precision = { valueOf() { log.push('precision'); return 7; } };
  const value = { valueOf() { log.push('value'); return 1234.5; } };
  const parsed = module.parseLocaleAmount('1,234.5', { locale, maxFractionDigits: precision });
  const displayed = module.formatLocaleAmount(value, { locale, maxFractionDigits: precision });
  return { parsed, displayed, log };
};
assert.deepEqual(trace(candidate), trace(baseline));
for (const options of [
  { locale: new Intl.Locale('de-DE'), minFractionDigits: '1', maxFractionDigits: '3' },
  { locale: ['en-US'], minFractionDigits: true, maxFractionDigits: [2] },
  { maxFractionDigits: NaN }, { maxFractionDigits: 2n },
  { minFractionDigits: Symbol('digits') }, { locale: 'bad_locale' },
]) assert.deepEqual(outcome(() => candidate.formatLocaleAmount('1234.50', options)),
  outcome(() => baseline.formatLocaleAmount('1234.50', options)));
assert.deepEqual(outcome(() => candidate.getLocaleSeparators(null)), outcome(() => baseline.getLocaleSeparators(null)));
assert.equal(candidate.formatLocaleAmount(NaN, { locale: 'bad_locale' }), '');
checks.push('coercion, unusual Intl inputs, and error-order parity');

// 3. The public separator object is always fresh and cannot corrupt the cache.
const separators = candidate.getLocaleSeparators('de-DE');
separators.decimal = 'broken';
assert.notStrictEqual(separators, candidate.getLocaleSeparators('de-DE'));
assert.deepEqual(candidate.getLocaleSeparators('de-DE'), baseline.getLocaleSeparators('de-DE'));
assert.equal(candidate.parseLocaleAmount('1.234,50', { locale: 'de-DE' }).canonical, '1234.50');
checks.push('fresh exported separator objects');

// 4. Count real Intl constructions; demonstrate reuse and bounded eviction.
const withCounter = (fn) => {
  const Original = Intl.NumberFormat;
  let calls = 0;
  Intl.NumberFormat = new Proxy(Original, { construct(target, params) {
    calls += 1;
    return Reflect.construct(target, params, target);
  } });
  try { return fn(() => calls); } finally { Intl.NumberFormat = Original; }
};
const constructorCounts = {};
for (const [name, source] of [['baseline', baselineSource], ['candidate', candidateSource]]) {
  const module = await load(source);
  constructorCounts[name] = withCounter((count) => {
    for (let i = 0; i < 50; i++) module.parseLocaleAmount('1,234,567.1234567');
    const parse = count();
    for (let i = 0; i < 50; i++) module.formatLocaleAmount('1234567.1234567', { maxFractionDigits: 7 });
    return { groupedParse50: parse, display50: count() - parse };
  });
}
assert.equal(constructorCounts.candidate.groupedParse50, 2);
assert.equal(constructorCounts.candidate.display50, 1);
const boundedModule = await load(candidateSource);
const bounds = withCounter((count) => {
  for (let i = 0; i < 35; i++) boundedModule.getLocaleSeparators(`en-US-x-cache${i}`);
  assert.equal(count(), 35);
  boundedModule.getLocaleSeparators('en-US-x-cache34');
  assert.equal(count(), 35);
  boundedModule.getLocaleSeparators('en-US-x-cache0');
  assert.equal(count(), 36);
  for (let i = 0; i < 35; i++) boundedModule.formatLocaleAmount('1234.5', { maxFractionDigits: i });
  assert.equal(count(), 71);
  boundedModule.formatLocaleAmount('1234.5', { maxFractionDigits: 34 });
  assert.equal(count(), 71);
  boundedModule.formatLocaleAmount('1234.5', { maxFractionDigits: 0 });
  assert.equal(count(), 72);
  const beforeCoercion = count();
  for (let i = 0; i < 2; i++) boundedModule.parseLocaleAmount('1,234.5', {
    locale: 'en-US', maxFractionDigits: { valueOf: () => 7 },
  });
  assert.equal(count() - beforeCoercion, 6);
  return { entriesPerCache: 32, caches: 2, observedEvictions: 2,
    nonprimitiveGroupedParses: 2, nonprimitiveConstructors: count() - beforeCoercion };
});
checks.push('real constructor reuse, bounded eviction, nonprimitive bypass');

const hotCases = ['en-US', 'de-DE', 'hi-IN', 'ar-EG'].map((locale) => ({
  locale, input: new Intl.NumberFormat(locale).format(1234567.5),
}));
const coldLocales = Array.from({ length: 256 }, (_, i) => `en-US-x-b${String(i).padStart(4, '0')}`);
let sink = 0;
const workloads = [
  { name: 'hot_grouped_parse_4_locales', count: iterations, run(module, i) {
    const { locale, input } = hotCases[i % hotCases.length];
    sink += module.parseLocaleAmount(input, { locale }).canonical.length;
  } },
  { name: 'hot_exact_display_4_locales', count: iterations, run(module, i) {
    sink += module.formatLocaleAmount('9007199254740990.1234567', {
      locale: hotCases[i % hotCases.length].locale, maxFractionDigits: 7,
    }).length;
  } },
  { name: 'cold_grouped_parse_unique_locales', count: coldLocales.length, run(module, i) {
    sink += module.parseLocaleAmount('1,234.5', { locale: coldLocales[i] }).canonical.length;
  } },
  { name: 'cold_exact_display_unique_locales', count: coldLocales.length, run(module, i) {
    sink += module.formatLocaleAmount('9007199254740990.1234567', {
      locale: coldLocales[i], maxFractionDigits: 7,
    }).length;
  } },
];
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const timings = [];
for (const workload of workloads) {
  for (let i = 0; i < Math.min(200, workload.count); i++) {
    workload.run(baseline, i); workload.run(candidate, i);
  }
  const pairedRounds = [];
  for (let round = 0; round < rounds; round++) {
    const elapsed = {};
    const order = round % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate'];
    for (const name of order) {
      const module = name === 'baseline' ? baseline : candidate;
      const start = performance.now();
      for (let i = 0; i < workload.count; i++) workload.run(module, i);
      elapsed[name] = performance.now() - start;
    }
    pairedRounds.push({ order, baselineMs: elapsed.baseline, candidateMs: elapsed.candidate,
      speedup: elapsed.baseline / elapsed.candidate });
  }
  timings.push({ workload: workload.name, iterationsPerRound: workload.count,
    baselineMedianNsPerOp: median(pairedRounds.map((r) => r.baselineMs)) * 1e6 / workload.count,
    candidateMedianNsPerOp: median(pairedRounds.map((r) => r.candidateMs)) * 1e6 / workload.count,
    medianPairedSpeedup: median(pairedRounds.map((r) => r.speedup)), pairedRounds });
}
const report = {
  runtime: { node: process.version, icu: process.versions.icu, platform: process.platform,
    arch: process.arch, cpu: cpus()[0]?.model },
  baseline: { source: args.baseline ?? `${baselineRef}:${args.source}`, ...digest(baselineSource) },
  candidate: { source: args.candidate ?? args.source, ...digest(candidateSource) },
  method: { rounds, alternatingPairOrder: true, warmupPerWorkload: 200,
    coldPath: '256 distinct supported private-use locale tags per round, exceeding both cache capacities',
    timing: 'real module functions, unmodified Intl constructor; constructor proxy used only in checks' },
  checks, constructorCounts, bounds, timings, sink,
};
if (args.json) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`${checks.length} focused check groups passed; ${process.version}, ICU ${process.versions.icu}`);
  for (const result of timings) console.log(`${result.workload}: ${result.baselineMedianNsPerOp.toFixed(0)} -> ` +
    `${result.candidateMedianNsPerOp.toFixed(0)} ns/op; paired median ${result.medianPairedSpeedup.toFixed(2)}x`);
  console.log('Use --json for source hashes, constructor counts, and every paired round.');
}
