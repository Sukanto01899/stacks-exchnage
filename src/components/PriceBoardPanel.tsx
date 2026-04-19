import { useEffect, useMemo, useRef, useState } from "react";

type FilterMode = "all" | "watchlist" | "gainers" | "losers" | "volume";
type SortKey = "price" | "volume" | "change" | "change1h";
type AlertPresetType = "price" | "percent" | "volume";
type AlertPreset = {
  id: string;
  name: string;
  type: AlertPresetType;
  threshold: number;
  window: number;
};
type WatchlistItemMeta = { tag: string; presetId: string };
type Watchlist = {
  id: string;
  name: string;
  items: Record<string, WatchlistItemMeta>;
};
type StoredUiState = {
  filterMode?: FilterMode;
  sortKey?: SortKey;
  sortDir?: "asc" | "desc";
};

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
  history: number[];
  rsi: number | null;
  maFast: number | null;
  maSlow: number | null;
  signal: { rsi: "overbought" | "oversold" | "neutral"; maCross: "bull" | "bear" | null };
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
    const history = Array.from({ length: 18 }, (_, idx) =>
      Number((lastPrice * (1 + (idx - 9) * 0.002)).toFixed(4)),
    );
    return {
      ...market,
      lastPrice,
      change24h,
      change1h,
      lastMove: "flat",
      volume24hLive: market.volume24h,
      history,
      rsi: null,
      maFast: null,
      maSlow: null,
      signal: { rsi: "neutral", maCross: null },
    };
  });
};

const calcMA = (values: number[], period: number) => {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  const sum = slice.reduce((acc, value) => acc + value, 0);
  return sum / slice.length;
};

const calcRSI = (values: number[], period: number) => {
  if (values.length < period + 1) return null;
  const changes = values.slice(-period - 1).map((value, idx, arr) => {
    if (idx === 0) return 0;
    return value - arr[idx - 1];
  });
  const gains = changes.map((delta) => Math.max(0, delta));
  const losses = changes.map((delta) => Math.max(0, -delta));
  const avgGain = gains.reduce((a, b) => a + b, 0) / period;
  const avgLoss = losses.reduce((a, b) => a + b, 0) / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
};

