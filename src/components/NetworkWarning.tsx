import { useState } from 'react';
import { useWallet } from '../hooks/useWallet.js';
import { useAppContext } from '../context/AppContext.jsx';
import { CONFIG } from '../constants/config';
import { getNetworkGuardState } from '../utils/networkGuard.js';
import Alert from './Alert';
import Button from './Button';

/**
 * Banner when the connected wallet network does not match the configured
 * deployment. Offers an explicit switch-network path; rejected switches leave
 * mutations blocked.
 */
export default function NetworkWarning() {
  const { walletNetwork, isConnected } = useWallet();
  const { switchWalletNetwork, switchingNetwork } = useAppContext() as {
    switchWalletNetwork?: (target?: string) => Promise<string>;
    switchingNetwork?: boolean;
  };
  const [switchError, setSwitchError] = useState<string | null>(null);

  const guard = getNetworkGuardState(walletNetwork, CONFIG.network);

  if (!isConnected || guard.matched) {
    return null;
  }

  const handleSwitch = async () => {
    setSwitchError(null);
    try {
      if (switchWalletNetwork) {
        await switchWalletNetwork(CONFIG.network);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error && /reject|denied|cancel/i.test(err.message)
          ? 'Network switch was rejected. Mutations stay blocked until the wallet matches the app network.'
          : err instanceof Error
            ? err.message
            : 'Failed to switch network';
      setSwitchError(message);
    }
  };

  return (
    <div className="network-warning" role="alert" aria-live="assertive">
      <Alert variant="warning" title="Wrong Network">
        <p>
          Your wallet is on <strong>{guard.connectedLabel || walletNetwork || 'Unknown'}</strong>, but
          this app expects <strong>{guard.expectedLabel}</strong>. Deposit and withdrawal
          actions are blocked until the networks match.
        </p>
        {guard.unsupported && (
          <p className="muted">Connected network is not supported by this deployment.</p>
        )}
        {switchError && <p className="field-error">{switchError}</p>}
        <Button
          type="button"
          onClick={handleSwitch}
          loading={Boolean(switchingNetwork)}
          disabled={Boolean(switchingNetwork)}
        >
          Switch wallet to {guard.expectedLabel}
        </Button>
      </Alert>
    </div>
  );
}
