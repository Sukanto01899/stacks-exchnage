import { useCallback, useEffect, useMemo, useState } from "react";
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
import type { ClarityValue } from "@stacks/transactions";
import { STACKS_MAINNET, STACKS_TESTNET, createNetwork } from "@stacks/network";
import "./App.css";
import { appKit } from "./wallets/appkit";

// TODO: Replace with your contract and token information
type PoolState = {
  reserveX: number;
  reserveY: number;
  totalShares: number;
};

// TODO: Update types and logic to match your contract's state and functions
type Balances = {
  tokenX: number;
  tokenY: number;
  lpShares: number;
};

// TODO: Update swap draft structure to match your contract's swap function arguments and quote logic
type SwapDraft = {
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

//  TODO: Update token key type if your contract supports more than 2 tokens or uses different identifiers for the tokens
type TokenKey = "x" | "y";
type PortfolioSnapshot = {
  ts: number;
  totalX: number;
  totalY: number;
  priceYX: number;
  reserveX?: number;
  reserveY?: number;
};
type ActivityItem = {
  id: string;
  ts: number;
  kind: "swap" | "add-liquidity" | "remove-liquidity" | "approve" | "faucet";
  status: "submitted" | "confirmed" | "failed" | "cancelled";
  txid?: string;
  message: string;
  detail?: string;
};
type PriceAlert = {
  id: string;
  createdAt: number;
  pairDirection: "x-to-y" | "y-to-x";
  condition: ">=" | "<=";
  targetPrice: number;
  status: "active" | "triggered";
  triggeredAt?: number;
  triggeredPrice?: number;
};

const FEE_BPS = 30;
const BPS = 10_000;
const FAUCET_AMOUNT = 5_000;
const PRICE_IMPACT_WARN_PCT = 1;
const PRICE_IMPACT_CONFIRM_PCT = 3;
const PRICE_IMPACT_BLOCK_PCT = 15;
const PRICE_IMPACT_TARGET_PCT = 1;
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
const DAY_MS = 24 * 60 * 60 * 1000;
const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;

// TODO: Update token normalization logic if your contract uses a different asset ID format or if you want to support multiple tokens per contract
const normalizeTokenId = (value: string | undefined, assetName: string) => {
  if (value?.includes("::")) return value;
  if (value) return `${value}::${assetName}`;
  return "";
};

// TODO: Update token contract addresses and asset names, or add logic to fetch them dynamically if needed
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

// TODO: Update formatting logic if your tokens use a different decimal precision or if you want to display more/less decimal places
const formatNumber = (value: number) =>
  value.toLocaleString(undefined, {
    maximumFractionDigits: 6,
    minimumFractionDigits: 0,
  });

const formatSignedPercent = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return "N/A";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
};

