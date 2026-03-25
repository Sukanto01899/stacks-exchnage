import { useEffect, useMemo, useState } from "react";
import type { PoolSnapshot, PoolState } from "../type";
import { isFiniteNumber } from "../lib/number";

type UsePoolHistoryParams = {
  poolHistoryKey: string;
  pool: PoolState;
  currentPrice: number;
  snapshotIntervalMs: number;
  retentionMs: number;
};

const isSnapshotLike = (value: unknown): value is PoolSnapshot => {
  if (!value || typeof value !== "object") return false;
  const maybe = value as Partial<PoolSnapshot>;
  return (
    typeof maybe.ts === "number" &&
    typeof maybe.reserveX === "number" &&
    typeof maybe.reserveY === "number" &&
    typeof maybe.priceYX === "number"
  );
};

export const usePoolHistory = ({
  poolHistoryKey,
  pool,
  currentPrice,
  snapshotIntervalMs,
  retentionMs,
}: UsePoolHistoryParams) => {
  const [poolHistory, setPoolHistory] = useState<PoolSnapshot[]>([]);

  const clearPoolHistory = () => {
    setPoolHistory([]);
    try {
      localStorage.removeItem(poolHistoryKey);
    } catch (error) {
      console.warn("Pool history clear failed", error);
    }
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(poolHistoryKey);
      if (!raw) {
        setPoolHistory([]);
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      const snapshots = Array.isArray(parsed)
        ? parsed.filter(isSnapshotLike)
        : [];
      setPoolHistory(snapshots);
    } catch (error) {
      console.warn("Pool history load failed", error);
      setPoolHistory([]);
    }
  }, [poolHistoryKey]);

  useEffect(() => {
    if (!isFiniteNumber(currentPrice) || currentPrice <= 0) return;
    if (!isFiniteNumber(pool.reserveX) || !isFiniteNumber(pool.reserveY)) return;
    if (pool.reserveX <= 0 || pool.reserveY <= 0) return;

    const now = Date.now();
    setPoolHistory((prev) => {
      const sorted = [...prev].sort((a, b) => a.ts - b.ts);
      const last = sorted[sorted.length - 1];
      if (
        last &&
        now - last.ts < snapshotIntervalMs &&
        Math.abs(last.reserveX - pool.reserveX) < 1e-9 &&
        Math.abs(last.reserveY - pool.reserveY) < 1e-9 &&
        Math.abs(last.priceYX - currentPrice) < 1e-9
      ) {
        return prev;
      }

      const nextItem: PoolSnapshot = {
        ts: now,
        reserveX: pool.reserveX,
        reserveY: pool.reserveY,
        priceYX: currentPrice,
        totalShares: pool.totalShares,
      };

      const next = [
        ...sorted.filter((item) => now - item.ts <= retentionMs),
        nextItem,
      ];

      try {
        localStorage.setItem(poolHistoryKey, JSON.stringify(next));
      } catch (error) {
        console.warn("Pool history save failed", error);
      }

      return next;
    });
  }, [
    currentPrice,
    pool.reserveX,
    pool.reserveY,
    pool.totalShares,
    poolHistoryKey,
    retentionMs,
    snapshotIntervalMs,
  ]);

  const sortedPoolHistory = useMemo(
    () => [...poolHistory].sort((a, b) => a.ts - b.ts),
    [poolHistory],
  );

  return { poolHistory: sortedPoolHistory, clearPoolHistory };
};
