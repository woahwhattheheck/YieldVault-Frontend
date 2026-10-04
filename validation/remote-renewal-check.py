import json, os, subprocess
from pathlib import Path
BASE = '2b5530f3a46276bceb08fcf4f5e1ab430630fe55'
SOURCE = Path('src/context/AppContext.jsx')
TEST = Path('test/integration/sessionTimeout.test.jsx')
OUT = Path(os.environ['EVIDENCE_DIR'])
OUT.mkdir(parents=True, exist_ok=True)
def git(*args):
    return subprocess.check_output(['git', *args], text=True).strip()
assert git('rev-parse', 'HEAD') == BASE
assert git('hash-object', str(SOURCE)) == '9cc020bc8b2b58cc9cc95977286eb789bd954db7'
assert git('hash-object', str(TEST)) == 'e2ed83805d47c01304f29926621d71ad726bb508'
source = SOURCE.read_text()
regression = r'''

  describe('remote renewal never authenticates an expired tab', () => {
    async function deliverRenewal(transport, remoteSession) {
      if (transport === 'storage') {
        window.dispatchEvent(new StorageEvent('storage', {
          key: SESSION_STORAGE_KEY,
          newValue: JSON.stringify(remoteSession),
        }));
      } else {
        const channel = new BroadcastChannel('yieldvault:session');
        channel.postMessage({ type: 'renewed', session: remoteSession, at: Date.now() });
        channel.close();
      }
      // Let the maintained BroadcastChannel fixture deliver its message.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    it.each(['storage', 'channel'])('rejects %s renewal after wall-clock expiry', async (transport) => {
      const { result } = renderHook(() => useAppContext(), { wrapper });
      await act(async () => { await result.current.connect(); });
      const local = result.current.session;
      const renewed = { ...local, version: local.version + 1, expiresAt: local.expiresAt + 60000 };
      cachePositions([{ vaultId: 'v1', value: 123 }]);
      writeSafeDraft(DEPOSIT_DRAFT_KEY, '42');
      // A suspended tab can receive the renewal before its queued expiry timer.
      vi.spyOn(Date, 'now').mockReturnValue(local.expiresAt);
      await act(async () => { await deliverRenewal(transport, renewed); });
      let authorized;
      await act(async () => { authorized = await result.current.ensureSessionActive(); });
      console.log('REMOTE_RENEWAL_OBSERVATION', JSON.stringify({
        transport, authorized: authorized !== null,
        expiresAt: result.current.session?.expiresAt ?? null,
        mutationsAllowed: result.current.mutationsAllowed,
      }));
      expect(authorized).toBeNull();
      expect(result.current.sessionExpired).toBe(true);
      expect(result.current.mutationsAllowed).toBe(false);
      expect(result.current.session).toBeNull();
      expect(result.current.balances).toEqual({});
      expect(sessionStorage.getItem(POSITIONS_CACHE_KEY)).toBeNull();
      expect(readSafeDraft(DEPOSIT_DRAFT_KEY)).toBe('42');
      expect(walletService.connect).toHaveBeenCalledTimes(1);
    });

    it.each(['storage', 'channel'])('keeps %s renewal for an active same-address session', async (transport) => {
      const { result } = renderHook(() => useAppContext(), { wrapper });
      await act(async () => { await result.current.connect(); });
      const local = result.current.session;
      const renewed = { ...local, version: local.version + 1, expiresAt: local.expiresAt + 60000 };
      await act(async () => { await deliverRenewal(transport, renewed); });
      expect(result.current.session).toEqual(renewed);
      expect(result.current.mutationsAllowed).toBe(true);
      expect(walletService.connect).toHaveBeenCalledTimes(1);
    });
  });
'''
parts = TEST.read_text().rsplit('\n});', 1)
assert len(parts) == 2 and not parts[1].strip()
TEST.write_text(parts[0] + regression + '\n});' + parts[1])
def execute(name, extra):
    command = ['node', 'node_modules/vitest/vitest.mjs', 'run', str(TEST), '--maxWorkers=1', '--reporter=json', '--outputFile=' + str(OUT / (name + '.json')), *extra]
    result = subprocess.run(command, text=True, capture_output=True, timeout=150)
    (OUT / (name + '.stdout')).write_text(result.stdout)
    (OUT / (name + '.stderr')).write_text(result.stderr)
    print(name, result.returncode, result.stdout, result.stderr)
    report = json.loads((OUT / (name + '.json')).read_text())
    return command, result.returncode, report
before_command, before_exit, before = execute('before', ['-t', 'remote renewal never authenticates an expired tab'])
assert before_exit == 1 and before['numFailedTests'] == 2 and before['numPassedTests'] == 2
old = '''          if (sessionRef.current?.address === remoteSession.address) {
            setSession(remoteSession);'''
new = '''          // Renewal is not authentication: a suspended tab may already
          // have expired even though its scheduled expiry callback is pending.
          if (sessionRef.current?.address === remoteSession.address &&
              !isSessionExpired(sessionRef.current)) {
            sessionRef.current = remoteSession;
            setSession(remoteSession);'''
assert source.count(old) == 1
SOURCE.write_text(source.replace(old, new, 1))
after_command, after_exit, after = execute('after', [])
assert after_exit == 0 and after['numFailedTests'] == 0 and after['numPassedTests'] >= 4
assert not git('diff', '--name-only', '--', 'package.json', 'package-lock.json')
(OUT / 'change.diff').write_text(subprocess.check_output(['git', 'diff', '--', str(SOURCE), str(TEST)], text=True))
subprocess.run(['git', 'add', str(SOURCE), str(TEST)], check=True)
subprocess.run(['git', 'commit', '-m', 'fix(auth): prevent remote renewal from reviving expired sessions [skip ci]'], check=True)
receipt = {
    'base': BASE, 'candidate': git('rev-parse', 'HEAD'),
    'source_blob': git('hash-object', str(SOURCE)), 'test_blob': git('hash-object', str(TEST)),
    'before': {'command': before_command, 'exit': before_exit, 'passed': before['numPassedTests'], 'failed': before['numFailedTests']},
    'after': {'command': after_command, 'exit': after_exit, 'passed': after['numPassedTests'], 'failed': after['numFailedTests']},
    'node': subprocess.check_output(['node', '--version'], text=True).strip(),
    'run_url': os.environ['RUN_URL'],
    'limits': 'Actual React AppProvider and session helpers under the maintained wallet and BroadcastChannel test fixtures; wall-clock expiry advanced without firing its scheduled callback. No live wallet, browser/device, backend, broad suite or build.',
}
(OUT / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
(OUT / SOURCE.name).write_text(SOURCE.read_text())
(OUT / TEST.name).write_text(TEST.read_text())
print(json.dumps(receipt, indent=2))
subprocess.run(['git', 'push', 'origin', 'HEAD:refs/heads/validation/yv272-remote-renewal-rivet1004'], check=True)
