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
  approvalSupport: ApprovalSupport;
  approveUnlimited: boolean;
  setApproveUnlimited: (value: boolean) => void;
  allowances: Allowances;
  formatNumber: (value: number) => string;
  handleApprove: (token: "x" | "y", amount: number) => void;
  stacksAddress: string | null;
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
    approvalSupport,
    approveUnlimited,
    setApproveUnlimited,
    allowances,
    formatNumber,
    handleApprove,
    stacksAddress,
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
      {!hasAnySupport ? (
        <p className="muted small">
          Approval not required for current token contracts (direct transfer
          model).
        </p>
      ) : (
        <div className="approval-grid">
          <div>
            <p className="muted small">Token X allowance</p>
            <strong>
              {allowances.x === null ? "N/A" : `${formatNumber(allowances.x)} X`}
            </strong>
            <button
              className="tiny ghost"
              onClick={() => handleApprove("x", requiredX)}
              disabled={
                !approvalSupport.x || !stacksAddress || approvePending !== null
              }
            >
              {approvePending === "x" ? "Approving X..." : "Approve X"}
            </button>
          </div>
          <div>
            <p className="muted small">Token Y allowance</p>
            <strong>
              {allowances.y === null ? "N/A" : `${formatNumber(allowances.y)} Y`}
            </strong>
            <button
              className="tiny ghost"
              onClick={() => handleApprove("y", requiredY)}
              disabled={
                !approvalSupport.y || !stacksAddress || approvePending !== null
              }
            >
              {approvePending === "y" ? "Approving Y..." : "Approve Y"}
            </button>
          </div>
        </div>
      )}
      <p className="muted small">Spender: {spenderContractId}</p>
    </div>
  );
}
