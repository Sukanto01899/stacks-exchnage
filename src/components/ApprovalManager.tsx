type ApprovalSupport = {
  x: boolean;
  y: boolean;
};

type Allowances = {
  x: number | null;
  y: number | null;
};

type ApprovalManagerProps = {
  mode: "swap" | "liquidity";
  swapDirection: "x-to-y" | "y-to-x";
  swapAmount: number;
  liqAmountX: number;
  liqAmountY: number;
  tokenLabels: { x: string; y: string };
  tokenMismatch: boolean;
  approvalSupport: ApprovalSupport;
  approveUnlimited: boolean;
  setApproveUnlimited: (value: boolean) => void;
  unlimitedApprovalConfirmed: boolean;
  setUnlimitedApprovalConfirmed: (value: boolean) => void;
  allowances: Allowances;
  formatNumber: (value: number) => string;
  handleApprove: (token: "x" | "y", amount: number) => void;
  stacksAddress: string | null;
  networkMismatch: boolean;
  approvePending: "x" | "y" | null;
  spenderContractId: string;
};

export default function ApprovalManager(props: ApprovalManagerProps) {
  const {
    mode,
    swapDirection,
    swapAmount,
    liqAmountX,
    liqAmountY,
    tokenLabels,
    tokenMismatch,
    approvalSupport,
    approveUnlimited,
    setApproveUnlimited,
    unlimitedApprovalConfirmed,
    setUnlimitedApprovalConfirmed,
    allowances,
    formatNumber,
    handleApprove,
    stacksAddress,
    networkMismatch,
    approvePending,
    spenderContractId,
  } = props;

  const requiredX =
    mode === "swap"
      ? swapDirection === "x-to-y"
        ? swapAmount
        : 0
      : liqAmountX;
  const requiredY =
    mode === "swap"
      ? swapDirection === "y-to-x"
        ? swapAmount
        : 0
      : liqAmountY;
  const hasAnySupport = approvalSupport.x || approvalSupport.y;
  const needsUnlimitedConfirm = approveUnlimited && hasAnySupport;
  const missingUnlimitedConfirm =
    needsUnlimitedConfirm && !unlimitedApprovalConfirmed;

  return (
    <div className="approval-panel">
      <div className="approval-head">
        <span className="muted">Approval Manager</span>
        <label className="target-toggle">
          <input
            type="checkbox"
            checked={approveUnlimited}
            onChange={(e) => setApproveUnlimited(e.target.checked)}
          />
          Unlimited
        </label>
      </div>

      {needsUnlimitedConfirm && (
        <div className="note warning">
          <p className="muted small">Unlimited approval risk</p>
          <strong>
            Unlimited approvals can expose your full token balance to the
            spender contract if it is compromised.
          </strong>
          <div className="note-actions">
            <label className="target-toggle">
              <input
                type="checkbox"
                checked={unlimitedApprovalConfirmed}
                onChange={(e) => setUnlimitedApprovalConfirmed(e.target.checked)}
              />
              I understand and accept
            </label>
          </div>
        </div>
      )}
      {!hasAnySupport ? (
        <p className="muted small">
          Approval not required for current token contracts (direct transfer
          model).
        </p>
      ) : (
        <div className="approval-grid">
          <div>
            <p className="muted small">{tokenLabels.x} allowance</p>
            <strong>
              {allowances.x === null
                ? "N/A"
                : `${formatNumber(allowances.x)} ${tokenLabels.x}`}
            </strong>
            <button
              className="tiny ghost"
              onClick={() => handleApprove("x", requiredX)}
              disabled={
                tokenMismatch ||
                networkMismatch ||
                !approvalSupport.x ||
                !stacksAddress ||
                missingUnlimitedConfirm ||
                approvePending !== null
              }
            >
              {approvePending === "x"
                ? `Approving ${tokenLabels.x}...`
                : `Approve ${tokenLabels.x}`}
            </button>
          </div>
          <div>
            <p className="muted small">{tokenLabels.y} allowance</p>
            <strong>
              {allowances.y === null
                ? "N/A"
                : `${formatNumber(allowances.y)} ${tokenLabels.y}`}
            </strong>
            <button
              className="tiny ghost"
              onClick={() => handleApprove("y", requiredY)}
              disabled={
                tokenMismatch ||
                networkMismatch ||
                !approvalSupport.y ||
                !stacksAddress ||
                missingUnlimitedConfirm ||
                approvePending !== null
              }
            >
              {approvePending === "y"
                ? `Approving ${tokenLabels.y}...`
                : `Approve ${tokenLabels.y}`}
            </button>
          </div>
        </div>
      )}
      {tokenMismatch && (
        <p className="muted small">Fix token selection to continue.</p>
      )}
      <p className="muted small">Spender: {spenderContractId}</p>
    </div>
  );
}
