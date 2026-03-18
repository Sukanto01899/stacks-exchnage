import { useCallback, useState } from "react";
import { fetchCallReadOnlyFunction, standardPrincipalCV } from "@stacks/transactions";
import type { StacksNetwork } from "@stacks/network";
import type { PoolState, PoolTokenInfo } from "../type";
import {
  parseClarityBool,
  parseClarityNumber,
  parseOptionalPrincipal,
  parsePoolReserves,
  readClarityField,
  unwrapReadOnlyOk,
} from "../lib/clarity";

type PoolContract = {
  address: string;
  contractName: string;
};

type UsePoolParams = {
  network: StacksNetwork;
  poolContract: PoolContract;
  contractAddress: string;
  tokenDecimals: number;
};

export const usePool = ({
  network,
  poolContract,
  contractAddress,
  tokenDecimals,
}: UsePoolParams) => {
  const [pool, setPool] = useState<PoolState>({
    reserveX: 0,
    reserveY: 0,
    totalShares: 0,
  });
  const [tokenInfo, setTokenInfo] = useState<PoolTokenInfo | null>(null);
  const [poolPending, setPoolPending] = useState(false);
  const [lastPoolRefreshAt, setLastPoolRefreshAt] = useState<number | null>(
    null,
  );

  const fetchPoolState = useCallback(
    async (address?: string | null) => {
      setPoolPending(true);
      try {
        const senderAddress = address || contractAddress;
        const reserves = await fetchCallReadOnlyFunction({
          contractAddress: poolContract.address,
          contractName: poolContract.contractName,
          functionName: "get-reserves",
          functionArgs: [],
          senderAddress,
          network,
        });
        const totalSupply = await fetchCallReadOnlyFunction({
          contractAddress: poolContract.address,
          contractName: poolContract.contractName,
          functionName: "get-total-supply",
          functionArgs: [],
          senderAddress,
          network,
        });
        const tokenInfoResult = await fetchCallReadOnlyFunction({
          contractAddress: poolContract.address,
          contractName: poolContract.contractName,
          functionName: "get-token-info",
          functionArgs: [],
          senderAddress,
          network,
        });
        const lpBalance =
          address &&
          (await fetchCallReadOnlyFunction({
            contractAddress: poolContract.address,
            contractName: poolContract.contractName,
            functionName: "get-lp-balance",
            functionArgs: [standardPrincipalCV(address)],
            senderAddress,
            network,
          }));

        const reserveValue = unwrapReadOnlyOk(reserves);
        const totalSupplyValue = parseClarityNumber(unwrapReadOnlyOk(totalSupply));
        const lpBalanceValue = lpBalance
          ? parseClarityNumber(unwrapReadOnlyOk(lpBalance))
          : 0;
        const tokenInfoValue = unwrapReadOnlyOk(tokenInfoResult);
        const tokenXRaw = readClarityField(tokenInfoValue, "token-x");
        const tokenYRaw = readClarityField(tokenInfoValue, "token-y");
        const tokenXIsStxRaw = readClarityField(tokenInfoValue, "token-x-is-stx");
        const tokenYIsStxRaw = readClarityField(tokenInfoValue, "token-y-is-stx");
        const parsedReserves = parsePoolReserves(reserveValue, tokenDecimals);

        setPool({
          reserveX: parsedReserves.reserveX,
          reserveY: parsedReserves.reserveY,
          totalShares: totalSupplyValue,
        });
        setTokenInfo({
          tokenX: parseOptionalPrincipal(tokenXRaw),
          tokenY: parseOptionalPrincipal(tokenYRaw),
          tokenXIsStx: parseClarityBool(tokenXIsStxRaw),
          tokenYIsStx: parseClarityBool(tokenYIsStxRaw),
        });
        setLastPoolRefreshAt(Date.now());
        return address ? lpBalanceValue : null;
      } catch (error) {
        console.warn("Pool state fetch failed", error);
        return null;
      } finally {
        setPoolPending(false);
      }
    },
    [
      contractAddress,
      network,
      poolContract.address,
      poolContract.contractName,
      tokenDecimals,
    ],
  );

  return {
    pool,
    tokenInfo,
    poolPending,
    lastPoolRefreshAt,
    fetchPoolState,
  };
};
