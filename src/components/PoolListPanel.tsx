import { useEffect, useState } from "react";
import { buildExplorerContractUrl } from "../lib/explorer";
import { tokenAvatarStyle } from "../lib/helper";

type PoolListItem = {
  id: string;
  label: string;
  tokenXLabel: string;
  tokenYLabel: string;
  tokenXIsStx: boolean;
  tokenYIsStx: boolean;
  reserveX: number;
  reserveY: number;
  tvl: number;
  volume24h: number;
  fees24h: number;
  apr: number | null;
  priceChange24?: number | null;
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
  onRemoveRecentPool: (poolId: string, target: "swap" | "liquidity") => void;
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
  totalPoolCount?: number;
};

const SORT_OPTIONS: { value: "tvl" | "volume" | "fees" | "apr"; label: string }[] = [
  { value: "tvl", label: "TVL" },
  { value: "volume", label: "Volume" },
  { value: "apr", label: "APR" },
];

function PairIcon({ label, isStx }: { label: string; isStx: boolean }) {
  const text = isStx ? "STX" : label.slice(0, 1).toUpperCase();
  return (
    <span
      className="pool-pair-icon"
      style={tokenAvatarStyle(isStx ? "STX" : label)}
      aria-hidden="true"
    >
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
    onRemoveRecentPool,
    onResetFilters,
    onOpenPool,
    onCopyPoolId,
    onCopyPoolLink,
    onCopyPoolExplorerLink,
    onCopyPoolsCsv,
    onDownloadPoolsCsv,
    resolvedStacksNetwork,
    formatCompactNumber,
    formatNumber,
    totalPoolCount,
  } = props;

  const isDefaultFilters =
    search.trim() === "" &&
    sort === "tvl" &&
    sortDir === "desc" &&
    favoritesOnly === false;

  const maxTvl = pools.reduce((m, p) => Math.max(m, p.tvl), 0);

  const [copiedPoolId, setCopiedPoolId] = useState<string | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [copiedLpLinkId, setCopiedLpLinkId] = useState<string | null>(null);
  const [copiedExplorerId, setCopiedExplorerId] = useState<string | null>(null);
  const [expandedPool, setExpandedPool] = useState<string | null>(null);

  useEffect(() => {
    if (!copiedPoolId) return;
    const timer = window.setTimeout(() => setCopiedPoolId(null), 1200);
    return () => window.clearTimeout(timer);
  }, [copiedPoolId]);

  useEffect(() => {
    if (!copiedLinkId) return;
    const timer = window.setTimeout(() => setCopiedLinkId(null), 1200);
    return () => window.clearTimeout(timer);
  }, [copiedLinkId]);

  useEffect(() => {
    if (!copiedLpLinkId) return;
    const timer = window.setTimeout(() => setCopiedLpLinkId(null), 1200);
    return () => window.clearTimeout(timer);
  }, [copiedLpLinkId]);

  useEffect(() => {
    if (!copiedExplorerId) return;
    const timer = window.setTimeout(() => setCopiedExplorerId(null), 1200);
    return () => window.clearTimeout(timer);
  }, [copiedExplorerId]);

  return (
    <section className="pool-list-panel">
      <div className="pool-list-head">
        <h2 className="pool-list-title">Pools</h2>
        {totalPoolCount !== undefined && totalPoolCount !== pools.length ? (
          <span className="chip ghost" title={`${totalPoolCount} pools total`}>
            {pools.length} of {totalPoolCount} pools
          </span>
        ) : (
          <span className="chip ghost">{pools.length} pools</span>
        )}
        <div className="mini-actions">
          <button
            className="tiny ghost"
            type="button"
            onClick={onCopyPoolsCsv}
            disabled={pools.length === 0}
          >
            Copy CSV
          </button>
          <button
            className="tiny ghost"
            type="button"
            onClick={onDownloadPoolsCsv}
            disabled={pools.length === 0}
          >
            Download CSV
          </button>
        </div>
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
              <span key={`${pool.id}-${pool.target}`} className="chip ghost recent-swap-chip">
                <button
                  className="recent-swap-chip-pick"
                  type="button"
                  onClick={() => onOpenPool(pool.id, pool.target)}
                  title={pool.target === "swap" ? "Open in Trade" : "Open in Liquidity"}
                >
                  {pool.tokenXLabel}/{pool.tokenYLabel}
                  <span className="muted small"> · {pool.target === "swap" ? "Trade" : "Liquidity"}</span>
                </button>
                <button
                  className="recent-swap-chip-remove"
                  type="button"
                  onClick={() => onRemoveRecentPool(pool.id, pool.target)}
                  aria-label={`Remove ${pool.tokenXLabel}/${pool.tokenYLabel} from recent pools`}
                  title="Remove"
                >
                  ×
                </button>
              </span>
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
                      {pool.priceChange24 !== null && pool.priceChange24 !== undefined && Number.isFinite(pool.priceChange24) && (
                        <span
                          className={`chip ${pool.priceChange24 >= 0 ? "price-up" : "price-down"}`}
                          title="24h price change"
                        >
                          {pool.priceChange24 >= 0 ? "+" : ""}{pool.priceChange24.toFixed(2)}%
                        </span>
                      )}
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

                <div
                  className="pool-tvl-bar"
                  role="meter"
                  aria-label={`TVL: ${formatCompactNumber(pool.tvl)}`}
                  aria-valuenow={pool.tvl}
                  aria-valuemin={0}
                  aria-valuemax={maxTvl}
                  title={[
                    `TVL ${formatCompactNumber(pool.tvl)} (${maxTvl > 0 ? ((pool.tvl / maxTvl) * 100).toFixed(0) : 0}% of deepest pool)`,
                    `${pool.tokenXLabel}: ${formatNumber(pool.reserveX)}`,
                    `${pool.tokenYLabel}: ${formatNumber(pool.reserveY)}`,
                    pool.volume24h > 0 ? `Vol 24h: ${formatCompactNumber(pool.volume24h)}` : null,
                    pool.fees24h > 0 ? `Fees 24h: ${formatCompactNumber(pool.fees24h)}` : null,
                    pool.apr !== null ? `APR: ${pool.apr}%` : null,
                  ].filter(Boolean).join("\n")}
                >
                  <div
                    className="pool-tvl-bar-fill"
                    style={{ width: maxTvl > 0 ? `${Math.min((pool.tvl / maxTvl) * 100, 100)}%` : "0%" }}
                  />
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
                  <button
                    className={`pool-contract-copy-btn${copiedPoolId === pool.id ? " is-copied" : ""}`}
                    type="button"
                    onClick={() => {
                      onCopyPoolId(pool.id);
                      setCopiedPoolId(pool.id);
                    }}
                    title={`Copy pool contract: ${pool.id}`}
                    aria-label="Copy pool contract address"
                  >
                    {copiedPoolId === pool.id ? (
                      <>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                          <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Copied
                      </>
                    ) : (
                      <>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                          <rect x="0.75" y="2.75" width="6.5" height="6.5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                          <path d="M2.75 2.75V2A.75.75 0 0 1 3.5 1.25h4.75A.75.75 0 0 1 9 2v4.75a.75.75 0 0 1-.75.75H7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                        </svg>
                        {pool.id.split(".")[1] ?? pool.id}
                      </>
                    )}
                  </button>
                  <button
                    className={`pool-contract-copy-btn${copiedLinkId === pool.id ? " is-copied" : ""}`}
                    type="button"
                    onClick={() => {
                      onCopyPoolLink(pool.id, "swap");
                      setCopiedLinkId(pool.id);
                    }}
                    title={`Copy share link for ${pool.tokenXLabel}/${pool.tokenYLabel}`}
                    aria-label="Copy share link"
                  >
                    {copiedLinkId === pool.id ? (
                      <>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                          <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Copied
                      </>
                    ) : (
                      <>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                          <path d="M4.5 2H2a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6.5M7 1h2m0 0v2M9 1 5.5 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Share
                      </>
                    )}
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
                        <button
                          className="tiny ghost"
                          type="button"
                          onClick={() => {
                            onCopyPoolLink(pool.id, "swap");
                            setCopiedLinkId(pool.id);
                          }}
                        >
                          {copiedLinkId === pool.id ? "Link copied!" : "Copy link"}
                        </button>
                        <button
                          className="tiny ghost"
                          type="button"
                          onClick={() => {
                            onCopyPoolLink(pool.id, "liquidity");
                            setCopiedLpLinkId(pool.id);
                          }}
                        >
                          {copiedLpLinkId === pool.id ? "LP link copied!" : "Copy LP link"}
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
                        {explorerUrl && (
                          <button
                            className="tiny ghost"
                            type="button"
                            onClick={() => {
                              onCopyPoolExplorerLink(pool.id);
                              setCopiedExplorerId(pool.id);
                            }}
                          >
                            {copiedExplorerId === pool.id ? "Link copied!" : "Copy explorer link"}
                          </button>
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
