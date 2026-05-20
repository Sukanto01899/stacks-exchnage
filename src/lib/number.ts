export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

// Convert raw on-chain amount to human-readable display amount.
// `decimals` should be the token's decimal divisor (e.g. 1_000_000 for 6 decimals).
export const toDisplayAmount = (
  raw: number | bigint,
  decimals: number,
): number => {
  if (decimals <= 0) return 0;
  const n = typeof raw === "bigint" ? Number(raw) : raw;
  return n / decimals;
};

// Convert a human-readable display amount back to the raw on-chain integer.
// Returns a bigint suitable for passing directly to Clarity contract calls.
export const toRawAmount = (display: number, decimals: number): bigint => {
  if (!Number.isFinite(display) || display < 0 || decimals <= 0) return 0n;
  return BigInt(Math.round(display * decimals));
};
