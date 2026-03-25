/* eslint-disable @typescript-eslint/no-explicit-any */
export default function SwapCard(props: any) {
  const {
    showMinimalSwapLayout,
    poolContract,
    FEE_BPS,
    tokenLabels,
    tokenIcons,
    tokenIsStx,
    poolTokenLabels,
    poolTokenIcons,
    poolTokenIsStx,
    tokenInfo,
    tokenMismatch,
    swapInput,
    setSwapInput,
    swapDirection,
    setSwapDirection,
    balances,
    formatNumber,
    setSwapPreset,
    clearSwapInput,
    setMaxSwap,
    quoteLoading,
    liveSwapOutput,
    currentPrice,
    pool,
    handleManualRefresh,
    poolPending,
    handleCopySwapSnapshot,
    priceImpact,
    slippageRatio,
    PRICE_IMPACT_WARN_PCT,
    PRICE_IMPACT_CONFIRM_PCT,
    PRICE_IMPACT_BLOCK_PCT,
    splitSuggestionCount,
    applySplitSuggestion,
    impactConfirmed,
    setImpactConfirmed,
    slippageInput,
    setSlippageInput,
    highSlippageRequired,
    highSlippageConfirmed,
    setHighSlippageConfirmed,
    deadlineMinutesInput,
    setDeadlineMinutesInput,
    onResetSwapSettings,
    customTokenRequired,
    customTokenConfirmed,
    setCustomTokenConfirmed,
    networkMismatch,
    resolvedStacksNetwork,
    directionalPrice,
    targetPriceEnabled,
    setTargetPriceEnabled,
    targetPairDirection,
    setTargetPairDirection,
    targetCondition,
    setTargetCondition,
    targetPriceInput,
    setTargetPriceInput,
    targetPrice,
    targetTriggered,
    requestBrowserAlerts,
    browserAlertsEnabled,
    createPriceAlert,
    clearTriggeredAlerts,
    alertSummary,
    priceAlerts,
    removePriceAlert,
    maxSwap,
    simulator,
    curvePreview,
    renderApprovalManager,
    handleSimpleSwap,
    handleSwap,
    swapPending,
    preflightPending,
    onGoToPool,
    onMintFaucet,
    onOpenTokenSelector,
    faucetPending
  } = props;

  const tokenXLabel = tokenLabels?.x || "Token X";
  const tokenYLabel = tokenLabels?.y || "Token Y";
  const poolTokenXLabel = poolTokenLabels?.x || tokenXLabel;
  const poolTokenYLabel = poolTokenLabels?.y || tokenYLabel;
  const poolTokenXIcon = poolTokenIcons?.x || null;
  const poolTokenYIcon = poolTokenIcons?.y || null;
  const poolTokenXIsStx = poolTokenIsStx?.x || false;
  const poolTokenYIsStx = poolTokenIsStx?.y || false;
  const fromLabel = swapDirection === "x-to-y" ? tokenXLabel : tokenYLabel;
  const toLabel = swapDirection === "x-to-y" ? tokenYLabel : tokenXLabel;
  const fromIcon =
    swapDirection === "x-to-y" ? tokenIcons?.x || null : tokenIcons?.y || null;
  const toIcon =
    swapDirection === "x-to-y" ? tokenIcons?.y || null : tokenIcons?.x || null;
  const fromIsStx =
    swapDirection === "x-to-y" ? tokenIsStx?.x || false : tokenIsStx?.y || false;
  const toIsStx =
    swapDirection === "x-to-y" ? tokenIsStx?.y || false : tokenIsStx?.x || false;
  const swapAmount = Number(swapInput || 0);
  const fromBalance =
    swapDirection === "x-to-y" ? balances.tokenX : balances.tokenY;
  const insufficientBalance =
    Number.isFinite(swapAmount) && swapAmount > 0 && swapAmount > fromBalance;
  const noLiquidity = pool.reserveX <= 0 || pool.reserveY <= 0;
  const missingRiskConfirm =
    (customTokenRequired && !customTokenConfirmed) ||
    (highSlippageRequired && !highSlippageConfirmed);

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

  return (
    <div className="swap-card">
      {showMinimalSwapLayout && (
        <div className="swap-hero-row" aria-label="Swap status">
          <span className="chip success">Instant route</span>
          <span className="chip ghost">{poolContract.contractName}</span>
          <span className="chip ghost">{(FEE_BPS / 100).toFixed(2)}% fee</span>
        </div>
      )}

      {tokenInfo && (
        <div className="note subtle">
          <p className="muted small">Pool tokens</p>
          <strong className="token-inline">
            {renderIcon(poolTokenXIcon, poolTokenXLabel, poolTokenXIsStx)}
            {poolTokenXLabel}
            <span className="muted small"> / </span>
            {renderIcon(poolTokenYIcon, poolTokenYLabel, poolTokenYIsStx)}
            {poolTokenYLabel}
          </strong>
        </div>
      )}

      {(tokenMismatch || insufficientBalance || noLiquidity) && (
        <div
          className={`note ${
            noLiquidity ? "error" : tokenMismatch ? "warning" : "warning"
          }`}
        >
          <p className="muted small">Heads up</p>
          <strong>
            {tokenMismatch
              ? "Selected tokens do not match the initialized pool."
              : noLiquidity
                ? "Pool has no liquidity yet. Swaps are disabled."
                : "Insufficient balance for this swap amount."}
          </strong>
          <div className="note-actions">
            {tokenMismatch && onOpenTokenSelector ? (
              <button className="tiny ghost" onClick={onOpenTokenSelector}>
                Open token selector
              </button>
            ) : null}
            {!tokenMismatch && noLiquidity && onGoToPool ? (
              <button className="tiny ghost" onClick={onGoToPool}>
                Go to Pool
              </button>
            ) : null}
            {insufficientBalance && onMintFaucet ? (
              <button
                className="tiny"
                onClick={() => onMintFaucet()}
                disabled={faucetPending}
              >
                {faucetPending ? "Minting..." : "Mint from Faucet"}
              </button>
            ) : null}
          </div>
        </div>
      )}

      {networkMismatch && (
        <div className="note error">
          <p className="muted small">Network mismatch</p>
          <strong>
            Connected wallet is not on {resolvedStacksNetwork}. Swaps are
            disabled.
          </strong>
          <p className="muted small">
            Switch wallet network and reconnect, then refresh pool data.
          </p>
        </div>
      )}

      <div className="token-card">
        <div className="token-card-head">
          <span className="muted">From</span>
          <span className="token-inline muted small">
            {renderIcon(fromIcon, fromLabel, fromIsStx)}
            {fromLabel}
          </span>
          <div className="mini-actions">
            <button
              className="tiny ghost"
              onClick={() => setSwapDirection("x-to-y")}
            >
              X -&gt; Y
            </button>
            <button
              className="tiny ghost"
              onClick={() => setSwapDirection("y-to-x")}
            >
              Y -&gt; X
            </button>
            <button className="tiny" onClick={setMaxSwap}>
              Max
            </button>
            <button className="tiny ghost" onClick={clearSwapInput}>
              Clear
            </button>
          </div>
        </div>
        <div className="token-input">
          <input
            type="number"
            value={swapInput}
            onChange={(e) => setSwapInput(e.target.value)}
            min="0"
            placeholder="0.0"
          />
          <select
            className="token-select"
            value={swapDirection === "x-to-y" ? "x" : "y"}
            onChange={(e) =>
              setSwapDirection(e.target.value === "x" ? "x-to-y" : "y-to-x")
            }
          >
            <option value="x">{tokenXLabel}</option>
            <option value="y">{tokenYLabel}</option>
          </select>
        </div>
        <p className="muted small">
          Balance:{" "}
          {swapDirection === "x-to-y"
            ? formatNumber(balances.tokenX)
            : formatNumber(balances.tokenY)}
        </p>
        <div className="mini-actions">
          <button className="tiny ghost" onClick={() => setSwapPreset(0.25)}>
            25%
          </button>
          <button className="tiny ghost" onClick={() => setSwapPreset(0.5)}>
            50%
          </button>
          <button className="tiny ghost" onClick={() => setSwapPreset(0.75)}>
            75%
          </button>
        </div>
      </div>

      <button
        className="switcher"
        onClick={() =>
          setSwapDirection((prev: any) =>
            prev === "x-to-y" ? "y-to-x" : "x-to-y",
          )
        }
      >
        Switch
      </button>

      <div className="token-card">
        <div className="token-card-head">
          <span className="muted">To</span>
          <span className="token-inline muted small">
            {renderIcon(toIcon, toLabel, toIsStx)}
            {toLabel}
          </span>
          <select
            className="token-select"
            value={swapDirection === "x-to-y" ? "y" : "x"}
            disabled
          >
            <option value="x">{tokenXLabel}</option>
            <option value="y">{tokenYLabel}</option>
          </select>
        </div>
        <div className="token-output">
          <h3>
            {quoteLoading
              ? "Loading..."
              : liveSwapOutput !== null
                ? formatNumber(liveSwapOutput)
                : pool.reserveX <= 0 || pool.reserveY <= 0
                  ? "No pool"
                  : "0.0"}
          </h3>
          <p className="muted small">Expected output</p>
        </div>
      </div>

      {showMinimalSwapLayout && (
        <div className="simple-quote-line">
          <span className="simple-quote-pill muted small">
            {pool.reserveX > 0 && pool.reserveY > 0
              ? `1 ${poolTokenXLabel} = ${formatNumber(currentPrice || 0)} ${poolTokenYLabel}`
              : "No liquidity yet"}
          </span>
          <span className="simple-quote-pill muted small">
            {quoteLoading
              ? "Refreshing pool..."
              : liveSwapOutput !== null
                ? `Est. ${formatNumber(liveSwapOutput)} ${swapDirection === "x-to-y" ? tokenYLabel : tokenXLabel}`
                : "Enter amount"}
          </span>
        </div>
      )}

      {showMinimalSwapLayout && (
        <div className="swap-quick-actions">
          <button
            className="tiny ghost"
            onClick={() => void handleManualRefresh()}
            disabled={poolPending}
          >
            {poolPending ? "Refreshing..." : "Refresh data"}
          </button>
          <button
            className="tiny ghost"
            onClick={() => void handleCopySwapSnapshot()}
          >
            Copy snapshot
          </button>
        </div>
      )}

      {showMinimalSwapLayout && (
        <div className="swap-breakdown-compact">
          <span className="chip ghost">
            Route: {fromLabel} → {toLabel}
          </span>
          <span className="chip ghost">
            Fee: {(FEE_BPS / 100).toFixed(2)}%
          </span>
          <span className="chip ghost">
            Impact: {priceImpact ? `${priceImpact.toFixed(3)}%` : "N/A"}
          </span>
          <span className="chip ghost">
            Min:{" "}
            {liveSwapOutput
              ? `${formatNumber(liveSwapOutput * (1 - slippageRatio))}`
              : "N/A"}{" "}
            {swapDirection === "x-to-y" ? tokenYLabel : tokenXLabel}
          </span>
        </div>
      )}

      <div className="inline-stats">
        <div>
          <p className="muted small">Price</p>
          <strong>
            {currentPrice
              ? `1 ${poolTokenXLabel} ~ ${formatNumber(currentPrice)} ${poolTokenYLabel}`
              : "N/A"}
          </strong>
        </div>
        <div>
          <p className="muted small">Fee</p>
          <strong>0.30%</strong>
        </div>
        <div>
          <p className="muted small">Pool reserves</p>
          <strong>
            {formatNumber(pool.reserveX)} {poolTokenXLabel} /{" "}
            {formatNumber(pool.reserveY)} {poolTokenYLabel}
          </strong>
        </div>
      </div>
      <div className="swap-breakdown">
        <div className="swap-breakdown-head">
          <div>
            <p className="eyebrow">Route</p>
            <h3>Single pool path</h3>
          </div>
          <span className="chip ghost">{poolContract.contractName}</span>
        </div>
        <div className="swap-breakdown-grid">
          <div className="swap-breakdown-item">
            <span className="muted small">
              Route
              <span
                className="info-icon"
                aria-label="Swap path for this trade"
                data-tooltip="Swap path for this trade"
              >
                i
              </span>
            </span>
            <strong>
              {fromLabel} → {toLabel} (1 hop)
            </strong>
          </div>
          <div className="swap-breakdown-item">
            <span className="muted small">
              Pool fee
              <span
                className="info-icon"
                aria-label="Fee charged by the pool"
                data-tooltip="Fee charged by the pool"
              >
                i
              </span>
            </span>
            <strong>{(FEE_BPS / 100).toFixed(2)}%</strong>
          </div>
          <div className="swap-breakdown-item">
            <span className="muted small">
              Price impact
              <span
                className="info-icon"
                aria-label="Estimated price movement from this trade"
                data-tooltip="Estimated price movement from this trade"
              >
                i
              </span>
            </span>
            <strong>{priceImpact ? `${priceImpact.toFixed(4)}%` : "N/A"}</strong>
          </div>
          <div className="swap-breakdown-item">
            <span className="muted small">
              Slippage tolerance
              <span
                className="info-icon"
                aria-label="Maximum price movement you will accept"
                data-tooltip="Maximum price movement you will accept"
              >
                i
              </span>
            </span>
            <strong>{slippageInput ? `${slippageInput}%` : "N/A"}</strong>
          </div>
          <div className="swap-breakdown-item">
            <span className="muted small">
              Minimum received
              <span
                className="info-icon"
                aria-label="Minimum output after slippage"
                data-tooltip="Minimum output after slippage"
              >
                i
              </span>
            </span>
            <strong>
              {liveSwapOutput
                ? `${formatNumber(liveSwapOutput * (1 - slippageRatio))} `
                : "N/A"}
              {swapDirection === "x-to-y" ? tokenYLabel : tokenXLabel}
            </strong>
          </div>
          <div className="swap-breakdown-item">
            <span className="muted small">
              Estimated fee
              <span
                className="info-icon"
                aria-label="Estimated fee charged in the input token"
                data-tooltip="Estimated fee charged in the input token"
              >
                i
              </span>
            </span>
            <strong>
              {formatNumber(simulator.fee)} {fromLabel}
            </strong>
          </div>
        </div>
      </div>

      <div className="impact-guardrail">
        <div className="impact-row">
          <span className="muted small">
            Guardrail: warn at {PRICE_IMPACT_WARN_PCT}%, confirm at{" "}
            {PRICE_IMPACT_CONFIRM_PCT}%, block at {PRICE_IMPACT_BLOCK_PCT}%.
          </span>
          {splitSuggestionCount > 1 && (
            <button className="tiny ghost" onClick={applySplitSuggestion}>
              Auto split ({splitSuggestionCount}x)
            </button>
          )}
        </div>
        {priceImpact >= PRICE_IMPACT_CONFIRM_PCT &&
          priceImpact < PRICE_IMPACT_BLOCK_PCT && (
            <label className="impact-confirm">
              <input
                type="checkbox"
                checked={impactConfirmed}
                onChange={(e) => setImpactConfirmed(e.target.checked)}
              />
              I understand this swap has high price impact.
            </label>
          )}
        {priceImpact >= PRICE_IMPACT_WARN_PCT &&
          priceImpact < PRICE_IMPACT_CONFIRM_PCT && (
            <p className="muted small">
              Warning: current price impact is {priceImpact.toFixed(2)}%.
              Consider smaller size.
            </p>
          )}
      </div>

      <div className="swap-settings">
        <div>
          <label>Slippage tolerance (%)</label>
          <input
            type="number"
            min="0"
            max="50"
            step="0.1"
            value={slippageInput}
            onChange={(e) => setSlippageInput(e.target.value)}
          />
          <div className="mini-actions">
            <button
              className="tiny ghost"
              onClick={() => setSlippageInput("0.1")}
            >
              0.1%
            </button>
            <button
              className="tiny ghost"
              onClick={() => setSlippageInput("0.5")}
            >
              0.5%
            </button>
            <button
              className="tiny ghost"
              onClick={() => setSlippageInput("1")}
            >
              1%
            </button>
            {onResetSwapSettings ? (
              <button className="tiny ghost" onClick={onResetSwapSettings}>
                Reset
              </button>
            ) : null}
          </div>
        </div>
        <div>
          <label>Deadline (minutes)</label>
          <input
            type="number"
            min="1"
            max="1440"
            step="1"
            value={deadlineMinutesInput}
            onChange={(e) => setDeadlineMinutesInput(e.target.value)}
          />
        </div>
      </div>

      <div className="target-panel">
        <div className="target-head">
          <span className="muted">Target Price</span>
          <label className="target-toggle">
            <input
              type="checkbox"
              checked={targetPriceEnabled}
              onChange={(e) => setTargetPriceEnabled(e.target.checked)}
            />
            Enable
          </label>
        </div>
        <div className="target-meta">
          <span className="muted small">
            When 1 {targetPairDirection === "x-to-y" ? "X" : "Y"}
          </span>
          <button
            className="tiny ghost"
            onClick={() =>
              setTargetPairDirection((prev: any) =>
                prev === "x-to-y" ? "y-to-x" : "x-to-y",
              )
            }
            disabled={!targetPriceEnabled}
          >
            Reverse
          </button>
        </div>
        <div className="target-grid">
          <select
            className="token-select"
            value={targetCondition}
            onChange={(e) =>
              setTargetCondition((e.target.value as ">=" | "<=") || ">=")
            }
            disabled={!targetPriceEnabled}
          >
            <option value=">=">{">="}</option>
            <option value="<=">{"<="}</option>
          </select>
          <input
            className="target-input"
            type="number"
            min="0"
            step="0.000001"
            placeholder={`Target ${targetPairDirection === "x-to-y" ? "Y" : "X"}`}
            value={targetPriceInput}
            onChange={(e) => setTargetPriceInput(e.target.value)}
            disabled={!targetPriceEnabled}
          />
        </div>
        <div className="target-meta">
          <span className="muted small">
            Live:{" "}
            {directionalPrice
              ? `${formatNumber(directionalPrice)} ${targetPairDirection === "x-to-y" ? "Y/X" : "X/Y"}`
              : "N/A"}
          </span>
          <button
            className="tiny ghost"
            onClick={() =>
              directionalPrice > 0 &&
              setTargetPriceInput(directionalPrice.toFixed(6))
            }
            disabled={!targetPriceEnabled || directionalPrice <= 0}
          >
            Use current
          </button>
        </div>
        {targetPriceEnabled && targetPrice && (
          <p className={`note ${targetTriggered ? "subtle" : ""}`}>
            {targetTriggered
              ? `Condition met: 1 ${targetPairDirection === "x-to-y" ? "X" : "Y"} ${targetCondition} ${formatNumber(targetPrice)} ${targetPairDirection === "x-to-y" ? "Y" : "X"}.`
              : `Waiting: 1 ${targetPairDirection === "x-to-y" ? "X" : "Y"} ${targetCondition} ${formatNumber(targetPrice)} ${targetPairDirection === "x-to-y" ? "Y" : "X"}.`}
          </p>
        )}
        <div className="alerts-panel">
          <div className="alerts-head">
            <div>
              <span className="muted">Price Alerts</span>
              <p className="muted small">
                Save the current target as a reusable alert.
              </p>
            </div>
            <button className="tiny ghost" onClick={requestBrowserAlerts}>
              {browserAlertsEnabled ? "Browser alerts on" : "Enable alerts"}
            </button>
          </div>
          <div className="alerts-actions">
            <button
              className="tiny"
              onClick={createPriceAlert}
              disabled={!targetPriceEnabled || !targetPrice}
            >
              Save alert
            </button>
            <button
              className="tiny ghost"
              onClick={clearTriggeredAlerts}
              disabled={alertSummary.triggered.length === 0}
            >
              Clear triggered
            </button>
          </div>
          {priceAlerts.length === 0 ? (
            <p className="muted small">No saved alerts yet.</p>
          ) : (
            <div className="alerts-list">
            {priceAlerts.slice(0, 6).map((alert: any) => {
              const unitFrom = alert.pairDirection === "x-to-y" ? "X" : "Y";
              const unitTo = alert.pairDirection === "x-to-y" ? "Y" : "X";
              return (
                <div className="alerts-item" key={alert.id}>
                    <div className="alerts-main">
                      <span
                        className={`chip ghost status-${alert.status === "triggered" ? "confirmed" : "submitted"}`}
                      >
                        {alert.status}
                      </span>
                      <strong>
                        1 {unitFrom} {alert.condition}{" "}
                        {formatNumber(alert.targetPrice)} {unitTo}
                      </strong>
                    </div>
                    <div className="alerts-meta">
                      <span className="muted small">
                        {alert.status === "triggered" && alert.triggeredAt
                          ? `Triggered ${new Date(alert.triggeredAt).toLocaleString()}`
                          : `Created ${new Date(alert.createdAt).toLocaleString()}`}
                      </span>
                      <div className="mini-actions">
                        <button
                          className="tiny ghost"
                          onClick={() => {
                            setTargetPriceEnabled(true);
                            setTargetPairDirection(alert.pairDirection);
                            setTargetCondition(alert.condition);
                            setTargetPriceInput(String(alert.targetPrice));
                          }}
                        >
                          Use
                        </button>
                        <button
                          className="tiny ghost"
                          onClick={() => removePriceAlert(alert.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    {alert.status === "triggered" && alert.triggeredPrice ? (
                      <p className="muted small">
                        Live hit at {formatNumber(alert.triggeredPrice)}{" "}
                        {unitTo}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="simulator">
        <div className="sim-header">
          <div>
            <p className="eyebrow">Swap Simulator</p>
            <h3>Live curve preview</h3>
          </div>
          <span className="pill-small">Drag to preview</span>
        </div>
        <div className="sim-body">
          <div className="sim-controls">
            <label>Simulated amount</label>
            <input
              type="range"
              min="0"
              max={maxSwap || 0}
              step="0.01"
              value={Math.min(Number(swapInput || 0), maxSwap || 0)}
              onChange={(e) => setSwapInput(e.target.value)}
              disabled={maxSwap <= 0}
            />
            <div className="sim-meta">
              <span className="muted small">
                {formatNumber(simulator.amount)}{" "}
                {swapDirection === "x-to-y" ? "X" : "Y"}
              </span>
              <span className="muted small">Max {formatNumber(maxSwap)}</span>
            </div>
          </div>
          <div className="sim-curve">
            {curvePreview ? (
              <svg
                viewBox="0 0 100 100"
                role="img"
                aria-label="Swap curve preview"
              >
                <path d={curvePreview.path} className="curve-path" />
                <circle
                  cx={curvePreview.current.x}
                  cy={curvePreview.current.y}
                  r="3.5"
                />
                {curvePreview.simulated && (
                  <circle
                    cx={curvePreview.simulated.x}
                    cy={curvePreview.simulated.y}
                    r="4.5"
                    className="curve-point"
                  />
                )}
              </svg>
            ) : (
              <p className="muted small">
                Add liquidity to render the AMM curve.
              </p>
            )}
          </div>
        </div>
        <div className="sim-stats">
          <div>
            <span className="muted small">Post-swap reserves</span>
            <strong>
              {formatNumber(simulator.nextReserveX)} X /{" "}
              {formatNumber(simulator.nextReserveY)} Y
            </strong>
          </div>
          <div>
            <span className="muted small">New price</span>
            <strong>
              {simulator.nextPrice
                ? `1 X ~ ${formatNumber(simulator.nextPrice)} Y`
                : "N/A"}
            </strong>
          </div>
          <div>
            <span className="muted small">Estimated fee</span>
            <strong>
              {formatNumber(simulator.fee)}{" "}
              {swapDirection === "x-to-y" ? "X" : "Y"}
            </strong>
          </div>
        </div>
      </div>

      {(customTokenRequired || highSlippageRequired) && (
        <div className="note warning">
          <p className="muted small">Confirmation required</p>
          <strong>Review risks before swapping</strong>
          <div className="note-actions">
            {customTokenRequired && (
              <label className="target-toggle">
                <input
                  type="checkbox"
                  checked={!!customTokenConfirmed}
                  onChange={(e) => setCustomTokenConfirmed(e.target.checked)}
                />
                I trust these custom tokens
              </label>
            )}
            {highSlippageRequired && (
              <label className="target-toggle">
                <input
                  type="checkbox"
                  checked={!!highSlippageConfirmed}
                  onChange={(e) => setHighSlippageConfirmed(e.target.checked)}
                />
                I accept high slippage
              </label>
            )}
          </div>
          {missingRiskConfirm && (
            <p className="muted small">
              Swap stays disabled until required confirmations are checked.
            </p>
          )}
        </div>
      )}

      {renderApprovalManager("swap")}

      <button
        className="primary"
        onClick={showMinimalSwapLayout ? handleSimpleSwap : handleSwap}
        disabled={
          quoteLoading ||
          swapPending ||
          preflightPending ||
          tokenMismatch ||
          insufficientBalance ||
          noLiquidity ||
          networkMismatch ||
          missingRiskConfirm
        }
      >
        {quoteLoading
          ? "Loading quote..."
          : preflightPending
            ? "Preparing swap..."
            : swapPending
            ? "Swapping..."
            : "Swap"}
      </button>
    </div>
  );
}
