import type { ClarityValue } from "@stacks/transactions";

// Replace with your contract and token information
export type PoolState = {
  reserveX: number;
  reserveY: number;
  totalShares: number;
};

// Update types and logic to match your contract's state and functions
export type Balances = {
  tokenX: number;
  tokenY: number;
  lpShares: number;
};

// Update swap draft structure to match your contract's swap function arguments and quote logic
export type SwapDraft = {
  amount: number;
  outputPreview: number;
  minReceived: number;
  slippagePercent: number;
  deadlineMinutes: number;
  priceImpact: number;
  fromSymbol: "X" | "Y";
  toSymbol: "X" | "Y";
  functionName: "swap-x-for-y" | "swap-y-for-x";
  functionArgs: ClarityValue[];
};

//  Update token key type if your contract supports more than 2 tokens or uses different identifiers for the tokens
export type TokenKey = "x" | "y";
export type PortfolioSnapshot = {
  ts: number;
  totalX: number;
  totalY: number;
  priceYX: number;
  reserveX?: number;
  reserveY?: number;
};

//  Update activity item structure if you want to track additional types of activities, include more detailed information, or implement a different status system based on your contract's specific functions and events
export type ActivityItem = {
  id: string;
  ts: number;
  kind: "swap" | "add-liquidity" | "remove-liquidity" | "approve" | "faucet";
  status: "submitted" | "confirmed" | "failed" | "cancelled";
  txid?: string;
  message: string;
  detail?: string;
};

// Update price alert structure if you want to track additional alert types, include more detailed information, or implement a different status system based on your contract's specific functions and events
export type PriceAlert = {
  id: string;
  createdAt: number;
  pairDirection: "x-to-y" | "y-to-x";
  condition: ">=" | "<=";
  targetPrice: number;
  status: "active" | "triggered";
  triggeredAt?: number;
  triggeredPrice?: number;
};
