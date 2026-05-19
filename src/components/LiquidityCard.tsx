/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { buildExplorerTxUrl } from "../lib/explorer";

export default function LiquidityCard(props: any) {
  const {
    handleSyncToPoolRatio,
    handleSyncToPoolRatioFromY,
    setMaxLiquidity,
    handleFaucet,
    faucetPending,
    liquidityPending,
    removeLiquidityPending,
    balancesPending,
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
    activityCount,
  } = props;

  const safeRecentSwaps = Array.isArray(recentSwaps) ? recentSwaps : [];
  const safeActivityCount =
    typeof activityCount === "number" && Number.isFinite(activityCount)
      ? activityCount
      : 0;

  const [copiedTxid, setCopiedTxid] = useState<string | null>(null);
  const [activeBurnPreset, setActiveBurnPreset] = useState<number | "max" | null>(null);

  useEffect(() => {
    if (!copiedTxid) return;
    const timer = window.setTimeout(() => setCopiedTxid(null), 1200);
    return () => window.clearTimeout(timer);
  }, [copiedTxid]);

  const copyTx = async (txid: string) => {
    try {
      await navigator.clipboard.writeText(txid);
      setCopiedTxid(txid);
    } catch {
      // ignore
    }
  };

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
    if (iconUrl) return <img className="token-icon" src={iconUrl} alt="" />;
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

  const burnAmount = Number(burnShares) || 0;
  const burnFraction = pool.totalShares > 0 ? burnAmount / pool.totalShares : 0;
  const hasBurnPreview = burnAmount > 0 && burnFraction > 0 && hasLiquidity;
  const burnReceiveX = hasBurnPreview ? burnFraction * pool.reserveX : null;
  const burnReceiveY = hasBurnPreview ? burnFraction * pool.reserveY : null;

  return (
    <div className="lp-stack pool-page">

      {/* Pool overview */}
      <div className="pool-overview">
        <div className="pool-overview-card">
          {(balancesPending || liquidityPending || removeLiquidityPending) && (
            <div className="loading-strip" role="status">
              <span className="loading-spinner" aria-hidden="true" />
              <span>
                {balancesPending
                  ? "Refreshing balances..."
                  : liquidityPending
                    ? "Adding liquidity..."
                    : "Removing liquidity..."}
              </span>
            </div>
          )}
          <div className="pool-overview-head">
            <div>
              <p className="eyebrow">Pool</p>
              <h3>Reserves</h3>
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
                {formatNumber(pool.reserveX)} {poolTokenXLabel}
              </strong>
              <span className="muted small">
                {formatNumber(pool.reserveY)} {poolTokenYLabel}
              </span>
            </div>
            <div className="pool-stat">
              <span className="muted small">Price</span>
              <strong>
                {ratio
                  ? `1 ${poolTokenXLabel} = ${formatNumber(ratio)} ${poolTokenYLabel}`
                  : "No liquidity yet"}
              </strong>
            </div>
          </div>
        </div>

        <div className="pool-overview-card">
          <div className="pool-overview-head">
            <div>
              <p className="eyebrow">Your position</p>
              <h3>LP balance</h3>
            </div>
            <span className={`chip ${hasPosition ? "success" : "ghost"}`}>
              {hasPosition ? "Active" : "No position"}
            </span>
          </div>
          <div className="pool-stats-grid">
            <div className="pool-stat">
              <span className="muted small">LP shares</span>
              <strong>
                {balancesPending ? (
                  <span className="skeleton-text skeleton-short" aria-label="Loading LP balance" />
                ) : (
                  formatNumber(balances.lpShares)
                )}
              </strong>
              <span className="muted small">
                {(poolShare * 100).toFixed(2)}% of pool
              </span>
            </div>
            <div className="pool-stat">
              <span className="muted small">Underlying</span>
              <strong>
                {hasPosition
                  ? `${formatNumber(positionX)} ${poolTokenXLabel}`
                  : "—"}
              </strong>
              <span className="muted small">
                {hasPosition ? `${formatNumber(positionY)} ${poolTokenYLabel}` : "No position yet"}
              </span>
            </div>
          </div>
          {hasPosition && (
            <div className="pool-share-bar-wrap">
              <div
                className="pool-share-bar"
                role="progressbar"
                aria-label={`${(poolShare * 100).toFixed(2)}% of pool`}
                aria-valuenow={poolShare * 100}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="pool-share-bar-fill"
                  style={{ width: `${Math.min(poolShare * 100, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add liquidity */}
      <div className="token-card pool-card">
        <div className="token-card-head">
          <div>
            <p className="eyebrow">Deposit</p>
            <strong>Add liquidity</strong>
          </div>
          <div className="mini-actions">
            <button
              className="tiny ghost"
              onClick={handleSyncToPoolRatio}
              title={`Auto-fill ${tokenYLabel} to match ${tokenXLabel} at current pool ratio`}
            >
              Sync Y
            </button>
            <button
              className="tiny ghost"
              onClick={handleSyncToPoolRatioFromY}
              title={`Auto-fill ${tokenXLabel} to match ${tokenYLabel} at current pool ratio`}
            >
              Sync X
            </button>
            <button className="tiny ghost" onClick={setMaxLiquidity}>
              Max
            </button>
            <button
              className="tiny ghost"
              onClick={() => handleFaucet()}
              disabled={faucetPending}
            >
              {faucetPending && (
                <span className="loading-spinner tiny-spinner" aria-hidden="true" />
              )}
              {faucetPending ? "Minting..." : "Faucet"}
            </button>
          </div>
        </div>

        <div className="dual-input">
          <div>
            <div className="pool-input-head">
              <span className="token-inline muted small">
                {renderIcon(tokenXIcon, tokenXLabel, tokenXIsStx)}
                {tokenXLabel}
              </span>
              <div className="mini-actions">
                {balancesPending ? (
                  <span className="skeleton-text skeleton-short" aria-label="Loading balance" />
                ) : (
                  <span className="muted small">{formatNumber(balances.tokenX)}</span>
                )}
                <button className="tiny ghost" onClick={() => fillLiquidityInput("x")}>
                  Max
                </button>
              </div>
            </div>
            <div className="token-input">
              <input
                type="number"
                value={liqX}
                onChange={(e) => setLiqX(e.target.value)}
                min="0"
                placeholder="0.0"
              />
              <span className="token-badge token-badge--static">
                {renderIcon(tokenXIcon, tokenXLabel, tokenXIsStx)}
                <span>{tokenXLabel}</span>
              </span>
            </div>
          </div>
          <div>
            <div className="pool-input-head">
              <span className="token-inline muted small">
                {renderIcon(tokenYIcon, tokenYLabel, tokenYIsStx)}
                {tokenYLabel}
              </span>
              <div className="mini-actions">
                {balancesPending ? (
                  <span className="skeleton-text skeleton-short" aria-label="Loading balance" />
                ) : (
                  <span className="muted small">{formatNumber(balances.tokenY)}</span>
                )}
                <button className="tiny ghost" onClick={() => fillLiquidityInput("y")}>
                  Max
                </button>
              </div>
            </div>
            <div className="token-input">
              <input
                type="number"
                value={liqY}
                onChange={(e) => setLiqY(e.target.value)}
                min="0"
                placeholder="0.0"
              />
              <span className="token-badge token-badge--static">
                {renderIcon(tokenYIcon, tokenYLabel, tokenYIsStx)}
                <span>{tokenYLabel}</span>
              </span>
            </div>
          </div>
        </div>

        {liquidityPreview && (
          <div className="swap-breakdown-compact">
            <span className="chip ghost">
              Est. shares: {formatNumber(liquidityPreview.shares)}
            </span>
            <span className="chip ghost">
              Deposit: {formatNumber(liquidityPreview.actualX)} {tokenXLabel} / {formatNumber(liquidityPreview.actualY)} {tokenYLabel}
            </span>
            {liquidityPreview.initializing && (
              <span className="chip ghost">Initializing pool</span>
            )}
          </div>
        )}

        {initialLiquidityTooSmall && (
          <p className="muted small">
            Initial liquidity too small — increase amounts to meet minimum shares.
          </p>
        )}

        {renderApprovalManager("liquidity")}

        <div className="pool-actions">
          <button
            className="primary"
            onClick={handleAddLiquidity}
            disabled={tokenMismatch || initialLiquidityTooSmall || liquidityPending}
          >
            {liquidityPending && (
              <span className="loading-spinner button-spinner" aria-hidden="true" />
            )}
            {liquidityPending ? "Adding..." : "Add liquidity"}
          </button>
        </div>
      </div>

      {/* Remove liquidity */}
      <div className="token-card pool-card">
        <div className="token-card-head">
          <div>
            <p className="eyebrow">Withdraw</p>
            <strong>Remove liquidity</strong>
          </div>
          <div className="mini-actions">
            {([0.25, 0.5, 0.75] as const).map((p) => (
              <button
                key={p}
                className={`tiny ghost${activeBurnPreset === p ? " is-active" : ""}`}
                onClick={() => { setBurnPreset(p); setActiveBurnPreset(p); }}
              >
                {p * 100}%
              </button>
            ))}
            <button
              className={`tiny ghost${activeBurnPreset === "max" ? " is-active" : ""}`}
              onClick={() => { setMaxBurn(); setActiveBurnPreset("max"); }}
            >
              Max
            </button>
          </div>
        </div>

        <div className="token-input">
          <input
            type="number"
            value={burnShares}
            onChange={(e) => { setBurnShares(e.target.value); setActiveBurnPreset(null); }}
            min="0"
            placeholder="0"
          />
          <span className="token-badge token-badge--static">LP shares</span>
        </div>

        <div className="pool-helper">
          <span className="muted small">
            Your LP:{" "}
            {balancesPending ? (
              <span className="skeleton-text skeleton-short" />
            ) : (
              `${formatNumber(balances.lpShares)} shares`
            )}
          </span>
          <span className="muted small">
            {(poolShare * 100).toFixed(2)}% of pool
          </span>
        </div>

        {hasBurnPreview && (
          <div className="swap-breakdown-compact">
            <span className="chip ghost">
              Est. receive: {formatNumber(burnReceiveX!)} {tokenXLabel}
            </span>
            <span className="chip ghost">
              {formatNumber(burnReceiveY!)} {tokenYLabel}
            </span>
            <span className="chip ghost">
              {(burnFraction * 100).toFixed(2)}% of pool
            </span>
          </div>
        )}

        <div className="pool-actions">
          <button
            className="primary"
            onClick={handleRemoveLiquidity}
            disabled={tokenMismatch || removeLiquidityPending || !hasPosition}
          >
            {removeLiquidityPending && (
              <span className="loading-spinner button-spinner" aria-hidden="true" />
            )}
            {removeLiquidityPending ? "Removing..." : "Remove liquidity"}
          </button>
        </div>
      </div>

      {/* Recent activity */}
      {safeRecentSwaps.length > 0 && (
        <div className="pool-recent">
          <div className="pool-recent-head">
            <div>
              <p className="eyebrow">Activity</p>
              <h3>Recent activity</h3>
            </div>
            <div className="pool-recent-actions">
              <span className="chip ghost">{safeRecentSwaps.length} in log</span>
              {safeActivityCount > 0 && (
                <button className="tiny ghost" type="button" onClick={onViewAllActivity}>
                  View all
                </button>
              )}
            </div>
          </div>
          <div className="pool-recent-list">
            {safeRecentSwaps.slice(0, 4).map((item: any) => (
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
                  {item.txid && (
                    <div className="mini-actions">
                      <a
                        className="chip ghost"
                        href={buildExplorerTxUrl(item.txid, resolvedStacksNetwork)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {item.txid.slice(0, 6)}…{item.txid.slice(-4)}
                      </a>
                      <button
                        className="tiny ghost"
                        type="button"
                        onClick={() => void copyTx(item.txid || "")}
                      >
                        {copiedTxid === item.txid ? "Copied" : "Copy"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
