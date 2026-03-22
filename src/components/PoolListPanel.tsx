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

type PoolListPanelProps = {
  pools: PoolListItem[];
  search: string;
  setSearch: (value: string) => void;
  sort: "tvl" | "volume" | "fees" | "apr";
  setSort: (value: "tvl" | "volume" | "fees" | "apr") => void;
  sortDir: "asc" | "desc";
  setSortDir: (value: "asc" | "desc") => void;
  onOpenPool: (poolId: string, target: "swap" | "liquidity") => void;
  formatCompactNumber: (value: number) => string;
  formatNumber: (value: number) => string;
};

export default function PoolListPanel(props: PoolListPanelProps) {
  const {
    pools,
    search,
    setSearch,
    sort,
    setSort,
    sortDir,
    setSortDir,
    onOpenPool,
    formatCompactNumber,
    formatNumber,
  } = props;

  return (
    <section className="pool-list-panel">
      <div className="pool-list-head">
        <div>
          <p className="eyebrow">Pools</p>
          <h3>Discover liquidity</h3>
        </div>
        <span className="chip ghost">{pools.length} pools</span>
      </div>

      <div className="pool-list-controls">
        <div className="pool-search">
          <span className="pool-search-icon">Search</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by token, symbol, or pool label"
          />
        </div>
        <div className="pool-sort">
          <label htmlFor="pool-sort">Sort by</label>
          <select
            id="pool-sort"
            value={sort}
            onChange={(e) =>
              setSort(e.target.value as "tvl" | "volume" | "fees" | "apr")
            }
          >
            <option value="tvl">TVL</option>
            <option value="volume">Volume 24h</option>
            <option value="fees">Fees 24h</option>
            <option value="apr">APR</option>
          </select>
          <button
            className="tiny ghost"
            type="button"
            onClick={() => setSortDir(sortDir === "desc" ? "asc" : "desc")}
          >
            {sortDir === "desc" ? "High → Low" : "Low → High"}
          </button>
        </div>
      </div>

      {pools.length === 0 ? (
        <p className="muted small">No pools match your search.</p>
      ) : (
        <div className="pool-list-grid">
          {pools.map((pool) => (
            <div key={pool.id} className="pool-list-card">
              <div className="pool-list-card-head">
                <div>
                  <p className="muted small">{pool.label}</p>
                  <strong>
                    {pool.tokenXLabel} / {pool.tokenYLabel}
                  </strong>
                </div>
                <span className="chip ghost">
                  {pool.tokenXIsStx || pool.tokenYIsStx ? "STX" : "SIP-010"}
                </span>
              </div>
              <div className="pool-list-stats">
                <div>
                  <span className="muted small">TVL</span>
                  <strong>{formatCompactNumber(pool.tvl)}</strong>
                </div>
                <div>
                  <span className="muted small">Volume 24h</span>
                  <strong>{formatCompactNumber(pool.volume24h)}</strong>
                </div>
                <div>
                  <span className="muted small">Fees 24h</span>
                  <strong>{formatNumber(pool.fees24h)}</strong>
                </div>
                <div>
                  <span className="muted small">APR</span>
                  <strong>{pool.apr !== null ? `${pool.apr}%` : "—"}</strong>
                </div>
              </div>
              <div className="pool-list-actions">
                <button
                  className="secondary"
                  type="button"
                  onClick={() => onOpenPool(pool.id, "swap")}
                >
                  Trade
                </button>
                <button
                  className="primary"
                  type="button"
                  onClick={() => onOpenPool(pool.id, "liquidity")}
                >
                  Add liquidity
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
