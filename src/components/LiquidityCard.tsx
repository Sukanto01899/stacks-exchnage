/* eslint-disable @typescript-eslint/no-explicit-any */
export default function LiquidityCard(props: any) {
  const {
    handleSyncToPoolRatio,
    handleFaucet,
    faucetPending,
    tokenLabels,
    tokenInfo,
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
    handleRemoveLiquidity
  } = props;

  const tokenXLabel = tokenLabels?.x || "Token X";
  const tokenYLabel = tokenLabels?.y || "Token Y";

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
            {formatNumber(pool.reserveX)} {tokenXLabel} /{" "}
            {formatNumber(pool.reserveY)} {tokenYLabel}
          </strong>
        </div>
        <div className="pool-stat">
          <span className="muted small">Current ratio</span>
          <strong>
            {ratio
              ? `1 ${tokenXLabel} ~ ${formatNumber(ratio)} ${tokenYLabel}`
              : "No liquidity yet"}
          </strong>
        </div>
        {tokenInfo && (
          <div className="pool-stat">
            <span className="muted small">Pool tokens</span>
            <strong>
              {tokenXLabel} / {tokenYLabel}
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
              Match ratio
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
        {renderApprovalManager("liquidity")}
        <div className="pool-actions">
          <button className="primary" onClick={handleAddLiquidity}>
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
          <button className="primary" onClick={handleRemoveLiquidity}>
            Remove liquidity
          </button>
        </div>
      </div>
    </div>
  );
}
