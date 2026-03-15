import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Suspense, lazy } from "react";
import { connect, openContractCall } from "@stacks/connect";
import {
  AnchorMode,
  PostConditionMode,
  contractPrincipalCV,
  fetchCallReadOnlyFunction,
  standardPrincipalCV,
  uintCV,
} from "@stacks/transactions";
import { STACKS_MAINNET, STACKS_TESTNET, createNetwork } from "@stacks/network";
import "./App.css";
import { useActivity } from "./hooks/useActivity";
import { useAnalytics } from "./hooks/useAnalytics";
import { useBalances } from "./hooks/useBalances";
import { usePool } from "./hooks/usePool";
import SwapCard from "./components/SwapCard";
const LiquidityCard = lazy(() => import("./components/LiquidityCard"));
const AnalyticsPanel = lazy(() => import("./components/AnalyticsPanel"));
import PortfolioPanel from "./components/PortfolioPanel";
import ActivityPanel from "./components/ActivityPanel";
import OnboardingModal from "./components/OnboardingModal";
import SetupPanel from "./components/SetupPanel";
import ApprovalManager from "./components/ApprovalManager";
import type {
  ActivityItem,
  AppTab,
  OnboardingState,
  PriceAlert,
  SwapDraft,
  ToastItem,
  ToastTone,
  TokenKey,
} from "./type";
import {
  BPS,
  FAUCET_AMOUNT,
  FEE_BPS,
  PRICE_IMPACT_BLOCK_PCT,
  PRICE_IMPACT_CONFIRM_PCT,
  PRICE_IMPACT_TARGET_PCT,
  PRICE_IMPACT_WARN_PCT,
  RESOLVED_STACKS_NETWORK,
} from "./constant";
import { CONTRACT_ADDRESS, normalizeTokenId } from "./lib/helper";
import { parseClarityNumber, unwrapReadOnlyOk } from "./lib/clarity";
import { isFiniteNumber } from "./lib/number";

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
const ONBOARDING_STORAGE_KEY = `onboarding-${RESOLVED_STACKS_NETWORK}`;

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

// TODO: Update this type guard if your contract's ABI includes more complex function argument or return value structures
const isNamedFunctionLike = (value: unknown): value is { name: string } => {
  if (!value || typeof value !== "object") return false;
  const maybe = value as { name?: unknown };
  return typeof maybe.name === "string";
};

const inferToastTone = (
  source:
    | "swap"
    | "preflight"
    | "frontend"
    | "alert"
    | "approval"
    | "liquidity"
    | "remove"
    | "faucet",
  message: string,
): ToastTone => {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("failed") ||
    normalized.includes("error") ||
    normalized.includes("blocked") ||
    normalized.includes("not enough") ||
    normalized.includes("unavailable")
  ) {
    return "error";
  }
  if (
    normalized.includes("cancelled") ||
    normalized.includes("warning") ||
    normalized.includes("preview")
  ) {
    return "warning";
  }
  if (
    normalized.includes("submitted") ||
    normalized.includes("loaded") ||
    normalized.includes("enabled") ||
    normalized.includes("sent") ||
    normalized.includes("copied") ||
    normalized.includes("refreshed") ||
    normalized.includes("connected")
  ) {
    return "success";
  }
  if (source === "preflight" || source === "frontend") {
    return "info";
  }
  return "warning";
};

