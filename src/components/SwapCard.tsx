const SwapCard = ({
  showMinimalSwapLayout,
  poolContract,
  FEE_BPS,
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
}: {
  showMinimalSwapLayout: boolean;
  poolContract: any;
  FEE_BPS: number;
  swapInput: string;
  setSwapInput: (value: string) => void;
  swapDirection: "x-to-y" | "y-to-x";
  setSwapDirection: (direction: "x-to-y" | "y-to-x") => void;
  balances: any;
  formatNumber: (value: number) => string;
  setSwapPreset: (percentage: number) => void;
  clearSwapInput: () => void;
  setMaxSwap: () => void;
  quoteLoading: boolean;
  liveSwapOutput: number | null;
  currentPrice: number | null;
  pool: any;
}) => (
  <div className="swap-card">
    {showMinimalSwapLayout && (
      <div className="swap-hero-row" aria-label="Swap status">
        <span className="chip success">Instant route</span>
        <span className="chip ghost">{poolContract.contractName}</span>
        <span className="chip ghost">{(FEE_BPS / 100).toFixed(2)}% fee</span>
      </div>
    )}

    <div className="token-card">
      <div className="token-card-head">
        <span className="muted">From</span>
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
          <option value="x">Token X</option>
          <option value="y">Token Y</option>
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
        setSwapDirection((prev) => (prev === "x-to-y" ? "y-to-x" : "x-to-y"))
      }
    >
      Switch
    </button>

    <div className="token-card">
      <div className="token-card-head">
        <span className="muted">To</span>
        <select
          className="token-select"
          value={swapDirection === "x-to-y" ? "y" : "x"}
          disabled
        >
          <option value="x">Token X</option>
          <option value="y">Token Y</option>
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
            ? `1 X = ${formatNumber(currentPrice || 0)} Y`
            : "No liquidity yet"}
        </span>
        <span className="simple-quote-pill muted small">
          {quoteLoading
            ? "Refreshing pool..."
            : liveSwapOutput !== null
              ? `Est. ${formatNumber(liveSwapOutput)} ${swapDirection === "x-to-y" ? "Y" : "X"}`
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

    <div className="inline-stats">
      <div>
        <p className="muted small">Price (X-&gt;Y)</p>
        <strong>
          {currentPrice ? `1 X ~ ${formatNumber(currentPrice)} Y` : "N/A"}
        </strong>
      </div>
      <div>
        <p className="muted small">Fee</p>
        <strong>0.30%</strong>
      </div>
      <div>
        <p className="muted small">Pool reserves</p>
        <strong>
          {formatNumber(pool.reserveX)} X / {formatNumber(pool.reserveY)} Y
        </strong>
      </div>
    </div>
    <div className="breakdown">
      <div>
        <span className="muted small">Price impact</span>
        <strong>{priceImpact ? `${priceImpact.toFixed(4)}%` : "N/A"}</strong>
      </div>
      <div>
        <span className="muted small">Minimum received</span>
        <strong>
          {liveSwapOutput
            ? `${formatNumber(liveSwapOutput * (1 - slippageRatio))} `
            : "N/A"}
          {swapDirection === "x-to-y" ? "Y" : "X"}
        </strong>
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
            Warning: current price impact is {priceImpact.toFixed(2)}%. Consider
            smaller size.
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
          <button className="tiny ghost" onClick={() => setSlippageInput("1")}>
            1%
          </button>
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
            setTargetPairDirection((prev) =>
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
            {priceAlerts.slice(0, 6).map((alert) => {
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
                      Live hit at {formatNumber(alert.triggeredPrice)} {unitTo}
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

    {renderApprovalManager("swap")}

    <button
      className="primary"
      onClick={showMinimalSwapLayout ? handleSimpleSwap : handleSwap}
      disabled={quoteLoading || swapPending || preflightPending}
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
