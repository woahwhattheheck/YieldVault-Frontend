from __future__ import annotations
import hashlib,json,os,shutil,subprocess,sys,time
from pathlib import Path
BASE='c20bbca63ba7600b219a3157d556c784c521c1e9'
SOURCE='src/services/preflight.js'
TEST='test/services/preflight.test.js'
GUARDS={SOURCE:'0fc7e8cce79a34549f21f4199ea4a15b8f48af9a',TEST:'633548b67d1c2b1d8d226478f6dc5488b92ffac5'}
SELECTION=[TEST,'test/utils/preflight.test.js','test/hooks/usePreflight.test.jsx','test/components/DepositForm.preflight.test.jsx']
EXTRA=r'''

import { shouldRequestSignature } from '../../src/utils/preflight.js';

describe('finite preflight account state', () => {
  beforeEach(() => { __resetSimulationBehaviorForTests(); });
  afterEach(() => { __resetSimulationBehaviorForTests(); });

  it.each(['deposit', 'withdraw'].flatMap((kind) =>
    [NaN, Infinity, -Infinity, 'unavailable', 'Infinity', '1e999'].map((available) => ({ kind, available })),
  ))('does not permit a $kind signature with unusable account state $available', async ({ kind, available }) => {
    const input = { ...base, kind, balance: 100, position: 100, [kind === 'deposit' ? 'balance' : 'position']: available };
    const result = await runPreflight(input);
    expect(result.status).toBe(PREFLIGHT_STATUS.REJECTED);
    expect(result.code).toBe(PREFLIGHT_CODE.MISSING_CONTEXT);
    expect(result.reason).toMatch(/refresh/i);
    expect(result.advisoryOnly).toBe(true);
    expect(shouldRequestSignature(result, result.serializedTx, result.network)).toBe(false);
  });

  it.each(['deposit', 'withdraw'])('allows a $kind after a fresh finite account value arrives', async (kind) => {
    const field = kind === 'deposit' ? 'balance' : 'position';
    const rejected = await runPreflight({ ...base, kind, [field]: NaN });
    expect(shouldRequestSignature(rejected, rejected.serializedTx, rejected.network)).toBe(false);
    const fresh = await runPreflight({ ...base, kind, [field]: 100 });
    expect(fresh.status).toBe(PREFLIGHT_STATUS.OK);
    expect(shouldRequestSignature(fresh, fresh.serializedTx, fresh.network)).toBe(true);
    expect(fresh.serializedTx).toBe(rejected.serializedTx);
  });

  it.each(['deposit', 'withdraw'].flatMap((kind) =>
    [0, 24, 25, 100, '100'].map((available) => ({ kind, available })),
  ))('preserves finite $kind amount checks for available $available', async ({ kind, available }) => {
    const field = kind === 'deposit' ? 'balance' : 'position';
    const result = await runPreflight({ ...base, kind, [field]: available });
    if (Number(available) < 25) {
      expect(result.status).toBe(PREFLIGHT_STATUS.REJECTED);
      expect(result.code).toBe(kind === 'deposit' ? PREFLIGHT_CODE.STALE_BALANCE : PREFLIGHT_CODE.INSUFFICIENT_POSITION);
    } else {
      expect(result.status).toBe(PREFLIGHT_STATUS.OK);
    }
    expect(shouldRequestSignature(result, result.serializedTx, result.network)).toBe(Number(available) >= 25);
  });
});
'''

def blob(data): return hashlib.sha1(f'blob {len(data)}\0'.encode()+data).hexdigest()
def git(*args): return subprocess.check_output(['git',*args],cwd=subject,text=True).strip()
def run(label,command):
    started=time.monotonic()
    r=subprocess.run(command,cwd=subject,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=240)
    (evidence/f'{label}.stdout').write_text(r.stdout,encoding='utf8'); (evidence/f'{label}.stderr').write_text(r.stderr,encoding='utf8')
    print(r.stdout[-3000:]); print(r.stderr[-3000:])
    return {'command':command,'exit_code':r.returncode,'wall_seconds':round(time.monotonic()-started,6)}