const formatCompactNumber = (value: number) =>
  value.toLocaleString(undefined, {
    notation: "compact",
    maximumFractionDigits: value >= 100 ? 1 : 2,
  });

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const buildLinePath = (
  values: number[],
  width: number,
  height: number,
  padding = 10,
) => {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((value, index) => {
      const x =
        values.length === 1
          ? width / 2
          : padding + (index / (values.length - 1)) * (width - padding * 2);
      const y =
        height - padding - ((value - min) / range) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
};

// TODO: Update price formatting logic if you want to display more/less decimal places or use a different notation for small/large numbers
const isNetworkAddress = (addr: string | null) => {
  if (!addr) return false;
  if (IS_MAINNET) {
    return /^(SP|SM)[A-Z0-9]{38,}$/.test(addr);
  }
  return /^S[NT][A-Z0-9]{38,}$/.test(addr);
};

// TODO: Update error code mapping based on your contract's error codes and messages
const parseContractId = (id: string) => {
  const [address, nameWithAsset] = id.split(".");
  const contractName = (nameWithAsset || "").split("::")[0];
  return { address, contractName };
};

// TODO: Update token asset ID parsing logic if your contract uses a different format
const parseTokenAssetId = (id: string) => {
  const [contractId = "", assetName = ""] = id.split("::");
  const [address = "", contractName = ""] = contractId.split(".");
  return { fullId: id, contractId, address, contractName, assetName };
};

// TODO: Update this function if your contract uses a different liquidity math or if you want to implement more precise calculations (e.g. using a library for fixed-point arithmetic)
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

// TODO: Update this function if your contract uses a different swap formula or if you want to include fees, slippage, or price impact calculations in the quote logic
const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

// Simulate a quote calculation with a delay to mimic an API call or complex on-chain logic
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

// TODO: Update this function if your contract's read-only functions return errors in a different format or if you want to implement more robust error handling based on your contract's specific response structure
const unwrapReadOnlyOk = (raw: unknown) => {
  const parsed = cvToValue(raw as never) as unknown;
  if (parsed && typeof parsed === "object") {
    const maybe = parsed as Record<string, unknown>;
    if ("success" in maybe) {
      if (!maybe.success) {
        throw new Error(`Read-only call failed: ${String(maybe.value ?? "")}`);
      }
      return maybe.value;
    }
    if ("type" in maybe && maybe.type === "ok") {
      return maybe.value;
    }
  }
  return parsed;
};

// TODO: Update this type guard if your contract's ABI includes more complex function argument or return value structures
const isNamedFunctionLike = (value: unknown): value is { name: string } => {
  if (!value || typeof value !== "object") return false;
  const maybe = value as { name?: unknown };
  return typeof maybe.name === "string";
};

// TODO: Update this function if your contract uses a different swap formula or if you want to include fees, slippage, or price impact calculations in the quote logic
function App() {
  const [pool, setPool] = useState<PoolState>({
    reserveX: 0,
    reserveY: 0,
    totalShares: 0,
  });

  // TODO: Update balance state structure if you want to track additional tokens, LP positions, or other relevant user data
  const [balances, setBalances] = useState<Balances>({
    tokenX: 0,
    tokenY: 0,
    lpShares: 0,
  });
  const [faucetTxids, setFaucetTxids] = useState<string[]>([]);

  const [activeTab, setActiveTab] = useState<
    "swap" | "liquidity" | "analytics"
  >("swap");
  const [swapDirection, setSwapDirection] = useState<"x-to-y" | "y-to-x">(
    "x-to-y",
  );
  const [swapInput, setSwapInput] = useState("100");
  const [swapMessage, setSwapMessage] = useState<string | null>(null);
  const [swapPending, setSwapPending] = useState(false);
  const [swapDraft, setSwapDraft] = useState<SwapDraft | null>(null);
  const [impactConfirmed, setImpactConfirmed] = useState(false);
  const [preflightPending, setPreflightPending] = useState(false);
  const [preflightMessage, setPreflightMessage] = useState<string | null>(null);
  const [slippageInput, setSlippageInput] = useState("0.5");
  const [deadlineMinutesInput, setDeadlineMinutesInput] = useState("30");
  const [targetPriceEnabled, setTargetPriceEnabled] = useState(false);
  const [targetPriceInput, setTargetPriceInput] = useState("");
  const [targetCondition, setTargetCondition] = useState<">=" | "<=">(">=");
  const [targetPairDirection, setTargetPairDirection] = useState<
    "x-to-y" | "y-to-x"
  >("x-to-y");
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [browserAlertsEnabled, setBrowserAlertsEnabled] = useState(false);
  const [approvalSupport, setApprovalSupport] = useState<
    Record<TokenKey, boolean>
  >({
    x: false,
    y: false,
  });
  const [allowances, setAllowances] = useState<Record<TokenKey, number | null>>(
    {
      x: null,
      y: null,
    },
  );
  const [approvePending, setApprovePending] = useState<TokenKey | null>(null);
  const [approveUnlimited, setApproveUnlimited] = useState(true);
  const [approvalMessage, setApprovalMessage] = useState<string | null>(null);

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
  const [portfolioHistory, setPortfolioHistory] = useState<PortfolioSnapshot[]>(
    [],
  );
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);

  // TODO: Update this if your contract uses a different network configuration
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

  // TODO: Update these memoized values if your contract has different function names, argument structures, or if you want to support multiple pools or token pairs in the same UI
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
  const spenderContractId = useMemo(
    () => `${poolContract.address}.${poolContract.contractName}`,
    [poolContract.address, poolContract.contractName],
  );
  const portfolioHistoryKey = useMemo(
    () =>
      `portfolio-history-${RESOLVED_STACKS_NETWORK}-${stacksAddress || "guest"}`,
    [stacksAddress],
  );
  const activityKey = useMemo(
    () => `activity-${RESOLVED_STACKS_NETWORK}-${stacksAddress || "guest"}`,
    [stacksAddress],
  );
  const priceAlertsKey = useMemo(
    () => `price-alerts-${RESOLVED_STACKS_NETWORK}-${stacksAddress || "guest"}`,
    [stacksAddress],
  );

  // TODO: Update this function if you want to implement more robust logic for fetching the current block height, such as using a WebSocket connection to listen for new blocks or implementing retry logic in case of network errors
  const fetchTipHeight = async () => {
    const res = await fetch(`${STACKS_API}/extended/v1/info`);
    if (!res.ok) return 0;
    const data = await res.json().catch(() => ({}));
    return Number(data?.stacks_tip_height || 0);
  };

  // TODO: Update this function if your contract uses a different approval mechanism, such as separate allowance functions for each token, or if you want to implement more detailed error handling and user feedback based on your contract's specific response structure and error codes
  const detectApprovalSupport = useCallback(
    async (token: TokenKey) => {
      const t = tokenContracts[token];
      const url = `${STACKS_API}/v2/contracts/interface/${t.address}/${t.contractName}`;
      const response = await fetch(url).catch(() => null);
      if (!response?.ok) return false;
      const data = await response.json().catch(() => ({}));
      const functions = Array.isArray(data?.functions) ? data.functions : [];
      const hasApprove = functions.some(
        (fn) => isNamedFunctionLike(fn) && fn.name === "approve",
      );
      const hasAllowance = functions.some(
        (fn) => isNamedFunctionLike(fn) && fn.name === "get-allowance",
      );
      return hasApprove && hasAllowance;
    },
    [tokenContracts],
  );

  // TODO: Update this function if your contract uses a different approval mechanism, such as separate allowance functions for each token, or if you want to implement more detailed error handling and user feedback based on your contract's specific response structure and error codes
  const fetchAllowance = useCallback(
    async (token: TokenKey, owner: string) => {
      if (!approvalSupport[token]) return null;
      const t = tokenContracts[token];
      const result = await fetchCallReadOnlyFunction({
        contractAddress: t.address,
        contractName: t.contractName,
        functionName: "get-allowance",
        functionArgs: [
          standardPrincipalCV(owner),
          contractPrincipalCV(poolContract.address, poolContract.contractName),
        ],
        senderAddress: owner,
        network,
      });
      const raw = unwrapReadOnlyOk(result);
      const value = Number(raw || 0) / TOKEN_DECIMALS;
      return Number.isFinite(value) ? value : 0;
    },
    [
      approvalSupport,
      network,
      poolContract.address,
      poolContract.contractName,
      tokenContracts,
    ],
  );

  // TODO: Update this function if your contract uses a different approval mechanism, such as separate allowance functions for each token, or if you want to implement more detailed error handling and user feedback based on your contract's specific response structure and error codes
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const [x, y] = await Promise.all([
        detectApprovalSupport("x"),
        detectApprovalSupport("y"),
      ]);
      if (cancelled) return;
      setApprovalSupport({ x, y });
      if (!x || !y) {
        setAllowances((prev) => ({
          x: x ? prev.x : null,
          y: y ? prev.y : null,
        }));
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    detectApprovalSupport,
    tokenContracts.x.address,
    tokenContracts.x.contractName,
    tokenContracts.y.address,
    tokenContracts.y.contractName,
  ]);

  useEffect(() => {
    if (!stacksAddress) {
      setAllowances({ x: null, y: null });
      return;
    }
    let cancelled = false;
    const run = async () => {
      const [x, y] = await Promise.all([
        fetchAllowance("x", stacksAddress),
        fetchAllowance("y", stacksAddress),
      ]);
      if (cancelled) return;
      setAllowances({ x, y });
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    stacksAddress,
    fetchAllowance,
    approvalSupport.x,
    approvalSupport.y,
    poolContract.address,
    poolContract.contractName,
    tokenContracts.x.address,
    tokenContracts.x.contractName,
    tokenContracts.y.address,
    tokenContracts.y.contractName,
  ]);

  // TODO: Update this function if your contract uses a different pool state retrieval mechanism, or if you want to implement more detailed error handling and user feedback based on your contract's specific response structure and error codes
  const fetchPoolState = useCallback(
    async (address?: string | null) => {
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
        const lpBalanceValue = lpBalance
          ? Number(cvToValue(lpBalance) || 0)
          : 0;

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
    },
    [network, poolContract.address, poolContract.contractName],
  );

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

  const fetchPoolReserves = useCallback(
    async (address?: string | null) => {
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
    },
    [network, poolContract.address, poolContract.contractName],
  );

  const syncBalances = useCallback(
    async (address: string, opts?: { silent?: boolean }) => {
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
    },
    [fetchPoolReserves, fetchPoolState, tokenIds.x, tokenIds.y],
  );

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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(portfolioHistoryKey);
      if (!raw) {
        setPortfolioHistory([]);
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      const snapshots = Array.isArray(parsed)
        ? parsed.filter(
            (item): item is PortfolioSnapshot =>
              !!item &&
              typeof item === "object" &&
              typeof (item as PortfolioSnapshot).ts === "number" &&
              typeof (item as PortfolioSnapshot).totalX === "number" &&
              typeof (item as PortfolioSnapshot).totalY === "number" &&
              typeof (item as PortfolioSnapshot).priceYX === "number",
          )
        : [];
      setPortfolioHistory(snapshots);
    } catch (error) {
      console.warn("Portfolio history load failed", error);
      setPortfolioHistory([]);
    }
  }, [portfolioHistoryKey]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(activityKey);
      if (!raw) {
        setActivityItems([]);
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      const items = Array.isArray(parsed)
        ? parsed.filter(
            (item): item is ActivityItem =>
              !!item &&
              typeof item === "object" &&
              typeof (item as ActivityItem).id === "string" &&
              typeof (item as ActivityItem).ts === "number" &&
              typeof (item as ActivityItem).kind === "string" &&
              typeof (item as ActivityItem).status === "string" &&
              typeof (item as ActivityItem).message === "string",
          )
        : [];
      setActivityItems(items);
    } catch (error) {
      console.warn("Activity history load failed", error);
      setActivityItems([]);
    }
  }, [activityKey]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(priceAlertsKey);
      if (!raw) {
        setPriceAlerts([]);
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      const items = Array.isArray(parsed)
        ? parsed.filter(
            (item): item is PriceAlert =>
              !!item &&
              typeof item === "object" &&
              typeof (item as PriceAlert).id === "string" &&
              typeof (item as PriceAlert).createdAt === "number" &&
              ((item as PriceAlert).pairDirection === "x-to-y" ||
                (item as PriceAlert).pairDirection === "y-to-x") &&
              (((item as PriceAlert).condition as string) === ">=" ||
                ((item as PriceAlert).condition as string) === "<=") &&
              typeof (item as PriceAlert).targetPrice === "number" &&
              (((item as PriceAlert).status as string) === "active" ||
                ((item as PriceAlert).status as string) === "triggered"),
          )
        : [];
      setPriceAlerts(items);
    } catch (error) {
      console.warn("Price alerts load failed", error);
      setPriceAlerts([]);
    }
  }, [priceAlertsKey]);

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    setBrowserAlertsEnabled(Notification.permission === "granted");
  }, []);

  const pushActivity = useCallback(
    (item: Omit<ActivityItem, "id" | "ts">) => {
      const nextItem: ActivityItem = {
        ...item,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ts: Date.now(),
      };
      setActivityItems((prev) => {
        const next = [nextItem, ...prev].slice(0, 30);
        try {
          localStorage.setItem(activityKey, JSON.stringify(next));
        } catch (error) {
          console.warn("Activity history save failed", error);
        }
        return next;
      });
    },
    [activityKey],
  );

  const patchActivityByTxid = useCallback(
    (
      txid: string,
      patch: Partial<Pick<ActivityItem, "status" | "message" | "detail">>,
    ) => {
      if (!txid) return;
      setActivityItems((prev) => {
        let changed = false;
        const next = prev.map((item) => {
          if (item.txid !== txid) return item;
          changed = true;
          return { ...item, ...patch };
        });
        if (!changed) return prev;
        try {
          localStorage.setItem(activityKey, JSON.stringify(next));
        } catch (error) {
          console.warn("Activity history save failed", error);
        }
        return next;
      });
    },
    [activityKey],
  );

  const persistPriceAlerts = useCallback(
    (next: PriceAlert[]) => {
      try {
        localStorage.setItem(priceAlertsKey, JSON.stringify(next));
      } catch (error) {
        console.warn("Price alerts save failed", error);
      }
    },
    [priceAlertsKey],
  );

  const createPriceAlert = useCallback(() => {
    if (!targetPrice) {
      setAlertMessage("Enter a valid target price first.");
      return;
    }
    const nextAlert: PriceAlert = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      pairDirection: targetPairDirection,
      condition: targetCondition,
      targetPrice,
      status: "active",
    };
    setPriceAlerts((prev) => {
      const next = [nextAlert, ...prev].slice(0, 12);
      persistPriceAlerts(next);
      return next;
    });
    setAlertMessage(
      `Alert saved for 1 ${targetPairDirection === "x-to-y" ? "X" : "Y"} ${targetCondition} ${formatNumber(targetPrice)} ${targetPairDirection === "x-to-y" ? "Y" : "X"}.`,
    );
  }, [persistPriceAlerts, targetCondition, targetPairDirection, targetPrice]);

  const removePriceAlert = useCallback(
    (id: string) => {
      setPriceAlerts((prev) => {
        const next = prev.filter((item) => item.id !== id);
        persistPriceAlerts(next);
        return next;
      });
    },
    [persistPriceAlerts],
  );

  const clearTriggeredAlerts = useCallback(() => {
    setPriceAlerts((prev) => {
      const next = prev.filter((item) => item.status !== "triggered");
      persistPriceAlerts(next);
      return next;
    });
  }, [persistPriceAlerts]);

  const requestBrowserAlerts = useCallback(async () => {
    if (typeof Notification === "undefined") {
      setAlertMessage("Browser notifications are not supported here.");
      return;
    }
    const permission = await Notification.requestPermission();
    setBrowserAlertsEnabled(permission === "granted");
    setAlertMessage(
      permission === "granted"
        ? "Browser notifications enabled."
        : "Browser notifications were not granted.",
    );
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
  const lpPosition = useMemo(() => {
    const share = Math.max(0, Math.min(1, poolShare));
    return {
      x: pool.reserveX * share,
      y: pool.reserveY * share,
    };
  }, [pool.reserveX, pool.reserveY, poolShare]);
  const portfolioTotals = useMemo(() => {
    const totalX = balances.tokenX + lpPosition.x;
    const totalY = balances.tokenY + lpPosition.y;
    const valueInX = currentPrice > 0 ? totalX + totalY / currentPrice : totalX;
    const valueInY = currentPrice > 0 ? totalY + totalX * currentPrice : totalY;
    return { totalX, totalY, valueInX, valueInY };
  }, [
    balances.tokenX,
    balances.tokenY,
    lpPosition.x,
    lpPosition.y,
    currentPrice,
  ]);

  useEffect(() => {
    if (!stacksAddress || currentPrice <= 0) return;
    const now = Date.now();
    setPortfolioHistory((prev) => {
      const sorted = [...prev].sort((a, b) => a.ts - b.ts);
      const last = sorted[sorted.length - 1];
      if (
        last &&
        now - last.ts < SNAPSHOT_INTERVAL_MS &&
        Math.abs(last.totalX - portfolioTotals.totalX) < 1e-6 &&
        Math.abs(last.totalY - portfolioTotals.totalY) < 1e-6
      ) {
        return prev;
      }
      const next = [
        ...sorted.filter((item) => now - item.ts <= DAY_MS * 7),
        {
          ts: now,
          totalX: portfolioTotals.totalX,
          totalY: portfolioTotals.totalY,
          priceYX: currentPrice,
          reserveX: pool.reserveX,
          reserveY: pool.reserveY,
        },
      ];
      try {
        localStorage.setItem(portfolioHistoryKey, JSON.stringify(next));
      } catch (error) {
        console.warn("Portfolio history save failed", error);
      }
      return next;
    });
  }, [
    stacksAddress,
    currentPrice,
    portfolioTotals.totalX,
    portfolioTotals.totalY,
    pool.reserveX,
    pool.reserveY,
    portfolioHistoryKey,
  ]);

  useEffect(() => {
    const pendingItems = activityItems.filter(
      (item) => item.status === "submitted" && item.txid,
    );
    if (pendingItems.length === 0) return;

    const seen = new Set<string>();
    const uniquePending = pendingItems.filter((item) => {
      if (!item.txid || seen.has(item.txid)) return false;
      seen.add(item.txid);
      return true;
    });

    let cancelled = false;
    const interval = window.setInterval(() => {
      void Promise.all(
        uniquePending.map(async (item) => {
          if (!item.txid || cancelled) return;
          try {
            const res = await fetch(
              `${STACKS_API}/extended/v1/tx/${item.txid}`,
            );
            if (!res.ok) return;
            const data = await res.json().catch(() => ({}));
            const status = String(data?.tx_status || "");
            if (!status) return;

            if (status === "success") {
              patchActivityByTxid(item.txid, {
                status: "confirmed",
                message: `${item.kind.replace(/-/g, " ")} confirmed`,
                detail: "Confirmed on-chain",
              });
              if (stacksAddress) {
                await syncBalances(stacksAddress, { silent: true }).catch(
                  () => {},
                );
                await fetchPoolState(stacksAddress).catch(() => {});
              }
              return;
            }

            if (
              status.includes("abort") ||
              status.includes("dropped") ||
              status.includes("failed")
            ) {
              const repr = data?.tx_result?.repr as string | undefined;
              const reason =
                explainPoolError(repr) || repr || "Execution failed";
              patchActivityByTxid(item.txid, {
                status: "failed",
                message: `${item.kind.replace(/-/g, " ")} failed`,
                detail: reason,
              });
            }
          } catch (error) {
            console.warn("Tx status polling failed", error);
          }
        }),
      );
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    activityItems,
    patchActivityByTxid,
    stacksAddress,
    syncBalances,
    fetchPoolState,
  ]);

  useEffect(() => {
    if (directionalPrice <= 0) return;
    const now = Date.now();
    const triggeredIds: string[] = [];

    setPriceAlerts((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        if (item.status !== "active") return item;
        const price =
          item.pairDirection === "x-to-y"
            ? currentPrice
            : currentPrice > 0
              ? 1 / currentPrice
              : 0;
        if (!price) return item;
        const hit =
          item.condition === ">="
            ? price >= item.targetPrice
            : price <= item.targetPrice;
        if (!hit) return item;
        changed = true;
        triggeredIds.push(item.id);
        return {
          ...item,
          status: "triggered",
          triggeredAt: now,
          triggeredPrice: price,
        };
      });
      if (!changed) return prev;
      persistPriceAlerts(next);
      return next;
    });

    if (triggeredIds.length === 0) return;

    const triggeredAlerts = priceAlerts.filter((item) =>
      triggeredIds.includes(item.id),
    );
    const first = triggeredAlerts[0];
    if (first) {
      const unitFrom = first.pairDirection === "x-to-y" ? "X" : "Y";
      const unitTo = first.pairDirection === "x-to-y" ? "Y" : "X";
      setAlertMessage(
        `Price alert triggered: 1 ${unitFrom} ${first.condition} ${formatNumber(first.targetPrice)} ${unitTo}.`,
      );
      if (browserAlertsEnabled && typeof Notification !== "undefined") {
        const livePrice =
          first.pairDirection === "x-to-y"
            ? currentPrice
            : currentPrice > 0
              ? 1 / currentPrice
              : 0;
        new Notification("Stacks Exchange price alert", {
          body: `1 ${unitFrom} is now ${formatNumber(livePrice)} ${unitTo}.`,
        });
      }
    }
  }, [
    browserAlertsEnabled,
    currentPrice,
    directionalPrice,
    persistPriceAlerts,
    priceAlerts,
  ]);

  const portfolioMetrics = useMemo(() => {
    const cutoff = Date.now() - DAY_MS;
    const baseline = [...portfolioHistory]
      .sort((a, b) => a.ts - b.ts)
      .reverse()
      .find((item) => item.ts <= cutoff);

    const pnl24X =
      baseline && baseline.totalX > 0
        ? ((portfolioTotals.totalX - baseline.totalX) / baseline.totalX) * 100
        : null;
    const pnl24Y =
      baseline && baseline.totalY > 0
        ? ((portfolioTotals.totalY - baseline.totalY) / baseline.totalY) * 100
        : null;
    const ilPercent =
      baseline && baseline.priceYX > 0 && currentPrice > 0
        ? ((2 * Math.sqrt(currentPrice / baseline.priceYX)) /
            (1 + currentPrice / baseline.priceYX) -
            1) *
          100
        : null;

    return {
      pnl24X,
      pnl24Y,
      ilPercent,
      has24h: Boolean(baseline),
    };
  }, [
    portfolioHistory,
    portfolioTotals.totalX,
    portfolioTotals.totalY,
    currentPrice,
  ]);

  const analytics = useMemo(() => {
    const now = Date.now();
    const sorted = [...portfolioHistory].sort((a, b) => a.ts - b.ts);
    const chartPoints = sorted.slice(-28);
    const values = chartPoints.map((item) => item.priceYX).filter((v) => v > 0);
    const chartWidth = 320;
    const chartHeight = 140;
    const pricePath = buildLinePath(values, chartWidth, chartHeight, 12);
    const minPrice = values.length ? Math.min(...values) : 0;
    const maxPrice = values.length ? Math.max(...values) : 0;
    const latest = sorted[sorted.length - 1] || null;
    const baseline24 =
      [...sorted].reverse().find((item) => item.ts <= now - DAY_MS) || null;
    const priceChange24 =
      baseline24 && baseline24.priceYX > 0 && currentPrice > 0
        ? ((currentPrice - baseline24.priceYX) / baseline24.priceYX) * 100
        : null;
    const reserveXChange24 =
      baseline24 &&
      typeof baseline24.reserveX === "number" &&
      baseline24.reserveX > 0
        ? ((pool.reserveX - baseline24.reserveX) / baseline24.reserveX) * 100
        : null;
    const reserveYChange24 =
      baseline24 &&
      typeof baseline24.reserveY === "number" &&
      baseline24.reserveY > 0
        ? ((pool.reserveY - baseline24.reserveY) / baseline24.reserveY) * 100
        : null;
    const tvlX =
      currentPrice > 0 ? pool.reserveX + pool.reserveY / currentPrice : 0;
    const tvlY =
      currentPrice > 0 ? pool.reserveY + pool.reserveX * currentPrice : 0;
    const swaps24h = activityItems.filter(
      (item) =>
        item.kind === "swap" &&
        item.status === "confirmed" &&
        now - item.ts <= DAY_MS,
    );
    const liquidity24h = activityItems.filter(
      (item) =>
        (item.kind === "add-liquidity" || item.kind === "remove-liquidity") &&
        now - item.ts <= DAY_MS,
    );
    const chartStart = chartPoints[0]?.ts ?? now;
    const chartEnd = chartPoints[chartPoints.length - 1]?.ts ?? now;
    const span = Math.max(chartEnd - chartStart, 1);
    const swapMarkers = activityItems
      .filter(
        (item) =>
          item.kind === "swap" &&
          item.status === "confirmed" &&
          item.ts >= chartStart &&
          item.ts <= chartEnd,
      )
      .slice(-8)
      .map((item) => ({
        ...item,
        x: clamp(
          12 + ((item.ts - chartStart) / span) * (chartWidth - 24),
          12,
          308,
        ),
      }));

    return {
      baseline24,
      chartPoints,
      chartWidth,
      chartHeight,
      liquidity24h: liquidity24h.length,
      latest,
      maxPrice,
      minPrice,
      priceChange24,
      pricePath,
      swapMarkers,
      swaps24h: swaps24h.length,
      tvlX,
      tvlY,
      reserveXChange24,
      reserveYChange24,
    };
  }, [
    activityItems,
    currentPrice,
    pool.reserveX,
    pool.reserveY,
    portfolioHistory,
  ]);

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

  useEffect(() => {
    setImpactConfirmed(false);
  }, [swapInput, swapDirection]);

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
    const inputToken: TokenKey = fromX ? "x" : "y";
    if (approvalSupport[inputToken]) {
      const allowance = allowances[inputToken] || 0;
      if (allowance + Number.EPSILON < amount) {
        setSwapMessage(
          `Approve ${fromX ? "Token X" : "Token Y"} first. Required: ${formatNumber(amount)}, current allowance: ${formatNumber(allowance)}.`,
        );
        return;
      }
    }
    const outputPreview = quoteSwap(amount, fromX);
    if (outputPreview <= 0) {
      setSwapMessage("Pool has no liquidity for this direction yet.");
      return;
    }
    const reserve = fromX ? pool.reserveX : pool.reserveY;
    const impactPct = reserve > 0 ? (amount / reserve) * 100 : 0;
    if (impactPct >= PRICE_IMPACT_BLOCK_PCT) {
      setSwapMessage(
        `Swap blocked: price impact ${impactPct.toFixed(2)}% is too high (max ${PRICE_IMPACT_BLOCK_PCT}%). Split into smaller trades.`,
      );
      return;
    }
    if (impactPct >= PRICE_IMPACT_CONFIRM_PCT && !impactConfirmed) {
      setSwapMessage(
        `High price impact (${impactPct.toFixed(2)}%). Confirm the high-impact checkbox before swapping.`,
      );
      return;
    }
    const slippagePercent = Number(slippageInput);
    if (
      !Number.isFinite(slippagePercent) ||
      slippagePercent < 0 ||
      slippagePercent > 50
    ) {
      setSwapMessage("Set slippage between 0 and 50%.");
      return;
    }
    const deadlineMinutes = Number(deadlineMinutesInput);
    if (
      !Number.isFinite(deadlineMinutes) ||
      deadlineMinutes <= 0 ||
      deadlineMinutes > 1440
    ) {
      setSwapMessage("Set deadline minutes between 1 and 1440.");
      return;
    }
    const amountMicro = BigInt(Math.floor(amount * TOKEN_DECIMALS));
    const minOut = Math.max(0, outputPreview * (1 - slippagePercent / 100));
    const minOutMicro = BigInt(Math.floor(minOut * TOKEN_DECIMALS));
    const tip = await fetchTipHeight();
    const blocksAhead = Math.max(1, Math.ceil(deadlineMinutes / 10));
    const deadline = tip > 0 ? BigInt(tip + blocksAhead) : 9_999_999_999n;

    const runPreflight = async () => {
      const senderAddress = stacksAddress || CONTRACT_ADDRESS;
      const quoteFn = fromX ? "quote-x-for-y" : "quote-y-for-x";
      const quoteResult = await fetchCallReadOnlyFunction({
        contractAddress: poolContract.address,
        contractName: poolContract.contractName,
        functionName: quoteFn,
        functionArgs: [uintCV(amountMicro)],
        senderAddress,
        network,
      });
      const quoteValue = unwrapReadOnlyOk(quoteResult) as {
        dy?: string;
        dx?: string;
        fee?: string;
      };
      const outMicro = BigInt(
        String(fromX ? (quoteValue?.dy ?? 0) : (quoteValue?.dx ?? 0)),
      );
      const feeMicro = BigInt(String(quoteValue?.fee ?? 0));
      if (outMicro <= 0n) {
        throw new Error("Pre-flight failed: expected output is zero.");
      }
      if (outMicro < minOutMicro) {
        throw new Error(
          "Pre-flight failed: slippage settings are too strict for current pool state.",
        );
      }
      return {
        out: Number(outMicro) / TOKEN_DECIMALS,
        fee: Number(feeMicro) / TOKEN_DECIMALS,
      };
    };

    try {
      setPreflightPending(true);
      const simulated = await runPreflight();
      setPreflightMessage(
        `Preview ok: output ~${formatNumber(simulated.out)} ${fromX ? "Y" : "X"}, fee ~${formatNumber(simulated.fee)} ${fromX ? "X" : "Y"}.`,
      );
    } catch (error) {
      setPreflightMessage(
        error instanceof Error
          ? error.message
          : "Pre-flight simulation failed.",
      );
      setSwapMessage("Swap blocked: preview failed.");
      setPreflightPending(false);
      return;
    } finally {
      setPreflightPending(false);
    }

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

    setSwapDraft({
      amount,
      outputPreview,
      minReceived: minOut,
      slippagePercent,
      deadlineMinutes,
      priceImpact: impactPct,
      fromSymbol: fromX ? "X" : "Y",
      toSymbol: fromX ? "Y" : "X",
      functionName,
      functionArgs,
    });
    setSwapMessage("Review swap details and confirm.");
  };

  const executeSwap = async () => {
    if (!swapDraft || !stacksAddress) return;
    try {
      setSwapPending(true);
      await openContractCall({
        network,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Allow,
        contractAddress: poolContract.address,
        contractName: poolContract.contractName,
        functionName: swapDraft.functionName,
        functionArgs: swapDraft.functionArgs,
        onFinish: async (payload) => {
          setSwapMessage(`Swap submitted. Txid: ${payload.txId}`);
          pushActivity({
            kind: "swap",
            status: "submitted",
            txid: payload.txId,
            message: "Swap submitted",
            detail: "Waiting for on-chain confirmation",
          });
          setSwapPending(false);
          setSwapDraft(null);
        },
        onCancel: () => {
          setSwapMessage("Swap cancelled.");
          pushActivity({
            kind: "swap",
            status: "cancelled",
            message: "Swap cancelled",
          });
          setSwapPending(false);
          setSwapDraft(null);
        },
      });
    } catch (error) {
      pushActivity({
        kind: "swap",
        status: "failed",
        message: "Swap submission failed",
      });
      setSwapMessage(
        error instanceof Error
          ? error.message
          : "Swap failed. Check wallet and try again.",
      );
      setSwapPending(false);
      setSwapDraft(null);
    }
  };

  const handleSwapPreview = async () => {
    setPreflightMessage(null);
    const amount = Number(swapInput);
    if (!amount || amount <= 0) {
      setPreflightMessage("Enter an amount greater than 0.");
      return;
    }
    if (!stacksAddress) {
      setPreflightMessage("Connect a Stacks wallet first.");
      return;
    }
    if (pool.reserveX <= 0 || pool.reserveY <= 0) {
      setPreflightMessage("Pool has no liquidity yet.");
      return;
    }
    const fromX = swapDirection === "x-to-y";
    const inputBalance = fromX ? balances.tokenX : balances.tokenY;
    if (amount > inputBalance) {
      setPreflightMessage("Not enough token balance for this preview.");
      return;
    }
    const slippagePercent = Number(slippageInput);
    if (
      !Number.isFinite(slippagePercent) ||
      slippagePercent < 0 ||
      slippagePercent > 50
    ) {
      setPreflightMessage("Set slippage between 0 and 50%.");
      return;
    }
    const amountMicro = BigInt(Math.floor(amount * TOKEN_DECIMALS));
    const outputPreview = quoteSwap(amount, fromX);
    const minOut = Math.max(0, outputPreview * (1 - slippagePercent / 100));
    const minOutMicro = BigInt(Math.floor(minOut * TOKEN_DECIMALS));

    try {
      setPreflightPending(true);
      const senderAddress = stacksAddress || CONTRACT_ADDRESS;
      const quoteFn = fromX ? "quote-x-for-y" : "quote-y-for-x";
      const quoteResult = await fetchCallReadOnlyFunction({
        contractAddress: poolContract.address,
        contractName: poolContract.contractName,
        functionName: quoteFn,
        functionArgs: [uintCV(amountMicro)],
        senderAddress,
        network,
      });
      const quoteValue = unwrapReadOnlyOk(quoteResult) as {
        dy?: string;
        dx?: string;
        fee?: string;
      };
      const outMicro = BigInt(
        String(fromX ? (quoteValue?.dy ?? 0) : (quoteValue?.dx ?? 0)),
      );
      const feeMicro = BigInt(String(quoteValue?.fee ?? 0));
      if (outMicro <= 0n) {
        setPreflightMessage("Preview failed: output is zero.");
        return;
      }
      if (outMicro < minOutMicro) {
        setPreflightMessage(
          "Preview failed: slippage settings too strict for current reserves.",
        );
        return;
      }
      setPreflightMessage(
        `Preview ok: output ~${formatNumber(Number(outMicro) / TOKEN_DECIMALS)} ${fromX ? "Y" : "X"}, fee ~${formatNumber(Number(feeMicro) / TOKEN_DECIMALS)} ${fromX ? "X" : "Y"}.`,
      );
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Preview failed.";
      const reason = explainPoolError(raw);
      setPreflightMessage(reason ? `Preview failed. ${reason}.` : raw);
    } finally {
      setPreflightPending(false);
    }
  };

  const handleApprove = async (token: TokenKey, requiredAmount?: number) => {
    setApprovalMessage(null);
    if (!stacksAddress) {
      setApprovalMessage("Connect a Stacks wallet first.");
      return;
    }
    if (!approvalSupport[token]) {
      setApprovalMessage(
        `${token === "x" ? "Token X" : "Token Y"} does not require approvals with the current contract.`,
      );
      return;
    }

    const requiredMicro = BigInt(
      Math.max(1, Math.floor((requiredAmount || 0) * TOKEN_DECIMALS)),
    );
    const unlimitedMicro = 9_999_999_999_999_999n;
    const amountMicro = approveUnlimited ? unlimitedMicro : requiredMicro;
    const tokenLabel = token === "x" ? "Token X" : "Token Y";
    const tokenContract = tokenContracts[token];

    try {
      setApprovePending(token);
      await openContractCall({
        network,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Allow,
        contractAddress: tokenContract.address,
        contractName: tokenContract.contractName,
        functionName: "approve",
        functionArgs: [
          uintCV(amountMicro),
          contractPrincipalCV(poolContract.address, poolContract.contractName),
        ],
        onFinish: async (payload) => {
          setApprovalMessage(
            `${tokenLabel} approval submitted. Txid: ${payload.txId}`,
          );
          pushActivity({
            kind: "approve",
            status: "submitted",
            txid: payload.txId,
            message: `${tokenLabel} approval submitted`,
            detail: "Waiting for on-chain confirmation",
          });
          const next = await fetchAllowance(token, stacksAddress).catch(
            () => null,
          );
          setAllowances((prev) => ({ ...prev, [token]: next }));
          setApprovePending(null);
        },
        onCancel: () => {
          setApprovalMessage(`${tokenLabel} approval cancelled.`);
          pushActivity({
            kind: "approve",
            status: "cancelled",
            message: `${tokenLabel} approval cancelled`,
          });
          setApprovePending(null);
        },
      });
    } catch (error) {
      pushActivity({
        kind: "approve",
        status: "failed",
        message: `${tokenLabel} approval failed`,
      });
      setApprovalMessage(
        error instanceof Error
          ? error.message
          : `${tokenLabel} approval failed.`,
      );
      setApprovePending(null);
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
    if (approvalSupport.x) {
      const allowanceX = allowances.x || 0;
      if (allowanceX + Number.EPSILON < amountX) {
        setLiqMessage(
          `Approve Token X first. Required: ${formatNumber(amountX)}, current allowance: ${formatNumber(allowanceX)}.`,
        );
        return;
      }
    }
    if (approvalSupport.y) {
      const allowanceY = allowances.y || 0;
      if (allowanceY + Number.EPSILON < amountY) {
        setLiqMessage(
          `Approve Token Y first. Required: ${formatNumber(amountY)}, current allowance: ${formatNumber(allowanceY)}.`,
        );
        return;
      }
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
          pushActivity({
            kind: "add-liquidity",
            status: "submitted",
            txid: payload.txId,
            message: "Add liquidity submitted",
            detail: "Waiting for on-chain confirmation",
          });
        },
        onCancel: () => {
          setLiqMessage("Liquidity cancelled.");
          pushActivity({
            kind: "add-liquidity",
            status: "cancelled",
            message: "Add liquidity cancelled",
          });
        },
      });
    } catch (error) {
      pushActivity({
        kind: "add-liquidity",
        status: "failed",
        message: "Add liquidity failed",
      });
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
          pushActivity({
            kind: "remove-liquidity",
            status: "submitted",
            txid: payload.txId,
            message: "Remove liquidity submitted",
            detail: "Waiting for on-chain confirmation",
          });
        },
        onCancel: () => {
          setBurnMessage("Remove liquidity cancelled.");
          pushActivity({
            kind: "remove-liquidity",
            status: "cancelled",
            message: "Remove liquidity cancelled",
          });
        },
      });
    } catch (error) {
      pushActivity({
        kind: "remove-liquidity",
        status: "failed",
        message: "Remove liquidity failed",
      });
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
        pushActivity({
          kind: "faucet",
          status: "submitted",
          txid: String(res.txid || ""),
          message: `${t.toUpperCase()} faucet submitted`,
          detail: "Waiting for on-chain confirmation",
        });
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
            .join(
              " & ",
            )} on ${RESOLVED_STACKS_NETWORK}. Txid(s): ${results.join(
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
  const splitSuggestionCount = useMemo(() => {
    if (!priceImpact || priceImpact <= PRICE_IMPACT_TARGET_PCT) return 1;
    return Math.max(2, Math.ceil(priceImpact / PRICE_IMPACT_TARGET_PCT));
  }, [priceImpact]);
  const applySplitSuggestion = () => {
    const amount = Number(swapInput || 0);
    if (!amount || splitSuggestionCount <= 1) return;
    const chunk = amount / splitSuggestionCount;
    setSwapInput(chunk.toFixed(6));
    setSwapMessage(
      `Split suggestion applied: ${splitSuggestionCount} chunks of ~${formatNumber(chunk)} each.`,
    );
  };

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

  const directionalPrice = useMemo(() => {
    if (!currentPrice) return 0;
    return targetPairDirection === "x-to-y" ? currentPrice : 1 / currentPrice;
  }, [currentPrice, targetPairDirection]);

  const targetPrice = useMemo(() => {
    const parsed = Number(targetPriceInput);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  }, [targetPriceInput]);

  const targetTriggered = useMemo(() => {
    if (!targetPriceEnabled || !targetPrice || !directionalPrice) return false;
    if (targetCondition === ">=") return directionalPrice >= targetPrice;
    return directionalPrice <= targetPrice;
  }, [targetPriceEnabled, targetPrice, directionalPrice, targetCondition]);

  const alertSummary = useMemo(() => {
    const active = priceAlerts.filter((item) => item.status === "active");
    const triggered = priceAlerts.filter((item) => item.status === "triggered");
    return { active, triggered };
  }, [priceAlerts]);

  const slippageRatio = useMemo(() => {
    const parsed = Number(slippageInput);
    if (!Number.isFinite(parsed) || parsed < 0) return 0.005;
    return parsed / 100;
  }, [slippageInput]);

  const swapAmount = useMemo(() => {
    const parsed = Number(swapInput);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [swapInput]);

  const liqAmountX = useMemo(() => {
    const parsed = Number(liqX);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [liqX]);

  const liqAmountY = useMemo(() => {
    const parsed = Number(liqY);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [liqY]);

  const renderApprovalManager = (mode: "swap" | "liquidity") => {
    const requiredX =
      mode === "swap"
        ? swapDirection === "x-to-y"
          ? swapAmount
          : 0
        : liqAmountX;
    const requiredY =
      mode === "swap"
        ? swapDirection === "y-to-x"
          ? swapAmount
          : 0
        : liqAmountY;
    const hasAnySupport = approvalSupport.x || approvalSupport.y;

    return (
      <div className="approval-panel">
        <div className="approval-head">
          <span className="muted">Approval Manager</span>
          <label className="target-toggle">
            <input
              type="checkbox"
              checked={approveUnlimited}
              onChange={(e) => setApproveUnlimited(e.target.checked)}
            />
            Unlimited
          </label>
        </div>
        {!hasAnySupport ? (
          <p className="muted small">
            Approval not required for current token contracts (direct transfer
            model).
          </p>
        ) : (
          <div className="approval-grid">
            <div>
              <p className="muted small">Token X allowance</p>
              <strong>
                {allowances.x === null
                  ? "N/A"
                  : `${formatNumber(allowances.x)} X`}
              </strong>
              <button
                className="tiny ghost"
                onClick={() => handleApprove("x", requiredX)}
                disabled={
                  !approvalSupport.x ||
                  !stacksAddress ||
                  approvePending !== null
                }
              >
                {approvePending === "x" ? "Approving X..." : "Approve X"}
              </button>
            </div>
            <div>
              <p className="muted small">Token Y allowance</p>
              <strong>
                {allowances.y === null
                  ? "N/A"
                  : `${formatNumber(allowances.y)} Y`}
              </strong>
              <button
                className="tiny ghost"
                onClick={() => handleApprove("y", requiredY)}
                disabled={
                  !approvalSupport.y ||
                  !stacksAddress ||
                  approvePending !== null
                }
              >
                {approvePending === "y" ? "Approving Y..." : "Approve Y"}
              </button>
            </div>
          </div>
        )}
        <p className="muted small">Spender: {spenderContractId}</p>
        {approvalMessage && <p className="note subtle">{approvalMessage}</p>}
      </div>
    );
  };

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
            {liveSwapOutput
              ? `${formatNumber(liveSwapOutput * (1 - slippageRatio))} `
              : "N/A"}
            {swapDirection === "x-to-y" ? "Y" : "X"}
          </strong>
        </div>
      </div>

      <div className="impact-guardrail">
        <div className="impact-row">
          <span className="muted small">
            Guardrail: warn at {PRICE_IMPACT_WARN_PCT}%, confirm at{" "}
            {PRICE_IMPACT_CONFIRM_PCT}%, block at {PRICE_IMPACT_BLOCK_PCT}%.
          </span>
          {splitSuggestionCount > 1 && (
            <button className="tiny ghost" onClick={applySplitSuggestion}>
              Auto split ({splitSuggestionCount}x)
            </button>
          )}
        </div>
        {priceImpact >= PRICE_IMPACT_CONFIRM_PCT &&
          priceImpact < PRICE_IMPACT_BLOCK_PCT && (
            <label className="impact-confirm">
              <input
                type="checkbox"
                checked={impactConfirmed}
                onChange={(e) => setImpactConfirmed(e.target.checked)}
              />
              I understand this swap has high price impact.
            </label>
          )}
        {priceImpact >= PRICE_IMPACT_WARN_PCT &&
          priceImpact < PRICE_IMPACT_CONFIRM_PCT && (
            <p className="muted small">
              Warning: current price impact is {priceImpact.toFixed(2)}%.
              Consider smaller size.
            </p>
          )}
      </div>

      <div className="swap-settings">
        <div>
          <label>Slippage tolerance (%)</label>
          <input
            type="number"
            min="0"
            max="50"
            step="0.1"
            value={slippageInput}
            onChange={(e) => setSlippageInput(e.target.value)}
          />
          <div className="mini-actions">
            <button
              className="tiny ghost"
              onClick={() => setSlippageInput("0.1")}
            >
              0.1%
            </button>
            <button
              className="tiny ghost"
              onClick={() => setSlippageInput("0.5")}
            >
              0.5%
            </button>
            <button
              className="tiny ghost"
              onClick={() => setSlippageInput("1")}
            >
              1%
            </button>
          </div>
        </div>
        <div>
          <label>Deadline (minutes)</label>
          <input
            type="number"
            min="1"
            max="1440"
            step="1"
            value={deadlineMinutesInput}
            onChange={(e) => setDeadlineMinutesInput(e.target.value)}
          />
        </div>
      </div>

      <div className="target-panel">
        <div className="target-head">
          <span className="muted">Target Price</span>
          <label className="target-toggle">
            <input
              type="checkbox"
              checked={targetPriceEnabled}
              onChange={(e) => setTargetPriceEnabled(e.target.checked)}
            />
            Enable
          </label>
        </div>
        <div className="target-meta">
          <span className="muted small">
            When 1 {targetPairDirection === "x-to-y" ? "X" : "Y"}
          </span>
          <button
            className="tiny ghost"
            onClick={() =>
              setTargetPairDirection((prev) =>
                prev === "x-to-y" ? "y-to-x" : "x-to-y",
              )
            }
            disabled={!targetPriceEnabled}
          >
            Reverse
          </button>
        </div>
        <div className="target-grid">
          <select
            className="token-select"
            value={targetCondition}
            onChange={(e) =>
              setTargetCondition((e.target.value as ">=" | "<=") || ">=")
            }
            disabled={!targetPriceEnabled}
          >
            <option value=">=">{">="}</option>
            <option value="<=">{"<="}</option>
          </select>
          <input
            className="target-input"
            type="number"
            min="0"
            step="0.000001"
            placeholder={`Target ${targetPairDirection === "x-to-y" ? "Y" : "X"}`}
            value={targetPriceInput}
            onChange={(e) => setTargetPriceInput(e.target.value)}
            disabled={!targetPriceEnabled}
          />
        </div>
        <div className="target-meta">
          <span className="muted small">
            Live:{" "}
            {directionalPrice
              ? `${formatNumber(directionalPrice)} ${targetPairDirection === "x-to-y" ? "Y/X" : "X/Y"}`
              : "N/A"}
          </span>
          <button
            className="tiny ghost"
            onClick={() =>
              directionalPrice > 0 &&
              setTargetPriceInput(directionalPrice.toFixed(6))
            }
            disabled={!targetPriceEnabled || directionalPrice <= 0}
          >
            Use current
          </button>
        </div>
        {targetPriceEnabled && targetPrice && (
          <p className={`note ${targetTriggered ? "subtle" : ""}`}>
            {targetTriggered
              ? `Condition met: 1 ${targetPairDirection === "x-to-y" ? "X" : "Y"} ${targetCondition} ${formatNumber(targetPrice)} ${targetPairDirection === "x-to-y" ? "Y" : "X"}.`
              : `Waiting: 1 ${targetPairDirection === "x-to-y" ? "X" : "Y"} ${targetCondition} ${formatNumber(targetPrice)} ${targetPairDirection === "x-to-y" ? "Y" : "X"}.`}
          </p>
        )}
        <div className="alerts-panel">
          <div className="alerts-head">
            <div>
              <span className="muted">Price Alerts</span>
              <p className="muted small">
                Save the current target as a reusable alert.
              </p>
            </div>
            <button className="tiny ghost" onClick={requestBrowserAlerts}>
              {browserAlertsEnabled ? "Browser alerts on" : "Enable alerts"}
            </button>
          </div>
          <div className="alerts-actions">
            <button
              className="tiny"
              onClick={createPriceAlert}
              disabled={!targetPriceEnabled || !targetPrice}
            >
              Save alert
            </button>
            <button
              className="tiny ghost"
              onClick={clearTriggeredAlerts}
              disabled={alertSummary.triggered.length === 0}
            >
              Clear triggered
            </button>
          </div>
          {alertMessage ? <p className="note subtle">{alertMessage}</p> : null}
          {priceAlerts.length === 0 ? (
            <p className="muted small">No saved alerts yet.</p>
          ) : (
            <div className="alerts-list">
              {priceAlerts.slice(0, 6).map((alert) => {
                const unitFrom = alert.pairDirection === "x-to-y" ? "X" : "Y";
                const unitTo = alert.pairDirection === "x-to-y" ? "Y" : "X";
                return (
                  <div className="alerts-item" key={alert.id}>
                    <div className="alerts-main">
                      <span
                        className={`chip ghost status-${alert.status === "triggered" ? "confirmed" : "submitted"}`}
                      >
                        {alert.status}
                      </span>
                      <strong>
                        1 {unitFrom} {alert.condition}{" "}
                        {formatNumber(alert.targetPrice)} {unitTo}
                      </strong>
                    </div>
                    <div className="alerts-meta">
                      <span className="muted small">
                        {alert.status === "triggered" && alert.triggeredAt
                          ? `Triggered ${new Date(alert.triggeredAt).toLocaleString()}`
                          : `Created ${new Date(alert.createdAt).toLocaleString()}`}
                      </span>
                      <div className="mini-actions">
                        <button
                          className="tiny ghost"
                          onClick={() => {
                            setTargetPriceEnabled(true);
                            setTargetPairDirection(alert.pairDirection);
                            setTargetCondition(alert.condition);
                            setTargetPriceInput(String(alert.targetPrice));
                          }}
                        >
                          Use
                        </button>
                        <button
                          className="tiny ghost"
                          onClick={() => removePriceAlert(alert.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    {alert.status === "triggered" && alert.triggeredPrice ? (
                      <p className="muted small">
                        Live hit at {formatNumber(alert.triggeredPrice)}{" "}
                        {unitTo}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
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

      {renderApprovalManager("swap")}

      <button
        className="primary"
        onClick={handleSwap}
        disabled={
          quoteLoading || swapPending || preflightPending || Boolean(swapDraft)
        }
      >
        {quoteLoading
          ? "Loading quote..."
          : swapPending
            ? "Swapping..."
            : swapDraft
              ? "Review open"
              : "Review swap"}
      </button>
      <button
        className="secondary"
        onClick={handleSwapPreview}
        disabled={quoteLoading || swapPending || preflightPending}
      >
        {preflightPending ? "Previewing..." : "Preview transaction"}
      </button>
      {preflightMessage && <p className="note subtle">{preflightMessage}</p>}
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
        {renderApprovalManager("liquidity")}
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

  const PortfolioPanel = () => (
    <section className="portfolio-panel">
      <div className="portfolio-head">
        <div>
          <p className="eyebrow">Portfolio</p>
          <h3>PnL & Position</h3>
        </div>
        <span className="chip ghost">
          {portfolioMetrics.has24h ? "24h window" : "Building 24h data"}
        </span>
      </div>
      <div className="portfolio-grid">
        <div>
          <p className="muted small">Holdings</p>
          <strong>
            {formatNumber(portfolioTotals.totalX)} X /{" "}
            {formatNumber(portfolioTotals.totalY)} Y
          </strong>
        </div>
        <div>
          <p className="muted small">Total value</p>
          <strong>{formatNumber(portfolioTotals.valueInX)} X</strong>
          <p className="muted small">
            {formatNumber(portfolioTotals.valueInY)} Y
          </p>
        </div>
        <div>
          <p className="muted small">24h PnL</p>
          <strong>{formatSignedPercent(portfolioMetrics.pnl24X)} in X</strong>
          <p className="muted small">
            {formatSignedPercent(portfolioMetrics.pnl24Y)} in Y
          </p>
        </div>
        <div>
          <p className="muted small">LP position</p>
          <strong>{(poolShare * 100).toFixed(2)}% share</strong>
          <p className="muted small">
            {formatNumber(lpPosition.x)} X / {formatNumber(lpPosition.y)} Y
          </p>
        </div>
      </div>
      <p
        className={`note ${portfolioMetrics.ilPercent !== null ? "subtle" : ""}`}
      >
        Estimated IL vs hold: {formatSignedPercent(portfolioMetrics.ilPercent)}.
      </p>
    </section>
  );

  const ActivityPanel = () => (
    <section className="activity-panel">
      <div className="activity-head">
        <div>
          <p className="eyebrow">Recent Activity</p>
          <h3>Transactions</h3>
        </div>
        <button
          className="tiny ghost"
          onClick={() => {
            setActivityItems([]);
            try {
              localStorage.removeItem(activityKey);
            } catch (error) {
              console.warn("Activity history clear failed", error);
            }
          }}
          disabled={activityItems.length === 0}
        >
          Clear
        </button>
      </div>
      {activityItems.length === 0 ? (
        <p className="muted small">No activity yet.</p>
      ) : (
        <div className="activity-list">
          {activityItems.slice(0, 8).map((item) => (
            <div className="activity-item" key={item.id}>
              <div className="activity-main">
                <span className={`chip ghost status-${item.status}`}>
                  {item.status}
                </span>
                <strong>{item.message}</strong>
              </div>
              <div className="activity-meta">
                <span className="muted small">
                  {new Date(item.ts).toLocaleString()}
                </span>
                {item.txid ? (
                  <a
                    className="chip ghost"
                    href={`https://explorer.hiro.so/txid/${item.txid}?chain=${RESOLVED_STACKS_NETWORK}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {item.txid.slice(0, 6)}...{item.txid.slice(-6)}
                  </a>
                ) : null}
              </div>
              {item.detail ? (
                <p className="muted small">{item.detail}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );

  const AnalyticsPanel = () => (
    <section className="analytics-panel">
      <div className="analytics-head">
        <div>
          <p className="eyebrow">Pool Analytics</p>
          <h3>Price, reserves, activity</h3>
        </div>
        <span className="chip ghost">
          {analytics.chartPoints.length > 1
            ? "Local 7d history"
            : "Collecting data"}
        </span>
      </div>

      <div className="analytics-grid">
        <div className="analytics-stat">
          <p className="muted small">Pool TVL</p>
          <strong>{formatCompactNumber(analytics.tvlY)} Y</strong>
          <p className="muted small">{formatCompactNumber(analytics.tvlX)} X</p>
        </div>
        <div className="analytics-stat">
          <p className="muted small">Price 24h</p>
          <strong>{formatSignedPercent(analytics.priceChange24)}</strong>
          <p className="muted small">
            1 X = {formatNumber(currentPrice || 0)} Y
          </p>
        </div>
        <div className="analytics-stat">
          <p className="muted small">Reserve drift</p>
          <strong>{formatSignedPercent(analytics.reserveXChange24)} X</strong>
          <p className="muted small">
            {formatSignedPercent(analytics.reserveYChange24)} Y
          </p>
        </div>
        <div className="analytics-stat">
          <p className="muted small">24h activity</p>
          <strong>{analytics.swaps24h} swaps</strong>
          <p className="muted small">{analytics.liquidity24h} LP actions</p>
        </div>
      </div>

      <div className="analytics-chart-card">
        <div className="analytics-chart-head">
          <div>
            <p className="muted small">X/Y price trend</p>
            <strong>
              {analytics.latest
                ? `Updated ${new Date(analytics.latest.ts).toLocaleString()}`
                : "No chart data yet"}
            </strong>
          </div>
          <div className="analytics-legend">
            <span className="legend-line">Price</span>
            <span className="legend-dot">Swap</span>
          </div>
        </div>
        {analytics.pricePath ? (
          <svg
            className="analytics-chart"
            viewBox={`0 0 ${analytics.chartWidth} ${analytics.chartHeight}`}
            role="img"
            aria-label="Pool price analytics chart"
          >
            <path className="analytics-line" d={analytics.pricePath} />
            {analytics.swapMarkers.map((marker) => (
              <circle
                key={marker.id}
                className="analytics-marker"
                cx={marker.x}
                cy={analytics.chartHeight - 18}
                r="4"
              >
                <title>{new Date(marker.ts).toLocaleString()}</title>
              </circle>
            ))}
          </svg>
        ) : (
          <p className="muted small">
            Connect a wallet and keep the app open while balances refresh to
            build the local chart.
          </p>
        )}
        <div className="analytics-scale">
          <span className="muted small">
            Low {formatNumber(analytics.minPrice)}
          </span>
          <span className="muted small">
            High {formatNumber(analytics.maxPrice)}
          </span>
        </div>
      </div>

      <div className="analytics-grid">
        <div className="analytics-stat">
          <p className="muted small">Current reserves</p>
          <strong>{formatNumber(pool.reserveX)} X</strong>
          <p className="muted small">{formatNumber(pool.reserveY)} Y</p>
        </div>
        <div className="analytics-stat">
          <p className="muted small">Pool share supply</p>
          <strong>{formatCompactNumber(pool.totalShares)}</strong>
          <p className="muted small">LP shares minted</p>
        </div>
        <div className="analytics-stat">
          <p className="muted small">Latest baseline</p>
          <strong>
            {analytics.baseline24
              ? new Date(analytics.baseline24.ts).toLocaleString()
              : "No 24h point"}
          </strong>
          <p className="muted small">Used for change calculations</p>
        </div>
        <div className="analytics-stat">
          <p className="muted small">Confirmed swap markers</p>
          <strong>{analytics.swapMarkers.length}</strong>
          <p className="muted small">Shown on the visible chart window</p>
        </div>
      </div>
    </section>
  );

  return (
    <div className="page single">
      <header className="nav">
        <div className="nav-inner">
          <div className="brand">
            <img
              className="brand-mark"
              src="/favicon.png"
              alt="Stacks Exchange logo"
            />
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
          <PortfolioPanel />
          <ActivityPanel />
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
              <button
                className={activeTab === "analytics" ? "active" : ""}
                onClick={() => setActiveTab("analytics")}
              >
                Analytics
              </button>
            </div>
            <div className="panel-subtitle">
              {activeTab === "swap"
                ? "Trade tokens with a simple quote and confirm."
                : activeTab === "liquidity"
                  ? "Add or remove liquidity from the pool."
                  : "Inspect price movement, reserves, and local activity trends."}
            </div>
          </div>

          {activeTab === "swap" ? (
            <SwapCard />
          ) : activeTab === "liquidity" ? (
            <LiquidityCard />
          ) : (
            <AnalyticsPanel />
          )}

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
      {swapDraft && (
        <div
          className="swap-drawer-backdrop"
          onClick={() => !swapPending && setSwapDraft(null)}
        >
          <div className="swap-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="swap-drawer-head">
              <h3>Confirm Swap</h3>
              <button
                className="tiny ghost"
                onClick={() => setSwapDraft(null)}
                disabled={swapPending}
              >
                Close
              </button>
            </div>
            <div className="swap-drawer-grid">
              <div>
                <span className="muted small">You pay</span>
                <strong>
                  {formatNumber(swapDraft.amount)} {swapDraft.fromSymbol}
                </strong>
              </div>
              <div>
                <span className="muted small">You receive (est.)</span>
                <strong>
                  {formatNumber(swapDraft.outputPreview)} {swapDraft.toSymbol}
                </strong>
              </div>
              <div>
                <span className="muted small">Minimum received</span>
                <strong>
                  {formatNumber(swapDraft.minReceived)} {swapDraft.toSymbol}
                </strong>
              </div>
              <div>
                <span className="muted small">Slippage / Deadline</span>
                <strong>
                  {swapDraft.slippagePercent}% / {swapDraft.deadlineMinutes}m
                </strong>
              </div>
              <div>
                <span className="muted small">Route</span>
                <strong>{poolContract.contractName}</strong>
              </div>
              <div>
                <span className="muted small">Price impact</span>
                <strong>{swapDraft.priceImpact.toFixed(3)}%</strong>
              </div>
            </div>
            <div className="swap-drawer-actions">
              <button
                className="secondary"
                onClick={() => setSwapDraft(null)}
                disabled={swapPending}
              >
                Cancel
              </button>
              <button
                className="primary"
                onClick={executeSwap}
                disabled={swapPending}
              >
                {swapPending ? "Submitting..." : "Confirm Swap"}
              </button>
            </div>
          </div>
        </div>
      )}
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
