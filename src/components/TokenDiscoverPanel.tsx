import { useEffect, useMemo, useState } from "react";
import { shortAddress } from "../lib/helper";

type TokenSeed = {
  id: string;
  label: string;
  verified: boolean;
};

type ValidationResult = { ok: true } | { ok: false; message: string };

type TokenDiscoverPanelProps = {
  resolvedStacksNetwork: string;
  seedTokens: TokenSeed[];
  selected: { xId: string; yId: string; xIsStx: boolean; yIsStx: boolean };
  metadataByPrincipal: Record<
    string,
    { name?: string; symbol?: string; loading?: boolean; error?: string }
  >;
  getTokenPrincipal: (id: string) => string;
  validateSip10Token: (tokenId: string) => Promise<ValidationResult>;
  onPickToken: (side: "x" | "y", token: { id: string; isStx: boolean }) => void;
};

type CustomToken = {
  id: string;
  label?: string;
  verified: boolean;
  addedAt: number;
};

const isSaneTokenId = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed === "STX") return true;
  return trimmed.includes("::") && trimmed.length >= 10;
};

export default function TokenDiscoverPanel(props: TokenDiscoverPanelProps) {
  const {
    resolvedStacksNetwork,
    seedTokens,
    selected,
    metadataByPrincipal,
    getTokenPrincipal,
    validateSip10Token,
    onPickToken,
  } = props;

  const favoritesKey = `token-favorites-${resolvedStacksNetwork}`;
  const watchlistKey = `token-watchlist-${resolvedStacksNetwork}`;
  const customKey = `token-custom-${resolvedStacksNetwork}`;

  const [filterMode, setFilterMode] = useState<
    "all" | "favorites" | "watchlist"
  >("all");
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [customTokens, setCustomTokens] = useState<CustomToken[]>([]);
  const [addTokenId, setAddTokenId] = useState("");
  const [addMessage, setAddMessage] = useState<string | null>(null);
  const [addPending, setAddPending] = useState(false);

  useEffect(() => {
    try {
      const rawFav = localStorage.getItem(favoritesKey);
      const rawWatch = localStorage.getItem(watchlistKey);
      const rawCustom = localStorage.getItem(customKey);

      const parsedFav = rawFav ? (JSON.parse(rawFav) as unknown) : [];
      const parsedWatch = rawWatch ? (JSON.parse(rawWatch) as unknown) : [];
      const parsedCustom = rawCustom ? (JSON.parse(rawCustom) as unknown) : [];

      setFavorites(Array.isArray(parsedFav) ? parsedFav.filter((v) => typeof v === "string") : []);
      setWatchlist(
        Array.isArray(parsedWatch)
          ? parsedWatch.filter((v) => typeof v === "string")
          : [],
      );
      setCustomTokens(
        Array.isArray(parsedCustom)
          ? parsedCustom
              .filter(
                (item): item is CustomToken =>
                  !!item &&
                  typeof item === "object" &&
                  typeof (item as CustomToken).id === "string" &&
                  typeof (item as CustomToken).verified === "boolean" &&
                  typeof (item as CustomToken).addedAt === "number",
              )
              .slice(0, 200)
          : [],
      );
    } catch {
      // ignore storage errors
    }
  }, [customKey, favoritesKey, watchlistKey]);

  useEffect(() => {
    try {
      localStorage.setItem(favoritesKey, JSON.stringify(favorites));
    } catch {
      // ignore storage errors
    }
  }, [favorites, favoritesKey]);

  useEffect(() => {
    try {
      localStorage.setItem(watchlistKey, JSON.stringify(watchlist));
    } catch {
      // ignore storage errors
    }
  }, [watchlist, watchlistKey]);

  useEffect(() => {
    try {
      localStorage.setItem(customKey, JSON.stringify(customTokens));
    } catch {
      // ignore storage errors
    }
  }, [customKey, customTokens]);

  const tokenRows = useMemo(() => {
    const seen = new Set<string>();
    const merged: Array<{
      id: string;
      label: string;
      verified: boolean;
      isStx: boolean;
      principal: string;
      symbol?: string;
      name?: string;
    }> = [];

    const push = (entry: { id: string; label: string; verified: boolean }) => {
      const id = entry.id.trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      const isStx = id === "STX";
      const principal = isStx ? "STX" : getTokenPrincipal(id);
      const meta = principal && principal !== "STX" ? metadataByPrincipal[principal] : undefined;
      const symbol = meta?.symbol;
      const name = meta?.name;
      const resolvedLabel = symbol
        ? `${symbol}${name ? ` — ${name}` : ""}`
        : entry.label || (isStx ? "STX" : shortAddress(principal || id));
      merged.push({
        id,
        label: resolvedLabel,
        verified: entry.verified,
        isStx,
        principal,
        symbol,
        name,
      });
    };

    push({ id: "STX", label: "STX", verified: true });
    seedTokens.forEach(push);
    customTokens
      .slice()
      .sort((a, b) => b.addedAt - a.addedAt)
      .forEach((token) =>
        push({
          id: token.id,
          label: token.label || token.id,
          verified: token.verified,
        }),
      );

    const q = search.trim().toLowerCase();
    const filtered = q
      ? merged.filter((row) => {
          const hay = `${row.id} ${row.principal} ${row.label}`.toLowerCase();
          return hay.includes(q);
        })
      : merged;

    const asSet = (list: string[]) => new Set(list);
    const favSet = asSet(favorites);
    const watchSet = asSet(watchlist);

    const withFilter =
      filterMode === "favorites"
        ? filtered.filter((row) => favSet.has(row.id))
        : filterMode === "watchlist"
          ? filtered.filter((row) => watchSet.has(row.id))
          : filtered;

    return withFilter.sort((a, b) => {
      const aFav = favSet.has(a.id) ? 1 : 0;
      const bFav = favSet.has(b.id) ? 1 : 0;
      if (aFav !== bFav) return bFav - aFav;
      const aVerified = a.verified ? 1 : 0;
      const bVerified = b.verified ? 1 : 0;
      if (aVerified !== bVerified) return bVerified - aVerified;
      return a.label.localeCompare(b.label);
    });
  }, [
    customTokens,
    favorites,
    filterMode,
    getTokenPrincipal,
    metadataByPrincipal,
    search,
    seedTokens,
    watchlist,
  ]);

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleWatchlist = (id: string) => {
    setWatchlist((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleAddCustom = async () => {
    const raw = addTokenId.trim();
    setAddMessage(null);
    if (!isSaneTokenId(raw) || raw === "STX") {
      setAddMessage("Enter a SIP-010 token id like `SP...contract::asset`.");
      return;
    }
    if (customTokens.some((t) => t.id === raw) || seedTokens.some((t) => t.id === raw)) {
      setAddMessage("Token already exists in your list.");
      return;
    }
    setAddPending(true);
    try {
      const res = await validateSip10Token(raw);
      if (!res.ok) {
        setAddMessage(res.message || "Token validation failed.");
        return;
      }
      setCustomTokens((prev) => [{ id: raw, verified: true, addedAt: Date.now() }, ...prev].slice(0, 200));
      setAddTokenId("");
      setAddMessage("Token added.");
    } finally {
      setAddPending(false);
    }
  };

  return (
    <div className="token-discover">
      <div className="token-discover-head">
        <div>
          <p className="muted small">Discover tokens</p>
          <strong>Search, favorite, and watch</strong>
        </div>
        <div className="token-discover-controls">
          <select
            className="token-discover-select"
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value as typeof filterMode)}
            aria-label="Token list filter"
          >
            <option value="all">All</option>
            <option value="favorites">Favorites</option>
            <option value="watchlist">Watchlist</option>
          </select>
          <input
            className="token-discover-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symbol, name, or contract…"
            aria-label="Search tokens"
          />
        </div>
      </div>

      <div className="token-discover-add">
        <input
          className="token-discover-add-input"
          value={addTokenId}
          onChange={(e) => setAddTokenId(e.target.value)}
          placeholder="Add custom token: SP…contract::asset"
        />
        <button className="tiny" type="button" onClick={() => void handleAddCustom()} disabled={addPending}>
          {addPending ? "Checking…" : "Add"}
        </button>
      </div>
      {addMessage && <p className="muted small">{addMessage}</p>}

      <div className="token-discover-list">
        {tokenRows.length === 0 ? (
          <p className="muted small">No tokens matched your filters.</p>
        ) : (
          tokenRows.map((token) => {
            const isFav = favorites.includes(token.id);
            const isWatched = watchlist.includes(token.id);
            const selectedX = selected.xIsStx ? token.isStx : token.id === selected.xId;
            const selectedY = selected.yIsStx ? token.isStx : token.id === selected.yId;
            const warning = token.isStx ? null : token.verified ? null : "Unverified token — double-check contract and asset id.";
            return (
              <div key={token.id} className="token-discover-row">
                <div className="token-discover-main">
                  <div className="token-discover-title">
                    <strong>{token.label}</strong>
                    <div className="token-discover-badges">
                      {token.verified ? (
                        <span className="chip ghost">Verified</span>
                      ) : (
                        <span className="chip warn">Unverified</span>
                      )}
                      {selectedX && <span className="chip">Selected X</span>}
                      {selectedY && <span className="chip">Selected Y</span>}
                    </div>
                  </div>
                  <p className="muted small">
                    {token.isStx ? "STX" : token.id}
                    {warning ? ` · ${warning}` : ""}
                  </p>
                </div>

                <div className="token-discover-actions">
                  <button
                    className={`tiny ghost ${isFav ? "is-active" : ""}`}
                    type="button"
                    onClick={() => toggleFavorite(token.id)}
                    aria-label={isFav ? "Unfavorite token" : "Favorite token"}
                  >
                    {isFav ? "★" : "☆"}
                  </button>
                  <button
                    className={`tiny ghost ${isWatched ? "is-active" : ""}`}
                    type="button"
                    onClick={() => toggleWatchlist(token.id)}
                    aria-label={isWatched ? "Remove from watchlist" : "Add to watchlist"}
                  >
                    {isWatched ? "Watch ✓" : "Watch"}
                  </button>
                  <button
                    className="tiny"
                    type="button"
                    onClick={() => onPickToken("x", { id: token.id, isStx: token.isStx })}
                  >
                    Set X
                  </button>
                  <button
                    className="tiny"
                    type="button"
                    onClick={() => onPickToken("y", { id: token.id, isStx: token.isStx })}
                  >
                    Set Y
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

