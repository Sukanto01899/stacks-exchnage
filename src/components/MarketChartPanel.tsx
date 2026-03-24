import { useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";

type Timeframe = "1H" | "4H" | "1D" | "1W";
type IndicatorKey = "ma" | "ema" | "rsi";
type DrawTool = "none" | "hline" | "trend";

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

type LineDrawing =
  | { id: string; type: "hline"; y: number }
  | { id: string; type: "trend"; x1: number; y1: number; x2: number; y2: number };

const chartDims = {
  width: 640,
  height: 260,
  padding: 26,
};

const rsiDims = {
  width: 640,
  height: 120,
  padding: 22,
};

const mulberry32 = (seed: number) => {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let result = Math.imul(t ^ (t >>> 15), t | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
};

const seedFrom = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
};

const buildSeries = (id: string, timeframe: Timeframe, points: number) => {
  const seed = seedFrom(`${id}-${timeframe}`);
  const rand = mulberry32(seed);
  const base = 0.8 + rand() * 4.2;
  let value = base;
  const series = Array.from({ length: points }, (_, idx) => {
    const noise = (rand() - 0.5) * 0.07;
    const trend = Math.sin(idx / 12) * 0.02;
    value = Math.max(0.01, value * (1 + noise + trend));
    return value;
  });
  return series;
};

const buildCandles = (id: string, timeframe: Timeframe, points: number) => {
  const seed = seedFrom(`${id}-${timeframe}-ohlc`);
  const rand = mulberry32(seed);
  const closes = buildSeries(id, timeframe, points);
  return closes.map((close, idx) => {
    const prev = idx === 0 ? close : closes[idx - 1];
    const open = prev * (0.996 + rand() * 0.008);
    const high = Math.max(open, close) * (1 + rand() * 0.015);
    const low = Math.min(open, close) * (1 - rand() * 0.015);
    return { open, high, low, close };
  });
};

const buildPath = (values: number[], width: number, height: number, padding: number) => {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  return values
    .map((value, idx) => {
      const x = padding + (idx / (values.length - 1)) * innerW;
      const y = padding + innerH - ((value - min) / span) * innerH;
      return `${idx === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
};

const calcMA = (values: number[], period: number) => {
  if (values.length < period) return [];
  return values.map((_, idx) => {
    const start = Math.max(0, idx - period + 1);
    const slice = values.slice(start, idx + 1);
    const sum = slice.reduce((acc, v) => acc + v, 0);
    return sum / slice.length;
  });
};

const calcEMA = (values: number[], period: number) => {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [];
  values.forEach((value, idx) => {
    if (idx === 0) {
      ema.push(value);
    } else {
      ema.push(value * k + ema[idx - 1] * (1 - k));
    }
  });
  return ema;
};

const calcRSI = (values: number[], period: number) => {
  if (values.length < period + 1) return [];
  const changes = values.slice(1).map((v, i) => v - values[i]);
  const gains: number[] = [];
  const losses: number[] = [];
  changes.forEach((delta) => {
    gains.push(Math.max(0, delta));
    losses.push(Math.max(0, -delta));
  });
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const rsi: number[] = Array(period).fill(50);
  for (let i = period; i < gains.length; i += 1) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(100 - 100 / (1 + rs));
  }
  return [50, ...rsi];
};

const MarketChartPanel = ({ markets, formatNumber }: Props) => {
  const [timeframe, setTimeframe] = useState<Timeframe>("1D");
  const [primaryId, setPrimaryId] = useState(markets[0]?.id ?? "");
  const [compareId, setCompareId] = useState("");
  const [activeIndicators, setActiveIndicators] = useState<IndicatorKey[]>([
    "ma",
    "ema",
  ]);
  const [drawTool, setDrawTool] = useState<DrawTool>("none");
  const [drawings, setDrawings] = useState<LineDrawing[]>([]);
  const [pendingTrend, setPendingTrend] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [draggingCrosshair, setDraggingCrosshair] = useState(false);
  const [crosshairPinned, setCrosshairPinned] = useState(false);
  const [pinMode, setPinMode] = useState(true);

  const points = useMemo(() => {
    if (timeframe === "1H") return 48;
    if (timeframe === "4H") return 72;
    if (timeframe === "1W") return 168;
    return 96;
  }, [timeframe]);

  const primaryCandles = useMemo(() => {
    if (!primaryId) return [];
    return buildCandles(primaryId, timeframe, points);
  }, [points, primaryId, timeframe]);

  const primary = useMemo(
    () => primaryCandles.map((candle) => candle.close),
    [primaryCandles],
  );

  const volumes = useMemo(() => {
    if (!primaryId) return [];
    const seed = seedFrom(`${primaryId}-${timeframe}-volume`);
    const rand = mulberry32(seed);
    return primaryCandles.map((candle) => {
      const range = Math.max(candle.high - candle.low, 0.0001);
      return range * (9000 + rand() * 6000);
    });
  }, [primaryCandles, primaryId, timeframe]);

  const compare = useMemo(() => {
    if (!compareId) return [];
    return buildSeries(compareId, timeframe, points);
  }, [compareId, points, timeframe]);

  const ma = useMemo(() => (activeIndicators.includes("ma") ? calcMA(primary, 10) : []), [
    activeIndicators,
    primary,
  ]);
  const ema = useMemo(() => (activeIndicators.includes("ema") ? calcEMA(primary, 18) : []), [
    activeIndicators,
    primary,
  ]);
  const rsi = useMemo(() => (activeIndicators.includes("rsi") ? calcRSI(primary, 14) : []), [
    activeIndicators,
    primary,
  ]);

  const comparePath = useMemo(
    () => buildPath(compare, chartDims.width, chartDims.height, chartDims.padding),
    [compare],
  );
  const maPath = useMemo(
    () => buildPath(ma, chartDims.width, chartDims.height, chartDims.padding),
    [ma],
  );
  const emaPath = useMemo(
    () => buildPath(ema, chartDims.width, chartDims.height, chartDims.padding),
    [ema],
  );
  const rsiPath = useMemo(
    () => buildPath(rsi, rsiDims.width, rsiDims.height, rsiDims.padding),
    [rsi],
  );

  const latestPrice = primary[primary.length - 1] ?? 0;
  const primaryLabel =
    markets.find((market) => market.id === primaryId)?.tokenXLabel ?? "";
  const primaryQuote =
    markets.find((market) => market.id === primaryId)?.tokenYLabel ?? "";
  const compareLabel =
    markets.find((market) => market.id === compareId)?.tokenXLabel ?? "";
  const compareQuote =
    markets.find((market) => market.id === compareId)?.tokenYLabel ?? "";

  const toggleIndicator = (key: IndicatorKey) => {
    setActiveIndicators((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    );
  };

  const handleMouseMove = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * chartDims.width;
    const index = Math.round(
      ((x - chartDims.padding) /
        (chartDims.width - chartDims.padding * 2)) *
        (primaryCandles.length - 1),
    );
    if (index < 0 || index >= primaryCandles.length) {
      if (!draggingCrosshair && (!crosshairPinned || !pinMode)) {
        setHoverIndex(null);
        setHoverX(null);
      }
      return;
    }
    setHoverIndex(index);
    setHoverX(x);
  };

  const handleMouseLeave = () => {
    if (draggingCrosshair || (crosshairPinned && pinMode)) return;
    setHoverIndex(null);
    setHoverX(null);
  };

  const handleMouseDown = (event: MouseEvent<SVGSVGElement>) => {
    if (drawTool !== "none" || !pinMode) return;
    setDraggingCrosshair(true);
    handleMouseMove(event);
  };

  const handleMouseUp = () => {
    if (drawTool !== "none" || !pinMode) return;
    setDraggingCrosshair(false);
    setCrosshairPinned(true);
  };

  useEffect(() => {
    if (!draggingCrosshair) return;
    const handleWindowUp = () => setDraggingCrosshair(false);
    window.addEventListener("mouseup", handleWindowUp);
    return () => window.removeEventListener("mouseup", handleWindowUp);
  }, [draggingCrosshair]);

  const handleChartClick = (event: MouseEvent<SVGSVGElement>) => {
    if (pinMode && crosshairPinned) {
      setCrosshairPinned(false);
      if (!draggingCrosshair) {
        handleMouseMove(event);
      }
      return;
    }
    if (drawTool === "none") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * chartDims.width;
    const y = ((event.clientY - rect.top) / rect.height) * chartDims.height;
    const values = primary;
    if (values.length === 0) return;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const innerH = chartDims.height - chartDims.padding * 2;
    const normalizedY = (chartDims.height - chartDims.padding - y) / innerH;
    const value = min + clamp(normalizedY, 0, 1) * span;

    if (drawTool === "hline") {
      setDrawings((prev) => [
        ...prev,
        { id: `h-${Date.now()}`, type: "hline", y: value },
      ]);
      return;
    }

    if (drawTool === "trend") {
      if (!pendingTrend) {
        setPendingTrend({ x, y: value });
      } else {
        setDrawings((prev) => [
          ...prev,
          {
            id: `t-${Date.now()}`,
            type: "trend",
            x1: pendingTrend.x,
            y1: pendingTrend.y,
            x2: x,
            y2: value,
          },
        ]);
        setPendingTrend(null);
      }
    }
  };

  const valueToY = (value: number, values: number[], height: number, padding: number) => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const innerH = height - padding * 2;
    return padding + innerH - ((value - min) / span) * innerH;
  };

  return (
    <div className="market-chart-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Chart</p>
          <h3>Advanced charting</h3>
        </div>
        <div className="market-chart-price">
          <span className="muted small">Last</span>
          <strong>
            {formatNumber(latestPrice)} {primaryQuote}
          </strong>
        </div>
      </div>

      <div className="market-chart-controls">
        <div className="market-chart-select">
          <label>Market</label>
          <select value={primaryId} onChange={(e) => setPrimaryId(e.target.value)}>
            {markets.map((market) => (
              <option key={market.id} value={market.id}>
                {market.tokenXLabel}/{market.tokenYLabel} · {market.label}
              </option>
            ))}
          </select>
        </div>
        <div className="market-chart-select">
          <label>Compare</label>
          <select value={compareId} onChange={(e) => setCompareId(e.target.value)}>
            <option value="">None</option>
            {markets
              .filter((market) => market.id !== primaryId)
              .map((market) => (
                <option key={market.id} value={market.id}>
                  {market.tokenXLabel}/{market.tokenYLabel}
                </option>
              ))}
          </select>
        </div>
        <div className="market-chart-timeframes">
          {(["1H", "4H", "1D", "1W"] as Timeframe[]).map((frame) => (
            <button
              key={frame}
              type="button"
              className={`chip ${timeframe === frame ? "is-favorite" : ""}`}
              onClick={() => setTimeframe(frame)}
            >
              {frame}
            </button>
          ))}
        </div>
      </div>

      <div className="market-chart-tools">
        <div className="market-chart-indicators">
          <span className="muted small">Indicators</span>
          {([
            { key: "ma", label: "MA" },
            { key: "ema", label: "EMA" },
            { key: "rsi", label: "RSI" },
          ] as const).map((item) => (
            <button
              key={item.key}
              type="button"
              className={`chip ${activeIndicators.includes(item.key) ? "is-favorite" : ""}`}
              onClick={() => toggleIndicator(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="market-chart-draw">
          <span className="muted small">Draw</span>
          {([
            { key: "none", label: "None" },
            { key: "hline", label: "H-line" },
            { key: "trend", label: "Trend" },
          ] as const).map((item) => (
            <button
              key={item.key}
              type="button"
              className={`chip ${drawTool === item.key ? "is-favorite" : ""}`}
              onClick={() => {
                setDrawTool(item.key as DrawTool);
                setPendingTrend(null);
              }}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            className={`chip ${pinMode ? "is-favorite" : ""}`}
            onClick={() => {
              setPinMode((prev) => {
                const next = !prev;
                if (!next) {
                  setCrosshairPinned(false);
                  setDraggingCrosshair(false);
                }
                return next;
              });
            }}
          >
            Pin crosshair
          </button>
          <button
            type="button"
            className="tiny ghost"
            onClick={() => {
              setDrawings([]);
              setPendingTrend(null);
            }}
          >
            Clear
          </button>
        </div>
      </div>

      <div className="market-chart-canvas">
        <svg
          className="market-chart-svg"
          viewBox={`0 0 ${chartDims.width} ${chartDims.height}`}
          aria-label="Price chart"
          onClick={handleChartClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
        >
          {primaryCandles.map((candle, idx) => {
            const innerW = chartDims.width - chartDims.padding * 2;
            const step = innerW / Math.max(primaryCandles.length, 1);
            const candleWidth = step * 0.7;
            const x =
              chartDims.padding + idx * step + (step - candleWidth) / 2;
            const openY = valueToY(candle.open, primary, chartDims.height, chartDims.padding);
            const closeY = valueToY(candle.close, primary, chartDims.height, chartDims.padding);
            const highY = valueToY(candle.high, primary, chartDims.height, chartDims.padding);
            const lowY = valueToY(candle.low, primary, chartDims.height, chartDims.padding);
            const isUp = candle.close >= candle.open;
            return (
              <g key={`c-${idx}`} className={`candle ${isUp ? "up" : "down"}`}>
                <line x1={x + candleWidth / 2} x2={x + candleWidth / 2} y1={highY} y2={lowY} />
                <rect
                  x={x}
                  y={Math.min(openY, closeY)}
                  width={candleWidth}
                  height={Math.max(1.5, Math.abs(closeY - openY))}
                />
              </g>
            );
          })}

          {comparePath && compare.length > 0 && (
            <path className="market-chart-line compare" d={comparePath} />
          )}
          {maPath && ma.length > 0 && <path className="market-chart-line ma" d={maPath} />}
          {emaPath && ema.length > 0 && <path className="market-chart-line ema" d={emaPath} />}
          {drawings.map((drawing) => {
            if (drawing.type === "hline") {
              const y = valueToY(drawing.y, primary, chartDims.height, chartDims.padding);
              return (
                <line
                  key={drawing.id}
                  x1={chartDims.padding}
                  x2={chartDims.width - chartDims.padding}
                  y1={y}
                  y2={y}
                  className="market-chart-drawing"
                />
              );
            }
            const y1 = valueToY(drawing.y1, primary, chartDims.height, chartDims.padding);
            const y2 = valueToY(drawing.y2, primary, chartDims.height, chartDims.padding);
            return (
              <line
                key={drawing.id}
                x1={drawing.x1}
                x2={drawing.x2}
                y1={y1}
                y2={y2}
                className="market-chart-drawing"
              );
            );
          })}
          {pendingTrend && (
            <line
              x1={pendingTrend.x}
              x2={pendingTrend.x}
              y1={chartDims.padding}
              y2={chartDims.height - chartDims.padding}
              className="market-chart-drawing ghost"
            />
          )}
          {hoverIndex !== null && hoverX !== null && primaryCandles[hoverIndex] && (
            <>
              <line
                className="market-chart-crosshair"
                x1={hoverX}
                x2={hoverX}
                y1={chartDims.padding}
                y2={chartDims.height - chartDims.padding}
              />
              <line
                className="market-chart-crosshair"
                x1={chartDims.padding}
                x2={chartDims.width - chartDims.padding}
                y1={valueToY(
                  primaryCandles[hoverIndex].close,
                  primary,
                  chartDims.height,
                  chartDims.padding,
                )}
                y2={valueToY(
                  primaryCandles[hoverIndex].close,
                  primary,
                  chartDims.height,
                  chartDims.padding,
                )}
              />
            </>
          )}
        </svg>
        {hoverIndex !== null && primaryCandles[hoverIndex] && hoverX !== null && (
          <div
            className="market-chart-tooltip"
            style={{
              left: `${(hoverX / chartDims.width) * 100}%`,
              top: "12px",
            }}
          >
            <strong>
              O: {formatNumber(primaryCandles[hoverIndex].open)} H:{" "}
              {formatNumber(primaryCandles[hoverIndex].high)}
            </strong>
            <span>
              L: {formatNumber(primaryCandles[hoverIndex].low)} C:{" "}
              {formatNumber(primaryCandles[hoverIndex].close)}
            </span>
          </div>
        )}
        <div className="market-chart-legend">
          <span className="legend-dot primary">
            {primaryLabel}/{primaryQuote}
          </span>
          {compareId && (
            <span className="legend-dot compare">
              {compareLabel}/{compareQuote}
            </span>
          )}
        </div>
      </div>

      <div className="market-chart-volume">
        <div className="market-chart-rsi-head">
          <span className="muted small">Volume</span>
        </div>
        <svg
          className="market-chart-svg volume"
          viewBox={`0 0 ${chartDims.width} ${rsiDims.height}`}
          aria-label="Volume chart"
        >
          {volumes.map((value, idx) => {
            const innerW = chartDims.width - chartDims.padding * 2;
            const step = innerW / Math.max(volumes.length, 1);
            const barWidth = step * 0.7;
            const x =
              chartDims.padding + idx * step + (step - barWidth) / 2;
            const max = Math.max(...volumes, 1);
            const height =
              ((value / max) * (rsiDims.height - rsiDims.padding * 2)) || 1;
            const y =
              rsiDims.height - rsiDims.padding - Math.max(1, height);
            return (
              <rect
                key={`v-${idx}`}
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(1, height)}
                className="market-chart-volume-bar"
              />
            );
          })}
        </svg>
      </div>

      {activeIndicators.includes("rsi") && (
        <div className="market-chart-rsi">
          <div className="market-chart-rsi-head">
            <span className="muted small">RSI (14)</span>
          </div>
          <svg
            className="market-chart-svg rsi"
            viewBox={`0 0 ${rsiDims.width} ${rsiDims.height}`}
            aria-label="RSI chart"
          >
            <path className="market-chart-line rsi" d={rsiPath} />
          </svg>
        </div>
      )}
    </div>
  );
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export default MarketChartPanel;
