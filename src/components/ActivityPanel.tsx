type ActivityItem = {
  id: string;
  ts: number;
  kind:
    | "swap"
    | "send"
    | "add-liquidity"
    | "remove-liquidity"
    | "approve"
    | "faucet";
  status: "submitted" | "confirmed" | "failed" | "cancelled";
  txid?: string;
  message: string;
  detail?: string;
  submittedAt?: number;
  lastCheckedAt?: number;
  chainStatus?: string;
};

import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { buildExplorerTxUrl } from "../lib/explorer";

type ActivityFilter =
  | "swap"
  | "send"
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
  const [copiedTxLink, setCopiedTxLink] = useState<string | null>(null);
  const [csvCopied, setCsvCopied] = useState(false);
  const [csvDownloaded, setCsvDownloaded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(8);
  const [now, setNow] = useState(() => Date.now());
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setVisibleCount(8);
  }, [activityFilter, filteredActivityItems.length, searchQuery]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!copiedTxid) return;
    const timer = window.setTimeout(() => setCopiedTxid(null), 1200);
    return () => window.clearTimeout(timer);
  }, [copiedTxid]);

  useEffect(() => {
    if (!copiedTxLink) return;
    const timer = window.setTimeout(() => setCopiedTxLink(null), 1200);
    return () => window.clearTimeout(timer);
  }, [copiedTxLink]);

  useEffect(() => {
    if (!csvCopied) return;
    const timer = window.setTimeout(() => setCsvCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [csvCopied]);

  useEffect(() => {
    if (!csvDownloaded) return;
    const timer = window.setTimeout(() => setCsvDownloaded(false), 1200);
    return () => window.clearTimeout(timer);
  }, [csvDownloaded]);

  const escapeCsvCell = (value: unknown) => {
    const raw = value === null || value === undefined ? "" : String(value);
    return `"${raw.replaceAll('"', '""')}"`;
  };

  const buildCsv = (items: ActivityItem[]) => {
    const header = ["timestamp", "kind", "status", "txid", "message", "detail"];
    const lines = [header.map(escapeCsvCell).join(",")];
    for (const item of items) {
      lines.push(
        [
          escapeCsvCell(new Date(item.ts).toISOString()),
          escapeCsvCell(item.kind),
          escapeCsvCell(item.status),
          escapeCsvCell(item.txid || ""),
          escapeCsvCell(item.message),
          escapeCsvCell(item.detail || ""),
        ].join(","),
      );
    }
    return lines.join("\n");
  };

  const searchedActivityItems = useMemo(() => {
    const needle = String(searchQuery || "").trim().toLowerCase();
    if (!needle) return filteredActivityItems;
    return filteredActivityItems.filter((item) => {
      const haystack = [
        item.kind,
        item.status,
        item.txid || "",
        item.message,
        item.detail || "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [filteredActivityItems, searchQuery]);

  const activityStats = useMemo(() => {
    if (activityItems.length === 0) return null;
    const swaps = activityItems.filter((i) => i.kind === "swap").length;
    const lp = activityItems.filter(
      (i) => i.kind === "add-liquidity" || i.kind === "remove-liquidity",
    ).length;
    const pending = activityItems.filter((i) => i.status === "submitted").length;
    const latest = activityItems.reduce(
      (best, i) => (i.ts > best ? i.ts : best),
      0,
    );
    return { swaps, lp, pending, latest };
  }, [activityItems]);

  const copyCsv = async () => {
    const csv = buildCsv(searchedActivityItems);
    try {
      await navigator.clipboard.writeText(csv);
      setCsvCopied(true);
    } catch {
      // ignore clipboard errors
    }
  };

  const downloadCsv = () => {
    const csv = buildCsv(searchedActivityItems);
    try {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
      link.href = url;
      link.download = `activity-${stamp}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setCsvDownloaded(true);
    } catch {
      // ignore download errors
    }
  };

  const copyTxid = async (txid: string) => {
    try {
      await navigator.clipboard.writeText(txid);
      setCopiedTxid(txid);
    } catch {
      // ignore clipboard errors
    }
  };

  const copyTxLink = async (txid: string) => {
    const url = buildExplorerTxUrl(txid, resolvedStacksNetwork);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedTxLink(txid);
    } catch {
      // ignore clipboard errors
    }
  };

  const formatRelativeTime = (timestampMs: number) => {
    if (!Number.isFinite(timestampMs) || timestampMs <= 0) return "Unknown";
    const delta = Math.max(0, now - timestampMs);
    const minute = 60_000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (delta < minute) return "<1m ago";
    if (delta < hour) return `${Math.floor(delta / minute)}m ago`;
    if (delta < day) return `${Math.floor(delta / hour)}h ago`;
    return `${Math.floor(delta / day)}d ago`;
  };

  return (
    <section className="activity-panel">
      <div className="activity-head">
        <div>
          <p className="eyebrow">Recent Activity</p>
          <h3>Transactions</h3>
          {activityStats && (
            <div className="activity-stats-chips">
              {activityStats.swaps > 0 && (
                <button
                  className={`chip ghost activity-stat-chip${activityFilter === "swap" ? " is-active" : ""}`}
                  type="button"
                  onClick={() => setActivityFilter(activityFilter === "swap" ? "all" : "swap")}
                  title="Filter by swaps"
                >
                  {activityStats.swaps} swap{activityStats.swaps !== 1 ? "s" : ""}
                </button>
              )}
              {activityStats.lp > 0 && (
                <button
                  className={`chip ghost activity-stat-chip${activityFilter === "add-liquidity" || activityFilter === "remove-liquidity" ? " is-active" : ""}`}
                  type="button"
                  onClick={() => setActivityFilter(activityFilter === "add-liquidity" ? "all" : "add-liquidity")}
                  title="Filter by LP events"
                >
                  {activityStats.lp} LP event{activityStats.lp !== 1 ? "s" : ""}
                </button>
              )}
              {activityStats.pending > 0 && (
                <button
                  className={`chip activity-stat-chip activity-stat-pending${activityFilter === "submitted" ? " is-active" : ""}`}
                  type="button"
                  onClick={() => setActivityFilter(activityFilter === "submitted" ? "all" : "submitted")}
                  title="Filter by pending transactions"
                >
                  {activityStats.pending} pending
                </button>
              )}
              <span className="chip ghost activity-stat-chip activity-stat-latest" title={new Date(activityStats.latest).toLocaleString()}>
                last {formatRelativeTime(activityStats.latest)}
              </span>
            </div>
          )}
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
            onClick={() => setActivityFilter("send")}
            disabled={activityFilter === "send"}
          >
            Sends
          </button>
          <button
            className="tiny ghost"
            onClick={() => setActivityFilter("approve")}
            disabled={activityFilter === "approve"}
          >
            Approvals
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
            onClick={() => setActivityFilter("confirmed")}
            disabled={activityFilter === "confirmed"}
          >
            Confirmed
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
            onClick={() => setActivityFilter("cancelled")}
            disabled={activityFilter === "cancelled"}
          >
            Cancelled
          </button>
          <button
            className="tiny ghost"
            type="button"
            onClick={() => void copyCsv()}
            disabled={searchedActivityItems.length === 0}
          >
            {csvCopied ? "CSV copied" : "Copy CSV"}
          </button>
          <button
            className="tiny ghost"
            type="button"
            onClick={downloadCsv}
            disabled={searchedActivityItems.length === 0}
          >
            {csvDownloaded ? "Downloaded" : "Download CSV"}
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
        <div className="activity-search-row">
          <input
            className="activity-search"
            value={searchQuery}
            placeholder="Search txid, status, message..."
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && String(searchQuery || "").trim()) {
                e.preventDefault();
                setSearchQuery("");
              }
            }}
          />
          <button
            className="tiny ghost"
            type="button"
            onClick={() => setSearchQuery("")}
            disabled={!String(searchQuery || "").trim()}
          >
            Clear
          </button>
        </div>
      )}
      {activityItems.length > 0 && (
        <p className="muted small activity-summary">
          Showing {Math.min(searchedActivityItems.length, visibleCount)} of{" "}
          {searchedActivityItems.length} matching entries.
        </p>
      )}
      {searchedActivityItems.length === 0 ? (
        activityItems.length === 0 ? (
          <div className="empty-state">
            <svg className="empty-state-icon" width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
              <rect x="8" y="11" width="24" height="20" rx="3" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M14 18h12M14 23h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M26 6l4 5H10l4-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <p className="empty-state-title">No transactions yet</p>
            <p className="empty-state-sub">Your swap and liquidity history will appear here.</p>
          </div>
        ) : (
          <p className="muted small">
            {String(searchQuery || "").trim()
              ? "No activity matches the current filter and search."
              : "No activity matches the current filter."}
          </p>
        )
      ) : (
        <div className="activity-list">
          {searchedActivityItems.slice(0, visibleCount).map((item) => {
            const pendingAgeMs =
              item.status === "submitted"
                ? Math.max(0, now - (item.submittedAt || item.ts))
                : 0;
            const isStuck = pendingAgeMs > 30 * 60_000;
            const pendingAgeLabel =
              pendingAgeMs > 0
                ? pendingAgeMs < 60_000
                  ? "<1m"
                  : `${Math.floor(pendingAgeMs / 60_000)}m`
                : null;

            return (
            <div className="activity-item" key={item.id}>
              <div className="activity-main">
                <span className={`chip ghost status-${item.status}`}>
                  {item.status}
                </span>
                {pendingAgeLabel && (
                  <span
                    className={`chip pending-age-badge${isStuck ? " is-stuck" : ""}`}
                    title={`Pending for ${pendingAgeLabel}`}
                  >
                    {pendingAgeLabel}
                  </span>
                )}
                <strong>{item.message}</strong>
              </div>
              <div className="activity-meta">
                <span
                  className="muted small"
                  title={new Date(item.ts).toLocaleString()}
                >
                  {formatRelativeTime(item.ts)}
                </span>
                {item.txid ? (
                  <div className="mini-actions">
                    <span className="activity-txid-group">
                      <a
                        className="chip ghost"
                        href={buildExplorerTxUrl(item.txid, resolvedStacksNetwork)}
                        target="_blank"
                        rel="noreferrer"
                        title={item.txid}
                      >
                        {item.txid.slice(0, 6)}...{item.txid.slice(-6)}
                      </a>
                      <button
                        className={`activity-copy-hash-btn${copiedTxid === item.txid ? " is-copied" : ""}`}
                        type="button"
                        onClick={() => void copyTxid(item.txid || "")}
                        title={copiedTxid === item.txid ? "Copied!" : "Copy TX hash"}
                        aria-label="Copy transaction hash"
                      >
                        {copiedTxid === item.txid ? (
                          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                            <path d="M1.5 5.5l2.5 2.5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        ) : (
                          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                            <rect x="0.75" y="3.25" width="7" height="7" rx="1.25" stroke="currentColor" strokeWidth="1.2"/>
                            <path d="M3.25 3.25V2.25A1 1 0 0 1 4.25 1.25h4.5a1 1 0 0 1 1 1v4.5a1 1 0 0 1-1 1H7.75" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                          </svg>
                        )}
                      </button>
                    </span>
                    <button
                      className="tiny ghost"
                      type="button"
                      onClick={() => void copyTxLink(item.txid || "")}
                    >
                      {copiedTxLink === item.txid ? "Link copied" : "Copy link"}
                    </button>
                  </div>
                ) : null}
              </div>
              {item.detail ? (
                <p className="muted small">{item.detail}</p>
              ) : null}
              {item.txid ? (
                <p className="muted small">
                  {item.chainStatus
                    ? item.chainStatus.replace(/\b\w/g, (char) => char.toUpperCase())
                    : "Awaiting chain update"}
                  {item.lastCheckedAt
                    ? ` · checked ${formatRelativeTime(item.lastCheckedAt)}`
                    : ""}
                </p>
              ) : null}
              {isStuck && (
                <p className="muted small pending-stuck-warn">
                  Taking longer than expected — check the explorer or try resubmitting.
                </p>
              )}
            </div>
            );
          })}
          {searchedActivityItems.length > 8 && (
            <div className="mini-actions">
              <button
                className="tiny ghost"
                type="button"
                onClick={() =>
                  setVisibleCount((prev) =>
                    Math.min(searchedActivityItems.length, prev + 8),
                  )
                }
                disabled={visibleCount >= searchedActivityItems.length}
              >
                Show more
              </button>
              <button
                className="tiny ghost"
                type="button"
                onClick={() => setVisibleCount(8)}
                disabled={visibleCount <= 8}
              >
                Show less
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
