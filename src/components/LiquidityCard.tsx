const LiquidityCard = () => (
  <div className="lp-stack">
    <div className="token-card">
      <div className="token-card-head">
        <span className="muted">Add to pool</span>
        <div className="mini-actions">
          <button className="tiny ghost" onClick={handleSyncToPoolRatio}>
            Match pool ratio
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
          <label>Token X</label>
          <input
            type="number"
            value={liqX}
            onChange={(e) => setLiqX(e.target.value)}
            min="0"
            placeholder="0.0"
          />
          <p className="muted small">
            Balance: {formatNumber(balances.tokenX)}
          </p>
          <button
            className="tiny ghost"
            onClick={() => fillLiquidityInput("x")}
          >
            Use X balance
          </button>
        </div>
        <div>
          <label>Token Y</label>
          <input
            type="number"
            value={liqY}
            onChange={(e) => setLiqY(e.target.value)}
            min="0"
            placeholder="0.0"
          />
          <p className="muted small">
            Balance: {formatNumber(balances.tokenY)}
          </p>
          <button
            className="tiny ghost"
            onClick={() => fillLiquidityInput("y")}
          >
            Use Y balance
          </button>
        </div>
      </div>
      {renderApprovalManager("liquidity")}
      <button className="primary" onClick={handleAddLiquidity}>
        Add liquidity
      </button>
    </div>

    <div className="token-card">
      <div className="token-card-head">
        <span className="muted">Remove from pool</span>
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
      <p className="muted small">
        Your LP: {formatNumber(balances.lpShares)} / Pool share:{" "}
        {(poolShare * 100).toFixed(2)}%
      </p>
      <button className="primary" onClick={handleRemoveLiquidity}>
        Remove from pool
      </button>
    </div>
  </div>
);

export default LiquidityCard;
