import { useCallback } from 'react';
import SessionTimeoutModal from './SessionTimeoutModal';
import { useIdleTimer } from '../hooks/useIdleTimer.js';
import { useAppContext } from '../context/AppContext';

/**
 * Watches for user inactivity while an authenticated session is active.
 * Shows a countdown warning before auto-expiring the session, which clears
 * protected client state and surfaces the re-authentication path.
 */
export default function IdleGuard() {
  const { isConnected, expireSession, renewSession } = useAppContext() as {
    isConnected: boolean;
    expireSession: (opts?: { broadcast?: boolean; reason?: string }) => Promise<void>;
    renewSession: () => boolean;
  };

  const onIdle = useCallback(() => {
    void expireSession({ broadcast: true, reason: 'expiry' });
  }, [expireSession]);

  const { remainingTime, isWarning, resetTimer } = useIdleTimer({
    enabled: isConnected,
    onIdle,
  }) as {
    remainingTime: number;
    isWarning: boolean;
    resetTimer: () => void;
  };

  const handleStay = useCallback(() => {
    renewSession();
    resetTimer();
  }, [renewSession, resetTimer]);

  const remainingSeconds = Math.ceil(remainingTime / 1000);

  return (
    <SessionTimeoutModal
      open={isWarning && isConnected}
      remainingSeconds={remainingSeconds}
      onStay={handleStay}
    />
  );
}
