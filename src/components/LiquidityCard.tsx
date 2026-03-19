/* eslint-disable @typescript-eslint/no-explicit-any */
export default function LiquidityCard(props: any) {
  const {
    handleSyncToPoolRatio,
    handleSyncToPoolRatioFromY,
    setMaxLiquidity,
    handleFaucet,
    faucetPending,
    tokenLabels,
    poolTokenLabels,
    tokenInfo,
    tokenMismatch,
    liqX,
    setLiqX,
    formatNumber,
    balances,
    fillLiquidityInput,
    liqY,
    setLiqY,
    renderApprovalManager,
    handleAddLiquidity,
    setBurnPreset,
    setMaxBurn,
    burnShares,
    setBurnShares,
    poolShare,
    pool,
    liquidityPreview,
    handleRemoveLiquidity
  } = props;

  const tokenXLabel = tokenLabels?.x || "Token X";
  const tokenYLabel = tokenLabels?.y || "Token Y";
  const poolTokenXLabel = poolTokenLabels?.x || tokenXLabel;
  const poolTokenYLabel = poolTokenLabels?.y || tokenYLabel;

  const ratio =
    pool && pool.reserveX > 0 && pool.reserveY > 0
      ? pool.reserveY / pool.reserveX
      : null;

  return (
    <div className="lp-stack pool-page">
      <div className="pool-header">
        <div>
          <p className="eyebrow">Pool</p>
          <h3>Liquidity control</h3>
        </div>
        <div className="pool-meta">
          <div className="pool-stat">
            <span className="muted small">Your LP</span>
            <strong>{formatNumber(balances.lpShares)} shares</strong>
          </div>
          <div className="pool-stat">
            <span className="muted small">Pool share</span>
            <strong>{(poolShare * 100).toFixed(2)}%</strong>
          </div>
        </div>
      </div>

      <div className="pool-snapshot">
        <div className="pool-stat">
          <span className="muted small">Reserves</span>
          <strong>
            {formatNumber(pool.reserveX)} {poolTokenXLabel} /{" "}
            {formatNumber(pool.reserveY)} {poolTokenYLabel}
          </strong>
        </div>
        <div className="pool-stat">
          <span className="muted small">Current ratio</span>
          <strong>
            {ratio
              ? `1 ${poolTokenXLabel} ~ ${formatNumber(ratio)} ${poolTokenYLabel}`
              : "No liquidity yet"}
          </strong>
        </div>
        {tokenInfo && (
          <div className="pool-stat">
            <span className="muted small">Pool tokens</span>
            <strong>
              {poolTokenXLabel} / {poolTokenYLabel}
            </strong>
          </div>
        )}
      </div>

      <div className="token-card pool-card">
        <div className="token-card-head">
          <div>
            <span className="muted small">Add to pool</span>
            <strong>Provide balanced liquidity</strong>
          </div>
          <div className="mini-actions">
            <button className="tiny ghost" onClick={handleSyncToPoolRatio}>
              Match from X
            </button>
            <button className="tiny ghost" onClick={handleSyncToPoolRatioFromY}>
              Match from Y
            </button>
            <button className="tiny ghost" onClick={setMaxLiquidity}>
              Max LP
            </button>
            <button
              className="tiny ghost"
              onClick={() => handleFaucet()}
              disabled={faucetPending}
            >
              Faucet both
            </button>
          </div>
        </div>
        <div className="dual-input">
          <div>
            <label>{tokenXLabel}</label>
            <input
              type="number"
              value={liqX}
              onChange={(e) => setLiqX(e.target.value)}
              min="0"
              placeholder="0.0"
            />
            <div className="pool-helper">
              <span className="muted small">
                Balance: {formatNumber(balances.tokenX)}
              </span>
              <button
                className="tiny ghost"
                onClick={() => fillLiquidityInput("x")}
              >
                Use {tokenXLabel} balance
              </button>
            </div>
          </div>
          <div>
            <label>{tokenYLabel}</label>
            <input
              type="number"
              value={liqY}
              onChange={(e) => setLiqY(e.target.value)}
              min="0"
              placeholder="0.0"
            />
            <div className="pool-helper">
              <span className="muted small">
                Balance: {formatNumber(balances.tokenY)}
              </span>
              <button
                className="tiny ghost"
                onClick={() => fillLiquidityInput("y")}
              >
                Use {tokenYLabel} balance
              </button>
            </div>
          </div>
        </div>
        {liquidityPreview && (
          <div className="pool-helper">
            <span className="muted small">
              Est. shares: {formatNumber(liquidityPreview.shares)}
            </span>
            <span className="muted small">
              Actual deposit: {formatNumber(liquidityPreview.actualX)}{" "}
              {tokenXLabel} / {formatNumber(liquidityPreview.actualY)}{" "}
              {tokenYLabel}
            </span>
          </div>
        )}
        {renderApprovalManager("liquidity")}
        <div className="pool-actions">
          <button
            className="primary"
            onClick={handleAddLiquidity}
            disabled={tokenMismatch}
          >
            Add liquidity
          </button>
        </div>
      </div>

      <div className="token-card pool-card">
        <div className="token-card-head">
          <div>
            <span className="muted small">Remove from pool</span>
            <strong>Withdraw your position</strong>
          </div>
          <div className="mini-actions">
            <button className="tiny ghost" onClick={() => setBurnPreset(0.25)}>
              25%
            </button>
            <button className="tiny ghost" onClick={() => setBurnPreset(0.5)}>
              50%
            </button>
            <button className="tiny ghost" onClick={() => setBurnPreset(0.75)}>
              75%
            </button>
            <button className="tiny ghost" onClick={setMaxBurn}>
              Max
            </button>
          </div>
        </div>
        <div className="token-input">
          <input
            type="number"
            value={burnShares}
            onChange={(e) => setBurnShares(e.target.value)}
            min="0"
            placeholder="0"
          />
          <span className="token-pill">LP shares</span>
        </div>
        <div className="pool-helper">
          <span className="muted small">
            Your LP: {formatNumber(balances.lpShares)} shares
          </span>
          <span className="muted small">
            Pool share: {(poolShare * 100).toFixed(2)}%
          </span>
        </div>
        <div className="pool-actions">
          <button
            className="primary"
            onClick={handleRemoveLiquidity}
            disabled={tokenMismatch}
          >
            Remove liquidity
          </button>
        </div>
      </div>
    </div>
  );
}
