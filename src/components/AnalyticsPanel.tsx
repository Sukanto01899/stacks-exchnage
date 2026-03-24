import { useMemo, useState } from "react";
import type { ActivityItem, PoolSnapshot, PoolState } from "../type";
import { isFiniteNumber } from "../lib/number";

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
  pool: PoolState;
  poolShare: number;
  poolHistory: PoolSnapshot[];
  activityItems: ActivityItem[];
  tokenLabels: { x: string; y: string };
  formatNumber: (value: number) => string;
  formatSignedPercent: (value: number | null) => string;
  formatCompactNumber: (value: number) => string;
};

export default function AnalyticsPanel(props: AnalyticsPanelProps) {
  const {
    analytics,
    portfolioMetrics,
    currentPrice,
    pool,
    poolShare,
    poolHistory,
    activityItems,
    tokenLabels,
    formatNumber,
    formatSignedPercent,
    formatCompactNumber,
  } = props;

  const [lpRange, setLpRange] = useState<
    "1h" | "24h" | "7d" | "30d" | "90d" | "all"
  >("24h");

  const lpRangeMs = useMemo(() => {
    switch (lpRange) {
      case "1h":
        return 60 * 60 * 1000;
      case "24h":
        return 24 * 60 * 60 * 1000;
      case "7d":
        return 7 * 24 * 60 * 60 * 1000;
      case "30d":
        return 30 * 24 * 60 * 60 * 1000;
      case "90d":
        return 90 * 24 * 60 * 60 * 1000;
      case "all":
      default:
        return null;
    }
  }, [lpRange]);

  const lpBaseline = useMemo(() => {
    if (poolHistory.length === 0) return null;
    const sorted = [...poolHistory].sort((a, b) => a.ts - b.ts);
    if (!lpRangeMs) return sorted[0] || null;
    const cutoff = Date.now() - lpRangeMs;
    return [...sorted].reverse().find((snap) => snap.ts <= cutoff) || null;
  }, [lpRangeMs, poolHistory]);

  const lpMetrics = useMemo(() => {
    const share = Math.max(0, Math.min(1, poolShare));
    if (!lpBaseline) return { ok: false as const, reason: "No baseline yet." };
    if (!isFiniteNumber(currentPrice || 0) || (currentPrice || 0) <= 0) {
      return { ok: false as const, reason: "Pool price unavailable." };
    }
    if (share <= 0) {
      return { ok: false as const, reason: "No LP shares detected." };
    }

    const priceNow = currentPrice || 0;
    const priceStart = lpBaseline.priceYX;
    if (!isFiniteNumber(priceStart) || priceStart <= 0) {
      return { ok: false as const, reason: "Baseline price unavailable." };
    }

    const xStart = lpBaseline.reserveX * share;
    const yStart = lpBaseline.reserveY * share;
    const xNow = pool.reserveX * share;
    const yNow = pool.reserveY * share;

    const valueInX = (x: number, y: number, priceYX: number) =>
      priceYX > 0 ? x + y / priceYX : x;

    const startValueX = valueInX(xStart, yStart, priceStart);
    const hodlNowValueX = valueInX(xStart, yStart, priceNow);
    const lpNowValueX = valueInX(xNow, yNow, priceNow);

    const feeWindowStart = lpBaseline.ts;
    const now = Date.now();
    let feeTotalX = 0;
    let feeTotalY = 0;
    for (const item of activityItems) {
      if (item.kind !== "swap" || item.status !== "confirmed") continue;
      if (item.ts < feeWindowStart || item.ts > now) continue;
      const fee = item.meta?.fee;
      const feeSymbol = item.meta?.feeSymbol;
      if (!isFiniteNumber(fee || 0) || (fee || 0) <= 0) continue;
      if (feeSymbol === "X") feeTotalX += fee || 0;
      if (feeSymbol === "Y") feeTotalY += fee || 0;
    }

    const earnedX = feeTotalX * share;
    const earnedY = feeTotalY * share;
    const feesValueNowX = valueInX(earnedX, earnedY, priceNow);
    const netNowValueX = lpNowValueX + feesValueNowX;

    const ilPct =
      hodlNowValueX > 0 ? ((lpNowValueX - hodlNowValueX) / hodlNowValueX) * 100 : null;
    const netVsHodlPct =
      hodlNowValueX > 0
        ? ((netNowValueX - hodlNowValueX) / hodlNowValueX) * 100
        : null;

    const priceChangePct =
      priceStart > 0 ? ((priceNow - priceStart) / priceStart) * 100 : null;

    const rangeDays = Math.max(1 / 24, (now - lpBaseline.ts) / (24 * 60 * 60 * 1000));
    const feeAprPct =
      startValueX > 0 ? (feesValueNowX / startValueX) * (365 / rangeDays) * 100 : null;
    const annualizedReturnPct =
      startValueX > 0
        ? ((netNowValueX - startValueX) / startValueX) * (365 / rangeDays) * 100
        : null;

    return {
      ok: true as const,
      share,
      baselineTs: lpBaseline.ts,
      priceStart,
      priceNow,
      priceChangePct,
      xStart,
      yStart,
      xNow,
      yNow,
      startValueX,
      hodlNowValueX,
      lpNowValueX,
      earnedX,
      earnedY,
      feesValueNowX,
      ilPct,
      netVsHodlPct,
      feeAprPct,
      annualizedReturnPct,
    };
  }, [activityItems, currentPrice, lpBaseline, pool.reserveX, pool.reserveY, poolShare]);

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

      <div className="analytics-chart-card">
        <div className="analytics-chart-head">
          <div>
            <p className="muted small">LP position PnL / IL</p>
            <strong>
              {lpBaseline
                ? `Baseline ${new Date(lpBaseline.ts).toLocaleString()}`
                : "Baseline not ready"}
            </strong>
          </div>
          <div className="analytics-range">
            <label className="muted small" htmlFor="lp-range-select">
              Range
            </label>
            <select
              id="lp-range-select"
              value={lpRange}
              onChange={(event) =>
                setLpRange(event.target.value as typeof lpRange)
              }
            >
              <option value="1h">1h</option>
              <option value="24h">24h</option>
              <option value="7d">7d</option>
              <option value="30d">30d</option>
              <option value="90d">90d</option>
              <option value="all">All</option>
            </select>
          </div>
        </div>

        {lpMetrics.ok ? (
          <>
            <div className="analytics-grid">
              <div className="analytics-stat">
                <p className="muted small">Pool share</p>
                <strong>{(lpMetrics.share * 100).toFixed(4)}%</strong>
                <p className="muted small">Assumes share unchanged in range</p>
              </div>
              <div className="analytics-stat">
                <p className="muted small">Price change</p>
                <strong>{formatSignedPercent(lpMetrics.priceChangePct)}</strong>
                <p className="muted small">
                  1 X: {formatNumber(lpMetrics.priceStart)} →{" "}
                  {formatNumber(lpMetrics.priceNow)} Y
                </p>
              </div>
              <div className="analytics-stat">
                <p className="muted small">Impermanent loss</p>
                <strong>{formatSignedPercent(lpMetrics.ilPct)}</strong>
                <p className="muted small">LP vs HODL (fees excluded)</p>
              </div>
              <div className="analytics-stat">
                <p className="muted small">Net vs HODL</p>
                <strong>{formatSignedPercent(lpMetrics.netVsHodlPct)}</strong>
                <p className="muted small">Fees included (local estimate)</p>
              </div>
            </div>

            <div className="analytics-grid">
              <div className="analytics-stat">
                <p className="muted small">LP value now (X)</p>
                <strong>{formatCompactNumber(lpMetrics.lpNowValueX)} X</strong>
                <p className="muted small">Excludes fees</p>
              </div>
              <div className="analytics-stat">
                <p className="muted small">HODL value now (X)</p>
                <strong>{formatCompactNumber(lpMetrics.hodlNowValueX)} X</strong>
                <p className="muted small">Based on baseline reserves</p>
              </div>
              <div className="analytics-stat">
                <p className="muted small">Fees earned (est.)</p>
                <strong>
                  {formatNumber(lpMetrics.earnedX)} {tokenLabels.x} +{" "}
                  {formatNumber(lpMetrics.earnedY)} {tokenLabels.y}
                </strong>
                <p className="muted small">
                  ≈ {formatCompactNumber(lpMetrics.feesValueNowX)} X
                </p>
              </div>
              <div className="analytics-stat">
                <p className="muted small">Fee APR (est.)</p>
                <strong>{formatSignedPercent(lpMetrics.feeAprPct)}</strong>
                <p className="muted small">Annualized from range window</p>
              </div>
            </div>

            <div className="analytics-grid">
              <div className="analytics-stat">
                <p className="muted small">Annualized return (linear)</p>
                <strong>{formatSignedPercent(lpMetrics.annualizedReturnPct)}</strong>
                <p className="muted small">LP + fees vs baseline value</p>
              </div>
              <div className="analytics-stat">
                <p className="muted small">Baseline LP amounts</p>
                <strong>
                  {formatNumber(lpMetrics.xStart)} {tokenLabels.x}
                </strong>
                <p className="muted small">
                  {formatNumber(lpMetrics.yStart)} {tokenLabels.y}
                </p>
              </div>
              <div className="analytics-stat">
                <p className="muted small">Current LP amounts</p>
                <strong>
                  {formatNumber(lpMetrics.xNow)} {tokenLabels.x}
                </strong>
                <p className="muted small">
                  {formatNumber(lpMetrics.yNow)} {tokenLabels.y}
                </p>
              </div>
              <div className="analytics-stat">
                <p className="muted small">Notes</p>
                <strong>Local estimates</strong>
                <p className="muted small">
                  Fees use this device’s activity log; on-chain fee claims may differ.
                </p>
              </div>
            </div>
          </>
        ) : (
          <p className="muted small">{lpMetrics.reason}</p>
        )}
      </div>
    </section>
  );
}
