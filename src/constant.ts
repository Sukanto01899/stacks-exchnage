import { normalizeTokenId } from "./lib/helper";

export const FEE_BPS = 30;
export const BPS = 10_000;
export const FAUCET_AMOUNT = 5_000;
export const PRICE_IMPACT_WARN_PCT = 1;
export const PRICE_IMPACT_CONFIRM_PCT = 3;
export const PRICE_IMPACT_BLOCK_PCT = 15;
export const PRICE_IMPACT_TARGET_PCT = 1;
export const CONTRACT_ADDRESS =
  (typeof import.meta !== "undefined" &&
    (import.meta as { env?: Record<string, string | undefined> })?.env?.[
      "VITE_CONTRACT_ADDRESS"
    ]) ||
  "SP1K2XGT5RNGT42N49BH936VDF8NXWNZJY15BPV4F";
export const CONTRACT_IS_MAINNET = /^(SP|SM)/.test(CONTRACT_ADDRESS);
export const RESOLVED_STACKS_NETWORK = CONTRACT_IS_MAINNET
  ? "mainnet"
  : "testnet";
export const STACKS_API =
  (typeof import.meta !== "undefined" &&
    (import.meta as { env?: Record<string, string | undefined> })?.env?.[
      "VITE_STACKS_API"
    ]) ||
  (RESOLVED_STACKS_NETWORK === "mainnet"
    ? "https://api.hiro.so"
    : "https://api.testnet.hiro.so");
export const IS_MAINNET = RESOLVED_STACKS_NETWORK === "mainnet";
export const DAY_MS = 24 * 60 * 60 * 1000;
export const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;
export const ONBOARDING_STORAGE_KEY = `onboarding-${RESOLVED_STACKS_NETWORK}`;
export const TOKEN_CONTRACTS = {
  x:
    normalizeTokenId(
      (typeof import.meta !== "undefined" &&
        (import.meta as { env?: Record<string, string | undefined> })?.env?.[
          "VITE_TOKEN_X"
        ]) as string | undefined,
      "token-x",
    ) || `${CONTRACT_ADDRESS}.dex-token-x::token-x`,
  y:
    normalizeTokenId(
      (typeof import.meta !== "undefined" &&
        (import.meta as { env?: Record<string, string | undefined> })?.env?.[
          "VITE_TOKEN_Y"
        ]) as string | undefined,
      "token-y",
    ) || `${CONTRACT_ADDRESS}.dex-token-y::token-y`,
};

export const TOKEN_DECIMALS = 1_000_000;
export const MINIMUM_LIQUIDITY = 1_000n;
export const POOL_CONTRACT_ID =
  (typeof import.meta !== "undefined" &&
    (import.meta as { env?: Record<string, string | undefined> })?.env?.[
      "VITE_POOL_CONTRACT"
    ]) ||
  `${CONTRACT_ADDRESS}.dex-pool-v5`;

export const FAUCET_API =
  (typeof import.meta !== "undefined" &&
    (import.meta as { env?: Record<string, string | undefined> })?.env?.[
      "VITE_FAUCET_URL"
    ]) ||
  "http://localhost:8787";
