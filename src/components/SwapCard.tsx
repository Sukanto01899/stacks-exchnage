/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { TOKEN_DECIMALS } from "../constant";
import { tokenAvatarStyle } from "../lib/helper";

const SLIPPAGE_PRESETS = ["0.1", "0.5", "1", "3"] as const;

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
    tokenMismatch,
    swapInput,
    setSwapInput,
    swapDirection,
    setSwapDirection,
    recentSwaps,
    onApplyRecentSwap,
    onClearRecentSwaps,
    balances,
    balancesPending,
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
    lastPoolRefreshAt,
    handleCopySwapSnapshot,
    handleCopySwapLink,
    autoRefreshEnabled,
    setAutoRefreshEnabled,
    autoRefreshIntervalSec,
    setAutoRefreshIntervalSec,
    priceImpact,
    slippageRatio,
    PRICE_IMPACT_WARN_PCT,
    PRICE_IMPACT_CONFIRM_PCT,
    PRICE_IMPACT_BLOCK_PCT,
    suggestedSlippagePercent,
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
    renderApprovalManager,
    handleSimpleSwap,
    handleSwap,
    swapPending,
    preflightPending,
    onGoToPool,
    onMintFaucet,
    onOpenTokenSelector,
    faucetPending,
    faucetCooldownActive,
    faucetCooldownLabel,
    maxSwap,
    priceChange24,
  } = props;

  const tokenXLabel = tokenLabels?.x || "Token X";
  const tokenYLabel = tokenLabels?.y || "Token Y";
  const toBalance =
    swapDirection === "x-to-y" ? balances.tokenY : balances.tokenX;
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
  const maxAvailable = maxSwap && maxSwap > 0 ? maxSwap : fromBalance;
  const hasSwapInput = String(swapInput || "").trim().length > 0;
  const swapAmountIsFinite = Number.isFinite(swapAmount);
  const minSwapAmount = 1 / TOKEN_DECIMALS;
  const swapAmountTooSmall =
    hasSwapInput &&
    swapAmountIsFinite &&
    swapAmount > 0 &&
    swapAmount < minSwapAmount;
  const swapAmountInvalid = hasSwapInput && (!swapAmountIsFinite || swapAmount <= 0);
  const insufficientBalance = hasSwapInput && swapAmountIsFinite && swapAmount > maxAvailable;
  const noLiquidity = pool.reserveX <= 0 || pool.reserveY <= 0;
  const missingRiskConfirm =
    (customTokenRequired && !customTokenConfirmed) ||
    (highSlippageRequired && !highSlippageConfirmed);
  const hasPriceImpact = Number.isFinite(priceImpact);
  const impactBlocked = priceImpact >= PRICE_IMPACT_BLOCK_PCT;
  const impactNeedsConfirm =
    priceImpact >= PRICE_IMPACT_CONFIRM_PCT && priceImpact < PRICE_IMPACT_BLOCK_PCT;
  const missingImpactConfirm = impactNeedsConfirm && !impactConfirmed;
  const hasSuggestedSlippage = Number.isFinite(Number(suggestedSlippagePercent));
  const suggestedSlippage =
    hasSuggestedSlippage ? Number(suggestedSlippagePercent) : null;
  const parsedSlippage = Number(slippageInput);
  const slippageMatchesSuggestion =
    suggestedSlippage !== null &&
    Number.isFinite(parsedSlippage) &&
    Math.abs(parsedSlippage - suggestedSlippage) < 0.01;
  const slippageTrimmed = String(slippageInput ?? "").trim();
  const slippageValid =
    slippageTrimmed !== "" && Number.isFinite(parsedSlippage) && parsedSlippage >= 0;
  const slippageInvalid =
    slippageTrimmed !== "" && (!Number.isFinite(parsedSlippage) || parsedSlippage < 0);
  const slippageIsDefault = slippageValid && Math.abs(parsedSlippage - 0.5) < 0.001;
  const slippageZero = slippageValid && parsedSlippage === 0;
  const slippageVeryLow = slippageValid && parsedSlippage > 0 && parsedSlippage < 0.05;
  const isSlippagePresetActive = (preset: string) =>
    slippageInput === preset ||
    (slippageValid && Math.abs(parsedSlippage - Number(preset)) < 0.001);
  const slippageHint = slippageInvalid
    ? "Enter a valid slippage % (0–50)."
    : slippageZero
      ? "0% slippage will likely cause the swap to fail."
      : slippageVeryLow
        ? "Very low slippage may cause the swap to fail."
        : null;

  const exchangeRate =
    swapAmount > 0 &&
    liveSwapOutput !== null &&
    Number.isFinite(liveSwapOutput) &&
    liveSwapOutput > 0
      ? liveSwapOutput / swapAmount
      : null;

  const setAmountFraction = (fraction: number) => {
    const raw = maxAvailable * fraction;
    if (raw > 0) setSwapInput(String(+raw.toFixed(6)));
  };

  const [isFlipping, setIsFlipping] = useState(false);
  const [outputFlashing, setOutputFlashing] = useState(false);
  const [copiedPool, setCopiedPool] = useState(false);
  const [copiedPrice, setCopiedPrice] = useState(false);

  useEffect(() => {
    if (!copiedPool) return;
    const t = window.setTimeout(() => setCopiedPool(false), 1500);
    return () => window.clearTimeout(t);
  }, [copiedPool]);

  useEffect(() => {
    if (!copiedPrice) return;
    const t = window.setTimeout(() => setCopiedPrice(false), 1500);
    return () => window.clearTimeout(t);
  }, [copiedPrice]);

  const handleCopyPrice = async () => {
    if (!currentPrice) return;
    const text = `1 ${poolTokenXLabel} = ${formatNumber(currentPrice)} ${poolTokenYLabel}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPrice(true);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleCopyPoolContract = async () => {
    if (!poolContract?.address || !poolContract?.contractName) return;
    const id = `${poolContract.address}.${poolContract.contractName}`;
    try {
      await navigator.clipboard.writeText(id);
      setCopiedPool(true);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleFlip = () => {
    setIsFlipping(true);
    setSwapDirection((prev: "x-to-y" | "y-to-x") =>
      prev === "x-to-y" ? "y-to-x" : "x-to-y"
    );
    window.setTimeout(() => setIsFlipping(false), 320);
  };

  useEffect(() => {
    if (liveSwapOutput === null || !Number.isFinite(liveSwapOutput)) return;
    setOutputFlashing(true);
    const t = window.setTimeout(() => setOutputFlashing(false), 650);
    return () => window.clearTimeout(t);
  }, [liveSwapOutput]);

  const handleSwapAmountBlur = () => {
    if (!hasSwapInput || !swapAmountIsFinite) return;
    if (maxAvailable > 0 && swapAmount > maxAvailable) {
      setSwapInput(String(maxAvailable));
    }
  };

  const normalizeSlippageInput = () => {
    const raw = String(slippageInput ?? "").trim();
    if (!raw) return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(50, Math.max(0, parsed));
    const normalized = clamped.toFixed(2).replace(/\.?0+$/, "");
    setSlippageInput(normalized);
  };

  const renderIcon = (iconUrl: string | null, label: string, isStx: boolean) => {
    if (iconUrl) {
      return <img className="token-icon" src={iconUrl} alt="" />;
    }
    const text = isStx ? "STX" : label.slice(0, 1).toUpperCase();
    return (
      <span
        className="token-icon token-icon-fallback"
        style={tokenAvatarStyle(isStx ? "STX" : label)}
      >
        <span className="token-icon-text">{text}</span>
      </span>
    );
  };

  const refreshLabel = lastPoolRefreshAt
    ? `Updated ${new Date(lastPoolRefreshAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`
    : "Not updated yet";

  if (showMinimalSwapLayout) {
    const outputText =
      liveSwapOutput !== null && Number.isFinite(liveSwapOutput) && liveSwapOutput > 0
        ? formatNumber(liveSwapOutput)
        : "";

    return (
      <div className="swap-card">
        {(networkMismatch || tokenMismatch || noLiquidity || insufficientBalance) && (
          <div className={`note ${networkMismatch || noLiquidity ? "error" : "warning"}`}>
            <strong>
              {networkMismatch
                ? `Connected wallet is not on ${resolvedStacksNetwork}.`
                : tokenMismatch
                  ? "Selected tokens do not match the pool."
                  : noLiquidity
                    ? "Pool has no liquidity yet."
                    : "Insufficient balance."}
            </strong>
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
                onClick={() => setAmountFraction(0.25)}
                disabled={maxAvailable <= 0}
              >
                25%
              </button>
              <button
                className="tiny ghost"
                onClick={() => setAmountFraction(0.5)}
                disabled={maxAvailable <= 0}
              >
                50%
              </button>
              <button
                className="tiny ghost"
                onClick={() => setAmountFraction(0.75)}
                disabled={maxAvailable <= 0}
              >
                75%
              </button>
              <button
                className="tiny ghost"
                onClick={setMaxSwap}
                disabled={maxAvailable <= 0}
                title={
                  fromIsStx
                    ? "Keeps 0.1 STX for transaction fees"
                    : "Use your full balance"
                }
              >
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
              onKeyDown={(e) => {
                if (["e", "E", "+", "-"].includes(e.key)) {
                  e.preventDefault();
                  return;
                }
                if (e.key === "Escape" && String(swapInput || "").trim()) {
                  e.preventDefault();
                  clearSwapInput();
                }
              }}
              onBlur={handleSwapAmountBlur}
              min="0"
              step="0.000001"
              placeholder="0.0"
            />
            <button
              className="token-badge"
              type="button"
              onClick={handleFlip}
              title="Click to flip token direction"
            >
              {renderIcon(fromIcon, fromLabel, fromIsStx)}
              <span>{fromLabel}</span>
              <svg className="flip-indicator" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M3 1.5v5m0 0L1.5 5M3 6.5l1.5-1.5M7 8.5v-5m0 0L8.5 5M7 3.5 5.5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
          <div className="swap-balance-row" aria-label="From balance">
            {balancesPending ? (
              <span className="skeleton-text skeleton-short" aria-label="Loading balance" />
            ) : (
              <button
                className={`swap-balance-btn${insufficientBalance ? " is-insufficient" : ""}`}
                type="button"
                onClick={maxAvailable > 0 ? setMaxSwap : undefined}
                disabled={maxAvailable <= 0}
                title={
                  maxAvailable > 0
                    ? fromIsStx
                      ? "Click to use max (keeps 0.1 STX for fees)"
                      : "Click to use max balance"
                    : undefined
                }
              >
                Balance: {formatNumber(fromBalance)} {fromLabel}
              </button>
            )}
            <button
              className={`balance-refresh-btn${balancesPending || poolPending ? " is-spinning" : ""}`}
              type="button"
              onClick={() => void handleManualRefresh()}
              disabled={balancesPending || poolPending}
              title="Refresh balances"
              aria-label="Refresh balances"
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M10.5 2.5A5 5 0 1 0 11 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                <path d="M11 1.5v2h-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        <div className="swap-simple-mid">
          <button
            className={`icon-button swap-simple-flip${isFlipping ? " is-flipping" : ""}`}
            type="button"
            aria-label="Flip swap direction"
            title="Flip"
            onClick={handleFlip}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4.5 2v9m0 0L2 8.5M4.5 11l2.5-2.5M11.5 14V5m0 0L14 7.5M11.5 5 9 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {exchangeRate !== null && !quoteLoading && (
            <span className="swap-mid-rate">
              1 {fromLabel} ≈ {formatNumber(exchangeRate)} {toLabel}
            </span>
          )}
        </div>

        <div className="token-card">
          <div className="token-card-head">
            <span className="muted">To</span>
            <span className="token-inline muted small">
              {renderIcon(toIcon, toLabel, toIsStx)}
              {toLabel}
            </span>
          </div>
          <div className="token-input">
            {quoteLoading ? (
              <span className="skeleton-text skeleton-output" aria-label="Loading quote" />
            ) : (
              <input
                type="text"
                value={outputText}
                readOnly
                placeholder="0.0"
              />
            )}
            <span className="token-badge token-badge--static">
              {renderIcon(toIcon, toLabel, toIsStx)}
              <span>{toLabel}</span>
            </span>
          </div>
        </div>

        <div className="swap-settings swap-settings--simple">
          <div className="swap-setting-row">
            <span className="muted small">Slippage</span>
            <div className="swap-setting-pills" aria-label="Slippage presets">
              {SLIPPAGE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  className={`tiny ghost${isSlippagePresetActive(preset) ? " is-active" : ""}${Number(preset) >= 3 && !isSlippagePresetActive(preset) ? " is-warn" : ""}`}
                  type="button"
                  title={Number(preset) >= 3 ? "Higher slippage — suits volatile pairs" : undefined}
                  onClick={() => setSlippageInput(preset)}
                  aria-pressed={isSlippagePresetActive(preset)}
                >
                  {preset}%
                </button>
              ))}
              {suggestedSlippage !== null && (
                <button
                  className={`tiny ghost${slippageMatchesSuggestion ? " is-active" : ""}`}
                  type="button"
                  onClick={() => setSlippageInput(String(suggestedSlippage))}
                  disabled={slippageMatchesSuggestion}
                  title={`Suggested from current price impact (${suggestedSlippage}%)`}
                  aria-pressed={slippageMatchesSuggestion}
                >
                  Auto {suggestedSlippage}%
                </button>
              )}
            </div>
            <input
              className="tiny"
              inputMode="decimal"
              value={slippageInput}
              onChange={(e) => setSlippageInput(e.target.value)}
              onBlur={normalizeSlippageInput}
              placeholder="0.5"
              aria-label="Slippage percent"
            />
            {!slippageIsDefault && onResetSwapSettings && (
              <button
                className="tiny ghost"
                type="button"
                onClick={onResetSwapSettings}
                title="Reset slippage to 0.5%"
              >
                Reset
              </button>
            )}
          </div>
          {slippageHint && <p className="muted small">{slippageHint}</p>}
        </div>

        {renderApprovalManager("swap")}

        <button
          className="primary"
          onClick={handleSimpleSwap}
          disabled={
            quoteLoading ||
            swapPending ||
            preflightPending ||
            tokenMismatch ||
            insufficientBalance ||
            noLiquidity ||
            networkMismatch ||
            missingRiskConfirm ||
            missingImpactConfirm ||
            impactBlocked ||
            swapAmountInvalid ||
            swapAmountTooSmall
          }
        >
          {(quoteLoading || preflightPending || swapPending) && (
            <span className="loading-spinner button-spinner" aria-hidden="true" />
          )}
          {quoteLoading
            ? "Loading quote..."
            : preflightPending
              ? "Preparing swap..."
              : swapPending
                ? "Swapping..."
                : "Swap"}
        </button>
        <button className="tiny ghost swap-share-btn" type="button" onClick={handleCopySwapLink}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M4.5 2H2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V7.5M7.5 1H11m0 0v3.5M11 1 5.5 6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Copy link
        </button>
      </div>
    );
  }

  return (
    <div className="swap-card">
      {(networkMismatch || tokenMismatch || noLiquidity || insufficientBalance) && (
        <div className={`note ${networkMismatch || noLiquidity ? "error" : "warning"}`}>
          <strong>
            {networkMismatch
              ? `Wallet not on ${resolvedStacksNetwork}. Swaps are disabled.`
              : tokenMismatch
                ? "Selected tokens do not match the pool."
                : noLiquidity
                  ? "Pool has no liquidity yet. Swaps are disabled."
                  : `Insufficient balance. Max ${formatNumber(maxAvailable)} ${fromLabel}.`}
          </strong>
          <div className="note-actions">
            {tokenMismatch && onOpenTokenSelector && (
              <button className="tiny ghost" onClick={onOpenTokenSelector}>
                Open token selector
              </button>
            )}
            {!tokenMismatch && noLiquidity && onGoToPool && (
              <button className="tiny ghost" onClick={onGoToPool}>
                Go to Pool
              </button>
            )}
            {insufficientBalance && onMintFaucet && (
              <button
                className="tiny"
                onClick={() => onMintFaucet()}
                disabled={faucetPending || faucetCooldownActive}
              >
                {faucetPending
                  ? "Minting..."
                  : faucetCooldownActive
                    ? `⏳ Ready in ${faucetCooldownLabel || "..."}`.trim()
                    : "Mint from Faucet"}
              </button>
            )}
          </div>
        </div>
      )}

      {Array.isArray(recentSwaps) && recentSwaps.length > 0 && (
        <div className="recent-swaps-row">
          <span className="muted small">Recent</span>
          <div className="recent-swaps-chips">
            {recentSwaps.map((entry: any) => (
              <button
                key={`${entry.poolId}-${entry.direction}`}
                type="button"
                className="chip recent-swap-chip"
                title={`Swap ${entry.fromLabel} → ${entry.toLabel}`}
                onClick={() => onApplyRecentSwap?.(entry)}
              >
                {entry.fromLabel} → {entry.toLabel}
              </button>
            ))}
          </div>
          {onClearRecentSwaps && (
            <button
              type="button"
              className="tiny ghost"
              onClick={() => onClearRecentSwaps()}
            >
              Clear
            </button>
          )}
        </div>
      )}

      <div className="token-card">
        {(poolPending || balancesPending) && (
          <div className="loading-strip" role="status">
            <span className="loading-spinner" aria-hidden="true" />
            <span>
              {poolPending ? "Refreshing pool data..." : "Refreshing balances..."}
            </span>
          </div>
        )}
        <div className="token-card-head">
          <span className="muted">From</span>
          <span className="token-inline muted small">
            {renderIcon(fromIcon, fromLabel, fromIsStx)}
            {fromLabel}
          </span>
          <div className="mini-actions">
            <button
              className="tiny ghost"
              onClick={() => setAmountFraction(0.25)}
              disabled={maxAvailable <= 0}
            >
              25%
            </button>
            <button
              className="tiny ghost"
              onClick={() => setAmountFraction(0.5)}
              disabled={maxAvailable <= 0}
            >
              50%
            </button>
            <button
              className="tiny ghost"
              onClick={() => setAmountFraction(0.75)}
              disabled={maxAvailable <= 0}
            >
              75%
            </button>
            <button
              className="tiny ghost"
              onClick={setMaxSwap}
              disabled={maxAvailable <= 0}
              title={fromIsStx ? "Keeps 0.1 STX for transaction fees" : "Use your full balance"}
            >
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
            onKeyDown={(e) => {
              if (["e", "E", "+", "-"].includes(e.key)) {
                e.preventDefault();
                return;
              }
              if (e.key === "Escape" && String(swapInput || "").trim()) {
                e.preventDefault();
                clearSwapInput();
              }
            }}
            onBlur={handleSwapAmountBlur}
            min="0"
            step="0.000001"
            placeholder="0.0"
          />
          <button
            className="token-badge"
            type="button"
            onClick={handleFlip}
            title="Click to flip token direction"
          >
            {renderIcon(fromIcon, fromLabel, fromIsStx)}
            <span>{fromLabel}</span>
            <svg className="flip-indicator" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <path d="M3 1.5v5m0 0L1.5 5M3 6.5l1.5-1.5M7 8.5v-5m0 0L8.5 5M7 3.5 5.5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        <div className="swap-balance-row" aria-label="From balance">
          {balancesPending ? (
            <span className="skeleton-text skeleton-short" aria-label="Loading balance" />
          ) : (
            <button
              className={`swap-balance-btn${insufficientBalance ? " is-insufficient" : ""}`}
              type="button"
              onClick={maxAvailable > 0 ? setMaxSwap : undefined}
              disabled={maxAvailable <= 0}
              title={maxAvailable > 0 ? (fromIsStx ? "Click to use max (keeps 0.1 STX for fees)" : "Click to use max balance") : undefined}
            >
              Balance: {formatNumber(fromBalance)} {fromLabel}
            </button>
          )}
          <button
            className={`balance-refresh-btn${balancesPending || poolPending ? " is-spinning" : ""}`}
            type="button"
            onClick={() => void handleManualRefresh()}
            disabled={balancesPending || poolPending}
            title="Refresh balances"
            aria-label="Refresh balances"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M10.5 2.5A5 5 0 1 0 11 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              <path d="M11 1.5v2h-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        {swapAmountInvalid && (
          <p className="muted small">Enter an amount greater than 0.</p>
        )}
        {swapAmountTooSmall && (
          <p className="muted small">
            Amount is below minimum ({minSwapAmount.toFixed(6)} {fromLabel}).
          </p>
        )}
      </div>

      <div className="swap-simple-mid">
        <button
          className={`icon-button swap-simple-flip${isFlipping ? " is-flipping" : ""}`}
          type="button"
          aria-label="Flip swap direction"
          onClick={handleFlip}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4.5 2v9m0 0L2 8.5M4.5 11l2.5-2.5M11.5 14V5m0 0L14 7.5M11.5 5 9 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        {exchangeRate !== null && !quoteLoading && (
          <span className="swap-mid-rate">
            1 {fromLabel} ≈ {formatNumber(exchangeRate)} {toLabel}
          </span>
        )}
      </div>

      <div className="token-card">
        <div className="token-card-head">
          <span className="muted">To</span>
          <span className="token-inline muted small">
            {renderIcon(toIcon, toLabel, toIsStx)}
            {toLabel}
          </span>
        </div>
        <div className="token-input">
          {quoteLoading ? (
            <span className="skeleton-text skeleton-output" aria-label="Loading quote" />
          ) : (
            <input
              type="text"
              value={
                liveSwapOutput !== null && Number.isFinite(liveSwapOutput) && liveSwapOutput > 0
                  ? formatNumber(liveSwapOutput)
                  : ""
              }
              readOnly
              placeholder={noLiquidity ? "No pool" : "0.0"}
              className={outputFlashing && !quoteLoading ? "is-flashing" : ""}
            />
          )}
          <span className="token-badge token-badge--static">
            {renderIcon(toIcon, toLabel, toIsStx)}
            <span>{toLabel}</span>
          </span>
        </div>
        <div className="swap-balance-row" aria-label="To balance">
          {balancesPending ? (
            <span className="skeleton-text skeleton-short" aria-label="Loading balance" />
          ) : (
            <span className="muted small">
              Balance: {formatNumber(toBalance)} {toLabel}
            </span>
          )}
          <span className="muted small">
            {exchangeRate !== null
              ? `1 ${fromLabel} ≈ ${formatNumber(exchangeRate)} ${toLabel}`
              : "Expected output"}
          </span>
        </div>
      </div>

      {(currentPrice || hasPriceImpact || liveSwapOutput || poolContract?.contractName) && (
        <div className="swap-breakdown-compact">
          {currentPrice && (
            <button
              className={`chip ghost price-copy-chip${copiedPrice ? " is-copied" : ""}`}
              type="button"
              onClick={() => void handleCopyPrice()}
              title="Click to copy price"
              aria-label="Copy current price"
            >
              {copiedPrice ? (
                <>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                    <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Copied
                </>
              ) : (
                <>1 {poolTokenXLabel} = {formatNumber(currentPrice)} {poolTokenYLabel}</>
              )}
            </button>
          )}
          {priceChange24 !== null && priceChange24 !== undefined && Number.isFinite(priceChange24) && (
            <span className={`chip ${priceChange24 >= 0 ? "price-up" : "price-down"}`} title="24h price change">
              {priceChange24 >= 0 ? "+" : ""}{priceChange24.toFixed(2)}% 24h
            </span>
          )}
          <span className="chip ghost">Fee: {(FEE_BPS / 100).toFixed(2)}%</span>
          {hasPriceImpact && (
            <span className={`chip ghost${priceImpact >= PRICE_IMPACT_CONFIRM_PCT ? " impact-high" : priceImpact >= PRICE_IMPACT_WARN_PCT ? " impact-warn" : ""}`}>
              Impact: {priceImpact.toFixed(2)}%
            </span>
          )}
          {liveSwapOutput ? (
            <span className="chip ghost">
              Min: {formatNumber(liveSwapOutput * (1 - slippageRatio))}{" "}
              {swapDirection === "x-to-y" ? tokenYLabel : tokenXLabel}
            </span>
          ) : null}
          {poolContract?.contractName && (
            <button
              className={`chip ghost swap-pool-copy-btn${copiedPool ? " is-copied" : ""}`}
              type="button"
              onClick={() => void handleCopyPoolContract()}
              title={`Copy pool contract: ${poolContract.address}.${poolContract.contractName}`}
              aria-label="Copy pool contract address"
            >
              {copiedPool ? (
                <>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                    <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Copied
                </>
              ) : (
                <>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                    <rect x="0.75" y="2.75" width="6.5" height="6.5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                    <path d="M2.75 2.75V2A.75.75 0 0 1 3.5 1.25h4.75A.75.75 0 0 1 9 2v4.75a.75.75 0 0 1-.75.75H7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                  {poolContract.contractName}
                </>
              )}
            </button>
          )}
        </div>
      )}

      <div className="swap-settings swap-settings--simple">
        <div className="swap-setting-row">
          <span className="muted small">Slippage</span>
          <div className="swap-setting-pills" aria-label="Slippage presets">
            {SLIPPAGE_PRESETS.map((preset) => (
              <button
                key={preset}
                className={`tiny ghost ${isSlippagePresetActive(preset) ? "is-active" : ""}`}
                type="button"
                onClick={() => setSlippageInput(preset)}
                aria-pressed={isSlippagePresetActive(preset)}
              >
                {preset}%
              </button>
            ))}
            {suggestedSlippage !== null && (
              <button
                className={`tiny ghost ${slippageMatchesSuggestion ? "is-active" : ""}`}
                onClick={() => setSlippageInput(String(suggestedSlippage))}
                disabled={slippageMatchesSuggestion}
                type="button"
              >
                Auto {suggestedSlippage}%
              </button>
            )}
          </div>
          <input
            className="tiny"
            inputMode="decimal"
            value={slippageInput}
            onChange={(e) => setSlippageInput(e.target.value)}
            onBlur={normalizeSlippageInput}
            placeholder="0.5"
            aria-label="Slippage percent"
          />
          {!slippageIsDefault && onResetSwapSettings && (
            <button
              className="tiny ghost"
              type="button"
              onClick={onResetSwapSettings}
              title="Reset slippage to 0.5%"
            >
              Reset
            </button>
          )}
        </div>
        {slippageHint && <p className="muted small">{slippageHint}</p>}
      </div>

      {priceImpact >= PRICE_IMPACT_WARN_PCT && priceImpact < PRICE_IMPACT_CONFIRM_PCT && (
        <p className="muted small">
          Warning: price impact is {priceImpact.toFixed(2)}%. Consider a smaller size.
        </p>
      )}
      {impactNeedsConfirm && (
        <label className="impact-confirm">
          <input
            type="checkbox"
            checked={impactConfirmed}
            onChange={(e) => setImpactConfirmed(e.target.checked)}
          />
          I understand this swap has high price impact ({priceImpact.toFixed(2)}%).
        </label>
      )}
      {impactBlocked && (
        <p className="muted small">
          Swap blocked: price impact {priceImpact.toFixed(2)}% exceeds {PRICE_IMPACT_BLOCK_PCT}%.
        </p>
      )}

      {(customTokenRequired || highSlippageRequired) && (
        <div className="note warning">
          <strong>Confirm risks before swapping</strong>
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
        </div>
      )}

      {renderApprovalManager("swap")}

      <button
        className="primary"
        onClick={handleSwap}
        disabled={
          quoteLoading ||
          swapPending ||
          preflightPending ||
          tokenMismatch ||
          insufficientBalance ||
          noLiquidity ||
          networkMismatch ||
          missingRiskConfirm ||
          missingImpactConfirm ||
          impactBlocked ||
          swapAmountInvalid ||
          swapAmountTooSmall
        }
      >
        {(quoteLoading || preflightPending || swapPending) && (
          <span className="loading-spinner button-spinner" aria-hidden="true" />
        )}
        {quoteLoading
          ? "Loading quote..."
          : preflightPending
            ? "Preparing swap..."
            : swapPending
              ? "Swapping..."
              : "Swap"}
      </button>
      <button className="tiny ghost swap-share-btn" type="button" onClick={handleCopySwapLink}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M4.5 2H2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V7.5M7.5 1H11m0 0v3.5M11 1 5.5 6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Copy link
      </button>
    </div>
  );
}
