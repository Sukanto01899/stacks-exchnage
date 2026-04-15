import { useEffect, useMemo, useRef, useState } from "react";

export type CommandItem = {
  id: string;
  label: string;
  hint?: string;
  keywords?: string;
  hotkey?: string;
  run: () => void;
};

type CommandPaletteModalProps = {
  open: boolean;
  query: string;
  setQuery: (value: string) => void;
  items: CommandItem[];
  onClose: () => void;
};

type RecentCommand = {
  id: string;
  ts: number;
};

const RECENT_COMMANDS_KEY = "clardex_recent_commands_v1";
const RECENT_COMMANDS_LIMIT = 8;

function loadRecentCommands(): RecentCommand[] {
  try {
    const raw = localStorage.getItem(RECENT_COMMANDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is RecentCommand => {
        if (!x || typeof x !== "object") return false;
        const maybe = x as { id?: unknown; ts?: unknown };
        return typeof maybe.id === "string" && typeof maybe.ts === "number";
      })
      .sort((a, b) => b.ts - a.ts)
      .slice(0, RECENT_COMMANDS_LIMIT);
  } catch {
    return [];
  }
}

function saveRecentCommands(next: RecentCommand[]) {
  try {
    localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
}

export default function CommandPaletteModal(props: CommandPaletteModalProps) {
  const { open, query, setQuery, items, onClose } = props;
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [recent, setRecent] = useState<RecentCommand[]>([]);

  useEffect(() => {
    if (!open) return;
    setRecent(loadRecentCommands());
  }, [open]);

  const displayed = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      return items.filter((item) => {
        const hay = `${item.label} ${item.keywords || ""} ${item.hint || ""}`.toLowerCase();
        return hay.includes(q);
      });
    }

    if (recent.length === 0) return items;
    const recentItems = recent
      .map((r) => items.find((i) => i.id === r.id))
      .filter((i): i is CommandItem => Boolean(i));
    const recentIds = new Set(recentItems.map((i) => i.id));
    const rest = items.filter((i) => !recentIds.has(i.id));
    return [...recentItems, ...rest];
  }, [items, query, recent]);

  const handleRun = (item: CommandItem) => {
    const ts = new Date().getTime();
    setRecent((prev) => {
      const next: RecentCommand[] = [
        { id: item.id, ts },
        ...prev.filter((r) => r.id !== item.id),
      ].slice(0, RECENT_COMMANDS_LIMIT);
      saveRecentCommands(next);
      return next;
    });
    item.run();
  };

  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, Math.max(0, displayed.length - 1)));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const item = displayed[activeIndex];
        if (!item) return;
        handleRun(item);
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, displayed, onClose, open]);

  if (!open) return null;

  const hasRecent = recent.length > 0 && query.trim().length === 0;

  return (
    <div
      className="palette-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <div className="palette-head">
          <div>
            <p className="eyebrow">Command palette</p>
            <h2>Quick actions</h2>
          </div>
          <div className="palette-actions">
            {recent.length > 0 ? (
              <button
                className="chip ghost"
                type="button"
                onClick={() => {
                  setRecent([]);
                  saveRecentCommands([]);
                }}
                title="Clear recent commands"
              >
                Clear recent
              </button>
            ) : null}
            <button
              className="icon-button"
              type="button"
              aria-label="Close"
              onClick={onClose}
            >
              x
            </button>
          </div>
        </div>

        <input
          ref={inputRef}
          className="palette-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type to search... (Esc to close)"
          aria-label="Search commands"
        />

        {hasRecent ? (
          <p className="muted small palette-recent-hint">
            Recent commands are shown first.
          </p>
        ) : null}

        <div className="palette-list" role="listbox" aria-label="Commands">
          {displayed.length === 0 ? (
            <p className="muted small">No commands matched.</p>
          ) : (
            displayed.map((item, index) => (
              <button
                key={item.id}
                className={`palette-item ${index === activeIndex ? "is-active" : ""}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => handleRun(item)}
              >
                <span className="palette-label">
                  <strong>{item.label}</strong>
                  {item.hint ? <span className="muted small">{item.hint}</span> : null}
                </span>
                {item.hotkey ? <span className="chip ghost">{item.hotkey}</span> : null}
              </button>
            ))
          )}
        </div>

        <p className="muted small palette-foot">
          Tip: press Ctrl/Cmd+K anywhere.
        </p>
      </div>
    </div>
  );
}
