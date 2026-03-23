import { useEffect, useMemo, useState } from "react";

type FilterMode = "all" | "watchlist" | "gainers" | "losers" | "volume";
type SortKey = "price" | "volume" | "change" | "change1h";
type WatchlistItemMeta = { tag: string; preset: string };
type Watchlist = { id: string; name: string; items: Record<string, WatchlistItemMeta> };

type MarketInput = {
  id: string;
  label: string;
  tokenXLabel: string;
  tokenYLabel: string;
  tvl: number;
  volume24h: number;
};

type MarketRow = MarketInput & {
  lastPrice: number;
  change24h: number;
  change1h: number;
  lastMove: "up" | "down" | "flat";
  volume24hLive: number;
};

type Props = {
  markets: MarketInput[];
  formatNumber: (value: number) => string;
  formatCompactNumber: (value: number) => string;
  formatSignedPercent: (value: number | null) => string;
  storageKey: string;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const hashSeed = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const buildInitialRows = (markets: MarketInput[]): MarketRow[] => {
  return markets.map((market) => {
    const seed = hashSeed(market.id);
    const factor = (seed % 1000) / 1000;
    const base = 0.4 + factor * 6.4;
    const lastPrice = Number((base + factor * 1.2).toFixed(4));
    const change24h = Number((((factor * 2 - 1) * 10).toFixed(2)));
    const change1h = Number((((factor * 2 - 1) * 2.8).toFixed(2)));
    return {
      ...market,
      lastPrice,
      change24h,
      change1h,
      lastMove: "flat",
      volume24hLive: market.volume24h,
    };
  });
};

const PriceBoardPanel = ({
  markets,
  formatNumber,
  formatCompactNumber,
  formatSignedPercent,
  storageKey,
}: Props) => {
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [search, setSearch] = useState("");
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [activeWatchlistId, setActiveWatchlistId] = useState("");
  const [rows, setRows] = useState<MarketRow[]>(() =>
    buildInitialRows(markets),
  );
  const [lastUpdatedAt, setLastUpdatedAt] = useState(Date.now());
  const [sortKey, setSortKey] = useState<SortKey>("volume");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const tagOptions = [
    "Core",
    "Momentum",
    "Swing",
    "Long-term",
    "High risk",
    "Arb",
    "Watch",
  ];
  const presetOptions = [
    "5% move",
    "10% move",
    "Breakout",
    "Mean reversion",
    "Volume spike",
  ];

  const activeWatchlist = useMemo(
    () => watchlists.find((list) => list.id === activeWatchlistId) ?? null,
    [activeWatchlistId, watchlists],
  );
  const watchlistItems = activeWatchlist?.items ?? {};
  const watchlistIds = useMemo(
    () => new Set(Object.keys(watchlistItems)),
    [watchlistItems],
  );

  useEffect(() => {
    setRows(buildInitialRows(markets));
  }, [markets]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) {
        const defaults: Watchlist[] = [
          { id: "wl-main", name: "Main", items: {} },
          { id: "wl-swing", name: "Swing", items: {} },
          { id: "wl-long", name: "Long-term", items: {} },
        ];
        setWatchlists(defaults);
        setActiveWatchlistId(defaults[0]?.id ?? "");
        return;
      }
      const parsed = JSON.parse(stored) as
        | { version: number; activeId: string; lists: Watchlist[] }
        | string[];

      if (Array.isArray(parsed)) {
        const migrated: Watchlist[] = [
          {
            id: "wl-main",
            name: "Main",
            items: parsed.reduce<Record<string, WatchlistItemMeta>>(
              (acc, id) => {
                if (typeof id === "string") {
                  acc[id] = { tag: "Core", preset: "5% move" };
                }
                return acc;
              },
              {},
            ),
          },
        ];
        setWatchlists(migrated);
        setActiveWatchlistId("wl-main");
        return;
      }

      if (parsed?.lists && Array.isArray(parsed.lists)) {
        const sanitized = parsed.lists
          .filter((list) => list && typeof list.id === "string")
          .map((list) => ({
            id: list.id,
            name: typeof list.name === "string" ? list.name : "Watchlist",
            items: list.items && typeof list.items === "object" ? list.items : {},
          }));
        setWatchlists(sanitized);
        setActiveWatchlistId(
          typeof parsed.activeId === "string" && parsed.activeId
            ? parsed.activeId
            : sanitized[0]?.id ?? "",
        );
      }
    } catch {
      // ignore storage errors
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      if (watchlists.length === 0) return;
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          version: 1,
          activeId: activeWatchlistId,
          lists: watchlists,
        }),
      );
    } catch {
      // ignore storage errors
    }
  }, [activeWatchlistId, storageKey, watchlists]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRows((prev) =>
        prev.map((row) => {
          const drift = (Math.random() - 0.5) * 0.6;
          const nextPrice = Math.max(0.0001, row.lastPrice * (1 + drift / 100));
          const nextChange24h = clamp(row.change24h + drift * 0.2, -20, 20);
          const nextChange1h = clamp(row.change1h + drift * 0.6, -8, 8);
          const nextVolume = row.volume24hLive * (1 + Math.abs(drift) / 140);
          const move =
            nextPrice > row.lastPrice
              ? "up"
              : nextPrice < row.lastPrice
                ? "down"
                : "flat";
          return {
            ...row,
            lastPrice: Number(nextPrice.toFixed(4)),
            change24h: Number(nextChange24h.toFixed(2)),
            change1h: Number(nextChange1h.toFixed(2)),
            lastMove: move,
            volume24hLive: Number(nextVolume.toFixed(2)),
          };
        }),
      );
      setLastUpdatedAt(Date.now());
    }, 1800);
    return () => window.clearInterval(timer);
  }, []);

  const volumeThreshold = useMemo(() => {
    if (rows.length === 0) return 0;
    const volumes = rows.map((row) => row.volume24hLive).sort((a, b) => a - b);
    const median = volumes[Math.floor(volumes.length / 2)] ?? 0;
    return median * 1.1;
  }, [rows]);

  const visibleRows = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (filterMode === "watchlist" && !watchlistIds.has(row.id)) {
        return false;
      }
      if (filterMode === "gainers" && row.change24h <= 0) return false;
      if (filterMode === "losers" && row.change24h >= 0) return false;
      if (filterMode === "volume" && row.volume24hLive < volumeThreshold) {
        return false;
      }
      if (!normalized) return true;
      const haystack = `${row.label} ${row.tokenXLabel} ${row.tokenYLabel}`.toLowerCase();
      return haystack.includes(normalized);
    });

    const dir = sortDir === "asc" ? 1 : -1;
    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === "price") return (a.lastPrice - b.lastPrice) * dir;
      if (sortKey === "change1h") return (a.change1h - b.change1h) * dir;
      if (sortKey === "change") return (a.change24h - b.change24h) * dir;
      return (a.volume24hLive - b.volume24hLive) * dir;
    });

    return sorted;
  }, [
    filterMode,
    rows,
    search,
    sortDir,
    sortKey,
    volumeThreshold,
    watchlistIds,
  ]);

  const toggleWatch = (id: string) => {
    setWatchlists((prev) =>
      prev.map((list) => {
        if (list.id !== activeWatchlistId) return list;
        const nextItems = { ...list.items };
        if (nextItems[id]) {
          delete nextItems[id];
        } else {
          nextItems[id] = { tag: "Core", preset: "5% move" };
        }
        return { ...list, items: nextItems };
      }),
    );
  };

  const updateWatchItem = (id: string, patch: Partial<WatchlistItemMeta>) => {
    setWatchlists((prev) =>
      prev.map((list) => {
        if (list.id !== activeWatchlistId) return list;
        const current = list.items[id];
        if (!current) return list;
        return {
          ...list,
          items: {
            ...list.items,
            [id]: { ...current, ...patch },
          },
        };
      }),
    );
  };

  const handleAddWatchlist = () => {
    const name = window.prompt("Name the new watchlist", "New watchlist");
    if (!name) return;
    const id = `wl-${Date.now().toString(36)}`;
    setWatchlists((prev) => [...prev, { id, name, items: {} }]);
    setActiveWatchlistId(id);
  };

  const handleRenameWatchlist = () => {
    const current = activeWatchlist;
    if (!current) return;
    const name = window.prompt("Rename watchlist", current.name);
    if (!name) return;
    setWatchlists((prev) =>
      prev.map((list) => (list.id === current.id ? { ...list, name } : list)),
    );
  };

  const handleDeleteWatchlist = () => {
    if (watchlists.length <= 1) return;
    const current = activeWatchlist;
    if (!current) return;
    const confirmed = window.confirm(
      `Delete "${current.name}" watchlist? This cannot be undone.`,
    );
    if (!confirmed) return;
    setWatchlists((prev) => prev.filter((list) => list.id !== current.id));
    const next = watchlists.find((list) => list.id !== current.id);
    setActiveWatchlistId(next?.id ?? "");
  };

  return (
    <div className="price-board-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Live board</p>
          <h3>Price board</h3>
        </div>
        <div className="price-board-meta">
          <span className="pill-small">Live</span>
          <p className="muted small">
            Updated {new Date(lastUpdatedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </p>
        </div>
      </div>

      <div className="price-board-controls">
        <div className="price-board-filters" role="tablist">
          {([
            { id: "all", label: "All" },
            { id: "watchlist", label: "Watchlist" },
            { id: "gainers", label: "Gainers" },
            { id: "losers", label: "Losers" },
            { id: "volume", label: "High volume" },
          ] as const).map((item) => (
            <button
              key={item.id}
              className={`chip ${filterMode === item.id ? "is-favorite" : ""}`}
              onClick={() => setFilterMode(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="price-board-search">
          <span className="price-board-search-icon">Search</span>
          <input
            type="text"
            placeholder="Filter markets"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      <div className="price-board-watchlists">
        <div className="watchlist-select">
          <span className="muted small">Watchlist</span>
          <select
            value={activeWatchlistId}
            onChange={(event) => setActiveWatchlistId(event.target.value)}
          >
            {watchlists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </select>
        </div>
        <div className="watchlist-actions">
          <button className="tiny ghost" type="button" onClick={handleAddWatchlist}>
            New
          </button>
          <button
            className="tiny ghost"
            type="button"
            onClick={handleRenameWatchlist}
            disabled={!activeWatchlist}
          >
            Rename
          </button>
          <button
            className="tiny ghost"
            type="button"
            onClick={handleDeleteWatchlist}
            disabled={watchlists.length <= 1}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="price-board-table">
        <div className="price-board-row price-board-head">
          <span>Market</span>
          <button
            type="button"
            className={`price-board-head-button ${
              sortKey === "price" ? "is-active" : ""
            }`}
            onClick={() => {
              if (sortKey === "price") {
                setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
              } else {
                setSortKey("price");
                setSortDir("desc");
              }
            }}
          >
            Last {sortKey === "price" ? (sortDir === "asc" ? "↑" : "↓") : ""}
          </button>
          <button
            type="button"
            className={`price-board-head-button ${
              sortKey === "change1h" ? "is-active" : ""
            }`}
            onClick={() => {
              if (sortKey === "change1h") {
                setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
              } else {
                setSortKey("change1h");
                setSortDir("desc");
              }
            }}
          >
            1h {sortKey === "change1h" ? (sortDir === "asc" ? "↑" : "↓") : ""}
          </button>
          <button
            type="button"
            className={`price-board-head-button ${
              sortKey === "change" ? "is-active" : ""
            }`}
            onClick={() => {
              if (sortKey === "change") {
                setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
              } else {
                setSortKey("change");
                setSortDir("desc");
              }
            }}
          >
            24h {sortKey === "change" ? (sortDir === "asc" ? "↑" : "↓") : ""}
          </button>
          <button
            type="button"
            className={`price-board-head-button ${
              sortKey === "volume" ? "is-active" : ""
            }`}
            onClick={() => {
              if (sortKey === "volume") {
                setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
              } else {
                setSortKey("volume");
                setSortDir("desc");
              }
            }}
          >
            24h volume{" "}
            {sortKey === "volume" ? (sortDir === "asc" ? "↑" : "↓") : ""}
          </button>
          <span>Tag</span>
          <span>Alert preset</span>
          <span>Watch</span>
        </div>
        {visibleRows.map((row) => {
          const isWatched = watchlistIds.has(row.id);
          const itemMeta = watchlistItems[row.id];
          const change24hClass =
            row.change24h > 0
              ? "positive"
              : row.change24h < 0
                ? "negative"
                : "neutral";
          const change1hClass =
            row.change1h > 0
              ? "positive"
              : row.change1h < 0
                ? "negative"
                : "neutral";
          return (
            <div key={row.id} className="price-board-row">
              <div className="price-board-market">
                <strong>{row.tokenXLabel}</strong>
                <span className="muted small">/ {row.tokenYLabel}</span>
                <span className="muted small price-board-market-label">
                  {row.label}
                </span>
              </div>
              <span className={`price-board-price ${row.lastMove}`}>
                {formatNumber(row.lastPrice)}
              </span>
              <span className={`price-board-change ${change1hClass}`}>
                {formatSignedPercent(row.change1h)}
              </span>
              <span className={`price-board-change ${change24hClass}`}>
                {formatSignedPercent(row.change24h)}
              </span>
              <span className="price-board-volume">
                {formatCompactNumber(row.volume24hLive)}
              </span>
              {isWatched ? (
                <select
                  className="price-board-select"
                  value={itemMeta?.tag ?? tagOptions[0]}
                  onChange={(event) =>
                    updateWatchItem(row.id, { tag: event.target.value })
                  }
                >
                  {tagOptions.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="muted small">—</span>
              )}
              {isWatched ? (
                <select
                  className="price-board-select"
                  value={itemMeta?.preset ?? presetOptions[0]}
                  onChange={(event) =>
                    updateWatchItem(row.id, { preset: event.target.value })
                  }
                >
                  {presetOptions.map((preset) => (
                    <option key={preset} value={preset}>
                      {preset}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="muted small">—</span>
              )}
              <button
                className={`tiny ghost ${isWatched ? "is-active" : ""}`}
                type="button"
                onClick={() => toggleWatch(row.id)}
              >
                {isWatched ? "Watching" : "Watch"}
              </button>
            </div>
          );
        })}
      </div>

      {visibleRows.length === 0 && (
        <p className="muted small price-board-empty">
          No markets match this filter yet.
        </p>
      )}
    </div>
  );
};

export default PriceBoardPanel;
