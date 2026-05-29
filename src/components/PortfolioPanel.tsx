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
};

export default function PortfolioPanel(props: PortfolioPanelProps) {
  const {
    portfolioMetrics,
    portfolioTotals,
    poolShare,
    lpPosition,
    formatNumber,
    formatSignedPercent,
    walletConnected,
  } = props;

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
        <span className="chip ghost">
          {portfolioMetrics.has24h ? "24h window" : "Building 24h data"}
        </span>
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
        Estimated IL vs hold: {formatSignedPercent(portfolioMetrics.ilPercent)}.
      </p>
    </section>
  );
}
