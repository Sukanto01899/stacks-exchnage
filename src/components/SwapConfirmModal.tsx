import type { SwapDraft } from "../type";

type SwapConfirmModalProps = {
  open: boolean;
  draft: SwapDraft | null;
  fromLabel: string;
  toLabel: string;
  resolvedStacksNetwork: string;
  onClose: () => void;
  onConfirm: () => void;
  onCopy: (text: string) => void;
  formatNumber: (value: number) => string;
};

export default function SwapConfirmModal(props: SwapConfirmModalProps) {
  const {
    open,
    draft,
    fromLabel,
    toLabel,
    resolvedStacksNetwork,
    onClose,
    onConfirm,
    onCopy,
    formatNumber,
  } = props;

  if (!open || !draft) return null;

  const lines = [
    `Swap: ${formatNumber(draft.amount)} ${fromLabel} -> ~${formatNumber(draft.outputPreview)} ${toLabel}`,
    `Min received: ${formatNumber(draft.minReceived)} ${toLabel}`,
    `Slippage: ${draft.slippagePercent}%`,
    `Deadline: ${draft.deadlineMinutes} minutes`,
    `Price impact: ${draft.priceImpact.toFixed(2)}%`,
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
            x
          </button>
        </div>

        <div className="confirm-modal-body">
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
              <strong>{draft.priceImpact.toFixed(2)}%</strong>
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

