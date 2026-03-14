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
};

export default function PortfolioPanel(props: PortfolioPanelProps) {
  const {
    portfolioMetrics,
    portfolioTotals,
    poolShare,
    lpPosition,
    formatNumber,
    formatSignedPercent,
  } = props;

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
