import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useVaults } from '../hooks/useVaults.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import Loader from '../components/Loader';
import ErrorMessage from '../components/ErrorMessage';
import { formatUsd, formatPercent, formatAmount } from '../utils/format.js';
import { sharePrice } from '../utils/shares.js';
import { getAssetByCode } from '../constants/assets.js';

const MAX_COMPARE = 3;
const MIN_COMPARE = 2;

/**
 * Side-by-side vault comparison view.
 * Select 2–3 vaults and compare APY, TVL, risk, strategy and share metrics.
 */
export default function Compare() {
  useDocumentTitle('Compare Vaults');
  const { vaults, loading, error, correlationId, retryable, reload } = useVaults();
  const [selected, setSelected] = useState([]);

  // Derived: only the vaults currently selected
  const selectedVaults = useMemo(
    () => vaults.filter((v) => selected.includes(v.id)),
    [vaults, selected],
  );

  // Toggle a vault in/out of the selection
  const toggleVault = (id) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((v) => v !== id);
      if (prev.length >= MAX_COMPARE) return prev; // don't exceed max
      return [...prev, id];
    });
  };

  // Clear all selections
  const clearAll = () => setSelected([]);

  // Select all vaults (up to max)
  const selectAll = () => setSelected(vaults.slice(0, MAX_COMPARE).map((v) => v.id));

  if (loading) return <Loader label="Loading vaults…" />;
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

  // Build comparison rows
  const rows = buildComparisonRows(selectedVaults);

  return (
    <div className="compare">
      <Link to="/dashboard" className="back-link">
        ← Back to dashboard
      </Link>

      <header className="compare-header">
        <h1 className="page-title">Compare Vaults</h1>
        <p className="muted">
          Select {MIN_COMPARE}–{MAX_COMPARE} vaults to compare metrics side by
          side.
        </p>
      </header>

      {/* Vault selector */}
      <div className="compare-selector">
        <div className="compare-chips">
          {vaults.map((vault) => {
            const asset = getAssetByCode(vault.asset);
            const isSelected = selected.includes(vault.id);
            const atMax = selected.length >= MAX_COMPARE && !isSelected;

            return (
              <button
                key={vault.id}
                type="button"
                className={`compare-chip ${isSelected ? 'compare-chip-active' : ''}`}
                onClick={() => toggleVault(vault.id)}
                disabled={atMax}
                title={
                  atMax
                    ? `Maximum ${MAX_COMPARE} vaults`
                    : isSelected
                      ? 'Remove from comparison'
                      : 'Add to comparison'
                }
              >
                <span className="compare-chip-icon">{asset.icon}</span>
                <span className="compare-chip-name">{vault.name}</span>
                <span className="compare-chip-asset">{vault.asset}</span>
                {isSelected && (
                  <span className="compare-chip-check" aria-hidden="true">
                    ✕
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="compare-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={selectAll}
            disabled={selected.length >= MAX_COMPARE}
          >
            Select all
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={clearAll}
            disabled={selected.length === 0}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Comparison table — only shown when enough vaults are selected */}
      {selectedVaults.length >= MIN_COMPARE ? (
        <div className="compare-table-wrapper">
          <table className="compare-table">
            <thead>
              <tr>
                <th className="compare-table-label-col">Metric</th>
                {selectedVaults.map((vault, idx) => {
                  const asset = getAssetByCode(vault.asset);
                  return (
                    <th key={vault.id} className="compare-table-vault-col">
                      <div className="compare-col-head">
                        <span className="compare-col-icon">{asset.icon}</span>
                        <span className="compare-col-name">{vault.name}</span>
                        <span
                          className={`risk-badge risk-${vault.risk.toLowerCase()}`}
                        >
                          {vault.risk}
                        </span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="compare-table-label-col muted">
                    {row.label}
                  </th>
                  {row.values.map((cell, idx) => (
                    <td
                      key={`${row.label}-${idx}`}
                      className={`compare-table-vault-col ${cell.highlight || ''}`}
                    >
                      <span className={cell.className || ''}>
                        {cell.value}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <span className="empty-icon">🔍</span>
          <p className="empty-message">
            {selected.length === 0
              ? `Select at least ${MIN_COMPARE} vaults to start comparing.`
              : `Add at least ${MIN_COMPARE - selected.length} more vault${MIN_COMPARE - selected.length > 1 ? 's' : ''} to see a comparison.`}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Find the index of the vault with the best (max or min) value for a metric.
 * Returns null when all values are tied or only one vault exists.
 */
function findExtremeIndex(vaultsArr, metric, higherIsBetter) {
  if (vaultsArr.length < 2) return null;
  let best = 0;
  let allSame = true;
  for (let i = 1; i < vaultsArr.length; i++) {
    const a = vaultsArr[i][metric];
    const b = vaultsArr[best][metric];
    if (a !== b) allSame = false;
    if (higherIsBetter ? a > b : a < b) best = i;
  }
  return allSame ? null : best;
}

/**
 * Build an array of comparison rows from the list of selected vaults.
 * Each row has a label + an array of { value, className, highlight } per vault.
 */
function buildComparisonRows(vaultsArr) {
  if (vaultsArr.length === 0) return [];

  // Pre-compute per-vault derived values
  const derived = vaultsArr.map((v) => {
    const price = sharePrice(v.totalAssets, v.totalShares);
    const asset = getAssetByCode(v.asset);
    return { ...v, price, asset };
  });

  // Helper to find best index across derived array
  const bestIdx = (metric, higher = true) =>
    derived.length > 1
      ? findExtremeIndex(derived, metric, higher)
      : null;

  // Define the row builders
  const rowDefs = [
    {
      label: 'Asset',
      getValue: (v) => ({ value: v.asset.code, className: '' }),
    },
    {
      label: 'APY',
      getValue: (v, idx) => ({
        value: formatPercent(v.apy),
        className: 'apy',
        highlight: idx === bestIdx('apy', true) ? 'compare-best' : null,
      }),
    },
    {
      label: 'TVL',
      getValue: (v, idx) => ({
        value: formatUsd(v.tvl),
        className: '',
        highlight: idx === bestIdx('tvl', true) ? 'compare-best' : null,
      }),
    },
    {
      label: 'Total Assets',
      getValue: (v) => ({ value: formatAmount(v.totalAssets, 0), className: '' }),
    },
    {
      label: 'Total Shares',
      getValue: (v) => ({ value: formatAmount(v.totalShares, 0), className: '' }),
    },
    {
      label: 'Share Price',
      getValue: (v) => ({
        value: formatAmount(v.price, 4),
        className: '',
      }),
    },
    {
      label: 'Risk Level',
      getValue: (v) => ({
        value: v.risk,
        className: `risk-badge risk-${v.risk.toLowerCase()} compare-risk`,
      }),
    },
    {
      label: 'Strategy',
      getValue: (v) => ({ value: v.strategy, className: 'compare-strategy' }),
    },
  ];

  return rowDefs.map((def) => ({
    label: def.label,
    values: derived.map((v, idx) => def.getValue(v, idx)),
  }));
}
