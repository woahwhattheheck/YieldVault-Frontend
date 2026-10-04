from __future__ import annotations
import hashlib, json, os, shutil, subprocess, sys, time
from pathlib import Path
BASE='3939724e2fbc32c42ad87d532c93525dbfdb7952'
SOURCE='src/utils/localeAmount.js'
UTIL='test/utils/localeAmount.test.js'
COMP='test/components/AmountInput.test.tsx'
GUARDS={SOURCE:'f82be3c123111273684b84f2b654658b2182251b',UTIL:'6247bc8072c0ca77cb13865b2194474222cb138a',COMP:'1da4f53030b0b1c575a21048bf5f4a37369a49f8'}
UTIL_ADD=r'''

describe('exact decimal display and upper boundary', () => {
  it.each(['en-US', 'de-DE', 'fr-FR', 'hi-IN', 'sv-SE', 'de-CH'])('reconciles large decimal display with serialization in %s', (locale) => {
    for (const canonical of ['123456789012.1234567', '9007199254740990.9', '99999999999.9999999', '1000000000.0000001', '0.0000001']) {
      const displayed = formatLocaleAmount(canonical, { locale, maxFractionDigits: 7 });
      expect(serializeAmount(displayed, { locale })).toBe(canonical);
      expect(roundTripCanonical(displayed, locale).canonical).toBe(canonical);
    }
  });

  it.each(['en-US', 'de-DE', 'fr-FR', 'hi-IN'])('rejects nonzero fractional excess above the safe boundary in %s', (locale) => {
    const { decimal } = getLocaleSeparators(locale);
    for (const fraction of ['1', '0000001', '000001', '01', '5', '9']) {
      const entered = `9007199254740991${decimal}${fraction}`;
      expect(parseLocaleAmount(entered, { locale })).toEqual({ ok: false, error: 'Amount is outside the supported numeric range' });
      expect(() => serializeAmount(entered, { locale })).toThrow('Amount is outside the supported numeric range');
    }
    for (const fraction of ['', `${decimal}0`, `${decimal}0000000`]) {
      expect(parseLocaleAmount(`9007199254740991${fraction}`, { locale }).ok).toBe(true);
    }
    expect(serializeAmount(`9007199254740990${decimal}9999999`, { locale })).toBe('9007199254740990.9999999');
  });

  it('keeps display rounding explicit without mutating canonical serialization', () => {
    expect(formatLocaleAmount('99999999999.9999999', { maxFractionDigits: 2 })).toBe('100,000,000,000');
    expect(formatLocaleAmount('123456789012.125', { maxFractionDigits: 2 })).toBe('123,456,789,012.13');
    expect(serializeAmount('99999999999.9999999')).toBe('99999999999.9999999');
    expect(formatLocaleAmount(1234.5, { minFractionDigits: 2 })).toBe('1,234.50');
    expect(formatLocaleAmount('not-a-number')).toBe('');
  });
});
'''
COMP_ADD=r'''

describe('exact canonical amount remains visible', () => {
  it.each([
    ['en-US', '123,456,789,012.1234567', '123456789012.1234567', '123,456,789,012.1234568'],
    ['de-DE', '123.456.789.012,1234567', '123456789012,1234567', '123.456.789.012,1234568'],
    ['fr-FR', '123\u202f456\u202f789\u202f012,1234567', '123456789012,1234567', '123\u202f456\u202f789\u202f012,1234568'],
    ['hi-IN', '1,23,45,67,89,012.1234567', '123456789012.1234567', '1,23,45,67,89,012.1234568'],
  ])('preserves all seven decimal digits through focus, edit and blur in %s', (locale, display, editing, editedDisplay) => {
    render(<ControlledAmountInput locale={locale} initialValue="123456789012.1234567" />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue(display);
    expect(screen.getByTestId('canonical-amount')).toHaveTextContent('123456789012.1234567');
    fireEvent.focus(input);
    expect(input).toHaveValue(editing);
    fireEvent.change(input, { target: { value: `${editing.slice(0, -1)}8` } });
    fireEvent.blur(input);
    expect(input).toHaveValue(editedDisplay);
    expect(screen.getByTestId('canonical-amount')).toHaveTextContent('123456789012.1234568');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it.each([['en-US', '.'], ['de-DE', ',']])('clears a fractional out-of-range amount in %s', (locale, decimal) => {
    render(<ControlledAmountInput locale={locale} initialValue="10" />);
    const input = screen.getByRole('textbox');
    const invalid = `9007199254740991${decimal}0000001`;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: invalid } });
    fireEvent.blur(input);
    expect(input).toHaveValue(invalid);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('canonical-amount')).toBeEmptyDOMElement();
  });
});
'''

