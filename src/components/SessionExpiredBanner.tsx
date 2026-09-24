import Button from './Button';
import { useAppContext } from '../context/AppContext';

/**
 * Explicit re-authentication path shown after session expiry or logout from
 * another tab. Safe drafts (amount inputs) are preserved; protected balances
 * and positions are already cleared by AppContext.
 */
export default function SessionExpiredBanner() {
  const { sessionExpired, isConnected, reauthenticate, connecting } = useAppContext() as {
    sessionExpired: boolean;
    isConnected: boolean;
    reauthenticate: () => Promise<unknown>;
    connecting: boolean;
  };

  if (!sessionExpired || isConnected) return null;

  return (
    <div
      className="session-expired-banner"
      role="status"
      aria-live="polite"
      data-testid="session-expired-banner"
    >
      <div className="session-expired-copy">
        <strong>Session expired</strong>
        <p className="muted">
          Your authorization ended for security. Sensitive balances and positions
          were cleared. Safe form drafts were kept — reconnect to continue.
        </p>
      </div>
      <Button onClick={() => void reauthenticate()} loading={connecting}>
        Re-authenticate
      </Button>
    </div>
  );
}
