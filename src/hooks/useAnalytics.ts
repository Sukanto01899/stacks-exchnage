import { useEffect, useMemo, useState } from "react";
import type { ActivityItem, PoolState, PortfolioSnapshot } from "../type";
import { clamp, isFiniteNumber } from "../lib/number";

type PortfolioTotals = {
  totalX: number;
  totalY: number;
  valueInX: number;
  valueInY: number;
};

type UseAnalyticsParams = {
  stacksAddress: string | null;
  portfolioHistoryKey: string;
  portfolioTotals: PortfolioTotals;
  currentPrice: number;
  pool: PoolState;
  activityItems: ActivityItem[];
  dayMs: number;
  snapshotIntervalMs: number;
};

const buildLinePath = (
  values: number[],
  width: number,
  height: number,
  padding = 10,
) => {
  const cleanValues = values.filter((value) => isFiniteNumber(value));
  if (
    cleanValues.length === 0 ||
    !isFiniteNumber(width) ||
    !isFiniteNumber(height) ||
    !isFiniteNumber(padding)
  ) {
    return "";
  }
  const min = Math.min(...cleanValues);
  const max = Math.max(...cleanValues);
  const range = max - min || 1;
  return cleanValues
    .map((value, index) => {
      const x =
        cleanValues.length === 1
          ? width / 2
          : padding +
            (index / (cleanValues.length - 1)) * (width - padding * 2);
      const y =
        height - padding - ((value - min) / range) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
};

export const useAnalytics = ({
  stacksAddress,
  portfolioHistoryKey,
  portfolioTotals,
  currentPrice,
  pool,
  activityItems,
  dayMs,
  snapshotIntervalMs,
}: UseAnalyticsParams) => {
  const [portfolioHistory, setPortfolioHistory] = useState<PortfolioSnapshot[]>(
    [],
  );

  const clearPortfolioHistory = () => {
    setPortfolioHistory([]);
    try {
      localStorage.removeItem(portfolioHistoryKey);
    } catch (error) {
      console.warn("Portfolio history clear failed", error);
    }
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(portfolioHistoryKey);
      if (!raw) {
        setPortfolioHistory([]);
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      const snapshots = Array.isArray(parsed)
        ? parsed.filter(
            (item): item is PortfolioSnapshot =>
              !!item &&
              typeof item === "object" &&
              typeof (item as PortfolioSnapshot).ts === "number" &&
              typeof (item as PortfolioSnapshot).totalX === "number" &&
              typeof (item as PortfolioSnapshot).totalY === "number" &&
              typeof (item as PortfolioSnapshot).priceYX === "number",
          )
        : [];
      setPortfolioHistory(snapshots);
    } catch (error) {
      console.warn("Portfolio history load failed", error);
      setPortfolioHistory([]);
    }
  }, [portfolioHistoryKey]);

  useEffect(() => {
    if (!stacksAddress || currentPrice <= 0) return;
    const now = Date.now();
    setPortfolioHistory((prev) => {
      const sorted = [...prev].sort((a, b) => a.ts - b.ts);
      const last = sorted[sorted.length - 1];
      if (
        last &&
        now - last.ts < snapshotIntervalMs &&
        Math.abs(last.totalX - portfolioTotals.totalX) < 1e-6 &&
        Math.abs(last.totalY - portfolioTotals.totalY) < 1e-6
      ) {
        return prev;
      }
      const next = [
        ...sorted.filter((item) => now - item.ts <= dayMs * 7),
        {
          ts: now,
          totalX: portfolioTotals.totalX,
          totalY: portfolioTotals.totalY,
          priceYX: currentPrice,
          reserveX: pool.reserveX,
          reserveY: pool.reserveY,
        },
      ];
      try {
        localStorage.setItem(portfolioHistoryKey, JSON.stringify(next));
      } catch (error) {
        console.warn("Portfolio history save failed", error);
      }
      return next;
    });
  }, [
    currentPrice,
    dayMs,
    pool.reserveX,
    pool.reserveY,
    portfolioHistoryKey,
    portfolioTotals.totalX,
    portfolioTotals.totalY,
    snapshotIntervalMs,
    stacksAddress,
  ]);

  const portfolioMetrics = useMemo(() => {
    const cutoff = Date.now() - dayMs;
    const baseline = [...portfolioHistory]
      .sort((a, b) => a.ts - b.ts)
      .reverse()
      .find((item) => item.ts <= cutoff);

    const pnl24X =
      baseline && baseline.totalX > 0
        ? ((portfolioTotals.totalX - baseline.totalX) / baseline.totalX) * 100
        : null;
    const pnl24Y =
      baseline && baseline.totalY > 0
        ? ((portfolioTotals.totalY - baseline.totalY) / baseline.totalY) * 100
        : null;
    const ilPercent =
      baseline && baseline.priceYX > 0 && currentPrice > 0
        ? ((2 * Math.sqrt(currentPrice / baseline.priceYX)) /
            (1 + currentPrice / baseline.priceYX) -
            1) *
          100
        : null;

    return {
      pnl24X,
      pnl24Y,
      ilPercent,
      has24h: Boolean(baseline),
    };
  }, [
    currentPrice,
    dayMs,
    portfolioHistory,
    portfolioTotals.totalX,
    portfolioTotals.totalY,
  ]);

  const analytics = useMemo(() => {
    const now = Date.now();
    const sorted = [...portfolioHistory].sort((a, b) => a.ts - b.ts);
    const chartPoints = sorted.slice(-28);
    const values = chartPoints
      .map((item) => item.priceYX)
      .filter((v) => isFiniteNumber(v) && v > 0);
    const chartWidth = 320;
    const chartHeight = 140;
    const pricePath = buildLinePath(values, chartWidth, chartHeight, 12);
    const minPrice = values.length ? Math.min(...values) : 0;
    const maxPrice = values.length ? Math.max(...values) : 0;
    const latest = sorted[sorted.length - 1] || null;
    const baseline24 =
      [...sorted].reverse().find((item) => item.ts <= now - dayMs) || null;
    const priceChange24 =
      baseline24 && baseline24.priceYX > 0 && currentPrice > 0
        ? ((currentPrice - baseline24.priceYX) / baseline24.priceYX) * 100
        : null;
    const reserveXChange24 =
      baseline24 &&
      typeof baseline24.reserveX === "number" &&
      baseline24.reserveX > 0
        ? ((pool.reserveX - baseline24.reserveX) / baseline24.reserveX) * 100
        : null;
    const reserveYChange24 =
      baseline24 &&
      typeof baseline24.reserveY === "number" &&
      baseline24.reserveY > 0
        ? ((pool.reserveY - baseline24.reserveY) / baseline24.reserveY) * 100
        : null;
    const tvlX =
      currentPrice > 0 ? pool.reserveX + pool.reserveY / currentPrice : 0;
    const tvlY =
      currentPrice > 0 ? pool.reserveY + pool.reserveX * currentPrice : 0;
    const swaps24h = activityItems.filter(
      (item) =>
        item.kind === "swap" &&
        item.status === "confirmed" &&
        now - item.ts <= dayMs,
    );
    const liquidity24h = activityItems.filter(
      (item) =>
        (item.kind === "add-liquidity" || item.kind === "remove-liquidity") &&
        now - item.ts <= dayMs,
    );
    const chartStart = chartPoints[0]?.ts ?? now;
    const chartEnd = chartPoints[chartPoints.length - 1]?.ts ?? now;
    const span = Math.max(chartEnd - chartStart, 1);
    const swapMarkers = activityItems
      .filter(
        (item) =>
          item.kind === "swap" &&
          item.status === "confirmed" &&
          item.ts >= chartStart &&
          item.ts <= chartEnd,
      )
      .slice(-8)
      .map((item) => ({
        ...item,
        x: clamp(
          12 + ((item.ts - chartStart) / span) * (chartWidth - 24),
          12,
          308,
        ),
      }))
      .filter((item) => isFiniteNumber(item.x));

    return {
      baseline24,
      chartPoints,
      chartWidth,
      chartHeight,
      liquidity24h: liquidity24h.length,
      latest,
      maxPrice,
      minPrice,
      priceChange24,
      pricePath,
      swapMarkers,
      swaps24h: swaps24h.length,
      tvlX,
      tvlY,
      reserveXChange24,
      reserveYChange24,
    };
  }, [activityItems, currentPrice, dayMs, pool, portfolioHistory]);

  return {
    analytics,
    portfolioMetrics,
    portfolioHistory,
    clearPortfolioHistory,
  };
};
