import type { SwapDraft } from "../type";

type SwapConfirmModalProps = {
  open: boolean;
  draft: SwapDraft | null;
  fromLabel: string;
  toLabel: string;
  resolvedStacksNetwork: string;
  priceMovePct: number | null;
  priceMoved: boolean;
  refreshingQuote: boolean;
  onRefreshQuote: () => void;
  onClose: () => void;
  onConfirm: () => void;
  onCopy: (text: string) => void;
  formatNumber: (value: number) => string;
  stxTxFeeHint?: number | null;
};

export default function SwapConfirmModal(props: SwapConfirmModalProps) {
  const {
    open,
    draft,
    fromLabel,
    toLabel,
    resolvedStacksNetwork,
    priceMovePct,
    priceMoved,
    refreshingQuote,
    onRefreshQuote,
    onClose,
    onConfirm,
    onCopy,
    formatNumber,
    stxTxFeeHint,
  } = props;

  if (!open || !draft) return null;

  const impact = draft.priceImpact;
  const impactLevel: "normal" | "elevated" | "high" =
    impact >= 3 ? "high" : impact >= 1 ? "elevated" : "normal";
  const impactColor =
    impactLevel === "high"
      ? "#fca5a5"
      : impactLevel === "elevated"
        ? "#fde68a"
        : undefined;

  const lines = [
    `Swap: ${formatNumber(draft.amount)} ${fromLabel} -> ~${formatNumber(draft.outputPreview)} ${toLabel}`,
    `Min received: ${formatNumber(draft.minReceived)} ${toLabel}`,
    `Slippage: ${draft.slippagePercent}%`,
    `Deadline: ${draft.deadlineMinutes} minutes`,
    `Price impact: ${draft.priceImpact.toFixed(2)}%`,
    ...(draft.feeEstimate !== null && draft.feeEstimate !== undefined
      ? [`Estimated fee: ${formatNumber(draft.feeEstimate)} ${draft.feeSymbol || ""}`.trim()]
      : []),
    `Network: ${resolvedStacksNetwork}`,
  ];

  return (
    <div
      className="confirm-modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-modal-head">
          <div>
            <p className="eyebrow">Confirm swap</p>
            <h2>Review before signing</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close"
            onClick={onClose}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M1 1l12 12M13 1 1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="confirm-modal-body">
          {priceMoved && (
            <div className="note warning">
              <p className="muted small">Price moved</p>
              <strong>
                The quote moved {priceMovePct?.toFixed(2)}% since you opened this
                review. Refresh for an updated estimate.
              </strong>
              <div className="confirm-modal-actions">
                <button
                  className="secondary"
                  type="button"
                  onClick={onRefreshQuote}
                  disabled={refreshingQuote}
                >
                  {refreshingQuote ? "Updating..." : "Update quote"}
                </button>
              </div>
            </div>
          )}
          {impactLevel !== "normal" && (
            <div className={`note ${impactLevel === "high" ? "error" : "warning"}`}>
              <p className="muted small">
                Price impact {impactLevel === "high" ? "is high" : "is elevated"}
              </p>
              <strong>
                This swap moves the pool price by {impact.toFixed(2)}%, so you may
                receive noticeably less than the spot rate
                {impactLevel === "high" ? " — consider a smaller size." : "."}
              </strong>
            </div>
          )}
          <div className="confirm-modal-summary">
            <p className="muted small">You pay</p>
            <strong>
              {formatNumber(draft.amount)} {fromLabel}
            </strong>
            <p className="muted small">You receive (est.)</p>
            <strong>
              {formatNumber(draft.outputPreview)} {toLabel}
            </strong>
          </div>

          <div className="confirm-modal-grid">
            <div className="confirm-modal-stat">
              <p className="muted small">Min received</p>
              <strong>
                {formatNumber(draft.minReceived)} {toLabel}
              </strong>
            </div>
            <div className="confirm-modal-stat">
              <p className="muted small">Slippage</p>
              <strong>{draft.slippagePercent}%</strong>
            </div>
            <div className="confirm-modal-stat">
              <p className="muted small">Deadline</p>
              <strong>{draft.deadlineMinutes} min</strong>
            </div>
            <div className="confirm-modal-stat">
              <p className="muted small">Price impact</p>
              <strong style={{ color: impactColor }}>
                {impact.toFixed(2)}%
                {impactLevel !== "normal" && (
                  <span
                    className={`chip ${impactLevel === "high" ? "impact-high" : "impact-warn"}`}
                    style={{ marginLeft: 6 }}
                  >
                    {impactLevel === "high" ? "High" : "Elevated"}
                  </span>
                )}
              </strong>
            </div>
            <div className="confirm-modal-stat">
              <p className="muted small">Estimated fee</p>
              <strong>
                {draft.feeEstimate !== null && draft.feeEstimate !== undefined
                  ? `${formatNumber(draft.feeEstimate)} ${draft.feeSymbol || ""}`.trim()
                  : stxTxFeeHint != null && Number.isFinite(stxTxFeeHint)
                    ? `~${stxTxFeeHint} STX`
                    : "N/A"}
              </strong>
            </div>
          </div>

          <div className="confirm-modal-actions">
            <button
              className="secondary"
              type="button"
              onClick={() => onCopy(lines.join("\n"))}
            >
              Copy details
            </button>
            <button className="primary" type="button" onClick={onConfirm}>
              Confirm &amp; sign
            </button>
          </div>

          <p className="muted small">
            Your wallet will open next to sign the transaction.
          </p>
        </div>
      </div>
    </div>
  );
}
