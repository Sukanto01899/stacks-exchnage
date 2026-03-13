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
