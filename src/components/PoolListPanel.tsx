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
  favoritesOnly: boolean;
  setFavoritesOnly: (value: boolean) => void;
  sort: "tvl" | "volume" | "fees" | "apr";
  setSort: (value: "tvl" | "volume" | "fees" | "apr") => void;
  sortDir: "asc" | "desc";
  setSortDir: (value: "asc" | "desc") => void;
  favorites: string[];
  toggleFavorite: (poolId: string) => void;
  clearFavorites: () => void;
  onResetFilters: () => void;
  onOpenPool: (poolId: string, target: "swap" | "liquidity") => void;
  onCopyPoolId: (poolId: string) => void;
  resolvedStacksNetwork: string;
  formatCompactNumber: (value: number) => string;
  formatNumber: (value: number) => string;
};

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
    onResetFilters,
    onOpenPool,
    onCopyPoolId,
    resolvedStacksNetwork,
    formatCompactNumber,
    formatNumber,
  } = props;

  const toContractExplorerUrl = (contractId: string) => {
    const [address = "", name = ""] = contractId.split(".");
    if (!address || !name) return null;
    return `https://explorer.hiro.so/contract/${address}/${name}?chain=${resolvedStacksNetwork}`;
  };

  const isDefaultFilters =
    search.trim() === "" &&
    sort === "tvl" &&
    sortDir === "desc" &&
    favoritesOnly === false;

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
            onKeyDown={(e) => {
              if (e.key === "Escape" && search.trim()) {
                setSearch("");
              }
            }}
            placeholder="Search by token, symbol, or pool label"
          />
          {search.trim() && (
            <button
              className="tiny ghost"
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear pool search"
            >
              Clear
            </button>
          )}
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
          <label className="target-toggle pool-sort-favorites">
            <input
              type="checkbox"
              checked={favoritesOnly}
              onChange={(e) => setFavoritesOnly(e.target.checked)}
            />
            Favorites only
          </label>
          <button
            className="tiny ghost"
            type="button"
            onClick={onResetFilters}
            disabled={isDefaultFilters}
          >
            Reset
          </button>
          <button
            className="tiny ghost"
            type="button"
            onClick={clearFavorites}
            disabled={favorites.length === 0}
          >
            Clear favorites
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
                <button
                  className={`chip ghost ${favorites.includes(pool.id) ? "is-favorite" : ""}`}
                  type="button"
                  onClick={() => toggleFavorite(pool.id)}
                  aria-label={
                    favorites.includes(pool.id)
                      ? "Remove from favorites"
                      : "Add to favorites"
                  }
                >
                  {favorites.includes(pool.id) ? "★ Favorite" : "☆ Favorite"}
                </button>
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
                  className="tiny ghost"
                  type="button"
                  onClick={() => onCopyPoolId(pool.id)}
                >
                  Copy contract
                </button>
                {toContractExplorerUrl(pool.id) && (
                  <a
                    className="tiny ghost"
                    href={toContractExplorerUrl(pool.id) as string}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Explorer
                  </a>
                )}
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
