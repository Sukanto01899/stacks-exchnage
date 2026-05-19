import { useEffect, useState } from "react";
import { buildExplorerContractUrl } from "../lib/explorer";

type PoolListItem = {
  id: string;
  label: string;
  tokenXLabel: string;
  tokenYLabel: string;
  tokenXIsStx: boolean;
  tokenYIsStx: boolean;
  tvl: number;
  volume24h: number;
  fees24h: number;
  apr: number | null;
};

type RecentPoolItem = {
  id: string;
  label: string;
  tokenXLabel: string;
  tokenYLabel: string;
  target: "swap" | "liquidity";
};

type PoolListPanelProps = {
  pools: PoolListItem[];
  search: string;
  setSearch: (value: string) => void;
  favoritesOnly: boolean;
  setFavoritesOnly: (value: boolean) => void;
  sort: "tvl" | "volume" | "fees" | "apr";
  setSort: (value: "tvl" | "volume" | "fees" | "apr") => void;
  sortDir: "asc" | "desc";
  setSortDir: (value: "asc" | "desc") => void;
  favorites: string[];
  toggleFavorite: (poolId: string) => void;
  clearFavorites: () => void;
  recentPools: RecentPoolItem[];
  clearRecentPools: () => void;
  onResetFilters: () => void;
  onOpenPool: (poolId: string, target: "swap" | "liquidity") => void;
  onCopyPoolId: (poolId: string) => void;
  onCopyPoolLink: (poolId: string, target: "swap" | "liquidity") => void;
  onCopyPoolExplorerLink: (poolId: string) => void;
  onCopyPoolsCsv: () => void;
  onDownloadPoolsCsv: () => void;
  resolvedStacksNetwork: string;
  formatCompactNumber: (value: number) => string;
  formatNumber: (value: number) => string;
};

const SORT_OPTIONS: { value: "tvl" | "volume" | "fees" | "apr"; label: string }[] = [
  { value: "tvl", label: "TVL" },
  { value: "volume", label: "Volume" },
  { value: "apr", label: "APR" },
];

function PairIcon({ label, isStx }: { label: string; isStx: boolean }) {
  const text = isStx ? "STX" : label.slice(0, 1).toUpperCase();
  return (
    <span className="pool-pair-icon" aria-hidden="true">
      {text}
    </span>
  );
}

function HealthDot({ tvl }: { tvl: number }) {
  const safe = Number.isFinite(tvl) ? tvl : 0;
  if (safe <= 0) return <span className="pool-health-dot pool-health-dot--empty" title="No liquidity" />;
  if (safe < 10) return <span className="pool-health-dot pool-health-dot--low" title="Low liquidity" />;
  return <span className="pool-health-dot pool-health-dot--healthy" title="Healthy" />;
}

