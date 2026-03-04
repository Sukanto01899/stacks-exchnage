import { useEffect, useMemo, useState } from "react";
import { connect, openContractCall } from "@stacks/connect";
import {
  AnchorMode,
  PostConditionMode,
  contractPrincipalCV,
  cvToValue,
  fetchCallReadOnlyFunction,
  standardPrincipalCV,
  uintCV,
} from "@stacks/transactions";
import { STACKS_MAINNET, STACKS_TESTNET, createNetwork } from "@stacks/network";
import "./App.css";
import { appKit } from "./wallets/appkit";

type PoolState = {
  reserveX: number;
  reserveY: number;
  totalShares: number;
};

type Balances = {
  tokenX: number;
  tokenY: number;
  lpShares: number;
};

const FEE_BPS = 30;
const BPS = 10_000;
const FAUCET_AMOUNT = 5_000;
const CONTRACT_ADDRESS =
  (typeof import.meta !== "undefined" &&
    (import.meta as { env?: Record<string, string | undefined> })?.env?.[
      "VITE_CONTRACT_ADDRESS"
    ]) ||
  "SP1K2XGT5RNGT42N49BH936VDF8NXWNZJY15BPV4F";
const CONTRACT_IS_MAINNET = /^(SP|SM)/.test(CONTRACT_ADDRESS);
const RESOLVED_STACKS_NETWORK = CONTRACT_IS_MAINNET ? "mainnet" : "testnet";
const STACKS_API =
  (typeof import.meta !== "undefined" &&
    (import.meta as { env?: Record<string, string | undefined> })?.env?.[
      "VITE_STACKS_API"
    ]) ||
  (RESOLVED_STACKS_NETWORK === "mainnet"
    ? "https://api.hiro.so"
    : "https://api.testnet.hiro.so");
const IS_MAINNET = RESOLVED_STACKS_NETWORK === "mainnet";

const normalizeTokenId = (value: string | undefined, assetName: string) => {
  if (value?.includes("::")) return value;
  if (value) return `${value}::${assetName}`;
  return "";
};

