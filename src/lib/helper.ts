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

// Deterministic FNV-1a hash so the same token symbol always maps to the same color.
const hashString = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

// A stable gradient + readable text color derived from a token's symbol/label,
// used as the avatar fallback when a token has no cached image.
export const tokenAvatarStyle = (seed: string): { background: string; color: string } => {
  const key = (seed || "?").trim().toUpperCase();
  const hash = hashString(key);
  const hue = hash % 360;
  const hue2 = (hue + 38) % 360;
  return {
    background: `linear-gradient(135deg, hsl(${hue} 68% 52%), hsl(${hue2} 70% 42%))`,
    color: "#fff",
  };
};