def git(*args):
    return subprocess.check_output(['git',*args],cwd=subject,text=True).strip()
def blob(data): return hashlib.sha1(f'blob {len(data)}\0'.encode()+data).hexdigest()
def run(label,command):
    start=time.monotonic()
    result=subprocess.run(command,cwd=subject,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=240)
    (evidence/f'{label}.stdout').write_text(result.stdout,encoding='utf8')
    (evidence/f'{label}.stderr').write_text(result.stderr,encoding='utf8')
    print(result.stdout[-4000:]); print(result.stderr[-4000:])
    return {'command':command,'exit_code':result.returncode,'wall_seconds':round(time.monotonic()-start,6)}
def test(label):
    report=evidence/f'{label}.json'
    result=run(label,['npm','test','--',UTIL,COMP,'--reporter=json',f'--outputFile={report}'])
    if report.exists():
        data=json.loads(report.read_text())
        result['counts']={key:data.get(key) for key in ['numTotalTests','numPassedTests','numFailedTests','numPendingTests']}
        result['failed']=[item.get('fullName') for suite in data.get('testResults',[]) for item in suite.get('assertionResults',[]) if item.get('status')=='failed']
    return result
subject=Path(sys.argv[1]).resolve(); evidence=Path(sys.argv[2]).resolve(); evidence.mkdir(parents=True)
receipt={'base':BASE,'run_id':os.environ['GITHUB_RUN_ID'],'node':subprocess.check_output(['node','--version'],text=True).strip(),'npm':subprocess.check_output(['npm','--version'],text=True).strip(),'status':'STARTED'}
try:
    assert git('rev-parse','HEAD')==BASE and git('status','--porcelain')==''
    originals={p:(subject/p).read_bytes() for p in GUARDS}
    assert all(blob(originals[p])==h for p,h in GUARDS.items()), 'source blob changed'
    receipt['install']=run('install',['npm','ci','--no-audit','--no-fund'])
    assert receipt['install']['exit_code']==0, 'locked install failed'
    assert git('status','--porcelain')=='', 'locked install changed tracked files'
    (subject/UTIL).write_bytes(originals[UTIL]+UTIL_ADD.encode())
    (subject/COMP).write_bytes(originals[COMP]+COMP_ADD.encode())
    receipt['before']=test('before')
    assert receipt['before']['exit_code']!=0 and receipt['before'].get('counts',{}).get('numFailedTests',0)>=10,'claimed display/range failure not reproduced'
    text=originals[SOURCE].decode()
    old='  if (Math.abs(value) > Number.MAX_SAFE_INTEGER) {'
    new='''  // A fraction above the largest supported integer can round back down
  // during Number conversion. Compare that exact decimal boundary as text.
  const aboveExactMaximum = canonical.split('.')[0] === String(Number.MAX_SAFE_INTEGER)
    && /[1-9]/.test(fraction);
  if (Math.abs(value) > Number.MAX_SAFE_INTEGER || aboveExactMaximum) {'''
    assert text.count(old)==1 and text.count('  }).format(num);')==1
    text=text.replace(old,new).replace('  }).format(num);', '''  // Intl accepts exact decimal strings; converting them to Number first
  // would discard supported digits before the configured display rounding.
  }).format(typeof value === 'string' ? value : num);''')
    (subject/SOURCE).write_bytes(text.encode())
    receipt['after']=test('after')
    assert receipt['after']['exit_code']==0 and receipt['after']['counts']['numFailedTests']==0 and receipt['after']['counts']['numPendingTests']==0,'candidate selection failed or skipped'
    receipt['blobs']={p:blob((subject/p).read_bytes()) for p in GUARDS}
    for p in GUARDS:
        dest=evidence/'source'/p; dest.parent.mkdir(parents=True,exist_ok=True); shutil.copyfile(subject/p,dest)
    (evidence/'change.patch').write_text(git('diff','--',*GUARDS)+'\n',encoding='utf8')
    git('add','--',*GUARDS)
    assert set(git('diff','--cached','--name-only').splitlines())==set(GUARDS)
    git('-c','user.name=woahwhattheheck','-c','user.email=293286387+woahwhattheheck@users.noreply.github.com','commit','-m','fix(amount): preserve exact decimal display and upper range boundary [skip ci]')
    receipt['candidate']=git('rev-parse','HEAD'); receipt['tree']=git('rev-parse','HEAD^{tree}')
    assert git('status','--porcelain')==''
    receipt['candidate_ref']='fix/yv269-exact-decimal-dbd0-20261004'
    git('push','origin',f"HEAD:refs/heads/{receipt['candidate_ref']}")
    receipt['status']='PASSED_AND_RETAINED'
finally:
    (evidence/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf8'); print(json.dumps(receipt,indent=2))
