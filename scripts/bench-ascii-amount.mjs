// Compare two complete production localeAmount modules; no package dependencies.
// Usage: node bench-ascii-amount.mjs before.js after.js > results.json
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const paths = process.argv.slice(2);
if (paths.length !== 2) throw new Error('Provide baseline and candidate module paths');
const source = paths.map(path => readFileSync(path));
const modules = await Promise.all(source.map((bytes, i) => import(
  `data:text/javascript;base64,${bytes.toString('base64')}#variant${i}`
)));
const gitBlob = bytes => createHash('sha1')
  .update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const observed = (fn) => {
  try { return { value: fn() }; }
  catch (error) { return { error: { name: error.name, message: error.message } }; }
};
const options = locale => ({ locale, maxFractionDigits: 7 });
const workloads = [
  ['ASCII plain', '1234.5678901', 'en-US'],
  ['ASCII grouped', '1,234,567.1234567', 'en-US'],
  ['ASCII Indian grouping', '12,34,567.1234567', 'hi-IN'],
  ['French narrow-space grouping', '1\u202f234\u202f567,1234567', 'fr-FR'],
  ['Arabic digits', '١٬٢٣٤٬٥٦٧٫١٢٣٤٥٦٧', 'ar-EG'],
];

// Untimed behavioral comparisons include the fast path and unchanged fallbacks.
const inputs = [
  ...workloads.map(([, input, locale]) => [input, options(locale)]),
  ['-1,234.5', options('en-US')], ['1,23,456', options('en-US')],
  ['1.12345678', options('en-US')], ['9007199254740991.0000001', options('en-US')],
  ['0001234.50', options('en-US')], ['not a number', options('en-US')],
  ['1 234,125', options('fr-FR')], ['1,234.5', options('en-US-u-nu-hanidec')],
  ['1٬٢٣٤٫5', options('ar-EG')], ['1.5', options('invalid_locale')],
  [1.25e-7, { maxFractionDigits: 9 }], [null, options('en-US')],
  ['1.5', { locale: ['en-US'], maxFractionDigits: '7' }],
];
const astralLocale = 'en-US-u-nu-mathbold';
inputs.push([new Intl.NumberFormat(astralLocale, { maximumFractionDigits: 7 })
  .format('1234.1234567'), options(astralLocale)]);
for (const [input, opts] of inputs) {
  for (const name of ['parseLocaleAmount', 'serializeAmount']) {
    assert.deepStrictEqual(observed(() => modules[1][name](input, opts)),
      observed(() => modules[0][name](input, opts)), `${name}: ${String(input)}`);
  }
}
// Getters must retain the uncached Intl path and its observable access order.
const getterTrace = mod => {
  const trace = [];
  const locale = { get length() { trace.push('length'); return 1; },
    get 0() { trace.push('locale'); return 'en-US'; } };
  const precision = { valueOf() { trace.push('precision'); return 7; } };
  return { result: observed(() => mod.parseLocaleAmount('1,234.5',
    { locale, maxFractionDigits: precision })), trace };
};
assert.deepStrictEqual(getterTrace(modules[1]), getterTrace(modules[0]));
for (const mod of modules) {
  // ASCII first must not prevent later lazy initialization of native digits.
  assert.equal(mod.serializeAmount('1234', options('ar-EG')), '1234');
  assert.equal(mod.serializeAmount('١٢٣٤٫٥', options('ar-EG')), '1234.5');
}

const iterations = 30000, pairs = 7, warmup = 5000;
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const results = [];
let checksum = 0;
for (const [name, input, locale] of workloads) {
  const opts = options(locale);
  const expected = modules[0].parseLocaleAmount(input, opts);
  assert.equal(expected.ok, true, name);
  assert.deepStrictEqual(modules[1].parseLocaleAmount(input, opts), expected);
  const run = (mod, count) => {
    const start = performance.now();
    for (let i = 0; i < count; i++) {
      const result = mod.parseLocaleAmount(input, opts);
      checksum += result.canonical.length;
    }
    return (performance.now() - start) * 1000 / count;
  };
  modules.forEach(mod => run(mod, warmup));
  const samples = [];
  for (let pair = 0; pair < pairs; pair++) {
    const sample = {};
    for (const index of pair % 2 === 0 ? [0, 1] : [1, 0]) {
      sample[index === 0 ? 'before_us' : 'after_us'] = run(modules[index], iterations);
    }
    samples.push(sample);
  }
  const before = median(samples.map(x => x.before_us));
  const after = median(samples.map(x => x.after_us));
  results.push({ name, input, locale, expected, before_median_us: before,
    after_median_us: after, ratio_of_medians: before / after, samples });
}
console.log(JSON.stringify({ node: process.version, icu: process.versions.icu,
  platform: process.platform, arch: process.arch,
  source_git_blobs: source.map(gitBlob), iterations, pairs, warmup,
  checks: { input_cases: inputs.length, exports_per_case: 2,
    getter_trace_equal: true, ascii_then_native: true }, checksum, results }, null, 2));
