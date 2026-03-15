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
  tokenIds: Record<TokenKey, TokenId>;
  tokenContracts: Record<TokenKey, string>;
  tokenDecimals: number;
  fetchPoolState: (address?: string | null) => Promise<number | null>;
};

export const useBalances = ({
  stacksApi,
  tokenIds,
  tokenContracts,
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
      const fungible = data?.fungible_tokens || {};

      const findTokenEntry = (target: TokenId) => {
        if (fungible[target.fullId]) return fungible[target.fullId];
        if (fungible[target.contractId]) return fungible[target.contractId];
        const suffix = `.${target.contractName}::${target.assetName}`;
        const key = Object.keys(fungible).find((k) => k.endsWith(suffix));
        return key ? fungible[key] : undefined;
      };

      const tokenX = findTokenEntry(tokenIds.x);
      const tokenY = findTokenEntry(tokenIds.y);
      const normalize = (balance?: { balance?: string }) =>
        balance?.balance ? Number(balance.balance) / tokenDecimals : 0;

      const missing = [];
      if (!tokenX) missing.push(tokenContracts.x);
      if (!tokenY) missing.push(tokenContracts.y);

      return {
        tokenX: normalize(tokenX),
        tokenY: normalize(tokenY),
        missing,
        found: Object.keys(fungible || {}),
      };
    },
    [stacksApi, tokenContracts.x, tokenContracts.y, tokenDecimals, tokenIds],
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
