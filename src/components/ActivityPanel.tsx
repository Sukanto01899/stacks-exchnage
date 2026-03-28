type ActivityItem = {
  id: string;
  ts: number;
  kind: "swap" | "add-liquidity" | "remove-liquidity" | "approve" | "faucet";
  status: "submitted" | "confirmed" | "failed" | "cancelled";
  txid?: string;
  message: string;
  detail?: string;
};

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

type ActivityFilter =
  | "swap"
  | "confirmed"
  | "submitted"
  | "add-liquidity"
  | "remove-liquidity"
  | "approve"
  | "faucet"
  | "failed"
  | "cancelled"
  | "all";

type ActivityPanelProps = {
  activityFilter: ActivityFilter;
  setActivityFilter: Dispatch<SetStateAction<ActivityFilter>>;
  activityItems: ActivityItem[];
  filteredActivityItems: ActivityItem[];
  setActivityItems: Dispatch<SetStateAction<ActivityItem[]>>;
  activityKey: string;
  resolvedStacksNetwork: string;
};

export default function ActivityPanel(props: ActivityPanelProps) {
  const {
    activityFilter,
    setActivityFilter,
    activityItems,
    filteredActivityItems,
    setActivityItems,
    activityKey,
    resolvedStacksNetwork,
  } = props;

  const [copiedTxid, setCopiedTxid] = useState<string | null>(null);

  useEffect(() => {
    if (!copiedTxid) return;
    const timer = window.setTimeout(() => setCopiedTxid(null), 1200);
    return () => window.clearTimeout(timer);
  }, [copiedTxid]);

  const copyTxid = async (txid: string) => {
    try {
      await navigator.clipboard.writeText(txid);
      setCopiedTxid(txid);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <section className="activity-panel">
      <div className="activity-head">
        <div>
          <p className="eyebrow">Recent Activity</p>
          <h3>Transactions</h3>
        </div>
        <div className="mini-actions">
          <button
            className="tiny ghost"
            onClick={() => setActivityFilter("all")}
            disabled={activityFilter === "all"}
          >
            All
          </button>
          <button
            className="tiny ghost"
            onClick={() => setActivityFilter("swap")}
            disabled={activityFilter === "swap"}
          >
            Swaps
          </button>
          <button
            className="tiny ghost"
            onClick={() => setActivityFilter("add-liquidity")}
            disabled={activityFilter === "add-liquidity"}
          >
            Add LP
          </button>
          <button
            className="tiny ghost"
            onClick={() => setActivityFilter("remove-liquidity")}
            disabled={activityFilter === "remove-liquidity"}
          >
            Remove LP
          </button>
          <button
            className="tiny ghost"
            onClick={() => setActivityFilter("faucet")}
            disabled={activityFilter === "faucet"}
          >
            Faucet
          </button>
          <button
            className="tiny ghost"
            onClick={() => setActivityFilter("submitted")}
            disabled={activityFilter === "submitted"}
          >
            Pending
          </button>
          <button
            className="tiny ghost"
            onClick={() => setActivityFilter("failed")}
            disabled={activityFilter === "failed"}
          >
            Failed
          </button>
          <button
            className="tiny ghost"
            onClick={() => {
              setActivityItems([]);
              setActivityFilter("all");
              try {
                localStorage.removeItem(activityKey);
              } catch (error) {
                console.warn("Activity history clear failed", error);
              }
            }}
            disabled={activityItems.length === 0}
          >
            Clear
          </button>
        </div>
      </div>
      {activityItems.length > 0 && (
        <p className="muted small activity-summary">
          Showing {Math.min(filteredActivityItems.length, 8)} of{" "}
          {filteredActivityItems.length} matching entries.
        </p>
      )}
      {filteredActivityItems.length === 0 ? (
        <p className="muted small">
          {activityItems.length === 0
            ? "No activity yet."
            : "No activity matches the current filter."}
        </p>
      ) : (
        <div className="activity-list">
          {filteredActivityItems.slice(0, 8).map((item) => (
            <div className="activity-item" key={item.id}>
              <div className="activity-main">
                <span className={`chip ghost status-${item.status}`}>
                  {item.status}
                </span>
                <strong>{item.message}</strong>
              </div>
              <div className="activity-meta">
                <span className="muted small">
                  {new Date(item.ts).toLocaleString()}
                </span>
                {item.txid ? (
                  <div className="mini-actions">
                    <a
                      className="chip ghost"
                      href={`https://explorer.hiro.so/txid/${item.txid}?chain=${resolvedStacksNetwork}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {item.txid.slice(0, 6)}...{item.txid.slice(-6)}
                    </a>
                    <button
                      className="tiny ghost"
                      type="button"
                      onClick={() => void copyTxid(item.txid || "")}
                    >
                      {copiedTxid === item.txid ? "Copied" : "Copy"}
                    </button>
                  </div>
                ) : null}
              </div>
              {item.detail ? (
                <p className="muted small">{item.detail}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
