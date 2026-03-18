import { useCallback, useState } from "react";
import type { Balances, TokenKey } from "../type";

type TokenId = {
  fullId: string;
  contractId: string;
  contractName: string;
  assetName: string;
};

type UseBalancesParams = {
  stacksApi: string;
  tokenIds: Record<TokenKey, TokenId | null>;
  tokenContracts: Record<TokenKey, string | null>;
  tokenIsStx: Record<TokenKey, boolean>;
  tokenDecimals: number;
  fetchPoolState: (address?: string | null) => Promise<number | null>;
};

export const useBalances = ({
  stacksApi,
  tokenIds,
  tokenContracts,
  tokenIsStx,
  tokenDecimals,
  fetchPoolState,
}: UseBalancesParams) => {
  const [balances, setBalances] = useState<Balances>({
    tokenX: 0,
    tokenY: 0,
    lpShares: 0,
  });
  const [faucetMessage, setFaucetMessage] = useState<string | null>(null);

  const fetchOnChainBalances = useCallback(
    async (address: string) => {
      const response = await fetch(
        `${stacksApi}/extended/v1/address/${address}/balances`,
      );
      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(
          `Failed to fetch balances from Stacks API (${response.status}). ${errorText}`,
        );
      }
      const data = await response.json();
      const stxBalanceRaw = data?.stx?.balance;
      const fungible = data?.fungible_tokens || {};

      const findTokenEntry = (target: TokenId) => {
        if (fungible[target.fullId]) return fungible[target.fullId];
        if (fungible[target.contractId]) return fungible[target.contractId];
        const suffix = `.${target.contractName}::${target.assetName}`;
        const key = Object.keys(fungible).find((k) => k.endsWith(suffix));
        return key ? fungible[key] : undefined;
      };

      const tokenX = tokenIds.x ? findTokenEntry(tokenIds.x) : undefined;
      const tokenY = tokenIds.y ? findTokenEntry(tokenIds.y) : undefined;
      const normalize = (balance?: { balance?: string }) =>
        balance?.balance ? Number(balance.balance) / tokenDecimals : 0;
      const stxNormalize = (balance?: string) =>
        balance ? Number(balance) / tokenDecimals : 0;

      const missing = [];
      if (!tokenIsStx.x && tokenContracts.x && !tokenX) {
        missing.push(tokenContracts.x);
      }
      if (!tokenIsStx.y && tokenContracts.y && !tokenY) {
        missing.push(tokenContracts.y);
      }

      return {
        tokenX: tokenIsStx.x ? stxNormalize(stxBalanceRaw) : normalize(tokenX),
        tokenY: tokenIsStx.y ? stxNormalize(stxBalanceRaw) : normalize(tokenY),
        missing,
        found: Object.keys(fungible || {}),
      };
    },
    [
      stacksApi,
      tokenContracts.x,
      tokenContracts.y,
      tokenDecimals,
      tokenIds,
      tokenIsStx.x,
      tokenIsStx.y,
    ],
  );

  const syncBalances = useCallback(
    async (address: string, opts?: { silent?: boolean }) => {
      if (!address) return;
      try {
        if (!opts?.silent) {
          setFaucetMessage("Refreshing on-chain balances...");
        }
        const next = await fetchOnChainBalances(address);
        const lpShares = await fetchPoolState(address);
        setBalances((prev) => ({
          ...prev,
          tokenX: next.tokenX ?? prev.tokenX,
          tokenY: next.tokenY ?? prev.tokenY,
          lpShares: typeof lpShares === "number" ? lpShares : prev.lpShares,
        }));
        if (!opts?.silent) {
          if (next.missing?.length) {
            const noTrackedTokenBalances =
              (next.tokenX ?? 0) <= 0 && (next.tokenY ?? 0) <= 0;
            setFaucetMessage(
              noTrackedTokenBalances
                ? "No tracked token balances found yet (likely zero balance)."
                : `Some token entries are missing: ${next.missing.join(" & ")}`,
            );
          } else {
            setFaucetMessage("Loaded on-chain balances.");
          }
        }
      } catch (error) {
        if (!opts?.silent) {
          setFaucetMessage(
            error instanceof Error
              ? error.message
              : "Could not load on-chain balances.",
          );
        }
      }
    },
    [fetchOnChainBalances, fetchPoolState],
  );

  return {
    balances,
    setBalances,
    faucetMessage,
    setFaucetMessage,
    syncBalances,
  };
};
