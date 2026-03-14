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
