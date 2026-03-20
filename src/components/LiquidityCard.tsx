/* eslint-disable @typescript-eslint/no-explicit-any */
export default function LiquidityCard(props: any) {
  const {
    handleSyncToPoolRatio,
    handleSyncToPoolRatioFromY,
    setMaxLiquidity,
    handleFaucet,
    faucetPending,
    tokenLabels,
    tokenIcons,
    tokenIsStx,
    poolTokenLabels,
    poolTokenIcons,
    poolTokenIsStx,
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
    initialLiquidityTooSmall,
    handleRemoveLiquidity,
    recentSwaps,
    resolvedStacksNetwork,
    onViewAllActivity,
  } = props;
  const safeRecentSwaps = Array.isArray(recentSwaps) ? recentSwaps : [];

  const tokenXLabel = tokenLabels?.x || "Token X";
  const tokenYLabel = tokenLabels?.y || "Token Y";
  const poolTokenXLabel = poolTokenLabels?.x || tokenXLabel;
  const poolTokenYLabel = poolTokenLabels?.y || tokenYLabel;
  const tokenXIcon = tokenIcons?.x || null;
  const tokenYIcon = tokenIcons?.y || null;
  const poolTokenXIcon = poolTokenIcons?.x || null;
  const poolTokenYIcon = poolTokenIcons?.y || null;
  const tokenXIsStx = tokenIsStx?.x || false;
  const tokenYIsStx = tokenIsStx?.y || false;
  const poolTokenXIsStx = poolTokenIsStx?.x || false;
  const poolTokenYIsStx = poolTokenIsStx?.y || false;

  const renderIcon = (iconUrl: string | null, label: string, isStx: boolean) => {
    if (iconUrl) {
      return <img className="token-icon" src={iconUrl} alt="" />;
    }
    const text = isStx ? "STX" : label.slice(0, 1).toUpperCase();
    return (
      <span className="token-icon token-icon-fallback">
        <span className="token-icon-text">{text}</span>
      </span>
    );
  };

  const ratio =
    pool && pool.reserveX > 0 && pool.reserveY > 0
      ? pool.reserveY / pool.reserveX
      : null;
  const hasLiquidity = pool && pool.totalShares > 0;
  const hasPosition = balances.lpShares > 0;
  const positionX = hasLiquidity ? pool.reserveX * poolShare : 0;
  const positionY = hasLiquidity ? pool.reserveY * poolShare : 0;

  return (
    <div className="lp-stack pool-page">
      <div className="pool-header">
        <div>
          <p className="eyebrow">Pool</p>
          <h3>Liquidity control</h3>
        </div>
      </div>

      <div className="pool-overview">
        <div className="pool-overview-card">
          <div className="pool-overview-head">
            <div>
              <p className="eyebrow">Pool stats</p>
              <h3>Pool snapshot</h3>
            </div>
            {tokenInfo && (
              <strong className="token-inline">
                {renderIcon(poolTokenXIcon, poolTokenXLabel, poolTokenXIsStx)}
                {poolTokenXLabel}
                <span className="muted small"> / </span>
                {renderIcon(poolTokenYIcon, poolTokenYLabel, poolTokenYIsStx)}
                {poolTokenYLabel}
              </strong>
            )}
          </div>
          <div className="pool-stats-grid">
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
            <div className="pool-stat">
              <span className="muted small">Total LP shares</span>
              <strong>{formatNumber(pool.totalShares)} shares</strong>
            </div>
          </div>
        </div>

        <div className="pool-overview-card">
          <div className="pool-overview-head">
            <div>
              <p className="eyebrow">Your position</p>
              <h3>Liquidity footprint</h3>
            </div>
            <span className={`chip ${hasPosition ? "success" : "ghost"}`}>
              {hasPosition ? "Active" : "No position"}
            </span>
          </div>
          <div className="pool-stats-grid">
            <div className="pool-stat">
              <span className="muted small">Your LP</span>
              <strong>{formatNumber(balances.lpShares)} shares</strong>
            </div>
            <div className="pool-stat">
              <span className="muted small">Pool share</span>
              <strong>{(poolShare * 100).toFixed(2)}%</strong>
            </div>
            <div className="pool-stat wide">
              <span className="muted small">Underlying in pool</span>
              <strong>
                {hasPosition
                  ? `${formatNumber(positionX)} ${poolTokenXLabel} / ${formatNumber(
                      positionY,
                    )} ${poolTokenYLabel}`
                  : "No position yet"}
              </strong>
            </div>
          </div>
        </div>
      </div>

      <div className="pool-recent">
        <div className="pool-recent-head">
          <div>
            <p className="eyebrow">Pool activity</p>
            <h3>Recent swaps</h3>
          </div>
          <div className="pool-recent-actions">
            <span className="chip ghost">
              {safeRecentSwaps.length} in activity log
            </span>
            <button
              className="tiny ghost"
              type="button"
              onClick={onViewAllActivity}
            >
              View all activity
            </button>
          </div>
        </div>
        {safeRecentSwaps.length === 0 ? (
          <p className="muted small pool-recent-empty">
            No swaps recorded yet.
          </p>
        ) : (
          <div className="pool-recent-list">
            {safeRecentSwaps.slice(0, 5).map((item: any) => (
              <div className="pool-recent-item" key={item.id}>
                <div className="pool-recent-main">
                  <span className={`chip ghost status-${item.status}`}>
                    {item.status}
                  </span>
                  <strong>{item.message}</strong>
                </div>
                <div className="pool-recent-meta">
                  <span className="muted small">
                    {new Date(item.ts).toLocaleString()}
                  </span>
                  {item.txid ? (
                    <a
                      className="chip ghost"
                      href={`https://explorer.hiro.so/txid/${item.txid}?chain=${resolvedStacksNetwork}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {item.txid.slice(0, 6)}...{item.txid.slice(-6)}
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
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
            <label className="token-inline">
              {renderIcon(tokenXIcon, tokenXLabel, tokenXIsStx)}
              {tokenXLabel}
            </label>
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
            <label className="token-inline">
              {renderIcon(tokenYIcon, tokenYLabel, tokenYIsStx)}
              {tokenYLabel}
            </label>
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
        {initialLiquidityTooSmall && (
          <p className="muted small">
            Initial liquidity too small. Increase amounts to meet minimum
            shares.
          </p>
        )}
        {renderApprovalManager("liquidity")}
        <div className="pool-actions">
          <button
            className="primary"
            onClick={handleAddLiquidity}
            disabled={tokenMismatch || initialLiquidityTooSmall}
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

      <div className="pool-action-bar" aria-label="Pool quick actions">
        <button
          className="secondary"
          onClick={handleRemoveLiquidity}
          disabled={tokenMismatch}
        >
          Remove liquidity
        </button>
        <button
          className="primary"
          onClick={handleAddLiquidity}
          disabled={tokenMismatch || initialLiquidityTooSmall}
        >
          Add liquidity
        </button>
      </div>
    </div>
  );
}
