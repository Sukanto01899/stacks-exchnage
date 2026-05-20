import { BPS, FEE_BPS } from "../constant";

/**
 * Spot price of token X denominated in Y (Y per 1 X), with no fee or slippage.
 */
export const getSpotPrice = (reserveX: number, reserveY: number): number => {
  if (reserveX <= 0 || reserveY <= 0) return 0;
  return reserveY / reserveX;
};

/**
 * Constant-product output amount after fee.
 * Mirrors the on-chain formula: amountOut = (amountIn*(BPS-fee)*reserveOut) /
 *   (reserveIn*BPS + amountIn*(BPS-fee))
 */
export const getAmountOut = (
  amountIn: number,
  reserveIn: number,
  reserveOut: number,
  feeBps: number = FEE_BPS,
): number => {
  if (amountIn <= 0 || reserveIn <= 0 || reserveOut <= 0) return 0;
  const fee = BPS - feeBps;
  const numerator = amountIn * fee * reserveOut;
  const denominator = reserveIn * BPS + amountIn * fee;
  return numerator / denominator;
};

/**
 * Price impact as a percentage: how much worse the actual rate is vs. the
 * zero-slippage spot rate, expressed as a positive number (e.g. 2.5 = 2.5%).
 */
export const getPriceImpact = (
  amountIn: number,
  reserveIn: number,
  reserveOut: number,
  feeBps: number = FEE_BPS,
): number => {
  if (amountIn <= 0 || reserveIn <= 0 || reserveOut <= 0) return 0;
  const spotOut = (amountIn * reserveOut) / reserveIn;
  const actualOut = getAmountOut(amountIn, reserveIn, reserveOut, feeBps);
  if (spotOut <= 0) return 0;
  return ((spotOut - actualOut) / spotOut) * 100;
};
