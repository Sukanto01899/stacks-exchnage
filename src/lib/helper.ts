export const CONTRACT_ADDRESS =
  (typeof import.meta !== "undefined" &&
    (import.meta as { env?: Record<string, string | undefined> })?.env?.[
      "VITE_CONTRACT_ADDRESS"
    ]) ||
  "SP1K2XGT5RNGT42N49BH936VDF8NXWNZJY15BPV4F";

// TODO: Update token normalization logic if your contract uses a different asset ID format or if you want to support multiple tokens per contract
export const normalizeTokenId = (
  value: string | undefined,
  assetName: string,
) => {
  if (value?.includes("::")) return value;
  if (value) return `${value}::${assetName}`;
  return "";
};

// Update formatting logic if your tokens use a different decimal precision or if you want to display more/less decimal places
export const formatNumber = (value: number) =>
  value.toLocaleString(undefined, {
    maximumFractionDigits: 6,
    minimumFractionDigits: 0,
  });

export const shortAddress = (addr: string) =>
  addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;

export const formatSignedPercent = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return "N/A";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
};

export const formatCompactNumber = (value: number) =>
  value.toLocaleString(undefined, {
    notation: "compact",
    maximumFractionDigits: value >= 100 ? 1 : 2,
  });
