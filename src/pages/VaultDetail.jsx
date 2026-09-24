import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useVault } from '../hooks/useVault.js';
import StatCard from '../components/StatCard';
import Tabs from '../components/Tabs';
import DepositForm from '../components/DepositForm';
import WithdrawForm from '../components/WithdrawForm';
import Loader from '../components/Loader';
import ErrorMessage from '../components/ErrorMessage';
import ErrorBoundary from '../components/ErrorBoundary';
import LastUpdated from '../components/LastUpdated';
import { formatUsd, formatPercent, formatAmount } from '../utils/format.js';
import { sharePrice } from '../utils/shares.js';
import { getAssetByCode } from '../constants/assets.js';

const TABS = [
  { id: 'deposit', label: 'Deposit' },
  { id: 'withdraw', label: 'Withdraw' },
];

/**
 * Vault detail page: stats plus deposit/withdraw forms in a tab switcher.
 */
export default function VaultDetail() {
  const { id } = useParams();
  const { vault, loading, error, correlationId, retryable, lastUpdated, reload } = useVault(id);
  const [tab, setTab] = useState('deposit');

  if (loading) return <Loader label="Loading vault…" />;
  if (error) {
    return (
      <ErrorMessage
        message={error}
        onRetry={reload}
        correlationId={correlationId}
        retryable={retryable}
      />
    );
  }
  if (!vault) return <ErrorMessage message="Vault not found" />;

  const asset = getAssetByCode(vault.asset);
  const price = sharePrice(vault.totalAssets, vault.totalShares);

  return (
    <div className="vault-detail">
      <Link to="/dashboard" className="back-link">
        ← Back to dashboard
      </Link>

      <header className="vault-header">
        <span className="vault-detail-icon">{asset.icon}</span>
        <div>
          <h1 className="page-title">{vault.name}</h1>
          <p className="muted">{vault.strategy}</p>
          <LastUpdated timestamp={lastUpdated} />
        </div>
      </header>

      <div className="stat-grid">
        <StatCard label="APY" value={formatPercent(vault.apy)} icon="📈" />
        <StatCard label="TVL" value={formatUsd(vault.tvl)} icon="🏦" />
        <StatCard
          label="Total Shares"
          value={formatAmount(vault.totalShares, 0)}
          icon="🧾"
        />
        <StatCard
          label="Share Price"
          value={formatAmount(price, 4)}
          hint={`per share in ${vault.asset}`}
          icon="🪙"
        />
      </div>

      <div className="vault-actions">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
        <ErrorBoundary
          level="feature"
          feature={tab === 'deposit' ? 'deposit-form' : 'withdraw-form'}
          resetKeys={[tab, vault.id]}
        >
          {tab === 'deposit' ? (
            <DepositForm vault={vault} onSuccess={reload} />
          ) : (
            <WithdrawForm vault={vault} onSuccess={reload} />
          )}
        </ErrorBoundary>
      </div>
    </div>
  );
}
