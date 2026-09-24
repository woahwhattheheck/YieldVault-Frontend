import { useMemo, useState, useCallback } from "react";
import { useApyHistory } from "../hooks/useApyHistory.js";
import { useToggle } from "../hooks/useToggle.js";
import { buildApySeries } from "../utils/chartSeries.js";
import { formatPercent } from "../utils/format.js";
import LineChart from "./LineChart";
import ChartLegend from "./ChartLegend";
import Loader from "./Loader";
import ErrorMessage from "./ErrorMessage";

/**
 * APY-by-vault trend chart with a legend that toggles individual vaults'
 * series on and off, plus a toggle for faint axis gridlines.
 * @param {object} props
 * @param {Array} props.vaults
 */
export default function VaultApyChart({ vaults }) {
  const { history, loading, error, correlationId, retryable, reload } = useApyHistory(vaults);
  const [hiddenIds, setHiddenIds] = useState(() => new Set());
  const [showGrid, { toggle: toggleGrid }] = useToggle(true);

  const series = useMemo(
    () => buildApySeries(vaults, history),
    [vaults, history],
  );

  const toggleSeries = useCallback((id) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (loading) return <Loader label="Loading APY history…" />;
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

  return (
    <div className="chart-card">
      <div className="chart-toolbar">
        <button
          type="button"
          className="chart-grid-toggle"
          aria-pressed={showGrid}
          onClick={toggleGrid}
        >
          Gridlines {showGrid ? "on" : "off"}
        </button>
      </div>
      <LineChart
        series={series}
        hiddenIds={hiddenIds}
        formatY={formatPercent}
        showGrid={showGrid}
      />
      <ChartLegend
        series={series}
        hiddenIds={hiddenIds}
        onToggle={toggleSeries}
      />
    </div>
  );
}
