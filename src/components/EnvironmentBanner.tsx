import { CONFIG } from '../constants/config';

/**
 * Environment banner that displays when the app is running on testnet.
 * This helps users distinguish between testnet and mainnet environments.
 */
export default function EnvironmentBanner({ network = CONFIG.network }: { network?: string }) {
  if (network !== 'testnet') {
    return null;
  }

  return (
    <div className="environment-banner" role="banner" aria-label="Testnet environment">
      <span className="environment-banner-text">⚠️ Testnet Environment</span>
    </div>
  );
}
