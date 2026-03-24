import { useEffect, useMemo, useState } from "react";

type MarketInput = {
  id: string;
  label: string;
  tokenXLabel: string;
  tokenYLabel: string;
};

type Props = {
  markets: MarketInput[];
  formatNumber: (value: number) => string;
};

const hashSeed = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const TradeSimulatorPanel = ({ markets, formatNumber }: Props) => {
  const [marketId, setMarketId] = useState(markets[0]?.id ?? "");
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [target, setTarget] = useState("");
  const [size, setSize] = useState("100");
  const [lastPrice, setLastPrice] = useState(0);

  useEffect(() => {
    if (!marketId) return;
    const seed = hashSeed(marketId);
    const base = 0.8 + (seed % 1000) / 1000 * 6.2;
    setLastPrice(Number(base.toFixed(4)));
    const timer = window.setInterval(() => {
      const drift = (Math.random() - 0.5) * 0.5;
      setLastPrice((prev) =>
        Number(Math.max(0.0001, prev * (1 + drift / 100)).toFixed(4)),
      );
    }, 1800);
    return () => window.clearInterval(timer);
  }, [marketId]);

  useEffect(() => {
    if (!entry) {
      setEntry(String(lastPrice || ""));
    }
  }, [lastPrice, entry]);

  const parse = (value: string) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  const entryNum = parse(entry);
  const stopNum = parse(stop);
  const targetNum = parse(target);
  const sizeNum = parse(size) ?? 0;

  const riskPerUnit = useMemo(() => {
    if (entryNum === null || stopNum === null) return null;
    return direction === "long" ? entryNum - stopNum : stopNum - entryNum;
  }, [direction, entryNum, stopNum]);

  const rewardPerUnit = useMemo(() => {
    if (entryNum === null || targetNum === null) return null;
    return direction === "long" ? targetNum - entryNum : entryNum - targetNum;
  }, [direction, entryNum, targetNum]);

  const riskAmount =
    riskPerUnit !== null && riskPerUnit > 0 ? riskPerUnit * sizeNum : null;
  const rewardAmount =
    rewardPerUnit !== null && rewardPerUnit > 0 ? rewardPerUnit * sizeNum : null;
  const rr =
    riskPerUnit && rewardPerUnit && riskPerUnit > 0
      ? rewardPerUnit / riskPerUnit
      : null;

  const stopHint =
    entryNum !== null && stopNum !== null
      ? direction === "long"
        ? stopNum >= entryNum
          ? "Stop should be below entry."
          : null
        : stopNum <= entryNum
          ? "Stop should be above entry."
          : null
      : null;

  const targetHint =
    entryNum !== null && targetNum !== null
      ? direction === "long"
        ? targetNum <= entryNum
          ? "Target should be above entry."
          : null
        : targetNum >= entryNum
          ? "Target should be below entry."
          : null
      : null;

  const handleUseLast = () => {
    setEntry(String(lastPrice));
  };

  const handleQuickStop = (percent: number) => {
    if (entryNum === null) return;
    const multiplier = direction === "long" ? 1 - percent : 1 + percent;
    setStop(String(Number((entryNum * multiplier).toFixed(4))));
  };

  const handleQuickTarget = (percent: number) => {
    if (entryNum === null) return;
    const multiplier = direction === "long" ? 1 + percent : 1 - percent;
    setTarget(String(Number((entryNum * multiplier).toFixed(4))));
  };

  const marketLabel =
    markets.find((market) => market.id === marketId)?.tokenXLabel ?? "";
  const marketQuote =
    markets.find((market) => market.id === marketId)?.tokenYLabel ?? "";

  return (
    <div className="trade-sim-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Trade simulator</p>
          <h3>Entry, stop, target</h3>
        </div>
        <div className="trade-sim-price">
          <span className="muted small">Last</span>
          <strong>
            {formatNumber(lastPrice)} {marketQuote}
          </strong>
        </div>
      </div>

      <div className="trade-sim-controls">
        <div className="trade-sim-select">
          <label>Market</label>
          <select value={marketId} onChange={(e) => setMarketId(e.target.value)}>
            {markets.map((market) => (
              <option key={market.id} value={market.id}>
                {market.tokenXLabel}/{market.tokenYLabel} · {market.label}
              </option>
            ))}
          </select>
        </div>
        <div className="trade-sim-select">
          <label>Direction</label>
          <div className="trade-sim-direction">
            <button
              type="button"
              className={`chip ${direction === "long" ? "is-favorite" : ""}`}
              onClick={() => setDirection("long")}
            >
              Long
            </button>
            <button
              type="button"
              className={`chip ${direction === "short" ? "is-favorite" : ""}`}
              onClick={() => setDirection("short")}
            >
              Short
            </button>
          </div>
        </div>
      </div>

      <div className="trade-sim-grid">
        <div>
          <label>Entry</label>
          <div className="trade-sim-input-row">
            <input
              type="number"
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
            />
            <button className="tiny ghost" type="button" onClick={handleUseLast}>
              Use last
            </button>
          </div>
        </div>
        <div>
          <label>Stop</label>
          <div className="trade-sim-input-row">
            <input
              type="number"
              value={stop}
              onChange={(e) => setStop(e.target.value)}
            />
            <div className="trade-sim-quick">
              <button
                className="tiny ghost"
                type="button"
                onClick={() => handleQuickStop(0.01)}
              >
                1%
              </button>
              <button
                className="tiny ghost"
                type="button"
                onClick={() => handleQuickStop(0.02)}
              >
                2%
              </button>
            </div>
          </div>
          {stopHint && <p className="muted small">{stopHint}</p>}
        </div>
        <div>
          <label>Target</label>
          <div className="trade-sim-input-row">
            <input
              type="number"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
            <div className="trade-sim-quick">
              <button
                className="tiny ghost"
                type="button"
                onClick={() => handleQuickTarget(0.02)}
              >
                2%
              </button>
              <button
                className="tiny ghost"
                type="button"
                onClick={() => handleQuickTarget(0.04)}
              >
                4%
              </button>
            </div>
          </div>
          {targetHint && <p className="muted small">{targetHint}</p>}
        </div>
        <div>
          <label>Position size ({marketLabel})</label>
          <input
            type="number"
            value={size}
            onChange={(e) => setSize(e.target.value)}
          />
        </div>
      </div>

      <div className="trade-sim-stats">
        <div>
          <span className="muted small">Risk / unit</span>
          <strong>
            {riskPerUnit && riskPerUnit > 0 ? formatNumber(riskPerUnit) : "—"}
          </strong>
        </div>
        <div>
          <span className="muted small">Reward / unit</span>
          <strong>
            {rewardPerUnit && rewardPerUnit > 0
              ? formatNumber(rewardPerUnit)
              : "—"}
          </strong>
        </div>
        <div>
          <span className="muted small">Risk amount</span>
          <strong>{riskAmount ? formatNumber(riskAmount) : "—"}</strong>
        </div>
        <div>
          <span className="muted small">Reward amount</span>
          <strong>{rewardAmount ? formatNumber(rewardAmount) : "—"}</strong>
        </div>
        <div>
          <span className="muted small">Risk/Reward</span>
          <strong>{rr ? rr.toFixed(2) : "—"}</strong>
        </div>
        <div>
          <span className="muted small">Position value</span>
          <strong>
            {entryNum && sizeNum ? formatNumber(entryNum * sizeNum) : "—"}
          </strong>
        </div>
      </div>
    </div>
  );
};

export default TradeSimulatorPanel;
