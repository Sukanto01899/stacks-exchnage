import { cvToValue } from "@stacks/transactions";

export const readClarityField = (raw: unknown, key: string): unknown => {
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  if (key in record) return record[key];
  const nested = record.value;
  if (
    nested &&
    typeof nested === "object" &&
    key in (nested as Record<string, unknown>)
  ) {
    return (nested as Record<string, unknown>)[key];
  }
  return undefined;
};

const readReserveValue = (raw: unknown, ...keys: string[]) => {
  for (const key of keys) {
    const value = readClarityField(raw, key);
    if (value !== undefined && value !== null) {
      const parsed = parseClarityNumber(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
};

export const parseClarityNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === "object") {
    const record = value as { value?: unknown };
    if ("value" in record) {
      return parseClarityNumber(record.value);
    }
  }
  return 0;
};

export const parseClarityBool = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (value && typeof value === "object") {
    const record = value as { value?: unknown };
    if ("value" in record) {
      return Boolean(record.value);
    }
  }
  return false;
};

export const parseOptionalPrincipal = (value: unknown): string | null => {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  const record = value as { type?: string; value?: unknown };
  if (record.type === "none") return null;
  if (record.type === "some") {
    const inner = record.value as unknown;
    if (typeof inner === "string") return inner;
    if (inner && typeof inner === "object") {
      const nested = inner as { value?: unknown; address?: string; contractName?: string };
      if (typeof nested.value === "string") return nested.value;
      if (nested.address && nested.contractName) {
        return `${nested.address}.${nested.contractName}`;
      }
    }
  }
  return null;
};

export const parsePoolReserves = (raw: unknown, tokenDecimals: number) => ({
  reserveX:
    readReserveValue(raw, "reserve-x", "reserveX", "x") / tokenDecimals,
  reserveY:
    readReserveValue(raw, "reserve-y", "reserveY", "y") / tokenDecimals,
});

export const unwrapReadOnlyOk = (raw: unknown) => {
  const parsed = cvToValue(raw as never) as {
    value?: unknown;
    success?: boolean;
    type?: string;
  };
  if (parsed && typeof parsed === "object") {
    if ("success" in parsed) {
      if (!parsed.success) {
        throw new Error(
          `Read-only call failed: ${String(
            (parsed as { value?: unknown }).value ?? "",
          )}`,
        );
      }
      return (parsed as { value?: unknown }).value;
    }
    if ("type" in parsed && parsed.type === "ok") {
      return parsed.value;
    }
  }
  return parsed;
};