export default function PoolListPanel(props: PoolListPanelProps) {
  const {
    pools,
    search,
    setSearch,
    favoritesOnly,
    setFavoritesOnly,
    sort,
    setSort,
    sortDir,
    setSortDir,
    favorites,
    toggleFavorite,
    clearFavorites,
    recentPools,
    clearRecentPools,
    onResetFilters,
    onOpenPool,
    onCopyPoolId,
    resolvedStacksNetwork,
    formatCompactNumber,
  } = props;

  const isDefaultFilters =
    search.trim() === "" &&
    sort === "tvl" &&
    sortDir === "desc" &&
    favoritesOnly === false;

  const [copiedPoolId, setCopiedPoolId] = useState<string | null>(null);
  const [expandedPool, setExpandedPool] = useState<string | null>(null);

  useEffect(() => {
    if (!copiedPoolId) return;
    const timer = window.setTimeout(() => setCopiedPoolId(null), 1200);
    return () => window.clearTimeout(timer);
  }, [copiedPoolId]);

  return (
    <section className="pool-list-panel">
      <div className="pool-list-head">
        <h2 className="pool-list-title">Pools</h2>
        <span className="chip ghost">{pools.length} pools</span>
      </div>

      <div className="pool-list-controls">
        <div className="pool-search">
          <svg className="pool-search-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && search.trim()) setSearch("");
            }}
            placeholder="Search pools…"
          />
          {search.trim() && (
            <button className="pool-search-clear" type="button" onClick={() => setSearch("")} aria-label="Clear search">
              ✕
            </button>
          )}
        </div>

        <div className="pool-sort-row">
          <div className="pool-sort-pills" role="group" aria-label="Sort by">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`pool-sort-pill ${sort === opt.value ? "is-active" : ""}`}
                type="button"
                onClick={() => {
                  if (sort === opt.value) {
                    setSortDir(sortDir === "desc" ? "asc" : "desc");
                  } else {
                    setSort(opt.value);
                    setSortDir("desc");
                  }
                }}
                aria-pressed={sort === opt.value}
              >
                {opt.label}
                {sort === opt.value && (
                  <span className="pool-sort-arrow">{sortDir === "desc" ? "↓" : "↑"}</span>
                )}
              </button>
            ))}
          </div>

          <button
            className={`pool-fav-toggle ${favoritesOnly ? "is-active" : ""}`}
            type="button"
            onClick={() => setFavoritesOnly(!favoritesOnly)}
            title={favoritesOnly ? "Showing favorites only" : "Show favorites only"}
            aria-pressed={favoritesOnly}
          >
            {favoritesOnly ? "★" : "☆"} Saved
          </button>

          {!isDefaultFilters && (
            <button className="tiny ghost" type="button" onClick={onResetFilters}>
              Reset
            </button>
          )}
        </div>
      </div>

      {recentPools.length > 0 && (
        <div className="pool-recent-row" aria-label="Recent pools">
          <span className="muted small">Recent</span>
          <div className="chip-row">
            {recentPools.map((pool) => (
              <button
                key={`${pool.id}-${pool.target}`}
                className="chip ghost"
                type="button"
                onClick={() => onOpenPool(pool.id, pool.target)}
                title={pool.target === "swap" ? "Open in Trade" : "Open in Liquidity"}
              >
                {pool.tokenXLabel}/{pool.tokenYLabel}
                <span className="muted small"> · {pool.target === "swap" ? "Trade" : "Liquidity"}</span>
              </button>
            ))}
            <button className="tiny ghost" type="button" onClick={clearRecentPools}>
              Clear
            </button>
          </div>
        </div>
      )}

      {pools.length === 0 ? (
        <div className="note subtle" aria-label="No pools">
          <p className="muted small">
            {favoritesOnly && favorites.length === 0
              ? "No saved pools yet."
              : search.trim()
                ? `No pools match "${search}".`
                : "No pools match these filters."}
          </p>
          <div className="chip-row">
            {favoritesOnly && (
              <button className="tiny ghost" type="button" onClick={() => setFavoritesOnly(false)}>
                Show all pools
              </button>
            )}
            {search.trim() && (
              <button className="tiny ghost" type="button" onClick={() => setSearch("")}>
                Clear search
              </button>
            )}
            {!isDefaultFilters && (
              <button className="tiny ghost" type="button" onClick={onResetFilters}>
                Reset filters
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="pool-list-grid">
          {pools.map((pool) => {
            const isFav = favorites.includes(pool.id);
            const isExpanded = expandedPool === pool.id;
            const explorerUrl = buildExplorerContractUrl(pool.id, resolvedStacksNetwork);

            return (
              <div key={pool.id} className={`pool-list-card ${isFav ? "is-favorite" : ""}`}>
                <div className="pool-list-card-head">
                  <div className="pool-pair">
                    <div className="pool-pair-icons">
                      <PairIcon label={pool.tokenXLabel} isStx={pool.tokenXIsStx} />
                      <PairIcon label={pool.tokenYLabel} isStx={pool.tokenYIsStx} />
                    </div>
                    <div className="pool-pair-info">
                      <span className="pool-pair-name">
                        {pool.tokenXLabel} / {pool.tokenYLabel}
                      </span>
                      <HealthDot tvl={pool.tvl} />
                    </div>
                  </div>

                  <button
                    className={`pool-fav-btn ${isFav ? "is-active" : ""}`}
                    type="button"
                    onClick={() => toggleFavorite(pool.id)}
                    aria-label={isFav ? "Remove from saved" : "Save pool"}
                    title={isFav ? "Remove from saved" : "Save pool"}
                  >
                    {isFav ? "★" : "☆"}
                  </button>
                </div>

                <div className="pool-list-stats">
                  <div className="pool-stat-item">
                    <span className="pool-stat-label">TVL</span>
                    <strong className="pool-stat-value">{formatCompactNumber(pool.tvl)}</strong>
                  </div>
                  <div className="pool-stat-item">
                    <span className="pool-stat-label">Vol. 24h</span>
                    <strong className="pool-stat-value">{formatCompactNumber(pool.volume24h)}</strong>
                  </div>
                  <div className="pool-stat-item">
                    <span className="pool-stat-label">APR</span>
                    <strong className="pool-stat-value pool-stat-apr">
                      {pool.apr !== null ? `${pool.apr}%` : "—"}
                    </strong>
                  </div>
                </div>

                <div className="pool-list-actions">
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => onOpenPool(pool.id, "swap")}
                  >
                    Swap
                  </button>
                  <button
                    className="primary"
                    type="button"
                    onClick={() => onOpenPool(pool.id, "liquidity")}
                  >
                    + Add liquidity
                  </button>
                </div>

                <div className="pool-card-footer">
                  <button
                    className="pool-details-toggle"
                    type="button"
                    onClick={() => setExpandedPool(isExpanded ? null : pool.id)}
                    aria-expanded={isExpanded}
                  >
                    <svg
                      className={`pool-details-chevron${isExpanded ? " is-open" : ""}`}
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {isExpanded ? "Less" : "Details"}
                  </button>
                  {isExpanded && (
                    <div className="pool-details">
                      <div className="pool-details-stat">
                        <span className="muted small">Fees 24h</span>
                        <strong className="muted small">{formatCompactNumber(pool.fees24h)}</strong>
                      </div>
                      <div className="pool-details-stat">
                        <span className="muted small">Contract</span>
                        <code className="pool-contract-id">{pool.id.split(".")[1] ?? pool.id}</code>
                      </div>
                      <div className="pool-details-actions">
                        <button
                          className="tiny ghost"
                          type="button"
                          onClick={() => {
                            onCopyPoolId(pool.id);
                            setCopiedPoolId(pool.id);
                          }}
                        >
                          {copiedPoolId === pool.id ? "Copied!" : "Copy contract"}
                        </button>
                        {explorerUrl && (
                          <a
                            className="tiny ghost"
                            href={explorerUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Explorer ↗
                          </a>
                        )}
                        {favoritesOnly && favorites.length > 0 && (
                          <button className="tiny ghost" type="button" onClick={clearFavorites}>
                            Clear saved
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
