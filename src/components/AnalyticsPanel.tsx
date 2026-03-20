/* eslint-disable @typescript-eslint/no-explicit-any */
type AnalyticsPanelProps = {
  analytics: {
    tvlX: number;
    tvlY: number;
    priceChange24: number | null;
    reserveXChange24: number | null;
    reserveYChange24: number | null;
    swaps24h: number;
    liquidity24h: number;
    pricePath?: string;
    chartWidth: number;
    chartHeight: number;
    chartPoints: { ts: number }[];
    swapMarkers: { id: string; ts: number; x: number }[];
    minPrice: number;
    maxPrice: number;
    latest?: { ts: number } | null;
    baseline24?: { ts: number } | null;
  };
  portfolioMetrics: {
    pnl24X: number | null;
    pnl24Y: number | null;
    ilPercent: number | null;
    has24h: boolean;
  };
  currentPrice: number | null;
  formatNumber: (value: number) => string;
  formatSignedPercent: (value: number | null) => string;
  formatCompactNumber: (value: number) => string;
};

export default function AnalyticsPanel(props: AnalyticsPanelProps) {
  const {
    analytics,
    portfolioMetrics,
    currentPrice,
    formatNumber,
    formatSignedPercent,
    formatCompactNumber,
  } = props;

  return (
    <section className="analytics-panel">
      <div className="analytics-head">
        <div>
          <p className="eyebrow">Pool Analytics</p>
          <h3>Price, reserves, activity</h3>
        </div>
        <span className="chip ghost">
          {analytics.chartPoints.length > 1
            ? "Local 7d history"
            : "Collecting data"}
        </span>
      </div>

      <div className="analytics-grid">
        <div className="analytics-stat">
          <p className="muted small">Pool TVL</p>
          <strong>{formatCompactNumber(analytics.tvlY)} Y</strong>
          <p className="muted small">{formatCompactNumber(analytics.tvlX)} X</p>
        </div>
        <div className="analytics-stat">
          <p className="muted small">Price 24h</p>
          <strong>{formatSignedPercent(analytics.priceChange24)}</strong>
          <p className="muted small">
            1 X = {formatNumber(currentPrice || 0)} Y
          </p>
        </div>
        <div className="analytics-stat">
          <p className="muted small">Reserve drift</p>
          <strong>{formatSignedPercent(analytics.reserveXChange24)} X</strong>
          <p className="muted small">
            {formatSignedPercent(analytics.reserveYChange24)} Y
          </p>
        </div>
        <div className="analytics-stat">
          <p className="muted small">24h activity</p>
          <strong>{analytics.swaps24h} swaps</strong>
          <p className="muted small">{analytics.liquidity24h} LP actions</p>
        </div>
      </div>

      <div className="analytics-grid">
        <div className="analytics-stat">
          <p className="muted small">LP PnL 24h (X)</p>
          <strong>
            {portfolioMetrics.has24h
              ? formatSignedPercent(portfolioMetrics.pnl24X)
              : "No 24h baseline"}
          </strong>
          <p className="muted small">Your holdings vs yesterday</p>
        </div>
        <div className="analytics-stat">
          <p className="muted small">LP PnL 24h (Y)</p>
          <strong>
            {portfolioMetrics.has24h
              ? formatSignedPercent(portfolioMetrics.pnl24Y)
              : "No 24h baseline"}
          </strong>
          <p className="muted small">Your holdings vs yesterday</p>
        </div>
        <div className="analytics-stat">
          <p className="muted small">IL estimate 24h</p>
          <strong>
            {portfolioMetrics.has24h
              ? formatSignedPercent(portfolioMetrics.ilPercent)
              : "No 24h baseline"}
          </strong>
          <p className="muted small">Vs HODL over 24h</p>
        </div>
      </div>

      <div className="analytics-chart-card">
        <div className="analytics-chart-head">
          <div>
            <p className="muted small">X/Y price trend</p>
            <strong>
              {analytics.latest
                ? `Updated ${new Date(analytics.latest.ts).toLocaleString()}`
                : "No chart data yet"}
            </strong>
          </div>
          <div className="analytics-legend">
            <span className="legend-line">Price</span>
            <span className="legend-dot">Swap</span>
          </div>
        </div>
        {analytics.pricePath ? (
          <svg
            className="analytics-chart"
            viewBox={`0 0 ${analytics.chartWidth} ${analytics.chartHeight}`}
            role="img"
            aria-label="Pool price analytics chart"
          >
            <path className="analytics-line" d={analytics.pricePath} />
            {analytics.swapMarkers.map((marker) => (
              <circle
                key={marker.id}
                className="analytics-marker"
                cx={marker.x}
                cy={analytics.chartHeight - 18}
                r="4"
              >
                <title>{new Date(marker.ts).toLocaleString()}</title>
              </circle>
            ))}
          </svg>
        ) : (
          <p className="muted small">
            Connect a wallet and keep the app open while balances refresh to
            build the local chart.
          </p>
        )}
        <div className="analytics-scale">
          <span className="muted small">
            Low {formatNumber(analytics.minPrice)}
          </span>
          <span className="muted small">
            High {formatNumber(analytics.maxPrice)}
          </span>
        </div>
      </div>

      <div className="analytics-grid">
        <div className="analytics-stat">
          <p className="muted small">Latest baseline</p>
          <strong>
            {analytics.baseline24
              ? new Date(analytics.baseline24.ts).toLocaleString()
              : "No 24h point"}
          </strong>
          <p className="muted small">Used for change calculations</p>
        </div>
        <div className="analytics-stat">
          <p className="muted small">Confirmed swap markers</p>
          <strong>{analytics.swapMarkers.length}</strong>
          <p className="muted small">Shown on the visible chart window</p>
        </div>
      </div>
    </section>
  );
}
