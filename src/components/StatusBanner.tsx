import { useEffect, useMemo, useState } from "react";

type StatusBannerVariant = "info" | "warning" | "error" | "success";

type StatusBannerConfig = {
  enabled?: boolean;
  id?: string;
  variant?: StatusBannerVariant;
  message?: string;
  linkUrl?: string;
  linkText?: string;
  dismissible?: boolean;
};

function safeStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage errors
  }
}

function normalizeVariant(value: unknown): StatusBannerVariant {
  if (value === "warning" || value === "error" || value === "success") return value;
  return "info";
}

export default function StatusBanner() {
  const [config, setConfig] = useState<StatusBannerConfig | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/status.json", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as StatusBannerConfig;
        if (cancelled) return;
        setConfig(data);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const bannerId = useMemo(() => {
    if (!config) return null;
    if (typeof config.id === "string" && config.id.trim()) return config.id.trim();
    if (typeof config.message === "string" && config.message.trim()) return config.message.trim();
    return null;
  }, [config]);

  const dismissedKey = useMemo(() => {
    if (!bannerId) return null;
    return `clardex_status_banner_dismissed:${bannerId}`;
  }, [bannerId]);

  const enabled = Boolean(config?.enabled);
  const message = typeof config?.message === "string" ? config.message.trim() : "";
  const variant = normalizeVariant(config?.variant);
  const dismissible = config?.dismissible !== false;
  const linkUrl = typeof config?.linkUrl === "string" ? config.linkUrl.trim() : "";
  const linkText =
    typeof config?.linkText === "string" && config.linkText.trim()
      ? config.linkText.trim()
      : "Details";

  const dismissed = useMemo(() => {
    if (!dismissedKey) return false;
    return safeStorageGet(dismissedKey) === "1";
  }, [dismissedKey]);

  if (!enabled || !message || dismissed || hidden) return null;

  return (
    <div className={`status-banner status-banner--${variant}`} role="status">
      <div className="status-banner__left">
        <span className="status-banner__message">{message}</span>
        {linkUrl ? (
          <a
            className="status-banner__link"
            href={linkUrl}
            target="_blank"
            rel="noreferrer"
          >
            {linkText}
          </a>
        ) : null}
      </div>
      {dismissible ? (
        <button
          className="status-banner__dismiss"
          type="button"
          onClick={() => {
            if (dismissedKey) safeStorageSet(dismissedKey, "1");
            setHidden(true);
          }}
          aria-label="Dismiss status banner"
          title="Dismiss"
        >
          Dismiss
        </button>
      ) : null}
    </div>
  );
}