const DEFAULT_PRESETS: AlertPreset[] = [
  { id: "p-5", name: "5% move", type: "percent", threshold: 5, window: 60 },
  { id: "p-10", name: "10% move", type: "percent", threshold: 10, window: 60 },
  { id: "p-break", name: "Breakout", type: "price", threshold: 0, window: 240 },
  {
    id: "p-vol",
    name: "Volume spike",
    type: "volume",
    threshold: 150,
    window: 60,
  },
];

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
  const [presets, setPresets] = useState<AlertPreset[]>(DEFAULT_PRESETS);
  const [rows, setRows] = useState<MarketRow[]>(() =>
    buildInitialRows(markets),
  );
  const [lastUpdatedAt, setLastUpdatedAt] = useState(Date.now());
  const [sortKey, setSortKey] = useState<SortKey>("volume");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [modal, setModal] = useState<
    | { type: "create" }
    | { type: "rename"; id: string; name: string }
    | { type: "delete"; id: string; name: string }
    | null
  >(null);
  const [modalName, setModalName] = useState("");
  const modalRef = useRef<HTMLDivElement | null>(null);
  const modalTitleId = "watchlist-modal-title";
  const tagOptions = [
    "Core",
    "Momentum",
    "Swing",
    "Long-term",
    "High risk",
    "Arb",
    "Watch",
  ];
  const resolvePresetId = (value: string | undefined, list: AlertPreset[]) => {
    if (!value) return list[0]?.id ?? "p-5";
    const byId = list.find((preset) => preset.id === value);
    if (byId) return byId.id;
    const byName = list.find(
      (preset) => preset.name.toLowerCase() === value.toLowerCase(),
    );
    return byName?.id ?? list[0]?.id ?? "p-5";
  };

  const activeWatchlist = useMemo(
    () => watchlists.find((list) => list.id === activeWatchlistId) ?? null,
    [activeWatchlistId, watchlists],
  );
  const watchlistItems = activeWatchlist?.items ?? {};
  const watchlistIds = useMemo(
    () => new Set(Object.keys(watchlistItems)),
    [watchlistItems],
  );

  const isDefaultView =
    filterMode === "all" &&
    search.trim() === "" &&
    sortKey === "volume" &&
    sortDir === "desc";

  const resetView = () => {
    setFilterMode("all");
    setSearch("");
    setSortKey("volume");
    setSortDir("desc");
  };

  const clearActiveWatchlist = () => {
    if (!activeWatchlist) return;
    if (watchlistIds.size === 0) return;
    const ok = window.confirm(
      `Clear all ${watchlistIds.size} watched markets from "${activeWatchlist.name}"?`,
    );
    if (!ok) return;
    setWatchlists((prev) =>
      prev.map((list) => (list.id === activeWatchlistId ? { ...list, items: {} } : list)),
    );
  };

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
        setPresets(DEFAULT_PRESETS);
        return;
      }
      const parsed = JSON.parse(stored) as
        | {
            version: number;
            activeId: string;
            lists: Watchlist[];
            presets?: AlertPreset[];
          }
        | string[];

      if (Array.isArray(parsed)) {
        const migrated: Watchlist[] = [
          {
            id: "wl-main",
            name: "Main",
            items: parsed.reduce<Record<string, WatchlistItemMeta>>(
              (acc, id) => {
                if (typeof id === "string") {
                  acc[id] = { tag: "Core", presetId: "p-5" };
                }
                return acc;
              },
              {},
            ),
          },
        ];
        setWatchlists(migrated);
        setActiveWatchlistId("wl-main");
        setPresets(DEFAULT_PRESETS);
        return;
      }

      if (parsed?.lists && Array.isArray(parsed.lists)) {
        const presetList =
          parsed.presets && Array.isArray(parsed.presets)
            ? parsed.presets
            : DEFAULT_PRESETS;
        const sanitized = parsed.lists
          .filter((list) => list && typeof list.id === "string")
          .map((list) => ({
            id: list.id,
            name: typeof list.name === "string" ? list.name : "Watchlist",
            items:
              list.items && typeof list.items === "object"
                ? Object.fromEntries(
                    Object.entries(list.items).map(([key, meta]) => {
                      const item = meta as Partial<WatchlistItemMeta> & {
                        preset?: string;
                      };
                      return [
                        key,
                        {
                          tag:
                            typeof item.tag === "string" ? item.tag : "Core",
                          presetId: resolvePresetId(
                            typeof item.presetId === "string"
                              ? item.presetId
                              : typeof item.preset === "string"
                                ? item.preset
                                : undefined,
                            presetList,
                          ),
                        },
                      ];
                    }),
                  )
                : {},
          }));
        setWatchlists(sanitized);
        setActiveWatchlistId(
          typeof parsed.activeId === "string" && parsed.activeId
            ? parsed.activeId
            : sanitized[0]?.id ?? "",
        );
        if (parsed.presets && Array.isArray(parsed.presets)) {
          setPresets(
            parsed.presets.filter(
              (preset) =>
                preset &&
                typeof preset.id === "string" &&
                typeof preset.name === "string",
            ).map((preset) => ({
              id: preset.id,
              name: preset.name,
              type:
                preset.type === "price" ||
                preset.type === "percent" ||
                preset.type === "volume"
                  ? preset.type
                  : "percent",
              threshold:
                typeof preset.threshold === "number" ? preset.threshold : 5,
              window: typeof preset.window === "number" ? preset.window : 60,
            })),
          );
        } else {
          setPresets(DEFAULT_PRESETS);
        }

        const uiRaw = (parsed as { ui?: unknown }).ui;
        if (uiRaw && typeof uiRaw === "object") {
          const ui = uiRaw as StoredUiState;
          if (
            ui.filterMode === "all" ||
            ui.filterMode === "watchlist" ||
            ui.filterMode === "gainers" ||
            ui.filterMode === "losers" ||
            ui.filterMode === "volume"
          ) {
            setFilterMode(ui.filterMode);
          }
          if (
            ui.sortKey === "price" ||
            ui.sortKey === "volume" ||
            ui.sortKey === "change" ||
            ui.sortKey === "change1h"
          ) {
            setSortKey(ui.sortKey);
          }
          if (ui.sortDir === "asc" || ui.sortDir === "desc") {
            setSortDir(ui.sortDir);
          }
        }
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
          version: 3,
          activeId: activeWatchlistId,
          lists: watchlists,
          presets,
          ui: { filterMode, sortKey, sortDir },
        }),
      );
    } catch {
      // ignore storage errors
    }
  }, [
    activeWatchlistId,
    filterMode,
    presets,
    sortDir,
    sortKey,
    storageKey,
    watchlists,
  ]);

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
          const nextHistory = [...row.history, Number(nextPrice.toFixed(4))].slice(
            -32,
          );
          const maFast = calcMA(nextHistory, 5);
          const maSlow = calcMA(nextHistory, 12);
          const prevFast = calcMA(nextHistory.slice(0, -1), 5);
          const prevSlow = calcMA(nextHistory.slice(0, -1), 12);
          let maCross: "bull" | "bear" | null = null;
          if (
            prevFast !== null &&
            prevSlow !== null &&
            maFast !== null &&
            maSlow !== null
          ) {
            if (prevFast <= prevSlow && maFast > maSlow) maCross = "bull";
            if (prevFast >= prevSlow && maFast < maSlow) maCross = "bear";
          }
          const rsi = calcRSI(nextHistory, 14);
          const rsiSignal =
            rsi !== null && rsi >= 70
              ? "overbought"
              : rsi !== null && rsi <= 30
                ? "oversold"
                : "neutral";
          return {
            ...row,
            lastPrice: Number(nextPrice.toFixed(4)),
            change24h: Number(nextChange24h.toFixed(2)),
            change1h: Number(nextChange1h.toFixed(2)),
            lastMove: move,
            volume24hLive: Number(nextVolume.toFixed(2)),
            history: nextHistory,
            rsi,
            maFast,
            maSlow,
            signal: { rsi: rsiSignal, maCross },
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
          nextItems[id] = {
            tag: "Core",
            presetId: presets[0]?.id ?? "p-5",
          };
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

  const openCreateModal = () => {
    setModal({ type: "create" });
    setModalName("New watchlist");
  };

  const openRenameModal = () => {
    const current = activeWatchlist;
    if (!current) return;
    setModal({ type: "rename", id: current.id, name: current.name });
    setModalName(current.name);
  };

  const openDeleteModal = () => {
    const current = activeWatchlist;
    if (!current || watchlists.length <= 1) return;
    setModal({ type: "delete", id: current.id, name: current.name });
  };

  const closeModal = () => {
    setModal(null);
  };

  const handleCreateSubmit = () => {
    const name = modalName.trim();
    if (!name) return;
    const id = `wl-${Date.now().toString(36)}`;
    setWatchlists((prev) => [...prev, { id, name, items: {} }]);
    setActiveWatchlistId(id);
    closeModal();
  };

  const handleRenameSubmit = () => {
    if (!modal || modal.type !== "rename") return;
    const name = modalName.trim();
    if (!name) return;
    setWatchlists((prev) =>
      prev.map((list) => (list.id === modal.id ? { ...list, name } : list)),
    );
    closeModal();
  };

  const handleDeleteSubmit = () => {
    if (!modal || modal.type !== "delete") return;
    if (watchlists.length <= 1) return;
    setWatchlists((prev) => prev.filter((list) => list.id !== modal.id));
    const next = watchlists.find((list) => list.id !== modal.id);
    setActiveWatchlistId(next?.id ?? "");
    closeModal();
  };

  const presetById = useMemo(() => {
    const map = new Map<string, AlertPreset>();
    presets.forEach((preset) => map.set(preset.id, preset));
    return map;
  }, [presets]);

  const updatePreset = (id: string, patch: Partial<AlertPreset>) => {
    setPresets((prev) =>
      prev.map((preset) => (preset.id === id ? { ...preset, ...patch } : preset)),
    );
  };

  const handleAddPreset = () => {
    const id = `p-${Date.now().toString(36)}`;
    setPresets((prev) => [
      ...prev,
      { id, name: "New preset", type: "percent", threshold: 5, window: 60 },
    ]);
  };

  const handleRemovePreset = (id: string) => {
    if (presets.length <= 1) return;
    const fallbackId = presets.find((preset) => preset.id !== id)?.id ?? id;
    setPresets((prev) => prev.filter((preset) => preset.id !== id));
    setWatchlists((prev) =>
      prev.map((list) => ({
        ...list,
        items: Object.fromEntries(
          Object.entries(list.items).map(([key, meta]) => [
            key,
            meta.presetId === id ? { ...meta, presetId: fallbackId } : meta,
          ]),
        ),
      })),
    );
  };

  useEffect(() => {
    if (!modal) return;
    const root = modalRef.current;
    if (!root) return;
    const focusableSelectors = [
      "button:not([disabled])",
      "a[href]",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ];
    const getFocusable = () =>
      Array.from(
        root.querySelectorAll<HTMLElement>(focusableSelectors.join(",")),
      ).filter((el) => !el.hasAttribute("disabled"));

    const focusables = getFocusable();
    const preferred =
      root.querySelector<HTMLElement>("input, button.primary") ?? focusables[0];
    preferred?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
        return;
      }

      if (event.key === "Enter") {
        if (event.shiftKey) {
          event.preventDefault();
          closeModal();
          return;
        }
        if (modal.type === "delete") {
          event.preventDefault();
          handleDeleteSubmit();
        } else if (
          document.activeElement instanceof HTMLInputElement ||
          document.activeElement instanceof HTMLButtonElement
        ) {
          event.preventDefault();
          modal.type === "create" ? handleCreateSubmit() : handleRenameSubmit();
        }
      }

      if (event.key === "Tab") {
        const items = getFocusable();
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        const current = document.activeElement as HTMLElement | null;
        if (event.shiftKey && current === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && current === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [modal, handleCreateSubmit, handleDeleteSubmit, handleRenameSubmit]);

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
            onKeyDown={(event) => {
              if (event.key === "Escape" && search.trim()) {
                event.preventDefault();
                setSearch("");
              }
            }}
          />
          <button
            className="tiny ghost"
            type="button"
            onClick={resetView}
            disabled={isDefaultView}
            title="Reset filter, sort, and search"
          >
            Reset view
          </button>
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
          <button className="tiny ghost" type="button" onClick={openCreateModal}>
            New
          </button>
          <button
            className="tiny ghost"
            type="button"
            onClick={openRenameModal}
            disabled={!activeWatchlist}
          >
            Rename
          </button>
          <button
            className="tiny ghost"
            type="button"
            onClick={clearActiveWatchlist}
            disabled={!activeWatchlist || watchlistIds.size === 0}
            title="Remove all watched markets from the selected watchlist"
          >
            Clear
          </button>
          <button
            className="tiny ghost"
            type="button"
            onClick={openDeleteModal}
            disabled={watchlists.length <= 1}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="alert-builder">
        <div className="alert-builder-head">
          <div>
            <p className="eyebrow">Alert builder</p>
            <h3>Presets</h3>
          </div>
          <button className="tiny ghost" type="button" onClick={handleAddPreset}>
            Add preset
          </button>
        </div>
        <div className="alert-builder-grid">
          {presets.map((preset) => (
            <div key={preset.id} className="alert-card">
              <div className="alert-card-head">
                <input
                  className="alert-card-name"
                  value={preset.name}
                  onChange={(event) =>
                    updatePreset(preset.id, { name: event.target.value })
                  }
                />
                <button
                  className="tiny ghost"
                  type="button"
                  onClick={() => handleRemovePreset(preset.id)}
                  disabled={presets.length <= 1}
                >
                  Remove
                </button>
              </div>
              <div className="alert-card-row">
                <label>Type</label>
                <select
                  value={preset.type}
                  onChange={(event) =>
                    updatePreset(preset.id, {
                      type: event.target.value as AlertPresetType,
                    })
                  }
                >
                  <option value="price">Price</option>
                  <option value="percent">% Move</option>
                  <option value="volume">Volume</option>
                </select>
              </div>
              <div className="alert-card-row">
                <label>Threshold</label>
                <input
                  type="number"
                  value={preset.threshold}
                  onChange={(event) =>
                    updatePreset(preset.id, {
                      threshold: Number(event.target.value),
                    })
                  }
                />
              </div>
              <div className="alert-card-row">
                <label>Window (min)</label>
                <input
                  type="number"
                  value={preset.window}
                  onChange={(event) =>
                    updatePreset(preset.id, {
                      window: Number(event.target.value),
                    })
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="alert-builder preview">
        <div className="alert-builder-head">
          <div>
            <p className="eyebrow">Live watchlist</p>
            <h3>Alert preview</h3>
          </div>
        </div>
        <div className="alert-preview-list">
          {Object.entries(watchlistItems).length === 0 ? (
            <p className="muted small">Add markets to see alert routing.</p>
          ) : (
            visibleRows
              .filter((row) => watchlistItems[row.id])
              .map((row) => {
                const meta = watchlistItems[row.id];
                const preset = presetById.get(meta.presetId);
                const label = preset
                  ? `${preset.name} · ${preset.type} ${preset.threshold} ${
                      preset.type === "percent" ? "%" : ""
                    } / ${preset.window}m`
                  : "Preset not found";
                return (
                  <div key={`preview-${row.id}`} className="alert-preview-item">
                    <div>
                      <strong>
                        {row.tokenXLabel}/{row.tokenYLabel}
                      </strong>
                      <p className="muted small">{label}</p>
                    </div>
                    <span className="pill-small">{meta.tag}</span>
                  </div>
                );
              })
          )}
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
          <span>Signals</span>
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
                  value={itemMeta?.presetId ?? presets[0]?.id ?? "p-5"}
                  onChange={(event) =>
                    updateWatchItem(row.id, { presetId: event.target.value })
                  }
                >
                  {presets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="muted small">—</span>
              )}
              <div className="signal-badges">
                {row.signal.rsi === "overbought" && (
                  <span className="signal-badge warn">RSI OB</span>
                )}
                {row.signal.rsi === "oversold" && (
                  <span className="signal-badge ok">RSI OS</span>
                )}
                {row.signal.maCross === "bull" && (
                  <span className="signal-badge ok">MA Bull</span>
                )}
                {row.signal.maCross === "bear" && (
                  <span className="signal-badge warn">MA Bear</span>
                )}
                {row.signal.rsi === "neutral" && !row.signal.maCross && (
                  <span className="signal-badge neutral">—</span>
                )}
              </div>
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
          {filterMode === "watchlist" && watchlistIds.size === 0
            ? 'Your watchlist is empty. Click "Watch" on a market to add it.'
            : search.trim()
              ? "No markets match your search."
              : "No markets match this filter yet."}
        </p>
      )}

      {modal && (
        <div
          className="watchlist-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeModal();
            }
          }}
        >
          <div
            className="watchlist-modal"
            ref={modalRef}
            aria-labelledby={modalTitleId}
          >
            <div className="watchlist-modal-head">
              <div>
                <p className="eyebrow">Watchlists</p>
                <h3 id={modalTitleId}>
                  {modal.type === "create"
                    ? "Create watchlist"
                    : modal.type === "rename"
                      ? "Rename watchlist"
                      : "Delete watchlist"}
                </h3>
              </div>
              <button className="icon-button" type="button" onClick={closeModal}>
                x
              </button>
            </div>

            {modal.type === "delete" ? (
              <div className="watchlist-modal-body">
                <p className="muted">
                  Delete <strong>{modal.name}</strong>? This cannot be undone.
                </p>
                <div className="watchlist-modal-actions">
                  <button className="secondary" type="button" onClick={closeModal}>
                    Cancel
                  </button>
                  <button className="primary" type="button" onClick={handleDeleteSubmit}>
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <div className="watchlist-modal-body">
                <label>Name</label>
                <input
                  className="watchlist-modal-input"
                  type="text"
                  value={modalName}
                  onChange={(event) => setModalName(event.target.value)}
                  placeholder="e.g. Momentum picks"
                />
                <div className="watchlist-modal-actions">
                  <button className="secondary" type="button" onClick={closeModal}>
                    Cancel
                  </button>
                  <button
                    className="primary"
                    type="button"
                    onClick={
                      modal.type === "create"
                        ? handleCreateSubmit
                        : handleRenameSubmit
                    }
                  >
                    {modal.type === "create" ? "Create" : "Save"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PriceBoardPanel;
