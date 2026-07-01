import { useEffect, useState } from "react";

type PortfolioMetrics = {
  has24h: boolean;
  pnl24X: number | null;
  pnl24Y: number | null;
  ilPercent: number | null;
};

type PortfolioTotals = {
  totalX: number;
  totalY: number;
  valueInX: number;
  valueInY: number;
};

type LpPosition = {
  x: number;
  y: number;
};

type PortfolioPanelProps = {
  portfolioMetrics: PortfolioMetrics;
  portfolioTotals: PortfolioTotals;
  poolShare: number;
  lpPosition: LpPosition;
  formatNumber: (value: number) => string;
  formatSignedPercent: (value: number | null) => string;
  walletConnected: boolean;
  usdEnabled?: boolean;
  onToggleUsd?: () => void;
  stxUsdPriceInput?: string;
  onStxUsdPriceChange?: (value: string) => void;
  portfolioUsd?: number | null;
  usdAvailable?: boolean;
};

const formatUsd = (value: number) =>
  `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function PortfolioPanel(props: PortfolioPanelProps) {
  const {
    portfolioMetrics,
    portfolioTotals,
    poolShare,
    lpPosition,
    formatNumber,
    formatSignedPercent,
    walletConnected,
    usdEnabled = false,
    onToggleUsd,
    stxUsdPriceInput = "",
    onStxUsdPriceChange,
    portfolioUsd = null,
    usdAvailable = false,
  } = props;

  const [positionCopied, setPositionCopied] = useState(false);

  useEffect(() => {
    if (!positionCopied) return;
    const timer = window.setTimeout(() => setPositionCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [positionCopied]);

  const handleCopyPositionCsv = async () => {
    const header = "pool_share_pct,lp_x,lp_y,value_x,value_y,holdings_x,holdings_y,pnl_24h_x_pct,pnl_24h_y_pct,il_pct";
    const row = [
      (poolShare * 100).toFixed(4),
      lpPosition.x,
      lpPosition.y,
      portfolioTotals.valueInX,
      portfolioTotals.valueInY,
      portfolioTotals.totalX,
      portfolioTotals.totalY,
      portfolioMetrics.pnl24X ?? "",
      portfolioMetrics.pnl24Y ?? "",
      portfolioMetrics.ilPercent ?? "",
    ].join(",");
    try {
      await navigator.clipboard.writeText(`${header}\n${row}`);
      setPositionCopied(true);
    } catch {}
  };

  const isEmpty =
    walletConnected &&
    portfolioTotals.totalX === 0 &&
    portfolioTotals.totalY === 0 &&
    poolShare === 0;

  if (!walletConnected) {
    return (
      <section className="portfolio-panel">
        <div className="portfolio-head">
          <div>
            <p className="eyebrow">Portfolio</p>
            <h3>PnL & Position</h3>
          </div>
        </div>
        <div className="empty-state">
          <svg className="empty-state-icon" width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <rect x="8" y="16" width="24" height="16" rx="3" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M14 24h4m6 0h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M8 22h24" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M15 16v-3a5 5 0 0 1 10 0v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <p className="empty-state-title">No wallet connected</p>
          <p className="empty-state-sub">Connect your wallet to track your holdings, PnL, and LP position.</p>
        </div>
      </section>
    );
  }

  if (isEmpty) {
    return (
      <section className="portfolio-panel">
        <div className="portfolio-head">
          <div>
            <p className="eyebrow">Portfolio</p>
            <h3>PnL & Position</h3>
          </div>
        </div>
        <div className="empty-state">
          <svg className="empty-state-icon" width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <path d="M8 28l8-8 5 5 5-7 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <rect x="8" y="8" width="24" height="24" rx="3" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
          <p className="empty-state-title">Nothing here yet</p>
          <p className="empty-state-sub">Make a swap or add liquidity to start tracking your portfolio.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="portfolio-panel">
      <div className="portfolio-head">
        <div>
          <p className="eyebrow">Portfolio</p>
          <h3>PnL & Position</h3>
        </div>
        <div className="portfolio-head-actions">
          {onToggleUsd && (
            <button
              type="button"
              className={`chip ghost${usdEnabled ? " is-active" : ""}`}
              onClick={onToggleUsd}
              title="Show rough USD estimates using your STX price"
            >
              {usdEnabled ? "USD on" : "USD"}
            </button>
          )}
          {usdEnabled && usdAvailable && onStxUsdPriceChange && (
            <label className="usd-price-field" title="Your STX price in USD">
              <span className="muted small">STX $</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={stxUsdPriceInput}
                onChange={(e) => onStxUsdPriceChange(e.target.value)}
                aria-label="STX price in USD"
              />
            </label>
          )}
          <span className="chip ghost">
            {portfolioMetrics.has24h ? "24h window" : "Building 24h data"}
          </span>
          <button
            type="button"
            className="tiny ghost"
            onClick={() => void handleCopyPositionCsv()}
            title="Copy position as CSV"
          >
            {positionCopied ? "Copied!" : "Copy CSV"}
          </button>
        </div>
      </div>
      <div className="portfolio-grid">
        <div>
          <p className="muted small">Holdings</p>
          <strong>
            {formatNumber(portfolioTotals.totalX)} X /{" "}
            {formatNumber(portfolioTotals.totalY)} Y
          </strong>
        </div>
        <div>
          <p className="muted small">Total value</p>
          <strong>{formatNumber(portfolioTotals.valueInX)} X</strong>
          <p className="muted small">
            {formatNumber(portfolioTotals.valueInY)} Y
          </p>
          {usdEnabled && (
            <p className="muted small portfolio-usd">
              {portfolioUsd !== null
                ? `≈ ${formatUsd(portfolioUsd)}`
                : "≈ $— (needs an STX pair)"}
            </p>
          )}
        </div>
        <div>
          <p className="muted small">24h PnL</p>
          <strong>{formatSignedPercent(portfolioMetrics.pnl24X)} in X</strong>
          <p className="muted small">
            {formatSignedPercent(portfolioMetrics.pnl24Y)} in Y
          </p>
        </div>
        <div>
          <p className="muted small">LP position</p>
          <strong>{(poolShare * 100).toFixed(2)}% share</strong>
          <p className="muted small">
            {formatNumber(lpPosition.x)} X / {formatNumber(lpPosition.y)} Y
          </p>
        </div>
      </div>
      <p
        className={`note ${portfolioMetrics.ilPercent !== null ? "subtle" : ""}`}
      >
        Estimated IL vs hold:{" "}
        <span
          className={
            portfolioMetrics.ilPercent === null
              ? ""
              : portfolioMetrics.ilPercent > 0
                ? "il-value il-value--positive"
                : portfolioMetrics.ilPercent < 0
                  ? "il-value il-value--negative"
                  : "il-value"
          }
        >
          {formatSignedPercent(portfolioMetrics.ilPercent)}
        </span>.
      </p>
    </section>
  );
}
