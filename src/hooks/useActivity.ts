import { useCallback, useEffect, useState } from "react";
import type { ActivityItem } from "../type";

type UseActivityParams = {
  activityKey: string;
  stacksApi: string;
  stacksAddress: string | null;
  syncBalances: (address: string, opts?: { silent?: boolean }) => Promise<void>;
  fetchPoolState: (address?: string | null) => Promise<number | null>;
  explainPoolError: (repr?: string) => string | null;
};

export const useActivity = ({
  activityKey,
  stacksApi,
  stacksAddress,
  syncBalances,
  fetchPoolState,
  explainPoolError,
}: UseActivityParams) => {
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(activityKey);
      if (!raw) {
        setActivityItems([]);
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      const items = Array.isArray(parsed)
        ? parsed.filter(
            (item): item is ActivityItem =>
              !!item &&
              typeof item === "object" &&
              typeof (item as ActivityItem).id === "string" &&
              typeof (item as ActivityItem).ts === "number" &&
              typeof (item as ActivityItem).kind === "string" &&
              typeof (item as ActivityItem).status === "string" &&
              typeof (item as ActivityItem).message === "string",
          )
        : [];
      setActivityItems(items);
    } catch (error) {
      console.warn("Activity history load failed", error);
      setActivityItems([]);
    }
  }, [activityKey]);

  const pushActivity = useCallback(
    (item: Omit<ActivityItem, "id" | "ts">) => {
      const nextItem: ActivityItem = {
        ...item,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ts: Date.now(),
      };
      setActivityItems((prev) => {
        const next = [nextItem, ...prev].slice(0, 30);
        try {
          localStorage.setItem(activityKey, JSON.stringify(next));
        } catch (error) {
          console.warn("Activity history save failed", error);
        }
        return next;
      });
    },
    [activityKey],
  );

  const patchActivityByTxid = useCallback(
    (
      txid: string,
      patch: Partial<Pick<ActivityItem, "status" | "message" | "detail">>,
    ) => {
      if (!txid) return;
      setActivityItems((prev) => {
        let changed = false;
        const next = prev.map((item) => {
          if (item.txid !== txid) return item;
          changed = true;
          return { ...item, ...patch };
        });
        if (!changed) return prev;
        try {
          localStorage.setItem(activityKey, JSON.stringify(next));
        } catch (error) {
          console.warn("Activity history save failed", error);
        }
        return next;
      });
    },
    [activityKey],
  );

  useEffect(() => {
    const pendingItems = activityItems.filter(
      (item) => item.status === "submitted" && item.txid,
    );
    if (pendingItems.length === 0) return;

    const seen = new Set<string>();
    const uniquePending = pendingItems.filter((item) => {
      if (!item.txid || seen.has(item.txid)) return false;
      seen.add(item.txid);
      return true;
    });

    let cancelled = false;
    const interval = window.setInterval(() => {
      void Promise.all(
        uniquePending.map(async (item) => {
          if (!item.txid || cancelled) return;
          try {
            const res = await fetch(
              `${stacksApi}/extended/v1/tx/${item.txid}`,
            );
            if (!res.ok) return;
            const data = await res.json().catch(() => ({}));
            const status = String(data?.tx_status || "");
            if (!status) return;

            if (status === "success") {
              patchActivityByTxid(item.txid, {
                status: "confirmed",
                message: `${item.kind.replace(/-/g, " ")} confirmed`,
                detail: "Confirmed on-chain",
              });
              if (stacksAddress) {
                await syncBalances(stacksAddress, { silent: true }).catch(
                  () => {},
                );
                await fetchPoolState(stacksAddress).catch(() => {});
              }
              return;
            }

            if (
              status.includes("abort") ||
              status.includes("dropped") ||
              status.includes("failed")
            ) {
              const repr = data?.tx_result?.repr as string | undefined;
              const reason =
                explainPoolError(repr) || repr || "Execution failed";
              patchActivityByTxid(item.txid, {
                status: "failed",
                message: `${item.kind.replace(/-/g, " ")} failed`,
                detail: reason,
              });
            }
          } catch (error) {
            console.warn("Tx status polling failed", error);
          }
        }),
      );
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    activityItems,
    explainPoolError,
    fetchPoolState,
    patchActivityByTxid,
    stacksApi,
    stacksAddress,
    syncBalances,
  ]);

  return {
    activityItems,
    setActivityItems,
    pushActivity,
    patchActivityByTxid,
  };
};
