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

export default function CommandPaletteModal(props: CommandPaletteModalProps) {
  const { open, query, setQuery, items, onClose } = props;
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const hay = `${item.label} ${item.keywords || ""} ${item.hint || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

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
        setActiveIndex((prev) => Math.min(prev + 1, Math.max(0, filtered.length - 1)));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const item = filtered[activeIndex];
        if (!item) return;
        item.run();
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, filtered, onClose, open]);

  if (!open) return null;

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
          <button
            className="icon-button"
            type="button"
            aria-label="Close"
            onClick={onClose}
          >
            x
          </button>
        </div>

        <input
          ref={inputRef}
          className="palette-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type to search... (Esc to close)"
          aria-label="Search commands"
        />

        <div className="palette-list" role="listbox" aria-label="Commands">
          {filtered.length === 0 ? (
            <p className="muted small">No commands matched.</p>
          ) : (
            filtered.map((item, index) => (
              <button
                key={item.id}
                className={`palette-item ${index === activeIndex ? "is-active" : ""}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => item.run()}
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
