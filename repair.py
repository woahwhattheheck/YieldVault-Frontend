import hashlib, json, pathlib, shutil, subprocess, sys, time
ROOT=pathlib.Path(__file__).resolve().parent
S=pathlib.Path(sys.argv[1]).resolve(); O=pathlib.Path(sys.argv[2]).resolve(); O.mkdir(parents=True,exist_ok=True)
BASE='cff7616156d3942651c0695dccd14943c7af176b'
HOOK='src/hooks/useTxLifecycle.js'; STATUS='src/components/TxStatus.tsx'
DEPOSIT='src/components/DepositForm.tsx'; WITHDRAW='src/components/WithdrawForm.tsx'
PINS={HOOK:'e1add25126e5e364a1dcc23fa1b713b3baef8a2a',STATUS:'c84cf0cd9adc0dd220ad61d189d1674a1131ca3b',DEPOSIT:'631256c905cbe0c1a772b1c5ad0d7a6e4f4f86be',WITHDRAW:'2fe2f512a85c1b57c35b9d22b01c6136c7a54b68'}
TESTS=['test/hooks/useTxLifecycle.recovery.test.jsx','test/components/TransactionForms.lifecycle.test.jsx']
def git(*args): return subprocess.check_output(['git',*args],cwd=S,text=True).strip()
def blob(data): return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
def replace(text,old,new):
 if text.count(old)!=1: raise RuntimeError('source anchor count: '+repr(old))
 return text.replace(old,new,1)
def execute(label):
 out=O/(label+'.json')
 cmd=['node','node_modules/vitest/vitest.mjs','run','test/hooks/useTxLifecycle.test.jsx','test/utils/txLifecycle.test.js',*TESTS,'--reporter=json','--outputFile='+str(out)]
 start=time.monotonic()
 with (O/(label+'.stdout')).open('wb') as stdout,(O/(label+'.stderr')).open('wb') as stderr:
  r=subprocess.run(cmd,cwd=S,stdout=stdout,stderr=stderr,timeout=120)
 data=json.loads(out.read_text())
 return {'command':cmd,'exit_code':r.returncode,'seconds':time.monotonic()-start,'passed':data['numPassedTests'],'failed':data['numFailedTests'],'pending':data['numPendingTests']}
if git('rev-parse','HEAD')!=BASE or git('status','--porcelain'): raise RuntimeError('expected clean pinned subject')
original={}
for p,h in PINS.items():
 d=(S/p).read_bytes()
 if blob(d)!=h: raise RuntimeError('source changed: '+p)
 original[p]=d.decode(); (O/('before-'+pathlib.Path(p).name)).write_bytes(d)
for p in TESTS:
 if (S/p).exists(): raise RuntimeError('test already exists')
 (S/p).parent.mkdir(parents=True,exist_ok=True); shutil.copyfile(ROOT/pathlib.Path(p).name,S/p)
before=execute('before')
if before['failed']<5: raise RuntimeError('original defects were not reproduced')
s=original[HOOK]
s=replace(s,'      const current = operation ? getTxOperation(operation.clientOpId) : null;','''      // Another mounted form may have submitted since this hook last rendered.
      const active = getActiveTxOperation({ kind, vaultId });
      const local = operation?.kind === kind && operation?.vaultId === vaultId
        ? operation
        : null;
      const current = active ?? (local ? getTxOperation(local.clientOpId) ?? local : null);''')
s=replace(s,'      ) {\n        return current;\n      }','      ) {\n        setOperation(current);\n        return current;\n      }')
s=replace(s,'  const reset = useCallback(() => {\n    if (operation?.clientOpId)', '''  const reset = useCallback(() => {
    const current = getActiveTxOperation({ kind, vaultId }) ?? operation;
    // Dismissal must not remove the only refresh-safe reference while a
    // submission is pending, even when it belongs to a prior hook instance.
    if (lockRef.current || current?.state === 'submitted' || current?.state === 'confirming') return;
    if (operation?.clientOpId)''')
s=replace(s,'  }, [operation]);','  }, [kind, vaultId, operation]);')
(S/HOOK).write_bytes(s.encode())
(S/STATUS).write_bytes(replace(original[STATUS],'        {onDismiss && (',"        {onDismiss && state !== 'submitted' && state !== 'confirming' && (").encode())
for p,verb in [(DEPOSIT,'Deposited'),(WITHDRAW,'Withdrew')]:
 s=replace(original[p],'      await run(value, async () => {','      const completed = await run(value, async () => {')
 s=replace(s,'      });\n      setMessage(`'+verb,'      });\n      if (completed?.state !== \'confirmed\') return;\n      setMessage(`'+verb)
 (S/p).write_bytes(s.encode())
after=execute('after')
report={'base':BASE,'node':subprocess.check_output(['node','--version'],text=True).strip(),'before':before,'after':after,'before_blobs':PINS,'after_blobs':{p:blob((S/p).read_bytes()) for p in [*PINS,*TESTS]}}
(O/'report.json').write_text(json.dumps(report,indent=2)+'\n')
for p in [*PINS,*TESTS]: shutil.copyfile(S/p,O/('after-'+pathlib.Path(p).name))
(O/'source.patch').write_bytes(subprocess.check_output(['git','diff','--',*PINS],cwd=S))
if after['exit_code'] or after['failed'] or after['pending']: raise RuntimeError('focused candidate checks failed or skipped')
if set(git('diff','--name-only').splitlines())!=set(PINS): raise RuntimeError('unexpected tracked changes')
git('add','--',*PINS,*TESTS)
git('-c','user.name=woahwhattheheck','-c','user.email=293286387+woahwhattheheck@users.noreply.github.com','commit','-m','fix: preserve pending transaction recovery and ignore duplicate success [skip ci]')
report['candidate_commit']=git('rev-parse','HEAD');report['candidate_tree']=git('rev-parse','HEAD^{tree}')
(O/'candidate.txt').write_text(report['candidate_commit']+'\n');(O/'report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