// TODO: Update this function if your contract uses a different swap formula or if you want to include fees, slippage, or price impact calculations in the quote logic
function App() {
  const [faucetTxids, setFaucetTxids] = useState<string[]>([]);

  const [activeTab, setActiveTab] = useState<AppTab>("swap");
  const [swapDirection, setSwapDirection] = useState<"x-to-y" | "y-to-x">(
    "x-to-y",
  );
  const [swapInput, setSwapInput] = useState("100");
  const [swapMessage, setSwapMessage] = useState<string | null>(null);
  const [swapPending, setSwapPending] = useState(false);
  const [impactConfirmed, setImpactConfirmed] = useState(false);
  const [preflightPending, setPreflightPending] = useState(false);
  const [preflightMessage, setPreflightMessage] = useState<string | null>(null);
  const [frontendMessage, setFrontendMessage] = useState<string | null>(null);
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

  const [faucetPending, setFaucetPending] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboarding, setOnboarding] = useState<OnboardingState>({
    seenModal: false,
    dismissed: false,
    visitedTabs: ["swap"],
  });
  const [stacksAddress, setStacksAddress] = useState<string | null>(null);
  const [activityFilter, setActivityFilter] = useState<
    "all" | ActivityItem["kind"] | ActivityItem["status"]
  >("all");
  const lastToastMessages = useRef<Record<string, string | null>>({});

  const pushToast = useCallback((message: string, tone: ToastTone) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev.slice(-4), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4200);
  }, []);

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

  // TODO: Update the spender contract ID if your contract uses a different approval mechanism
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
  const { pool, poolPending, lastPoolRefreshAt, fetchPoolState } = usePool({
    network,
    poolContract,
    contractAddress: CONTRACT_ADDRESS,
    tokenDecimals: TOKEN_DECIMALS,
  });
  const {
    balances,
    setBalances,
    faucetMessage,
    setFaucetMessage,
    syncBalances,
  } = useBalances({
    stacksApi: STACKS_API,
    tokenIds,
    tokenContracts: TOKEN_CONTRACTS,
    tokenDecimals: TOKEN_DECIMALS,
    fetchPoolState,
  });
  const { activityItems, setActivityItems, pushActivity } = useActivity({
    activityKey,
    stacksApi: STACKS_API,
    stacksAddress,
    syncBalances,
    fetchPoolState,
    explainPoolError,
  });
  const poolShare = useMemo(() => {
    if (pool.totalShares === 0) return 0;
    return balances.lpShares / pool.totalShares;
  }, [balances.lpShares, pool.totalShares]);

  const currentPrice = useMemo(() => {
    if (pool.reserveX === 0 || pool.reserveY === 0) return 0;
    return pool.reserveY / pool.reserveX;
  }, [pool.reserveX, pool.reserveY]);

  const directionalPrice = useMemo(() => {
    if (!currentPrice) return 0;
    return targetPairDirection === "x-to-y" ? currentPrice : 1 / currentPrice;
  }, [currentPrice, targetPairDirection]);

  const targetPrice = useMemo(() => {
    const parsed = Number(targetPriceInput);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  }, [targetPriceInput]);

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
  const { analytics, portfolioMetrics } = useAnalytics({
    stacksAddress,
    portfolioHistoryKey,
    portfolioTotals,
    currentPrice,
    pool,
    activityItems,
    dayMs: DAY_MS,
    snapshotIntervalMs: SNAPSHOT_INTERVAL_MS,
  });

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
        (fn: unknown) => isNamedFunctionLike(fn) && fn.name === "approve",
      );
      const hasAllowance = functions.some(
        (fn: unknown) => isNamedFunctionLike(fn) && fn.name === "get-allowance",
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
      const value = parseClarityNumber(raw) / TOKEN_DECIMALS;
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

  // TODO: Update this function if your contract uses a different approval mechanism, such as separate allowance functions for each token, or if you want to implement more detailed error handling and user feedback based on your contract's specific response structure and error codes
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

  useEffect(() => {
    fetchPoolState(stacksAddress);
  }, [fetchPoolState, stacksAddress]);

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
  }, [syncBalances]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<OnboardingState> | null;
      const visitedTabs = Array.isArray(parsed?.visitedTabs)
        ? parsed.visitedTabs.filter(
            (tab): tab is AppTab =>
              tab === "swap" || tab === "liquidity" || tab === "analytics",
          )
        : [];
      setOnboarding({
        seenModal: Boolean(parsed?.seenModal),
        dismissed: Boolean(parsed?.dismissed),
        visitedTabs:
          visitedTabs.length > 0
            ? Array.from(new Set<AppTab>(["swap", ...visitedTabs]))
            : ["swap"],
      });
    } catch (error) {
      console.warn("Onboarding state load failed", error);
    }
  }, []);

  useEffect(() => {
    setOnboarding((prev) => {
      if (prev.visitedTabs.includes(activeTab)) return prev;
      return {
        ...prev,
        visitedTabs: [...prev.visitedTabs, activeTab],
      };
    });
  }, [activeTab]);

  useEffect(() => {
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(onboarding));
    } catch (error) {
      console.warn("Onboarding state save failed", error);
    }
  }, [onboarding]);

  useEffect(() => {
    if (!onboarding.seenModal) {
      setShowOnboarding(true);
    }
  }, [onboarding.seenModal]);

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
      return addr;
    } catch (error) {
      console.error("Stacks connect error", error);
      setStacksAddress(null);
      setFaucetMessage(
        error instanceof Error
          ? error.message
          : `Failed to connect a Stacks ${RESOLVED_STACKS_NETWORK} wallet.`,
      );
      return null;
    }
  };

  const handleStacksDisconnect = () => {
    setStacksAddress(null);
    setSwapPending(false);
    try {
      localStorage.removeItem("stacks-connect-selected-provider");
      localStorage.removeItem("stacks-connect-addresses");
      localStorage.removeItem("stacks-address");
    } catch (error) {
      console.warn("Stacks disconnect cleanup failed", error);
    }
  };

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
          status: "triggered" as const,
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
        new Notification("Clardex price alert", {
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

  const prepareSwapDraft = async (addressOverride?: string | null) => {
    const activeAddress = addressOverride || stacksAddress;
    setSwapMessage(null);
    const amount = Number(swapInput);
    if (!amount || amount <= 0) {
      setSwapMessage("Enter an amount greater than 0.");
      return null;
    }
    if (!activeAddress) {
      setSwapMessage("Connect a Stacks wallet first.");
      return null;
    }
    if (pool.reserveX <= 0 || pool.reserveY <= 0) {
      setSwapMessage("Pool has no liquidity yet. Add liquidity first.");
      return null;
    }
    const fromX = swapDirection === "x-to-y";
    const inputBalance = fromX ? balances.tokenX : balances.tokenY;
    if (amount > inputBalance) {
      setSwapMessage("Not enough balance for this swap.");
      return null;
    }
    const inputToken: TokenKey = fromX ? "x" : "y";
    if (approvalSupport[inputToken]) {
      const allowance = allowances[inputToken] || 0;
      if (allowance + Number.EPSILON < amount) {
        setSwapMessage(
          `Approve ${fromX ? "Token X" : "Token Y"} first. Required: ${formatNumber(amount)}, current allowance: ${formatNumber(allowance)}.`,
        );
        return null;
      }
    }
    const outputPreview = quoteSwap(amount, fromX);
    if (!Number.isFinite(outputPreview)) {
      setSwapMessage(
        "Swap quote is unavailable. Refresh pool data and try again.",
      );
      return null;
    }
    if (outputPreview <= 0) {
      setSwapMessage("Pool has no liquidity for this direction yet.");
      return null;
    }
    const reserve = fromX ? pool.reserveX : pool.reserveY;
    const impactPct = reserve > 0 ? (amount / reserve) * 100 : 0;
    if (impactPct >= PRICE_IMPACT_BLOCK_PCT) {
      setSwapMessage(
        `Swap blocked: price impact ${impactPct.toFixed(2)}% is too high (max ${PRICE_IMPACT_BLOCK_PCT}%). Split into smaller trades.`,
      );
      return null;
    }
    if (
      impactPct >= PRICE_IMPACT_CONFIRM_PCT &&
      !showMinimalSwapLayout &&
      !impactConfirmed
    ) {
      setSwapMessage(
        `High price impact (${impactPct.toFixed(2)}%). Confirm the high-impact checkbox before swapping.`,
      );
      return null;
    }
    const slippagePercent = Number(slippageInput);
    if (
      !Number.isFinite(slippagePercent) ||
      slippagePercent < 0 ||
      slippagePercent > 50
    ) {
      setSwapMessage("Set slippage between 0 and 50%.");
      return null;
    }
    const deadlineMinutes = Number(deadlineMinutesInput);
    if (
      !Number.isFinite(deadlineMinutes) ||
      deadlineMinutes <= 0 ||
      deadlineMinutes > 1440
    ) {
      setSwapMessage("Set deadline minutes between 1 and 1440.");
      return null;
    }
    const amountMicro = BigInt(Math.floor(amount * TOKEN_DECIMALS));
    const minOut = Math.max(0, outputPreview * (1 - slippagePercent / 100));
    if (!Number.isFinite(minOut)) {
      setSwapMessage(
        "Swap minimum output could not be calculated. Refresh pool data and try again.",
      );
      return null;
    }
    const minOutMicro = BigInt(Math.floor(minOut * TOKEN_DECIMALS));
    const tip = await fetchTipHeight();
    const blocksAhead = Math.max(1, Math.ceil(deadlineMinutes / 10));
    const deadline = tip > 0 ? BigInt(tip + blocksAhead) : 9_999_999_999n;

    const runPreflight = async () => {
      const senderAddress = activeAddress || CONTRACT_ADDRESS;
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
        value?: { dy?: unknown; dx?: unknown; fee?: unknown };
      };
      const outMicro = BigInt(
        Math.floor(
          parseClarityNumber(
            fromX
              ? (quoteValue?.dy ?? quoteValue?.value?.dy)
              : (quoteValue?.dx ?? quoteValue?.value?.dx),
          ),
        ),
      );
      const feeMicro = BigInt(
        Math.floor(
          parseClarityNumber(quoteValue?.fee ?? quoteValue?.value?.fee),
        ),
      );
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
      return null;
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
          standardPrincipalCV(activeAddress),
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
          standardPrincipalCV(activeAddress),
          uintCV(deadline),
        ];

    return {
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
    } satisfies SwapDraft;
  };

  const handleSwap = async () => {
    const draft = await prepareSwapDraft();
    if (!draft) return;
    await executeSwap(draft);
  };

  const executeSwap = async (
    draft: SwapDraft,
    addressOverride?: string | null,
  ) => {
    const activeAddress = addressOverride || stacksAddress;
    if (!activeAddress) {
      setSwapMessage("Connect a Stacks wallet first.");
      return;
    }
    try {
      setSwapPending(true);
      await openContractCall({
        network,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Allow,
        contractAddress: poolContract.address,
        contractName: poolContract.contractName,
        functionName: draft.functionName,
        functionArgs: draft.functionArgs,
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
        },
        onCancel: () => {
          setSwapMessage("Swap cancelled.");
          pushActivity({
            kind: "swap",
            status: "cancelled",
            message: "Swap cancelled",
          });
          setSwapPending(false);
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
    }
  };

  const handleSimpleSwap = async () => {
    let activeAddress = stacksAddress;
    if (!activeAddress) {
      activeAddress = await handleStacksConnect();
    }
    if (!activeAddress) {
      setSwapMessage("Connect a Stacks wallet first.");
      return;
    }
    const draft = await prepareSwapDraft(activeAddress);
    if (!draft) return;
    await executeSwap(draft, activeAddress);
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

  const onboardingSteps = useMemo(
    () => [
      {
        id: "connect",
        title: "Connect Stacks wallet",
        description:
          "Use the wallet picker so balances, swaps, and LP actions bind to a real address.",
        complete: Boolean(stacksAddress),
        actionLabel: stacksAddress ? "Connected" : "Connect",
        action: handleStacksConnect,
      },
      {
        id: "fund",
        title: "Get demo liquidity",
        description:
          "Mint X and Y from the faucet so the swap and pool tabs have usable balances.",
        complete:
          balances.tokenX > 0 ||
          balances.tokenY > 0 ||
          faucetTxids.length > 0 ||
          activityItems.some((item) => item.kind === "faucet"),
        actionLabel: faucetPending ? "Requesting..." : "Use faucet",
        action: () => handleFaucet(),
      },
      {
        id: "explore-pool",
        title: "Open the pool tab",
        description:
          "Review add/remove liquidity inputs and the LP share panel before depositing.",
        complete: onboarding.visitedTabs.includes("liquidity"),
        actionLabel: "Go to pool",
        action: () => setActiveTab("liquidity"),
      },
      {
        id: "explore-analytics",
        title: "Open analytics",
        description:
          "Inspect price, reserves, and local activity trends to understand pool behavior.",
        complete: onboarding.visitedTabs.includes("analytics"),
        actionLabel: "View analytics",
        action: () => setActiveTab("analytics"),
      },
    ],
    [
      activityItems,
      balances.tokenX,
      balances.tokenY,
      faucetPending,
      faucetTxids.length,
      handleFaucet,
      handleStacksConnect,
      onboarding.visitedTabs,
      stacksAddress,
    ],
  );
  const onboardingCompletedCount = onboardingSteps.filter(
    (step) => step.complete,
  ).length;
  const onboardingProgressPercent =
    (onboardingCompletedCount / onboardingSteps.length) * 100;

  const openOnboarding = useCallback(() => {
    setShowOnboarding(true);
    setOnboarding((prev) => ({
      ...prev,
      seenModal: true,
      dismissed: false,
    }));
  }, []);

  const closeOnboarding = useCallback((dismissed: boolean) => {
    setShowOnboarding(false);
    setOnboarding((prev) => ({
      ...prev,
      seenModal: true,
      dismissed,
    }));
  }, []);

  const handleSyncToPoolRatio = () => {
    if (pool.reserveX === 0 || pool.reserveY === 0) return;
    const ratio = pool.reserveY / pool.reserveX;
    const x = Number(liqX) || 0;
    const y = x * ratio;
    setLiqY(y.toFixed(4));
  };

  const fillLiquidityInput = (token: "x" | "y") => {
    if (token === "x") {
      setLiqX(String(Number(balances.tokenX.toFixed(4))));
      return;
    }
    setLiqY(String(Number(balances.tokenY.toFixed(4))));
  };

  const setMaxSwap = () => {
    if (swapDirection === "x-to-y") {
      setSwapInput(String(balances.tokenX || ""));
      return;
    }
    setSwapInput(String(balances.tokenY || ""));
  };

  const setSwapPreset = (percent: number) => {
    const balance =
      swapDirection === "x-to-y" ? balances.tokenX : balances.tokenY;
    if (!balance || balance <= 0) return;
    const next = balance * percent;
    setSwapInput(String(Number(next.toFixed(4))));
  };

  const clearSwapInput = () => {
    setSwapInput("");
    setImpactConfirmed(false);
    setSwapMessage(null);
    setPreflightMessage(null);
  };

  const setMaxBurn = () => {
    setBurnShares(String(balances.lpShares || "0"));
  };

  const setBurnPreset = (percent: number) => {
    if (!balances.lpShares || balances.lpShares <= 0) return;
    const next = balances.lpShares * percent;
    setBurnShares(String(Number(next.toFixed(4))));
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
    const safeOutput = isFiniteNumber(output) ? output : 0;
    const nextReserveX = fromX ? reserveX + amount : reserveX - safeOutput;
    const nextReserveY = fromX ? reserveY - safeOutput : reserveY + amount;
    const nextPrice =
      nextReserveX > 0 && nextReserveY > 0 ? nextReserveY / nextReserveX : 0;
    return {
      amount,
      fee,
      output: safeOutput,
      nextReserveX,
      nextReserveY,
      nextPrice,
    };
  }, [swapInput, swapDirection, pool.reserveX, pool.reserveY]);

  const curvePreview = useMemo(() => {
    if (
      pool.reserveX <= 0 ||
      pool.reserveY <= 0 ||
      !isFiniteNumber(pool.reserveX) ||
      !isFiniteNumber(pool.reserveY)
    ) {
      return null;
    }
    const k = pool.reserveX * pool.reserveY;
    const xMin = pool.reserveX * 0.3;
    const xMax = pool.reserveX * 1.7;
    if (
      !isFiniteNumber(k) ||
      !isFiniteNumber(xMin) ||
      !isFiniteNumber(xMax) ||
      xMax <= xMin
    ) {
      return null;
    }
    const points: { x: number; y: number }[] = [];
    const total = 26;
    for (let i = 0; i <= total; i += 1) {
      const x = xMin + ((xMax - xMin) * i) / total;
      const y = k / x;
      if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null;
      points.push({ x, y });
    }
    const yMax = k / xMin;
    const yMin = k / xMax;
    if (!isFiniteNumber(yMax) || !isFiniteNumber(yMin) || yMax === yMin) {
      return null;
    }
    const mapPoint = (x: number, y: number) => ({
      x: ((x - xMin) / (xMax - xMin)) * 100,
      y: 100 - ((y - yMin) / (yMax - yMin)) * 100,
    });
    const path = points
      .map((pt, index) => {
        const mapped = mapPoint(pt.x, pt.y);
        if (!isFiniteNumber(mapped.x) || !isFiniteNumber(mapped.y)) {
          return null;
        }
        return `${index === 0 ? "M" : "L"}${mapped.x.toFixed(2)},${mapped.y.toFixed(2)}`;
      })
      .filter((segment): segment is string => Boolean(segment))
      .join(" ");
    if (!path) return null;
    const current = mapPoint(pool.reserveX, pool.reserveY);
    if (!isFiniteNumber(current.x) || !isFiniteNumber(current.y)) {
      return null;
    }
    const simulated =
      simulator.nextReserveX > 0 && simulator.nextReserveY > 0
        ? mapPoint(simulator.nextReserveX, simulator.nextReserveY)
        : null;
    if (
      simulated &&
      (!isFiniteNumber(simulated.x) || !isFiniteNumber(simulated.y))
    ) {
      return { path, current, simulated: null };
    }
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
  const filteredActivityItems = useMemo(() => {
    if (activityFilter === "all") return activityItems;
    return activityItems.filter(
      (item) => item.kind === activityFilter || item.status === activityFilter,
    );
  }, [activityFilter, activityItems]);
  const showMinimalSwapLayout = activeTab === "swap";

  useEffect(() => {
    const entries = [
      ["swap", swapMessage],
      ["preflight", preflightMessage],
      ["frontend", frontendMessage],
      ["alert", alertMessage],
      ["approval", approvalMessage],
      ["liquidity", liqMessage],
      ["remove", burnMessage],
      ["faucet", faucetMessage],
    ] as const;

    for (const [source, message] of entries) {
      if (!message || lastToastMessages.current[source] === message) continue;
      lastToastMessages.current[source] = message;
      pushToast(message, inferToastTone(source, message));
    }
  }, [
    alertMessage,
    approvalMessage,
    burnMessage,
    faucetMessage,
    frontendMessage,
    liqMessage,
    preflightMessage,
    pushToast,
    swapMessage,
  ]);

  const handleManualRefresh = useCallback(async () => {
    setFrontendMessage(null);
    try {
      if (stacksAddress) {
        await syncBalances(stacksAddress);
      } else {
        await fetchPoolState(null);
      }
      setFrontendMessage("Pool data refreshed.");
    } catch (error) {
      setFrontendMessage(
        error instanceof Error ? error.message : "Could not refresh pool data.",
      );
    }
  }, [fetchPoolState, stacksAddress, syncBalances]);

  const handleCopySwapSnapshot = useCallback(async () => {
    const fromSymbol = swapDirection === "x-to-y" ? "X" : "Y";
    const toSymbol = swapDirection === "x-to-y" ? "Y" : "X";
    const snapshot = [
      `Route: ${fromSymbol} -> ${toSymbol}`,
      currentPrice ? `Spot price: 1 X = ${formatNumber(currentPrice)} Y` : null,
      liveSwapOutput !== null
        ? `Estimated output: ${formatNumber(liveSwapOutput)} ${toSymbol}`
        : "Estimated output: unavailable",
      `Pool depth: ${formatNumber(pool.reserveX)} X / ${formatNumber(pool.reserveY)} Y`,
      lastPoolRefreshAt
        ? `Updated: ${new Date(lastPoolRefreshAt).toLocaleTimeString()}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await navigator.clipboard.writeText(snapshot);
      setFrontendMessage("Swap snapshot copied.");
    } catch (error) {
      setFrontendMessage(
        error instanceof Error
          ? error.message
          : "Clipboard access is not available.",
      );
    }
  }, [
    currentPrice,
    lastPoolRefreshAt,
    liveSwapOutput,
    pool.reserveX,
    pool.reserveY,
    swapDirection,
  ]);

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

  const renderApprovalManager = (mode: "swap" | "liquidity") => (
    <ApprovalManager
      mode={mode}
      swapDirection={swapDirection}
      swapAmount={swapAmount}
      liqAmountX={liqAmountX}
      liqAmountY={liqAmountY}
      approvalSupport={approvalSupport}
      approveUnlimited={approveUnlimited}
      setApproveUnlimited={setApproveUnlimited}
      allowances={allowances}
      formatNumber={formatNumber}
      handleApprove={handleApprove}
      stacksAddress={stacksAddress}
      approvePending={approvePending}
      spenderContractId={spenderContractId}
    />
  );

  return (
    <div
      className={`page single ${showMinimalSwapLayout ? "simple-page" : ""}`}
    >
      <header className="nav">
        <div className="nav-inner">
          <div className="nav-cluster">
            <div className="brand">
              <img
                className="brand-mark"
                src="/favicon.png"
                alt="Clardex logo"
              />
              <div>
                <p className="eyebrow">Clardex</p>
                <h1>Trade</h1>
              </div>
            </div>
            <nav className="nav-links" aria-label="Primary">
              <button
                className={activeTab === "swap" ? "is-active" : ""}
                onClick={() => setActiveTab("swap")}
              >
                Trade
              </button>
              <button
                className={activeTab === "analytics" ? "is-active" : ""}
                onClick={() => setActiveTab("analytics")}
              >
                Analytics
              </button>
              <button
                className={activeTab === "liquidity" ? "is-active" : ""}
                onClick={() => setActiveTab("liquidity")}
              >
                Pool
              </button>
            </nav>
          </div>
          <div className="nav-search" aria-hidden="true">
            <span className="nav-search-icon">Search</span>
            <span className="nav-search-text">tokens, pools, and wallets</span>
          </div>
          <div className="nav-actions">
            {stacksAddress ? (
              <button className="wallet-pill" onClick={handleStacksDisconnect}>
                {shortAddress(stacksAddress)}
              </button>
            ) : (
              <button className="wallet-pill" onClick={handleStacksConnect}>
                Connect Stacks
              </button>
            )}
          </div>
        </div>
      </header>

      <main
        className={`content single ${showMinimalSwapLayout ? "simple-content" : ""}`}
      >
        <section
          className={`panel swap-panel ${showMinimalSwapLayout ? "simple-mode" : ""}`}
        >
          <div className="dashboard-layout">
            {!showMinimalSwapLayout && (
              <aside className="dashboard-sidebar">
                {!onboarding.dismissed && (
                  <SetupPanel
                    onboardingSteps={onboardingSteps}
                    onboardingCompletedCount={onboardingCompletedCount}
                    onboardingProgressPercent={onboardingProgressPercent}
                    activeTab={activeTab}
                    onboardingDismissed={onboarding.dismissed}
                    faucetPending={faucetPending}
                    openOnboarding={openOnboarding}
                    closeOnboarding={closeOnboarding}
                  />
                )}
                <PortfolioPanel
                  portfolioMetrics={portfolioMetrics}
                  portfolioTotals={portfolioTotals}
                  poolShare={poolShare}
                  lpPosition={lpPosition}
                  formatNumber={formatNumber}
                  formatSignedPercent={formatSignedPercent}
                />
                <ActivityPanel
                  activityFilter={activityFilter}
                  setActivityFilter={setActivityFilter}
                  activityItems={activityItems}
                  filteredActivityItems={filteredActivityItems}
                  setActivityItems={setActivityItems}
                  activityKey={activityKey}
                  resolvedStacksNetwork={RESOLVED_STACKS_NETWORK}
                />
              </aside>
            )}

            <div className="dashboard-main">
              {!showMinimalSwapLayout && (
                <div className="panel-head">
                  <div className="panel-subtitle">
                    {activeTab === "liquidity"
                      ? "Add or remove liquidity from the pool."
                      : "Inspect price movement, reserves, and local activity trends."}
                  </div>
                </div>
              )}

              {activeTab === "swap" ? (
                <SwapCard
                  showMinimalSwapLayout={showMinimalSwapLayout}
                  poolContract={poolContract}
                  FEE_BPS={FEE_BPS}
                  swapInput={swapInput}
                  setSwapInput={setSwapInput}
                  swapDirection={swapDirection}
                  setSwapDirection={setSwapDirection}
                  balances={balances}
                  formatNumber={formatNumber}
                  setSwapPreset={setSwapPreset}
                  clearSwapInput={clearSwapInput}
                  setMaxSwap={setMaxSwap}
                  quoteLoading={quoteLoading}
                  liveSwapOutput={liveSwapOutput}
                  currentPrice={currentPrice}
                  pool={pool}
                  handleManualRefresh={handleManualRefresh}
                  poolPending={poolPending}
                  handleCopySwapSnapshot={handleCopySwapSnapshot}
                  priceImpact={priceImpact}
                  slippageRatio={slippageRatio}
                  PRICE_IMPACT_WARN_PCT={PRICE_IMPACT_WARN_PCT}
                  PRICE_IMPACT_CONFIRM_PCT={PRICE_IMPACT_CONFIRM_PCT}
                  PRICE_IMPACT_BLOCK_PCT={PRICE_IMPACT_BLOCK_PCT}
                  splitSuggestionCount={splitSuggestionCount}
                  applySplitSuggestion={applySplitSuggestion}
                  impactConfirmed={impactConfirmed}
                  setImpactConfirmed={setImpactConfirmed}
                  slippageInput={slippageInput}
                  setSlippageInput={setSlippageInput}
                  deadlineMinutesInput={deadlineMinutesInput}
                  setDeadlineMinutesInput={setDeadlineMinutesInput}
                  directionalPrice={directionalPrice}
                  targetPriceEnabled={targetPriceEnabled}
                  setTargetPriceEnabled={setTargetPriceEnabled}
                  targetPairDirection={targetPairDirection}
                  setTargetPairDirection={setTargetPairDirection}
                  targetCondition={targetCondition}
                  setTargetCondition={setTargetCondition}
                  targetPriceInput={targetPriceInput}
                  setTargetPriceInput={setTargetPriceInput}
                  targetPrice={targetPrice}
                  targetTriggered={targetTriggered}
                  requestBrowserAlerts={requestBrowserAlerts}
                  browserAlertsEnabled={browserAlertsEnabled}
                  createPriceAlert={createPriceAlert}
                  clearTriggeredAlerts={clearTriggeredAlerts}
                  alertSummary={alertSummary}
                  priceAlerts={priceAlerts}
                  removePriceAlert={removePriceAlert}
                  maxSwap={maxSwap}
                  simulator={simulator}
                  curvePreview={curvePreview}
                  renderApprovalManager={renderApprovalManager}
                  handleSimpleSwap={handleSimpleSwap}
                  handleSwap={handleSwap}
                  swapPending={swapPending}
                  preflightPending={preflightPending}
                />
              ) : activeTab === "liquidity" ? (
                <Suspense fallback={<div className="note subtle">Loading pool...</div>}>
                  <LiquidityCard
                    handleSyncToPoolRatio={handleSyncToPoolRatio}
                    handleFaucet={handleFaucet}
                    faucetPending={faucetPending}
                    liqX={liqX}
                    setLiqX={setLiqX}
                    formatNumber={formatNumber}
                    balances={balances}
                    fillLiquidityInput={fillLiquidityInput}
                    liqY={liqY}
                    setLiqY={setLiqY}
                    renderApprovalManager={renderApprovalManager}
                    handleAddLiquidity={handleAddLiquidity}
                    setBurnPreset={setBurnPreset}
                    setMaxBurn={setMaxBurn}
                    burnShares={burnShares}
                    setBurnShares={setBurnShares}
                    poolShare={poolShare}
                    pool={pool}
                    handleRemoveLiquidity={handleRemoveLiquidity}
                  />
                </Suspense>
              ) : (
                <Suspense fallback={<div className="note subtle">Loading analytics...</div>}>
                  <AnalyticsPanel
                    analytics={analytics}
                    currentPrice={currentPrice}
                    formatNumber={formatNumber}
                    formatSignedPercent={formatSignedPercent}
                    formatCompactNumber={formatCompactNumber}
                  />
                </Suspense>
              )}

              {!showMinimalSwapLayout && faucetTxids.length > 0 && (
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
            </div>
          </div>
        </section>
      </main>
      {showOnboarding && (
        <OnboardingModal
          onboardingSteps={onboardingSteps}
          onboardingCompletedCount={onboardingCompletedCount}
          onboardingProgressPercent={onboardingProgressPercent}
          closeOnboarding={closeOnboarding}
          faucetPending={faucetPending}
        />
      )}
      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast-item toast-${toast.tone}`}
            role="status"
          >
            {toast.message}
          </div>
        ))}
      </div>
      <div
        className="floating-faucet is-corner"
        aria-label="Quick faucet controls"
      >
        <button
          className="chip"
          onClick={() => handleFaucet("x")}
          disabled={faucetPending}
        >
          {faucetPending ? "Loading..." : "X Faucet"}
        </button>
        <button
          className="chip"
          onClick={() => handleFaucet("y")}
          disabled={faucetPending}
        >
          {faucetPending ? "Loading..." : "Y Faucet"}
        </button>
      </div>
      {poolPending && <span className="sr-only">Loading pool data</span>}
    </div>
  );
}

export default App;
