import { useWallet } from '../hooks/useWallet.js';
import { useClipboard } from '../hooks/useClipboard.js';
import { shortenAddress } from '../utils/format.js';
import Button from './Button';

/**
 * Connect/disconnect control for the mock Stellar wallet. Shows the
 * shortened address once connected; clicking it copies the full address.
 */
export default function WalletButton() {
  const { isConnected, address, connecting, connect, disconnect } = useWallet();
  const { copied, copy } = useClipboard();

  if (isConnected) {
    return (
      <div className="wallet-button">
        <button
          type="button"
          className="wallet-address"
          title={copied ? 'Copied!' : `Copy ${address}`}
          aria-label={copied ? 'Copied!' : `Copy ${address}`}
          onClick={() => copy(address ?? '')}
        >
          {copied ? 'Copied!' : shortenAddress(address ?? '')}
        </button>
        <Button variant="ghost" onClick={disconnect}>
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <Button onClick={connect} loading={connecting}>
      Connect Wallet
    </Button>
  );
}