def test(label):
    path=evidence/f'{label}.json'
    result=run(label,['npm','test','--',*SELECTION,'--reporter=json',f'--outputFile={path}'])
    if path.exists():
        data=json.loads(path.read_text())
        result['counts']={key:data.get(key) for key in ['numTotalTests','numPassedTests','numFailedTests','numPendingTests']}
        result['failed']=[item.get('fullName') for suite in data.get('testResults',[]) for item in suite.get('assertionResults',[]) if item.get('status')=='failed']
    return result
subject=Path(sys.argv[1]).resolve(); evidence=Path(sys.argv[2]).resolve(); evidence.mkdir(parents=True)
receipt={'base':BASE,'run_id':os.environ['GITHUB_RUN_ID'],'node':subprocess.check_output(['node','--version'],text=True).strip(),'npm':subprocess.check_output(['npm','--version'],text=True).strip(),'status':'STARTED'}
try:
    assert git('rev-parse','HEAD')==BASE and git('status','--porcelain')==''
    originals={p:(subject/p).read_bytes() for p in GUARDS}
    assert all(blob(originals[p])==h for p,h in GUARDS.items())
    assert all((subject/p).is_file() for p in SELECTION), 'maintained selection missing'
    receipt['install']=run('install',['npm','ci','--no-audit','--no-fund'])
    assert receipt['install']['exit_code']==0 and git('status','--porcelain')=='','locked install failed or changed source'
    (subject/TEST).write_bytes(originals[TEST]+EXTRA.encode())
    receipt['before']=test('before')
    assert receipt['before']['exit_code']!=0 and receipt['before'].get('counts',{}).get('numFailedTests',0)>=10, 'claimed nonfinite-state failure did not reproduce'
    text=originals[SOURCE].decode()
    for field,description in [('balance','wallet balance'),('position','position balance')]:
        old=f'    const {field} = Number(input.{field} ?? 0);\n'
        new=old+f'''    if (!Number.isFinite({field})) {{
      return rejected(
        base,
        PREFLIGHT_CODE.MISSING_CONTEXT,
        'The {description} is unavailable. Refresh it before signing.',
      );
    }}
'''
        assert text.count(old)==1
        text=text.replace(old,new)
    (subject/SOURCE).write_bytes(text.encode())
    receipt['after']=test('after')
    assert receipt['after']['exit_code']==0 and receipt['after']['counts']['numFailedTests']==0 and receipt['after']['counts']['numPendingTests']==0
    receipt['blobs']={p:blob((subject/p).read_bytes()) for p in GUARDS}
    for p in GUARDS:
        dest=evidence/'source'/p; dest.parent.mkdir(parents=True,exist_ok=True); shutil.copyfile(subject/p,dest)
    (evidence/'change.patch').write_text(git('diff','--',*GUARDS)+'\n',encoding='utf8')
    git('add','--',*GUARDS)
    assert set(git('diff','--cached','--name-only').splitlines())==set(GUARDS)
    git('-c','user.name=woahwhattheheck','-c','user.email=293286387+woahwhattheheck@users.noreply.github.com','commit','-m','fix(preflight): reject nonfinite account state before signature admission [skip ci]')
    receipt['candidate']=git('rev-parse','HEAD'); receipt['tree']=git('rev-parse','HEAD^{tree}')
    assert git('status','--porcelain')==''
    receipt['candidate_ref']='fix/yv270-finite-preflight-dbd0-20261004'
    git('push','origin',f"HEAD:refs/heads/{receipt['candidate_ref']}")
    receipt['status']='PASSED_AND_RETAINED'
finally:
    (evidence/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf8'); print(json.dumps(receipt,indent=2))
