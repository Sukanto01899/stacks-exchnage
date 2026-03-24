export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