const TOKEN_CONTRACTS = {
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
const TOKEN_DECIMALS = 1_000_000;
const MINIMUM_LIQUIDITY = 1_000n;
const POOL_CONTRACT_ID =
  (typeof import.meta !== "undefined" &&
    (import.meta as { env?: Record<string, string | undefined> })?.env?.[
      "VITE_POOL_CONTRACT"
    ]) ||
  `${CONTRACT_ADDRESS}.dex-pool-v5`;
const FAUCET_API =
  (typeof import.meta !== "undefined" &&
    (import.meta as { env?: Record<string, string | undefined> })?.env?.[
      "VITE_FAUCET_URL"
    ]) ||
  "http://localhost:8787";

const shortAddress = (addr: string) =>
  addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;

const formatNumber = (value: number) =>
  value.toLocaleString(undefined, {
    maximumFractionDigits: 6,
    minimumFractionDigits: 0,
  });

const isNetworkAddress = (addr: string | null) => {
  if (!addr) return false;
  if (IS_MAINNET) {
    return /^(SP|SM)[A-Z0-9]{38,}$/.test(addr);
  }
  return /^S[NT][A-Z0-9]{38,}$/.test(addr);
};

const parseContractId = (id: string) => {
  const [address, nameWithAsset] = id.split(".");
  const contractName = (nameWithAsset || "").split("::")[0];
  return { address, contractName };
};

const parseTokenAssetId = (id: string) => {
  const [contractId = "", assetName = ""] = id.split("::");
  const [address = "", contractName = ""] = contractId.split(".");
  return { fullId: id, contractId, address, contractName, assetName };
};

const bigintSqrt = (value: bigint) => {
  if (value < 0n) throw new Error("sqrt only works on non-negative inputs");
  if (value < 2n) return value;
  let x0 = BigInt(Math.floor(Math.sqrt(Number(value))));
  let x1 = (x0 + value / x0) >> 1n;
  while (x1 < x0) {
    x0 = x1;
    x1 = (x0 + value / x0) >> 1n;
  }
  return x0;
};

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const explainPoolError = (repr?: string) => {
  if (!repr) return null;
  const match = repr.match(/\(err u(\d+)\)/);
  const code = match?.[1];
  if (!code) return null;
  const map: Record<string, string> = {
    "100": "zero input amount",
    "101": "pool has zero reserves",
    "102": "swap deadline expired",
    "103": "slippage exceeded",
    "104": "insufficient liquidity",
    "105": "token X transfer failed (insufficient balance or token rules)",
    "106": "token Y transfer failed (insufficient balance or token rules)",
    "107": "fee transfer failed",
    "200": "pool already initialized",
    "201": "pool not initialized",
    "202": "insufficient LP balance",
    "203": "zero shares calculated",
    "204": "minimum initial liquidity not met",
  };
  return map[code] ? `Error u${code}: ${map[code]}` : `Error u${code}`;
};

function App() {
  const [pool, setPool] = useState<PoolState>({
    reserveX: 0,
    reserveY: 0,
    totalShares: 0,
  });

  const [balances, setBalances] = useState<Balances>({
    tokenX: 0,
    tokenY: 0,
    lpShares: 0,
  });
  const [faucetTxids, setFaucetTxids] = useState<string[]>([]);

  const [activeTab, setActiveTab] = useState<"swap" | "liquidity">("swap");
  const [swapDirection, setSwapDirection] = useState<"x-to-y" | "y-to-x">(
    "x-to-y",
  );
  const [swapInput, setSwapInput] = useState("100");
  const [swapMessage, setSwapMessage] = useState<string | null>(null);
  const [swapPending, setSwapPending] = useState(false);

  const [liqX, setLiqX] = useState("1200");
  const [liqY, setLiqY] = useState("1200");
  const [liqMessage, setLiqMessage] = useState<string | null>(null);

  const [burnShares, setBurnShares] = useState("0");
  const [burnMessage, setBurnMessage] = useState<string | null>(null);

  const [faucetMessage, setFaucetMessage] = useState<string | null>(null);
  const [faucetPending, setFaucetPending] = useState(false);

  const [stacksAddress, setStacksAddress] = useState<string | null>(null);
  const [btcStatus, setBtcStatus] = useState<string | null>(null);
  const [balancePending, setBalancePending] = useState(false);
  const [poolPending, setPoolPending] = useState(false);

  const network = useMemo(
    () =>
      createNetwork({
        ...(RESOLVED_STACKS_NETWORK === "mainnet"
          ? STACKS_MAINNET
          : STACKS_TESTNET),
        client: { baseUrl: STACKS_API },
      }),
    [STACKS_API],
  );
  const poolContract = useMemo(() => parseContractId(POOL_CONTRACT_ID), []);
  const tokenContracts = useMemo(
    () => ({
      x: parseContractId(TOKEN_CONTRACTS.x),
      y: parseContractId(TOKEN_CONTRACTS.y),
    }),
    [],
  );
  const tokenIds = useMemo(
    () => ({
      x: parseTokenAssetId(TOKEN_CONTRACTS.x),
      y: parseTokenAssetId(TOKEN_CONTRACTS.y),
    }),
    [],
  );

  const fetchTipHeight = async () => {
    const res = await fetch(`${STACKS_API}/extended/v1/info`);
    if (!res.ok) return 0;
    const data = await res.json().catch(() => ({}));
    return Number(data?.stacks_tip_height || 0);
  };

  const fetchPoolState = async (address?: string | null) => {
    setPoolPending(true);
    try {
      const senderAddress = address || CONTRACT_ADDRESS;
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

      const reserveValue = cvToValue(reserves) as { x: string; y: string };
      const totalSupplyValue = Number(cvToValue(totalSupply) || 0);
      const lpBalanceValue = lpBalance ? Number(cvToValue(lpBalance) || 0) : 0;

      setPool({
        reserveX: Number(reserveValue?.x || 0) / TOKEN_DECIMALS,
        reserveY: Number(reserveValue?.y || 0) / TOKEN_DECIMALS,
        totalShares: totalSupplyValue,
      });
      if (address) {
        setBalances((prev) => ({
          ...prev,
          lpShares: lpBalanceValue,
        }));
      }
    } catch (error) {
      console.warn("Pool state fetch failed", error);
    } finally {
      setPoolPending(false);
    }
  };

  const fetchOnChainBalances = async (address: string) => {
    const response = await fetch(
      `${STACKS_API}/extended/v1/address/${address}/balances`,
    );
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `Failed to fetch balances from Stacks API (${response.status}). ${errorText}`,
      );
    }
    const data = await response.json();
    const fungible = data?.fungible_tokens || {};

    const findTokenEntry = (target: {
      fullId: string;
      contractId: string;
      contractName: string;
      assetName: string;
    }) => {
      if (fungible[target.fullId]) return fungible[target.fullId];
      if (fungible[target.contractId]) return fungible[target.contractId];
      const suffix = `.${target.contractName}::${target.assetName}`;
      const key = Object.keys(fungible).find((k) => k.endsWith(suffix));
      return key ? fungible[key] : undefined;
    };

    const tokenX = findTokenEntry(tokenIds.x);
    const tokenY = findTokenEntry(tokenIds.y);
    const normalize = (balance?: { balance?: string }) =>
      balance?.balance ? Number(balance.balance) / TOKEN_DECIMALS : 0;

    const missing = [];
    if (!tokenX) missing.push(TOKEN_CONTRACTS.x);
    if (!tokenY) missing.push(TOKEN_CONTRACTS.y);

    return {
      tokenX: normalize(tokenX),
      tokenY: normalize(tokenY),
      missing,
      found: Object.keys(fungible || {}),
    };
  };

  const fetchPoolReserves = async (address?: string | null) => {
    const senderAddress = address || CONTRACT_ADDRESS;
    const reserves = await fetchCallReadOnlyFunction({
      contractAddress: poolContract.address,
      contractName: poolContract.contractName,
      functionName: "get-reserves",
      functionArgs: [],
      senderAddress,
      network,
    });
    return cvToValue(reserves) as { x: string; y: string };
  };

  const syncBalances = async (address: string, opts?: { silent?: boolean }) => {
    if (!address) return;
    try {
      setBalancePending(true);
      if (!opts?.silent) {
        setFaucetMessage("Refreshing on-chain balances...");
      }
      const next = await fetchOnChainBalances(address);
      const reserves = await fetchPoolReserves(address);
      setBalances((prev) => ({
        ...prev,
        tokenX: next.tokenX ?? prev.tokenX,
        tokenY: next.tokenY ?? prev.tokenY,
      }));
      setPool((prev) => ({
        ...prev,
        reserveX: Number(reserves?.x || 0) / TOKEN_DECIMALS,
        reserveY: Number(reserves?.y || 0) / TOKEN_DECIMALS,
      }));
      await fetchPoolState(address);
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
    } finally {
      setBalancePending(false);
    }
  };

  useEffect(() => {
    fetchPoolState(stacksAddress);
  }, [stacksAddress]);

  useEffect(() => {
    fetchPoolState(stacksAddress);
  }, []);

  useEffect(() => {
    try {
      const cached = localStorage.getItem("stacks-address");
      if (cached && isNetworkAddress(cached)) {
        setStacksAddress(cached);
        syncBalances(cached, { silent: true });
      }
    } catch (error) {
      console.warn("Stacks cache read failed", error);
    }
  }, []);

  const handleStacksConnect = async () => {
    try {
      const result = await connect({
        forceWalletSelect: true,
        network: RESOLVED_STACKS_NETWORK,
      });

      const addr = result?.addresses
        ?.map((entry: string | { address?: string }) =>
          typeof entry === "string"
            ? entry
            : (entry?.address as string | undefined),
        )
        .find((a: string | undefined) => isNetworkAddress(a || null));

      if (!addr) {
        throw new Error(
          `No Stacks ${RESOLVED_STACKS_NETWORK} address returned. Switch wallet to a Stacks ${RESOLVED_STACKS_NETWORK} account.`,
        );
      }

      setStacksAddress(addr);
      try {
        localStorage.setItem("stacks-address", addr);
      } catch (error) {
        console.warn("Stacks cache write failed", error);
      }
      await syncBalances(addr);
    } catch (error) {
      console.error("Stacks connect error", error);
      setStacksAddress(null);
      setFaucetMessage(
        error instanceof Error
          ? error.message
          : `Failed to connect a Stacks ${RESOLVED_STACKS_NETWORK} wallet.`,
      );
    }
  };

  const handleStacksDisconnect = () => {
    setStacksAddress(null);
    try {
      localStorage.removeItem("stacks-connect-selected-provider");
      localStorage.removeItem("stacks-connect-addresses");
      localStorage.removeItem("stacks-address");
    } catch (error) {
      console.warn("Stacks disconnect cleanup failed", error);
    }
  };

  const handleBtcConnect = () => {
    setBtcStatus("Opening modal...");
    appKit
      .open({ view: "Connect" })
      .then(() =>
        setBtcStatus("Modal open: select Leather, Xverse, or WalletConnect."),
      )
      .catch((error) => {
        console.error("Bitcoin connect error", error);
        setBtcStatus(
          "Could not open modal. Check WalletConnect project id and extensions.",
        );
      });
  };

  const handleBtcDisconnect = () => {
    setBtcStatus(null);
  };

  const poolShare = useMemo(() => {
    if (pool.totalShares === 0) return 0;
    return balances.lpShares / pool.totalShares;
  }, [balances.lpShares, pool.totalShares]);

  const currentPrice = useMemo(() => {
    if (pool.reserveX === 0 || pool.reserveY === 0) return 0;
    return pool.reserveY / pool.reserveX;
  }, [pool.reserveX, pool.reserveY]);

  const quoteSwap = (amount: number, fromX: boolean) => {
    const reserveIn = fromX ? pool.reserveX : pool.reserveY;
    const reserveOut = fromX ? pool.reserveY : pool.reserveX;
    if (amount <= 0 || reserveIn <= 0 || reserveOut <= 0) return 0;
    const fee = (amount * FEE_BPS) / BPS;
    const amountAfterFee = amount - fee;
    return (reserveOut * amountAfterFee) / (reserveIn + amountAfterFee);
  };

  const liveSwapOutput = useMemo(() => {
    const amount = Number(swapInput);
    if (!amount || amount <= 0) return null;
    const output = quoteSwap(amount, swapDirection === "x-to-y");
    return output > 0 ? output : 0;
  }, [swapInput, swapDirection, pool.reserveX, pool.reserveY]);
  const quoteLoading = poolPending;

  const handleSwap = async () => {
    setSwapMessage(null);
    const amount = Number(swapInput);
    if (!amount || amount <= 0) {
      setSwapMessage("Enter an amount greater than 0.");
      return;
    }
    if (!stacksAddress) {
      setSwapMessage("Connect a Stacks wallet first.");
      return;
    }
    if (pool.reserveX <= 0 || pool.reserveY <= 0) {
      setSwapMessage("Pool has no liquidity yet. Add liquidity first.");
      return;
    }
    const fromX = swapDirection === "x-to-y";
    const inputBalance = fromX ? balances.tokenX : balances.tokenY;
    if (amount > inputBalance) {
      setSwapMessage("Not enough balance for this swap.");
      return;
    }
    const outputPreview = quoteSwap(amount, fromX);
    if (outputPreview <= 0) {
      setSwapMessage("Pool has no liquidity for this direction yet.");
      return;
    }
    const amountMicro = BigInt(Math.floor(amount * TOKEN_DECIMALS));
    const minOutMicro = BigInt(0);
    const tip = await fetchTipHeight();
    // Give enough headroom for wallet confirm + mempool delay on mainnet.
    const deadline = tip > 0 ? BigInt(tip + 500) : 9_999_999_999n;

    const functionName = fromX ? "swap-x-for-y" : "swap-y-for-x";
    const functionArgs = fromX
      ? [
          contractPrincipalCV(
            tokenContracts.x.address,
            tokenContracts.x.contractName,
          ),
          contractPrincipalCV(
            tokenContracts.y.address,
            tokenContracts.y.contractName,
          ),
          uintCV(amountMicro),
          uintCV(minOutMicro),
          standardPrincipalCV(stacksAddress),
          uintCV(deadline),
        ]
      : [
          contractPrincipalCV(
            tokenContracts.x.address,
            tokenContracts.x.contractName,
          ),
          contractPrincipalCV(
            tokenContracts.y.address,
            tokenContracts.y.contractName,
          ),
          uintCV(amountMicro),
          uintCV(minOutMicro),
          standardPrincipalCV(stacksAddress),
          uintCV(deadline),
        ];

    try {
      setSwapPending(true);
      await openContractCall({
        network,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Allow,
        contractAddress: poolContract.address,
        contractName: poolContract.contractName,
        functionName,
        functionArgs,
        onFinish: async (payload) => {
          setSwapMessage(`Swap submitted. Txid: ${payload.txId}`);
          const waitForSwapOutcome = async () => {
            for (let i = 0; i < 18; i += 1) {
              await sleep(4000);
              const res = await fetch(
                `${STACKS_API}/extended/v1/tx/${payload.txId}`,
              ).catch(() => null);
              if (!res?.ok) continue;
              const data = await res.json().catch(() => ({}));
              const status = String(data?.tx_status || "");
              if (!status) continue;
              if (status === "success") {
                setSwapMessage(`Swap confirmed. Txid: ${payload.txId}`);
                return;
              }
              if (
                status.includes("abort") ||
                status.includes("dropped") ||
                status.includes("failed")
              ) {
                const repr = data?.tx_result?.repr as string | undefined;
                const reason = explainPoolError(repr);
                setSwapMessage(
                  reason
                    ? `Swap failed on-chain. ${reason}.`
                    : `Swap failed on-chain. ${repr || "No error code returned."}`,
                );
                return;
              }
            }
          };
          await waitForSwapOutcome();
          await syncBalances(stacksAddress, { silent: true });
          await fetchPoolState(stacksAddress);
          setSwapPending(false);
        },
        onCancel: () => {
          setSwapMessage("Swap cancelled.");
          setSwapPending(false);
        },
      });
    } catch (error) {
      setSwapMessage(
        error instanceof Error
          ? error.message
          : "Swap failed. Check wallet and try again.",
      );
      setSwapPending(false);
    }
  };

  const handleAddLiquidity = async () => {
    setLiqMessage(null);
    const amountX = Number(liqX);
    const amountY = Number(liqY);
    if (amountX <= 0 || amountY <= 0) {
      setLiqMessage("Enter positive amounts for both tokens.");
      return;
    }
    if (!stacksAddress) {
      setLiqMessage("Connect a Stacks wallet first.");
      return;
    }
    const initializing = pool.totalShares === 0;
    const amountXMicro = BigInt(Math.floor(amountX * TOKEN_DECIMALS));
    const amountYMicro = BigInt(Math.floor(amountY * TOKEN_DECIMALS));
    const minShares = BigInt(0);

    if (initializing) {
      const shares = bigintSqrt(amountXMicro * amountYMicro);
      if (shares <= MINIMUM_LIQUIDITY) {
        setLiqMessage(
          `Deposit too small to initialize pool. Need > ${MINIMUM_LIQUIDITY.toString()} initial shares (try larger amounts).`,
        );
        return;
      }
    }

    const functionName = initializing ? "initialize-pool" : "add-liquidity";
    const functionArgs = initializing
      ? [
          contractPrincipalCV(
            tokenContracts.x.address,
            tokenContracts.x.contractName,
          ),
          contractPrincipalCV(
            tokenContracts.y.address,
            tokenContracts.y.contractName,
          ),
          uintCV(amountXMicro),
          uintCV(amountYMicro),
        ]
      : [
          contractPrincipalCV(
            tokenContracts.x.address,
            tokenContracts.x.contractName,
          ),
          contractPrincipalCV(
            tokenContracts.y.address,
            tokenContracts.y.contractName,
          ),
          uintCV(amountXMicro),
          uintCV(amountYMicro),
          uintCV(minShares),
        ];

    try {
      await openContractCall({
        network,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Allow,
        contractAddress: poolContract.address,
        contractName: poolContract.contractName,
        functionName,
        functionArgs,
        onFinish: async (payload) => {
          setLiqMessage(`Liquidity submitted. Txid: ${payload.txId}`);
          await syncBalances(stacksAddress, { silent: true });
          await fetchPoolState(stacksAddress);
        },
        onCancel: () => setLiqMessage("Liquidity cancelled."),
      });
    } catch (error) {
      setLiqMessage(
        error instanceof Error
          ? error.message
          : "Liquidity add failed. Check wallet and try again.",
      );
    }
  };

  const handleRemoveLiquidity = async () => {
    setBurnMessage(null);
    const shares = Number(burnShares);
    if (shares <= 0) {
      setBurnMessage("Enter a share amount greater than 0.");
      return;
    }
    if (!stacksAddress) {
      setBurnMessage("Connect a Stacks wallet first.");
      return;
    }
    const sharesUint = BigInt(Math.floor(shares));
    const minX = BigInt(0);
    const minY = BigInt(0);

    try {
      await openContractCall({
        network,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Allow,
        contractAddress: poolContract.address,
        contractName: poolContract.contractName,
        functionName: "remove-liquidity",
        functionArgs: [
          contractPrincipalCV(
            tokenContracts.x.address,
            tokenContracts.x.contractName,
          ),
          contractPrincipalCV(
            tokenContracts.y.address,
            tokenContracts.y.contractName,
          ),
          uintCV(sharesUint),
          uintCV(minX),
          uintCV(minY),
        ],
        onFinish: async (payload) => {
          setBurnMessage(`Remove liquidity submitted. Txid: ${payload.txId}`);
          await syncBalances(stacksAddress, { silent: true });
          await fetchPoolState(stacksAddress);
        },
        onCancel: () => setBurnMessage("Remove liquidity cancelled."),
      });
    } catch (error) {
      setBurnMessage(
        error instanceof Error
          ? error.message
          : "Remove liquidity failed. Check wallet and try again.",
      );
    }
  };

  const requestFaucet = async (token: "x" | "y") => {
    if (!stacksAddress) {
      throw new Error("Connect a Stacks wallet to receive tokens.");
    }
    if (!isNetworkAddress(stacksAddress)) {
      throw new Error(
        `Connected address is not ${RESOLVED_STACKS_NETWORK} (must match network prefix). Switch wallet network.`,
      );
    }
    const response = await fetch(`${FAUCET_API}/faucet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: stacksAddress,
        token,
        network: RESOLVED_STACKS_NETWORK,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Faucet request failed.");
    }
    return data;
  };

  const handleFaucet = async (token?: "x" | "y") => {
    try {
      setFaucetPending(true);
      setFaucetMessage(`Requesting ${RESOLVED_STACKS_NETWORK} faucet mint...`);
      const targets = token ? [token] : ["x", "y"];
      const results = [];
      for (const t of targets) {
        const res = await requestFaucet(t as "x" | "y");
        results.push(`${t.toUpperCase()}: ${res.txid}`);
      }
      setFaucetTxids(results.map((entry) => entry.split(": ")[1] || entry));
      setBalances((prev) => ({
        tokenX: prev.tokenX + (targets.includes("x") ? FAUCET_AMOUNT : 0),
        tokenY: prev.tokenY + (targets.includes("y") ? FAUCET_AMOUNT : 0),
        lpShares: prev.lpShares,
      }));
      setFaucetMessage(
        `Faucet sent ${targets.map((t) => t.toUpperCase()).join(" & ")} on ${RESOLVED_STACKS_NETWORK}. Txid(s): ${results.join(
          " | ",
        )}`,
      );
      if (stacksAddress) {
        setFaucetMessage(
          `Faucet sent ${targets
            .map((t) => t.toUpperCase())
            .join(" & ")} on ${RESOLVED_STACKS_NETWORK}. Txid(s): ${results.join(
            " | ",
          )} (click Refresh after confirmation to show on-chain balance).`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Faucet failed. Try again.";
      setFaucetMessage(message);
    } finally {
      setFaucetPending(false);
    }
  };

  const handleSyncToPoolRatio = () => {
    if (pool.reserveX === 0 || pool.reserveY === 0) return;
    const ratio = pool.reserveY / pool.reserveX;
    const x = Number(liqX) || 0;
    const y = x * ratio;
    setLiqY(y.toFixed(4));
  };

  const setMaxSwap = () => {
    if (swapDirection === "x-to-y") {
      setSwapInput(String(balances.tokenX || ""));
      return;
    }
    setSwapInput(String(balances.tokenY || ""));
  };

  const setMaxBurn = () => {
    setBurnShares(String(balances.lpShares || "0"));
  };

  const priceImpact = useMemo(() => {
    const amount = Number(swapInput || 0);
    const reserve = swapDirection === "x-to-y" ? pool.reserveX : pool.reserveY;
    if (!amount || reserve <= 0) return 0;
    return (amount / reserve) * 100;
  }, [swapInput, swapDirection, pool.reserveX, pool.reserveY]);

  const simulator = useMemo(() => {
    const amount = Number(swapInput || 0);
    const fromX = swapDirection === "x-to-y";
    const reserveX = pool.reserveX;
    const reserveY = pool.reserveY;
    const fee = (amount * FEE_BPS) / BPS;
    const output = quoteSwap(amount, fromX);
    const nextReserveX = fromX ? reserveX + amount : reserveX - output;
    const nextReserveY = fromX ? reserveY - output : reserveY + amount;
    const nextPrice =
      nextReserveX > 0 && nextReserveY > 0 ? nextReserveY / nextReserveX : 0;
    return {
      amount,
      fee,
      output,
      nextReserveX,
      nextReserveY,
      nextPrice,
    };
  }, [swapInput, swapDirection, pool.reserveX, pool.reserveY]);

  const curvePreview = useMemo(() => {
    if (pool.reserveX <= 0 || pool.reserveY <= 0) return null;
    const k = pool.reserveX * pool.reserveY;
    const xMin = pool.reserveX * 0.3;
    const xMax = pool.reserveX * 1.7;
    const points: { x: number; y: number }[] = [];
    const total = 26;
    for (let i = 0; i <= total; i += 1) {
      const x = xMin + ((xMax - xMin) * i) / total;
      const y = k / x;
      points.push({ x, y });
    }
    const yMax = k / xMin;
    const yMin = k / xMax;
    const mapPoint = (x: number, y: number) => ({
      x: ((x - xMin) / (xMax - xMin)) * 100,
      y: 100 - ((y - yMin) / (yMax - yMin)) * 100,
    });
    const path = points
      .map((pt, index) => {
        const mapped = mapPoint(pt.x, pt.y);
        return `${index === 0 ? "M" : "L"}${mapped.x.toFixed(2)},${mapped.y.toFixed(2)}`;
      })
      .join(" ");
    const current = mapPoint(pool.reserveX, pool.reserveY);
    const simulated =
      simulator.nextReserveX > 0 && simulator.nextReserveY > 0
        ? mapPoint(simulator.nextReserveX, simulator.nextReserveY)
        : null;
    return { path, current, simulated };
  }, [
    pool.reserveX,
    pool.reserveY,
    simulator.nextReserveX,
    simulator.nextReserveY,
  ]);

  const maxSwap = useMemo(() => {
    const balance =
      swapDirection === "x-to-y" ? balances.tokenX : balances.tokenY;
    if (!balance || balance <= 0) return 0;
    return Math.max(0, Number(balance.toFixed(4)));
  }, [balances.tokenX, balances.tokenY, swapDirection]);

  const SwapCard = () => (
    <div className="swap-card">
      <div className="token-card">
        <div className="token-card-head">
          <span className="muted">From</span>
          <div className="mini-actions">
            <button
              className="tiny ghost"
              onClick={() => setSwapDirection("x-to-y")}
            >
              X -&gt; Y
            </button>
            <button
              className="tiny ghost"
              onClick={() => setSwapDirection("y-to-x")}
            >
              Y -&gt; X
            </button>
            <button className="tiny" onClick={setMaxSwap}>
              Max
            </button>
          </div>
        </div>
        <div className="token-input">
          <input
            type="number"
            value={swapInput}
            onChange={(e) => setSwapInput(e.target.value)}
            min="0"
            placeholder="0.0"
          />
          <select
            className="token-select"
            value={swapDirection === "x-to-y" ? "x" : "y"}
            onChange={(e) =>
              setSwapDirection(e.target.value === "x" ? "x-to-y" : "y-to-x")
            }
          >
            <option value="x">Token X</option>
            <option value="y">Token Y</option>
          </select>
        </div>
        <p className="muted small">
          Balance:{" "}
          {swapDirection === "x-to-y"
            ? formatNumber(balances.tokenX)
            : formatNumber(balances.tokenY)}
        </p>
      </div>

      <button
        className="switcher"
        onClick={() =>
          setSwapDirection((prev) => (prev === "x-to-y" ? "y-to-x" : "x-to-y"))
        }
      >
        Switch
      </button>

      <div className="token-card">
        <div className="token-card-head">
          <span className="muted">To</span>
          <select
            className="token-select"
            value={swapDirection === "x-to-y" ? "y" : "x"}
            disabled
          >
            <option value="x">Token X</option>
            <option value="y">Token Y</option>
          </select>
        </div>
        <div className="token-output">
          <h3>
            {quoteLoading
              ? "Loading..."
              : liveSwapOutput !== null
                ? formatNumber(liveSwapOutput)
                : "0.0"}
          </h3>
          <p className="muted small">Expected output</p>
        </div>
      </div>

      <div className="inline-stats">
        <div>
          <p className="muted small">Price (X-&gt;Y)</p>
          <strong>
            {currentPrice ? `1 X ~ ${formatNumber(currentPrice)} Y` : "N/A"}
          </strong>
        </div>
        <div>
          <p className="muted small">Fee</p>
          <strong>0.30%</strong>
        </div>
        <div>
          <p className="muted small">Pool reserves</p>
          <strong>
            {formatNumber(pool.reserveX)} X / {formatNumber(pool.reserveY)} Y
          </strong>
        </div>
      </div>
      <div className="breakdown">
        <div>
          <span className="muted small">Price impact</span>
          <strong>{priceImpact ? `${priceImpact.toFixed(4)}%` : "N/A"}</strong>
        </div>
        <div>
          <span className="muted small">Minimum received</span>
          <strong>
            {liveSwapOutput ? `${formatNumber(liveSwapOutput * 0.995)} ` : "N/A"}
            {swapDirection === "x-to-y" ? "Y" : "X"}
          </strong>
        </div>
      </div>

      <div className="simulator">
        <div className="sim-header">
          <div>
            <p className="eyebrow">Swap Simulator</p>
            <h3>Live curve preview</h3>
          </div>
          <span className="pill-small">Drag to preview</span>
        </div>
        <div className="sim-body">
          <div className="sim-controls">
            <label>Simulated amount</label>
            <input
              type="range"
              min="0"
              max={maxSwap || 0}
              step="0.01"
              value={Math.min(Number(swapInput || 0), maxSwap || 0)}
              onChange={(e) => setSwapInput(e.target.value)}
              disabled={maxSwap <= 0}
            />
            <div className="sim-meta">
              <span className="muted small">
                {formatNumber(simulator.amount)}{" "}
                {swapDirection === "x-to-y" ? "X" : "Y"}
              </span>
              <span className="muted small">Max {formatNumber(maxSwap)}</span>
            </div>
          </div>
          <div className="sim-curve">
            {curvePreview ? (
              <svg
                viewBox="0 0 100 100"
                role="img"
                aria-label="Swap curve preview"
              >
                <path d={curvePreview.path} className="curve-path" />
                <circle
                  cx={curvePreview.current.x}
                  cy={curvePreview.current.y}
                  r="3.5"
                />
                {curvePreview.simulated && (
                  <circle
                    cx={curvePreview.simulated.x}
                    cy={curvePreview.simulated.y}
                    r="4.5"
                    className="curve-point"
                  />
                )}
              </svg>
            ) : (
              <p className="muted small">
                Add liquidity to render the AMM curve.
              </p>
            )}
          </div>
        </div>
        <div className="sim-stats">
          <div>
            <span className="muted small">Post-swap reserves</span>
            <strong>
              {formatNumber(simulator.nextReserveX)} X /{" "}
              {formatNumber(simulator.nextReserveY)} Y
            </strong>
          </div>
          <div>
            <span className="muted small">New price</span>
            <strong>
              {simulator.nextPrice
                ? `1 X ~ ${formatNumber(simulator.nextPrice)} Y`
                : "N/A"}
            </strong>
          </div>
          <div>
            <span className="muted small">Estimated fee</span>
            <strong>
              {formatNumber(simulator.fee)}{" "}
              {swapDirection === "x-to-y" ? "X" : "Y"}
            </strong>
          </div>
        </div>
      </div>

      <button
        className="primary"
        onClick={handleSwap}
        disabled={quoteLoading || swapPending}
      >
        {quoteLoading
          ? "Loading quote..."
          : swapPending
            ? "Swapping..."
            : `Swap ${swapDirection === "x-to-y" ? "X for Y" : "Y for X"}`}
      </button>
      {swapMessage && <p className="note">{swapMessage}</p>}
    </div>
  );

  const LiquidityCard = () => (
    <div className="lp-stack">
      <div className="token-card">
        <div className="token-card-head">
          <span className="muted">Add to pool</span>
          <div className="mini-actions">
            <button className="tiny ghost" onClick={handleSyncToPoolRatio}>
              Match pool ratio
            </button>
            <button
              className="tiny ghost"
              onClick={() => handleFaucet()}
              disabled={faucetPending}
            >
              Faucet both
            </button>
          </div>
        </div>
        <div className="dual-input">
          <div>
            <label>Token X</label>
            <input
              type="number"
              value={liqX}
              onChange={(e) => setLiqX(e.target.value)}
              min="0"
              placeholder="0.0"
            />
            <p className="muted small">
              Balance: {formatNumber(balances.tokenX)}
            </p>
          </div>
          <div>
            <label>Token Y</label>
            <input
              type="number"
              value={liqY}
              onChange={(e) => setLiqY(e.target.value)}
              min="0"
              placeholder="0.0"
            />
            <p className="muted small">
              Balance: {formatNumber(balances.tokenY)}
            </p>
          </div>
        </div>
        <button className="primary" onClick={handleAddLiquidity}>
          Add liquidity
        </button>
        {liqMessage && <p className="note">{liqMessage}</p>}
      </div>

      <div className="token-card">
        <div className="token-card-head">
          <span className="muted">Remove from pool</span>
          <button className="tiny ghost" onClick={setMaxBurn}>
            Max
          </button>
        </div>
        <div className="token-input">
          <input
            type="number"
            value={burnShares}
            onChange={(e) => setBurnShares(e.target.value)}
            min="0"
            placeholder="0"
          />
          <span className="token-pill">LP shares</span>
        </div>
        <p className="muted small">
          Your LP: {formatNumber(balances.lpShares)} / Pool share:{" "}
          {(poolShare * 100).toFixed(2)}%
        </p>
        <button className="primary" onClick={handleRemoveLiquidity}>
          Remove from pool
        </button>
        {burnMessage && <p className="note">{burnMessage}</p>}
      </div>
    </div>
  );

  return (
    <div className="page single">
      <header className="nav">
        <div className="nav-inner">
          <div className="brand">
            <img className="brand-mark" src="/favicon.png" alt="Stacks Exchange logo" />
            <div>
              <p className="eyebrow">Stacks Exchange</p>
              <h1>Swap</h1>
            </div>
          </div>
          <div className="nav-actions">
            {IS_MAINNET && <span className="chip success">Mainnet live</span>}
            <button
              className="chip ghost"
              onClick={() => stacksAddress && syncBalances(stacksAddress)}
              disabled={!stacksAddress || balancePending}
            >
              {balancePending ? "Refreshing..." : "Refresh balances"}
            </button>
            {stacksAddress ? (
              <>
                <span className="chip success">
                  Stacks: {shortAddress(stacksAddress)}
                </span>
                <button className="chip ghost" onClick={handleStacksDisconnect}>
                  Disconnect
                </button>
              </>
            ) : (
              <button className="chip ghost" onClick={handleStacksConnect}>
                Connect Stacks
              </button>
            )}
            {btcStatus ? (
              <>
                <span className="chip ghost">BTC: {btcStatus}</span>
                <button className="chip ghost" onClick={handleBtcDisconnect}>
                  Clear
                </button>
              </>
            ) : !stacksAddress ? (
              <button className="chip ghost" onClick={handleBtcConnect}>
                Connect Bitcoin
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <main className="content single">
        <section className="panel swap-panel">
          <div className="panel-head">
            <div className="tabs">
              <button
                className={activeTab === "swap" ? "active" : ""}
                onClick={() => setActiveTab("swap")}
              >
                Swap
              </button>
              <button
                className={activeTab === "liquidity" ? "active" : ""}
                onClick={() => setActiveTab("liquidity")}
              >
                Pool
              </button>
            </div>
            <div className="panel-subtitle">
              {activeTab === "swap"
                ? "Trade tokens with a simple quote and confirm."
                : "Add or remove liquidity from the pool."}
            </div>
          </div>

          {activeTab === "swap" ? <SwapCard /> : <LiquidityCard />}

          {faucetMessage && <p className="note subtle">{faucetMessage}</p>}
          {faucetTxids.length > 0 && (
            <div className="note subtle">
              <p className="muted small">Recent faucet tx</p>
              <div className="chip-row">
                {faucetTxids.map((txid) => (
                  <a
                    key={txid}
                    className="chip ghost"
                    href={`https://explorer.hiro.so/txid/${txid}?chain=${RESOLVED_STACKS_NETWORK}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {txid.slice(0, 6)}...{txid.slice(-6)}
                  </a>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
      <div className="floating-faucet" aria-label="Quick faucet controls">
        <button
          className="chip"
          onClick={() => handleFaucet("x")}
          disabled={faucetPending}
        >
          X Faucet
        </button>
        <button
          className="chip"
          onClick={() => handleFaucet("y")}
          disabled={faucetPending}
        >
          Y Faucet
        </button>
      </div>
      {poolPending && <span className="sr-only">Loading pool data</span>}
    </div>
  );
}

export default App;


