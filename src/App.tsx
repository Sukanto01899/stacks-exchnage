import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Suspense, lazy } from "react";
import { connect, openContractCall } from "@stacks/connect";
import {
  AnchorMode,
  PostConditionMode,
  boolCV,
  contractPrincipalCV,
  fetchCallReadOnlyFunction,
  noneCV,
  someCV,
  standardPrincipalCV,
  uintCV,
} from "@stacks/transactions";
import { STACKS_MAINNET, STACKS_TESTNET, createNetwork } from "@stacks/network";
import "./App.css";
import { useActivity } from "./hooks/useActivity";
import { useAnalytics } from "./hooks/useAnalytics";
import { useBalances } from "./hooks/useBalances";
import { usePool } from "./hooks/usePool";
import { usePoolHistory } from "./hooks/usePoolHistory";
import SwapCard from "./components/SwapCard";
const LiquidityCard = lazy(() => import("./components/LiquidityCard"));
const AnalyticsPanel = lazy(() => import("./components/AnalyticsPanel"));
import PoolListPanel from "./components/PoolListPanel";
import PortfolioPanel from "./components/PortfolioPanel";
import OnboardingModal from "./components/OnboardingModal";
import ApprovalManager from "./components/ApprovalManager";
import PriceBoardPanel from "./components/PriceBoardPanel";
import MarketChartPanel from "./components/MarketChartPanel";
import TradeSimulatorPanel from "./components/TradeSimulatorPanel";
import TokenDiscoverPanel from "./components/TokenDiscoverPanel";
import AddressPill from "./components/AddressPill";
import SwapConfirmModal from "./components/SwapConfirmModal";
import WalletMenuModal from "./components/WalletMenuModal";
import CommandPaletteModal, { type CommandItem } from "./components/CommandPaletteModal";
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
  DAY_MS,
  FAUCET_AMOUNT,
  FAUCET_API,
  FAUCET_COOLDOWN_MS,
  FEE_BPS,
  IS_MAINNET,
  MINIMUM_LIQUIDITY,
  ONBOARDING_STORAGE_KEY,
  POOL_CONTRACT_IDS,
  PRESET_TOKENS,
  PRICE_IMPACT_BLOCK_PCT,
  PRICE_IMPACT_CONFIRM_PCT,
  PRICE_IMPACT_TARGET_PCT,
  PRICE_IMPACT_WARN_PCT,
  PRICE_MOVE_WARN_PCT,
  RESOLVED_STACKS_NETWORK,
  SNAPSHOT_INTERVAL_MS,
  STACKS_API,
  TOKEN_CONTRACTS,
  TOKEN_DECIMALS,
} from "./constant";
import {
  CONTRACT_ADDRESS,
  formatCompactNumber,
  formatNumber,
  formatSignedPercent,
  shortAddress,
} from "./lib/helper";
import {
  parseClarityBool,
  parseClarityNumber,
  parseOptionalPrincipal,
  parsePoolReserves,
  readClarityField,
  unwrapReadOnlyOk,
} from "./lib/clarity";
import { clamp, isFiniteNumber } from "./lib/number";
import {
  buildExplorerAddressUrl as buildExplorerAddressUrlBase,
  buildExplorerTxUrl as buildExplorerTxUrlBase,
} from "./lib/explorer";

const ACTIVE_TAB_STORAGE_KEY = `active-tab-${RESOLVED_STACKS_NETWORK}`;
const FAUCET_COOLDOWN_KEY = `faucet-cooldown-${RESOLVED_STACKS_NETWORK}`;
const STX_SWAP_FEE_BUFFER = 0.1;

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

type ActivityFilter =
  | "swap"
  | "confirmed"
  | "submitted"
  | "add-liquidity"
  | "remove-liquidity"
  | "approve"
  | "faucet"
  | "failed"
  | "cancelled"
  | "all";

type RecentPoolEntry = {
  id: string;
  target: "swap" | "liquidity";
  openedAt: number;
};

// TODO: Update this function if your contract uses a different swap formula or if you want to include fees, slippage, or price impact calculations in the quote logic
function App() {
  const [faucetTxids, setFaucetTxids] = useState<string[]>([]);

  const [activeTab, setActiveTab] = useState<AppTab>(() => {
    if (typeof window === "undefined") return "swap";
    try {
      const raw = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
      if (
        raw === "swap" ||
        raw === "prices" ||
        raw === "pools" ||
        raw === "analytics" ||
        raw === "liquidity"
      ) {
        return raw;
      }
    } catch {
      // ignore storage errors
    }
    return "swap";
  });
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
  const [lastFaucetAt, setLastFaucetAt] = useState<number | null>(null);
  const [faucetCooldownRemainingMs, setFaucetCooldownRemainingMs] = useState(0);
  const [slippageInput, setSlippageInput] = useState("0.5");
  const [highSlippageConfirmed, setHighSlippageConfirmed] = useState(false);
  const [customTokenConfirmed, setCustomTokenConfirmed] = useState(false);
  const [swapConfirmDraft, setSwapConfirmDraft] = useState<SwapDraft | null>(
    null,
  );
  const [swapConfirmRefreshing, setSwapConfirmRefreshing] = useState(false);
  const [swapConfirmAddressOverride, setSwapConfirmAddressOverride] = useState<
    string | null
  >(null);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const [activityDrawerOpen, setActivityDrawerOpen] = useState(false);
  const [activityDrawerClosing, setActivityDrawerClosing] = useState(false);
  const [activityFilter, setActivityFilter] =
    useState<ActivityFilter>("all");
  const [activitySearch, setActivitySearch] = useState("");
  const [activityLimit, setActivityLimit] = useState(10);
  const [activityNow, setActivityNow] = useState(() => Date.now());
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
  const [networkHealthChecking, setNetworkHealthChecking] = useState(false);
  const [networkHealth, setNetworkHealth] = useState<{
    ok: boolean;
    tipHeight: number | null;
    latencyMs: number | null;
    lastCheckedAt: number | null;
    error: string | null;
  }>({
    ok: false,
    tipHeight: null,
    latencyMs: null,
    lastCheckedAt: null,
    error: null,
  });
  const [unlimitedApprovalConfirmed, setUnlimitedApprovalConfirmed] =
    useState(false);
  const [approvalMessage, setApprovalMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
    } catch {
      // ignore storage errors
    }
  }, [activeTab]);

  useEffect(() => {
    setUnlimitedApprovalConfirmed(false);
  }, [approveUnlimited]);

  useEffect(() => {
    const timer = window.setInterval(() => setActivityNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

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
  const [tokenSelectHighlight, setTokenSelectHighlight] = useState(false);
  const [poolSearch, setPoolSearch] = useState("");
  const [poolSort, setPoolSort] = useState<"tvl" | "volume" | "fees" | "apr">(
    "tvl",
  );
  const [poolSortDir, setPoolSortDir] = useState<"asc" | "desc">("desc");
  const [favoritePools, setFavoritePools] = useState<string[]>([]);
  const [poolFavoritesOnly, setPoolFavoritesOnly] = useState(false);
  const [recentPools, setRecentPools] = useState<RecentPoolEntry[]>([]);
  const lastToastMessages = useRef<Record<string, string | null>>({});
  const navDrawerTimer = useRef<number | null>(null);
  const activityDrawerTimer = useRef<number | null>(null);
  const tokenSelectRef = useRef<HTMLDivElement | null>(null);
  const tokenSelectHighlightTimer = useRef<number | null>(null);
  const txToastInit = useRef(false);
  const txToastByTxid = useRef<Record<string, ActivityItem["status"]>>({});

  const buildExplorerTxUrl = useCallback((txid: string) => {
    return buildExplorerTxUrlBase(txid, RESOLVED_STACKS_NETWORK);
  }, []);

  const buildExplorerAddressUrl = useCallback((address: string) => {
    return buildExplorerAddressUrlBase(address, RESOLVED_STACKS_NETWORK);
  }, []);

  const pushToast = useCallback((
    message: string,
    tone: ToastTone,
    action?: { label: string; href: string },
  ) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [
      ...prev.slice(-4),
      {
        id,
        message,
        tone,
        actionLabel: action?.label,
        actionHref: action?.href,
      },
    ]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4200);
  }, []);

  const copyToClipboard = useCallback(
    async (label: string, value: string) => {
      try {
        await navigator.clipboard.writeText(value);
        pushToast(`${label} copied.`, "success");
      } catch (error) {
        pushToast(
          error instanceof Error ? error.message : "Clipboard not available.",
          "error",
        );
      }
    },
    [pushToast],
  );

  const downloadTextFile = useCallback(
    (filename: string, text: string, mime = "text/plain") => {
      try {
        const blob = new Blob([text], { type: `${mime};charset=utf-8` });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        pushToast(`Downloaded ${filename}.`, "success");
      } catch (error) {
        pushToast(
          error instanceof Error ? error.message : "Download failed.",
          "error",
        );
      }
    },
    [pushToast],
  );

  const formatRelativeTime = useCallback(
    (timestampMs: number) => {
      if (!Number.isFinite(timestampMs) || timestampMs <= 0) return "Unknown";
      const delta = Math.max(0, activityNow - timestampMs);
      const minute = 60_000;
      const hour = 60 * minute;
      const day = 24 * hour;

      if (delta < minute) return "<1m ago";
      if (delta < hour) return `${Math.floor(delta / minute)}m ago`;
      if (delta < day) return `${Math.floor(delta / hour)}h ago`;
      return `${Math.floor(delta / day)}d ago`;
    },
    [activityNow],
  );

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

  const poolContractStorageKey = useMemo(
    () => `active-pool-${RESOLVED_STACKS_NETWORK}`,
    [RESOLVED_STACKS_NETWORK],
  );
  const [poolContractId, setPoolContractId] = useState(() => {
    try {
      const stored = localStorage.getItem(poolContractStorageKey);
      if (stored && POOL_CONTRACT_IDS.includes(stored)) return stored;
    } catch {
      // ignore storage errors
    }
    return POOL_CONTRACT_IDS[0] ?? "";
  });

  useEffect(() => {
    try {
      if (poolContractId) {
        localStorage.setItem(poolContractStorageKey, poolContractId);
      }
    } catch {
      // ignore storage errors
    }
  }, [poolContractId, poolContractStorageKey]);

  const poolContract = useMemo(
    () => parseContractId(poolContractId),
    [poolContractId],
  );

  const defaultTokenSelection = useMemo(
    () => ({
      xId: TOKEN_CONTRACTS.x,
      yId: TOKEN_CONTRACTS.y,
      xIsStx: false,
      yIsStx: false,
    }),
    [],
  );
  const tokenSelectionKey = useMemo(
    () => `token-selection-${RESOLVED_STACKS_NETWORK}-${poolContractId || "unknown"}`,
    [RESOLVED_STACKS_NETWORK, poolContractId],
  );
  const [tokenSelection, setTokenSelection] = useState(defaultTokenSelection);
  const [tokenDraft, setTokenDraft] = useState(defaultTokenSelection);
  const [tokenSelectMessage, setTokenSelectMessage] = useState<string | null>(
    null,
  );
  const [tokenValidation, setTokenValidation] = useState<
    Record<
      TokenKey,
      { status: "idle" | "checking" | "ok" | "error"; message?: string }
    >
  >({
    x: { status: "idle" },
    y: { status: "idle" },
  });
  const [metadataByPrincipal, setMetadataByPrincipal] = useState<
    Record<
      string,
      {
        name?: string;
        symbol?: string;
        imageUri?: string;
        imageThumbnailUri?: string;
        cachedImage?: string;
        cachedThumbnailImage?: string;
        loading?: boolean;
        error?: string;
        fetchedAt?: number;
      }
    >
  >({});
  const metadataTtlMs = 24 * 60 * 60 * 1000;
  const metadataCacheKey = useMemo(
    () => `token-metadata-cache-${RESOLVED_STACKS_NETWORK}`,
    [RESOLVED_STACKS_NETWORK],
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(tokenSelectionKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<typeof defaultTokenSelection>;
      if (!parsed || typeof parsed !== "object") return;
      const next = {
        xId: typeof parsed.xId === "string" ? parsed.xId : TOKEN_CONTRACTS.x,
        yId: typeof parsed.yId === "string" ? parsed.yId : TOKEN_CONTRACTS.y,
        xIsStx: !!parsed.xIsStx,
        yIsStx: !!parsed.yIsStx,
      };
      setTokenSelection(next);
      setTokenDraft(next);
    } catch {
      // ignore storage parse errors
    }
  }, [tokenSelectionKey]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(metadataCacheKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<
        string,
        {
          name?: string;
          symbol?: string;
          imageUri?: string;
          imageThumbnailUri?: string;
          cachedImage?: string;
          cachedThumbnailImage?: string;
          fetchedAt?: number;
        }
      >;
      if (!parsed || typeof parsed !== "object") return;
      const now = Date.now();
      const fresh: typeof parsed = {};
      Object.entries(parsed).forEach(([key, value]) => {
        if (!value) return;
        if (value.fetchedAt && now - value.fetchedAt > metadataTtlMs) return;
        fresh[key] = value;
      });
      setMetadataByPrincipal((prev) => ({ ...fresh, ...prev }));
    } catch {
      // ignore storage errors
    }
  }, [metadataCacheKey, metadataTtlMs]);

  const validateSip10Token = useCallback(
    async (
      tokenId: string,
    ): Promise<{ ok: true } | { ok: false; message: string }> => {
      if (!tokenId.includes("::")) {
        return { ok: false, message: "Token must be in contract::asset format." };
      }
      const [contractId, assetName] = tokenId.split("::");
      if (!contractId || !assetName) {
        return { ok: false, message: "Invalid token identifier." };
      }
      const contract = parseContractId(contractId);
      if (!contract.address || !contract.contractName) {
        return { ok: false, message: "Invalid contract identifier." };
      }
      const response = await fetch(
        `${STACKS_API}/v2/contracts/interface/${contract.address}/${contract.contractName}`,
      ).catch(() => null);
      if (!response?.ok) {
        return { ok: false, message: "Contract interface not found." };
      }
      const data = await response.json().catch(() => ({}));
      const functions = Array.isArray(data?.functions) ? data.functions : [];
      const requiredFns = ["transfer", "get-balance", "get-total-supply"];
      const hasAll = requiredFns.every((fn) =>
        functions.some((item: { name?: string }) => item?.name === fn),
      );
      if (!hasAll) {
        return { ok: false, message: "Missing SIP-010 functions." };
      }
      const fts = Array.isArray(data?.fungible_tokens)
        ? data.fungible_tokens
        : [];
      if (fts.length > 0) {
        const matches = fts.some((token: Record<string, unknown>) => {
          const name = token?.name;
          const symbol = token?.symbol;
          const tokenField = token?.token;
          const assetId = token?.asset_identifier;
          if (typeof name === "string" && name === assetName) return true;
          if (typeof symbol === "string" && symbol === assetName) return true;
          if (typeof tokenField === "string" && tokenField === assetName)
            return true;
          if (
            typeof assetId === "string" &&
            assetId.endsWith(`::${assetName}`)
          )
            return true;
          return false;
        });
        if (!matches) {
          return { ok: false, message: "Asset not found in contract." };
        }
      }
      return { ok: true };
    },
    [STACKS_API],
  );

  const tokenDiscoverSeeds = useMemo(() => {
    const seeds: Array<{ id: string; label: string; verified: boolean }> = [
      ...PRESET_TOKENS.map((token) => ({
        id: token.id,
        label: token.label,
        verified: true,
      })),
    ];

    if (!tokenDraft.xIsStx && tokenDraft.xId) {
      seeds.push({
        id: tokenDraft.xId,
        label: "Current Token X",
        verified: tokenValidation.x.status === "ok",
      });
    }
    if (!tokenDraft.yIsStx && tokenDraft.yId) {
      seeds.push({
        id: tokenDraft.yId,
        label: "Current Token Y",
        verified: tokenValidation.y.status === "ok",
      });
    }
    if (!tokenSelection.xIsStx && tokenSelection.xId) {
      seeds.push({
        id: tokenSelection.xId,
        label: "Applied Token X",
        verified: true,
      });
    }
    if (!tokenSelection.yIsStx && tokenSelection.yId) {
      seeds.push({
        id: tokenSelection.yId,
        label: "Applied Token Y",
        verified: true,
      });
    }

    return seeds;
  }, [
    tokenDraft.xId,
    tokenDraft.xIsStx,
    tokenDraft.yId,
    tokenDraft.yIsStx,
    tokenSelection.xId,
    tokenSelection.xIsStx,
    tokenSelection.yId,
    tokenSelection.yIsStx,
    tokenValidation.x.status,
    tokenValidation.y.status,
  ]);

  const pickDiscoverToken = useCallback(
    (side: "x" | "y", token: { id: string; isStx: boolean }) => {
      setTokenDraft((prev) => {
        if (side === "x") {
          return {
            ...prev,
            xIsStx: token.isStx,
            xId: token.isStx ? prev.xId : token.id,
          };
        }
        return {
          ...prev,
          yIsStx: token.isStx,
          yId: token.isStx ? prev.yId : token.id,
        };
      });
      setTokenValidation((prev) => ({
        ...prev,
        [side]: { status: "idle" },
      }));
    },
    [],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!tokenDraft.xIsStx && tokenDraft.xId) {
        setTokenValidation((prev) => ({ ...prev, x: { status: "checking" } }));
        void validateSip10Token(tokenDraft.xId).then((result) => {
          setTokenValidation((prev) => ({
            ...prev,
            x: result.ok
              ? { status: "ok" }
              : { status: "error", message: result.message ?? "Invalid token." },
          }));
        });
      }
      if (!tokenDraft.yIsStx && tokenDraft.yId) {
        setTokenValidation((prev) => ({ ...prev, y: { status: "checking" } }));
        void validateSip10Token(tokenDraft.yId).then((result) => {
          setTokenValidation((prev) => ({
            ...prev,
            y: result.ok
              ? { status: "ok" }
              : { status: "error", message: result.message ?? "Invalid token." },
          }));
        });
      }
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [tokenDraft, validateSip10Token]);

  const applyTokenSelection = async () => {
    if (tokenDraft.xIsStx && tokenDraft.yIsStx) {
      setTokenSelectMessage("Both sides cannot be STX. Choose one side only.");
      return;
    }
    if (!tokenDraft.xIsStx && !tokenDraft.xId.includes("::")) {
      setTokenSelectMessage("Token X must be in `contract::asset` format.");
      return;
    }
    if (!tokenDraft.yIsStx && !tokenDraft.yId.includes("::")) {
      setTokenSelectMessage("Token Y must be in `contract::asset` format.");
      return;
    }
    setTokenSelectMessage(null);
    setTokenValidation((prev) => ({
      ...prev,
      x: { status: tokenDraft.xIsStx ? "ok" : "checking" },
      y: { status: tokenDraft.yIsStx ? "ok" : "checking" },
    }));

    const [xResult, yResult] = await Promise.all([
      tokenDraft.xIsStx
        ? Promise.resolve({ ok: true } as const)
        : validateSip10Token(tokenDraft.xId),
      tokenDraft.yIsStx
        ? Promise.resolve({ ok: true } as const)
        : validateSip10Token(tokenDraft.yId),
    ]);

    setTokenValidation({
      x: xResult.ok
        ? { status: "ok" }
        : { status: "error", message: xResult.message ?? "Invalid token." },
      y: yResult.ok
        ? { status: "ok" }
        : { status: "error", message: yResult.message ?? "Invalid token." },
    });

    if (!xResult.ok || !yResult.ok) {
      setTokenSelectMessage("Fix token validation errors before applying.");
      return;
    }

    setTokenSelection(tokenDraft);
    setTokenSelectMessage("Token selection updated.");
    try {
      localStorage.setItem(tokenSelectionKey, JSON.stringify(tokenDraft));
    } catch {
      // ignore storage errors
    }
    if (stacksAddress) {
      void syncBalances(stacksAddress, { silent: true });
    } else {
      void fetchPoolState(null);
    }
  };

  const metadataApiBase = useMemo(
    () =>
      RESOLVED_STACKS_NETWORK === "mainnet"
        ? "https://api.hiro.so"
        : "https://api.testnet.hiro.so",
    [RESOLVED_STACKS_NETWORK],
  );

  const getTokenPrincipal = useCallback((id: string) => {
    if (!id) return "";
    return id.split("::")[0] || "";
  }, []);

  useEffect(() => {
    return () => {
      if (navDrawerTimer.current) {
        window.clearTimeout(navDrawerTimer.current);
      }
      if (activityDrawerTimer.current) {
        window.clearTimeout(activityDrawerTimer.current);
      }
      if (tokenSelectHighlightTimer.current) {
        window.clearTimeout(tokenSelectHighlightTimer.current);
      }
    };
  }, []);

  const openNavDrawer = useCallback(() => {
    if (navDrawerTimer.current) {
      window.clearTimeout(navDrawerTimer.current);
      navDrawerTimer.current = null;
    }
    setDrawerClosing(false);
    setDrawerOpen(true);
  }, []);

  const closeNavDrawer = useCallback(() => {
    if (!drawerOpen || drawerClosing) return;
    setDrawerClosing(true);
    navDrawerTimer.current = window.setTimeout(() => {
      setDrawerOpen(false);
      setDrawerClosing(false);
      navDrawerTimer.current = null;
    }, 220);
  }, [drawerClosing, drawerOpen]);

  const openActivityDrawer = useCallback(() => {
    if (activityDrawerTimer.current) {
      window.clearTimeout(activityDrawerTimer.current);
      activityDrawerTimer.current = null;
    }
    setActivityDrawerClosing(false);
    setActivityDrawerOpen(true);
  }, []);

  const closeActivityDrawer = useCallback(() => {
    if (!activityDrawerOpen || activityDrawerClosing) return;
    setActivityDrawerClosing(true);
    activityDrawerTimer.current = window.setTimeout(() => {
      setActivityDrawerOpen(false);
      setActivityDrawerClosing(false);
      activityDrawerTimer.current = null;
    }, 220);
  }, [activityDrawerClosing, activityDrawerOpen]);

  const handleOpenTokenSelector = useCallback(() => {
    if (activeTab !== "swap") {
      setActiveTab("swap");
    }
    window.setTimeout(() => {
      tokenSelectRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      setTokenSelectHighlight(true);
      if (tokenSelectHighlightTimer.current) {
        window.clearTimeout(tokenSelectHighlightTimer.current);
      }
      tokenSelectHighlightTimer.current = window.setTimeout(() => {
        setTokenSelectHighlight(false);
        tokenSelectHighlightTimer.current = null;
      }, 3000);
    }, 0);
  }, [activeTab]);

  const getTokenIcon = useCallback(
    (principal: string | null) => {
      if (!principal) return null;
      const meta = metadataByPrincipal[principal];
      return (
        meta?.imageThumbnailUri ||
        meta?.imageUri ||
        meta?.cachedThumbnailImage ||
        meta?.cachedImage ||
        null
      );
    },
    [metadataByPrincipal],
  );

  const fetchTokenMetadata = useCallback(
    async (principal: string) => {
      if (!principal) return;
      setMetadataByPrincipal((prev) => ({
        ...prev,
        [principal]: { ...prev[principal], loading: true, error: undefined },
      }));
      try {
        const response = await fetch(
          `${metadataApiBase}/metadata/v1/ft/${principal}`,
        );
        if (!response.ok) {
          throw new Error(`Metadata not found (${response.status})`);
        }
      const data = (await response.json().catch(() => ({}))) as {
        name?: string;
        symbol?: string;
        image_uri?: string;
        image_thumbnail_uri?: string;
        metadata?: {
          cached_image?: string;
          cached_thumbnail_image?: string;
        };
      };
      setMetadataByPrincipal((prev) => ({
        ...prev,
        [principal]: {
          name: data?.name,
          symbol: data?.symbol,
          imageUri: data?.image_uri,
          imageThumbnailUri: data?.image_thumbnail_uri,
          cachedImage: data?.metadata?.cached_image,
          cachedThumbnailImage: data?.metadata?.cached_thumbnail_image,
          loading: false,
          error: undefined,
          fetchedAt: Date.now(),
        },
      }));
      } catch (error) {
        setMetadataByPrincipal((prev) => ({
          ...prev,
          [principal]: {
            ...prev[principal],
            loading: false,
            error:
              error instanceof Error ? error.message : "Metadata fetch failed",
          },
        }));
      }
    },
    [metadataApiBase],
  );

  useEffect(() => {
    try {
      const cache: Record<
        string,
        {
          name?: string;
          symbol?: string;
          imageUri?: string;
          imageThumbnailUri?: string;
          cachedImage?: string;
          cachedThumbnailImage?: string;
          fetchedAt?: number;
        }
      > = {};
      Object.entries(metadataByPrincipal).forEach(([key, value]) => {
        if (
          value?.symbol ||
          value?.name ||
          value?.imageUri ||
          value?.imageThumbnailUri ||
          value?.cachedImage ||
          value?.cachedThumbnailImage
        ) {
          cache[key] = {
            name: value.name,
            symbol: value.symbol,
            imageUri: value.imageUri,
            imageThumbnailUri: value.imageThumbnailUri,
            cachedImage: value.cachedImage,
            cachedThumbnailImage: value.cachedThumbnailImage,
            fetchedAt: value.fetchedAt,
          };
        }
      });
      localStorage.setItem(metadataCacheKey, JSON.stringify(cache));
    } catch {
      // ignore storage errors
    }
  }, [metadataByPrincipal, metadataCacheKey]);

  useEffect(() => {
    const principals = [
      tokenDraft.xIsStx ? "" : getTokenPrincipal(tokenDraft.xId),
      tokenDraft.yIsStx ? "" : getTokenPrincipal(tokenDraft.yId),
    ].filter(Boolean);
    if (principals.length === 0) return;
    const timeout = window.setTimeout(() => {
      principals.forEach((principal) => {
        const cached = metadataByPrincipal[principal];
        const isStale =
          cached?.fetchedAt &&
          Date.now() - cached.fetchedAt > metadataTtlMs;
        if (!cached || isStale) {
          void fetchTokenMetadata(principal);
        }
      });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [
    fetchTokenMetadata,
    getTokenPrincipal,
    metadataByPrincipal,
    metadataTtlMs,
    tokenDraft,
  ]);

  const tokenContracts = useMemo(
    () => ({
      x: tokenSelection.xIsStx ? null : parseContractId(tokenSelection.xId),
      y: tokenSelection.yIsStx ? null : parseContractId(tokenSelection.yId),
    }),
    [tokenSelection],
  );
  const tokenIds = useMemo(
    () => ({
      x: tokenSelection.xIsStx ? null : parseTokenAssetId(tokenSelection.xId),
      y: tokenSelection.yIsStx ? null : parseTokenAssetId(tokenSelection.yId),
    }),
    [tokenSelection],
  );
  const tokenIsStx = useMemo(
    () => ({
      x: tokenSelection.xIsStx,
      y: tokenSelection.yIsStx,
    }),
    [tokenSelection],
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
    () =>
      `activity-${RESOLVED_STACKS_NETWORK}-${stacksAddress || "guest"}-${poolContractId || "unknown"}`,
    [poolContractId, stacksAddress],
  );
  const activityUiKey = useMemo(
    () =>
      `activity-ui-${RESOLVED_STACKS_NETWORK}-${stacksAddress || "guest"}-${poolContractId || "unknown"}`,
    [poolContractId, stacksAddress],
  );
  const priceAlertsKey = useMemo(
    () =>
      `price-alerts-${RESOLVED_STACKS_NETWORK}-${stacksAddress || "guest"}-${poolContractId || "unknown"}`,
    [poolContractId, stacksAddress],
  );
  const favoritePoolsKey = useMemo(
    () =>
      `pool-favorites-${RESOLVED_STACKS_NETWORK}-${stacksAddress || "guest"}`,
    [stacksAddress],
  );
  const favoritePoolsOnlyKey = useMemo(
    () =>
      `pool-favorites-only-${RESOLVED_STACKS_NETWORK}-${stacksAddress || "guest"}`,
    [stacksAddress],
  );
  const recentPoolsKey = useMemo(
    () => `pool-recent-${RESOLVED_STACKS_NETWORK}-${stacksAddress || "guest"}`,
    [stacksAddress],
  );
  const { pool, tokenInfo, poolPending, lastPoolRefreshAt, fetchPoolState } = usePool({
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
    tokenContracts: {
      x: tokenSelection.xIsStx ? null : tokenSelection.xId,
      y: tokenSelection.yIsStx ? null : tokenSelection.yId,
    },
    tokenIsStx,
    tokenDecimals: TOKEN_DECIMALS,
    fetchPoolState,
  });
  const { activityItems, pushActivity, setActivityItems } = useActivity({
    activityKey,
    stacksApi: STACKS_API,
    stacksAddress,
    syncBalances,
    fetchPoolState,
    explainPoolError,
  });
  const pendingTxs = useMemo(
    () => activityItems.filter((item) => item.status === "submitted"),
    [activityItems],
  );
  const pendingTxSummary = useMemo(
    () =>
      pendingTxs.map((item) => ({
        ...item,
        trackerLabel:
          item.chainStatus
            ?.replace(/\b\w/g, (char) => char.toUpperCase())
            .replace(" By ", " by ") || "Awaiting confirmation",
      })),
    [pendingTxs],
  );
  const filteredActivityItems = useMemo(() => {
    if (activityFilter === "all") return activityItems;
    if (
      activityFilter === "confirmed" ||
      activityFilter === "submitted" ||
      activityFilter === "failed" ||
      activityFilter === "cancelled"
    ) {
      return activityItems.filter((item) => item.status === activityFilter);
    }
    return activityItems.filter((item) => item.kind === activityFilter);
  }, [activityFilter, activityItems]);
  const activityDrawerItems = useMemo(() => {
    const q = activitySearch.trim().toLowerCase();
    if (!q) return filteredActivityItems;
    return filteredActivityItems.filter((item) => {
      const hay = `${item.kind} ${item.status} ${item.message} ${item.detail || ""} ${item.txid || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [activitySearch, filteredActivityItems]);

  const activityCsv = useMemo(() => {
    const esc = (value: unknown) => {
      const raw = value === null || value === undefined ? "" : String(value);
      const needsQuotes = /[",\n\r]/.test(raw);
      const cleaned = raw.replaceAll('"', '""');
      return needsQuotes ? `"${cleaned}"` : cleaned;
    };
    const header = ["ts", "kind", "status", "message", "detail", "txid"].join(",");
    const rows = activityDrawerItems.map((item) =>
      [
        esc(new Date(item.ts).toISOString()),
        esc(item.kind),
        esc(item.status),
        esc(item.message),
        esc(item.detail || ""),
        esc(item.txid || ""),
      ].join(","),
    );
    return [header, ...rows].join("\n");
  }, [activityDrawerItems]);

  useEffect(() => {
    setActivityLimit(10);
  }, [activityFilter, activitySearch]);
  const recentSwaps = useMemo(
    () => activityItems.filter((item) => item.kind === "swap"),
    [activityItems],
  );
  const poolShare = useMemo(() => {
    if (pool.totalShares === 0) return 0;
    return balances.lpShares / pool.totalShares;
  }, [balances.lpShares, pool.totalShares]);

  const poolTokenLabels = useMemo(() => {
    const fallback = { x: "Token X", y: "Token Y" };
    if (!tokenInfo) return fallback;
    const format = (isStx: boolean, principal: string | null, fallbackLabel: string) => {
      if (isStx) return "STX";
      if (principal) return shortAddress(principal);
      return fallbackLabel;
    };
    return {
      x: format(tokenInfo.tokenXIsStx, tokenInfo.tokenX, "Token X"),
      y: format(tokenInfo.tokenYIsStx, tokenInfo.tokenY, "Token Y"),
    };
  }, [tokenInfo]);

  const selectionLabels = useMemo(() => {
    const format = (isStx: boolean, id: string, fallback: string) => {
      if (isStx) return "STX";
      const contractId = id.split("::")[0] || "";
      const meta = contractId ? metadataByPrincipal[contractId] : undefined;
      if (meta?.symbol) return meta.symbol;
      return contractId ? shortAddress(contractId) : fallback;
    };
    return {
      x: format(tokenSelection.xIsStx, tokenSelection.xId, "Token X"),
      y: format(tokenSelection.yIsStx, tokenSelection.yId, "Token Y"),
    };
  }, [metadataByPrincipal, tokenSelection]);

  const selectionIcons = useMemo(
    () => ({
      x: tokenSelection.xIsStx
        ? null
        : getTokenIcon(getTokenPrincipal(tokenSelection.xId)),
      y: tokenSelection.yIsStx
        ? null
        : getTokenIcon(getTokenPrincipal(tokenSelection.yId)),
    }),
    [getTokenIcon, getTokenPrincipal, tokenSelection],
  );

  const poolTokenIcons = useMemo(
    () => ({
      x: tokenInfo?.tokenXIsStx ? null : getTokenIcon(tokenInfo?.tokenX || null),
      y: tokenInfo?.tokenYIsStx ? null : getTokenIcon(tokenInfo?.tokenY || null),
    }),
    [getTokenIcon, tokenInfo],
  );

  const resolveTokenLabel = useCallback(
    (id: string, isStx: boolean, fallback: string) => {
      if (isStx) return "STX";
      const principal = id.split("::")[0] || "";
      const meta = principal ? metadataByPrincipal[principal] : undefined;
      if (meta?.symbol) return meta.symbol;
      return principal ? shortAddress(principal) : fallback;
    },
    [metadataByPrincipal],
  );

  const [ftAssetIdByPrincipal, setFtAssetIdByPrincipal] = useState<
    Record<string, string>
  >({});
  const resolveFtAssetId = useCallback(
    async (principal: string) => {
      if (!principal) return null;
      const cached = ftAssetIdByPrincipal[principal];
      if (cached) return cached;
      const contract = parseContractId(principal);
      if (!contract.address || !contract.contractName) return null;
      const response = await fetch(
        `${STACKS_API}/v2/contracts/interface/${contract.address}/${contract.contractName}`,
      ).catch(() => null);
      if (!response?.ok) return null;
      const data = await response.json().catch(() => ({}));
      const fts = Array.isArray(data?.fungible_tokens) ? data.fungible_tokens : [];
      if (fts.length === 0) return null;
      const first = fts[0] as Record<string, unknown>;
      const assetIdentifierRaw = first?.asset_identifier;
      const nameRaw = first?.name ?? first?.token;
      const inferred =
        typeof assetIdentifierRaw === "string"
          ? assetIdentifierRaw
          : typeof nameRaw === "string"
            ? `${principal}::${nameRaw}`
            : null;
      if (!inferred) return null;
      setFtAssetIdByPrincipal((prev) => ({ ...prev, [principal]: inferred }));
      return inferred;
    },
    [STACKS_API, ftAssetIdByPrincipal],
  );

  const buildTokenId = useCallback(
    (principal: string | null, isStx: boolean) => {
      if (isStx) return "STX";
      if (!principal) return "";
      return ftAssetIdByPrincipal[principal] ?? `${principal}::token`;
    },
    [ftAssetIdByPrincipal],
  );

  const [poolsDirectoryPending, setPoolsDirectoryPending] = useState(false);
  const [poolsDirectory, setPoolsDirectory] = useState<
    Array<{
      id: string;
      label: string;
      tokenXPrincipal: string | null;
      tokenYPrincipal: string | null;
      tokenXIsStx: boolean;
      tokenYIsStx: boolean;
      tvl: number;
      volume24h: number;
      fees24h: number;
      apr: number | null;
    }>
  >([]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setPoolsDirectoryPending(true);
      try {
        const senderAddress = stacksAddress || CONTRACT_ADDRESS;
        const results = await Promise.all(
          POOL_CONTRACT_IDS.map(async (id) => {
            const contract = parseContractId(id);
            if (!contract.address || !contract.contractName) {
              return null;
            }
            try {
              const [reservesRaw, tokenInfoRaw] = await Promise.all([
                fetchCallReadOnlyFunction({
                  contractAddress: contract.address,
                  contractName: contract.contractName,
                  functionName: "get-reserves",
                  functionArgs: [],
                  senderAddress,
                  network,
                }),
                fetchCallReadOnlyFunction({
                  contractAddress: contract.address,
                  contractName: contract.contractName,
                  functionName: "get-token-info",
                  functionArgs: [],
                  senderAddress,
                  network,
                }),
              ]);

              const reservesValue = unwrapReadOnlyOk(reservesRaw);
              const tokenInfoValue = unwrapReadOnlyOk(tokenInfoRaw);
              const tokenXPrincipal = parseOptionalPrincipal(
                readClarityField(tokenInfoValue, "token-x"),
              );
              const tokenYPrincipal = parseOptionalPrincipal(
                readClarityField(tokenInfoValue, "token-y"),
              );
              const tokenXIsStx = parseClarityBool(
                readClarityField(tokenInfoValue, "token-x-is-stx"),
              );
              const tokenYIsStx = parseClarityBool(
                readClarityField(tokenInfoValue, "token-y-is-stx"),
              );
              const parsedReserves = parsePoolReserves(
                reservesValue,
                TOKEN_DECIMALS,
              );
              const tvl = parsedReserves.reserveX + parsedReserves.reserveY;

              return {
                id,
                label: contract.contractName,
                tokenXPrincipal,
                tokenYPrincipal,
                tokenXIsStx,
                tokenYIsStx,
                tvl,
                volume24h: 0,
                fees24h: 0,
                apr: null,
              };
            } catch (error) {
              console.warn("Pool directory fetch failed", id, error);
              return null;
            }
          }),
        );

        const next = results.filter(Boolean) as NonNullable<(typeof results)[number]>[];
        if (cancelled) return;
        setPoolsDirectory(next);
      } finally {
        if (!cancelled) setPoolsDirectoryPending(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [network, stacksAddress]);

  useEffect(() => {
    const principals = new Set<string>();
    poolsDirectory.forEach((pool) => {
      if (!pool.tokenXIsStx && pool.tokenXPrincipal) {
        principals.add(pool.tokenXPrincipal);
      }
      if (!pool.tokenYIsStx && pool.tokenYPrincipal) {
        principals.add(pool.tokenYPrincipal);
      }
    });

    principals.forEach((principal) => {
      const cached = metadataByPrincipal[principal];
      if (cached?.loading) return;
      if (cached?.symbol || cached?.name || cached?.imageUri || cached?.imageThumbnailUri) {
        return;
      }
      void fetchTokenMetadata(principal);
    });
  }, [fetchTokenMetadata, metadataByPrincipal, poolsDirectory]);

  const poolList = useMemo(() => {
    const normalizedSearch = poolSearch.trim().toLowerCase();
    const favoritesSet = new Set(favoritePools);
    const filtered = poolsDirectory
      .map((pool) => {
        const tokenXId = buildTokenId(pool.tokenXPrincipal, pool.tokenXIsStx);
        const tokenYId = buildTokenId(pool.tokenYPrincipal, pool.tokenYIsStx);
        const tokenXLabel = resolveTokenLabel(tokenXId, pool.tokenXIsStx, "Token X");
        const tokenYLabel = resolveTokenLabel(tokenYId, pool.tokenYIsStx, "Token Y");
        return { ...pool, tokenXId, tokenYId, tokenXLabel, tokenYLabel };
      })
      .filter((pool) => {
        if (!normalizedSearch) return true;
        const haystack = [
          pool.label,
          pool.tokenXLabel,
          pool.tokenYLabel,
          pool.tokenXId,
          pool.tokenYId,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedSearch);
      })
      .filter((pool) => {
        if (!poolFavoritesOnly) return true;
        return favoritesSet.has(pool.id);
      });

    const sorted = [...filtered].sort((a, b) => {
      const favA = favoritesSet.has(a.id);
      const favB = favoritesSet.has(b.id);
      if (favA !== favB) return favA ? -1 : 1;
      const dir = poolSortDir === "asc" ? 1 : -1;
      const pick = (value: number | null) =>
        typeof value === "number" && Number.isFinite(value) ? value : -1;
      if (poolSort === "tvl") return (a.tvl - b.tvl) * dir;
      if (poolSort === "volume") return (a.volume24h - b.volume24h) * dir;
      if (poolSort === "fees") return (a.fees24h - b.fees24h) * dir;
      return (pick(a.apr) - pick(b.apr)) * dir;
    });

    return sorted;
  }, [
    favoritePools,
    poolsDirectory,
    poolSearch,
    poolSort,
    poolSortDir,
    buildTokenId,
    resolveTokenLabel,
    poolFavoritesOnly,
  ]);

  const marketsByPool = useMemo(
    () =>
      poolsDirectory.map((pool) => {
        const tokenXId = buildTokenId(pool.tokenXPrincipal, pool.tokenXIsStx);
        const tokenYId = buildTokenId(pool.tokenYPrincipal, pool.tokenYIsStx);
        return {
          id: pool.id,
          label: pool.label,
          tokenXLabel: resolveTokenLabel(tokenXId, pool.tokenXIsStx, "Token X"),
          tokenYLabel: resolveTokenLabel(tokenYId, pool.tokenYIsStx, "Token Y"),
          tvl: pool.tvl,
          volume24h: pool.volume24h,
        };
      }),
    [buildTokenId, poolsDirectory, resolveTokenLabel],
  );

  const priceBoardMarkets = useMemo(
    () => marketsByPool,
    [marketsByPool],
  );

  const marketChartMarkets = useMemo(
    () =>
      marketsByPool.map((market) => ({
        id: market.id,
        label: market.label,
        tokenXLabel: market.tokenXLabel,
        tokenYLabel: market.tokenYLabel,
      })),
    [marketsByPool],
  );

  const poolSelectorOptions = useMemo(() => {
    if (POOL_CONTRACT_IDS.length <= 1) return [];
    const byId = new Map(poolsDirectory.map((pool) => [pool.id, pool]));
    return POOL_CONTRACT_IDS.map((id) => {
      const entry = byId.get(id);
      if (!entry) {
        return { id, label: id };
      }
      const tokenXId = buildTokenId(entry.tokenXPrincipal, entry.tokenXIsStx);
      const tokenYId = buildTokenId(entry.tokenYPrincipal, entry.tokenYIsStx);
      const tokenXLabel = resolveTokenLabel(tokenXId, entry.tokenXIsStx, "Token X");
      const tokenYLabel = resolveTokenLabel(tokenYId, entry.tokenYIsStx, "Token Y");
      return { id, label: `${tokenXLabel} / ${tokenYLabel} · ${entry.label}` };
    });
  }, [buildTokenId, poolsDirectory, resolveTokenLabel]);

  const recentPoolsForPanel = useMemo(() => {
    if (recentPools.length === 0) return [];
    const byId = new Map(poolsDirectory.map((pool) => [pool.id, pool]));
    return recentPools
      .map((entry) => {
        const pool = byId.get(entry.id);
        if (!pool) return null;
        const tokenXId = buildTokenId(pool.tokenXPrincipal, pool.tokenXIsStx);
        const tokenYId = buildTokenId(pool.tokenYPrincipal, pool.tokenYIsStx);
        return {
          id: pool.id,
          label: pool.label,
          tokenXLabel: resolveTokenLabel(tokenXId, pool.tokenXIsStx, "Token X"),
          tokenYLabel: resolveTokenLabel(tokenYId, pool.tokenYIsStx, "Token Y"),
          target: entry.target,
        };
      })
      .filter(Boolean) as {
      id: string;
      label: string;
      tokenXLabel: string;
      tokenYLabel: string;
      target: "swap" | "liquidity";
    }[];
  }, [buildTokenId, poolsDirectory, recentPools, resolveTokenLabel]);

  const priceBoardStorageKey = useMemo(
    () => `price-board-watchlist-${RESOLVED_STACKS_NETWORK}`,
    [RESOLVED_STACKS_NETWORK],
  );

  const tokenMismatchWarning = useMemo(() => {
    if (!tokenInfo) return null;
    const poolInitialized =
      pool.totalShares > 0 || pool.reserveX > 0 || pool.reserveY > 0;
    if (!poolInitialized) return null;

    const selectedXPrincipal = tokenIsStx.x
      ? null
      : tokenSelection.xId.split("::")[0] || null;
    const selectedYPrincipal = tokenIsStx.y
      ? null
      : tokenSelection.yId.split("::")[0] || null;

    const xMismatch =
      tokenInfo.tokenXIsStx !== tokenIsStx.x ||
      (!tokenIsStx.x && tokenInfo.tokenX !== selectedXPrincipal);
    const yMismatch =
      tokenInfo.tokenYIsStx !== tokenIsStx.y ||
      (!tokenIsStx.y && tokenInfo.tokenY !== selectedYPrincipal);

    if (!xMismatch && !yMismatch) return null;
    return {
      pool: `${poolTokenLabels.x} / ${poolTokenLabels.y}`,
      selected: `${selectionLabels.x} / ${selectionLabels.y}`,
    };
  }, [
    pool.reserveX,
    pool.reserveY,
    pool.totalShares,
    poolTokenLabels.x,
    poolTokenLabels.y,
    selectionLabels.x,
    selectionLabels.y,
    tokenInfo,
    tokenIsStx.x,
    tokenIsStx.y,
    tokenSelection.xId,
    tokenSelection.yId,
  ]);

  useEffect(() => {
    if (!tokenInfo) return;
    const poolInitialized =
      pool.totalShares > 0 || pool.reserveX > 0 || pool.reserveY > 0;
    if (!poolInitialized) return;

    let cancelled = false;
    const run = async () => {
      const xId = tokenInfo.tokenXIsStx
        ? "STX"
        : tokenInfo.tokenX
          ? (await resolveFtAssetId(tokenInfo.tokenX))
          : null;
      const yId = tokenInfo.tokenYIsStx
        ? "STX"
        : tokenInfo.tokenY
          ? (await resolveFtAssetId(tokenInfo.tokenY))
          : null;
      if (cancelled) return;
      if (!xId || !yId) return;
      const next = {
        xId,
        yId,
        xIsStx: tokenInfo.tokenXIsStx,
        yIsStx: tokenInfo.tokenYIsStx,
      };

      const already =
        tokenSelection.xId === next.xId &&
        tokenSelection.yId === next.yId &&
        tokenSelection.xIsStx === next.xIsStx &&
        tokenSelection.yIsStx === next.yIsStx;
      if (already) return;

      setTokenSelection(next);
      setTokenDraft(next);
      setTokenValidation({ x: { status: "idle" }, y: { status: "idle" } });
      setTokenSelectMessage("Loaded tokens for selected pool.");
      try {
        localStorage.setItem(tokenSelectionKey, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }

      if (stacksAddress) {
        void syncBalances(stacksAddress, { silent: true });
      } else {
        void fetchPoolState(null);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    fetchPoolState,
    pool.reserveX,
    pool.reserveY,
    pool.totalShares,
    resolveFtAssetId,
    stacksAddress,
    syncBalances,
    tokenInfo,
    tokenSelection.xId,
    tokenSelection.xIsStx,
    tokenSelection.yId,
    tokenSelection.yIsStx,
    tokenSelectionKey,
  ]);

  const toOptionalTokenCv = useCallback(
    (token: TokenKey) => {
      if (tokenIsStx[token]) return noneCV();
      const t = tokenContracts[token];
      if (!t?.address || !t?.contractName) {
        throw new Error("Token contract is missing or invalid.");
      }
      return someCV(contractPrincipalCV(t.address, t.contractName));
    },
    [tokenContracts, tokenIsStx],
  );

  const validateTokenConfig = useCallback(() => {
    if (!tokenIsStx.x && (!tokenContracts.x?.address || !tokenContracts.x?.contractName)) {
      return "Token X contract is missing or invalid.";
    }
    if (!tokenIsStx.y && (!tokenContracts.y?.address || !tokenContracts.y?.contractName)) {
      return "Token Y contract is missing or invalid.";
    }
    if (tokenIsStx.x && tokenIsStx.y) {
      return "Both sides cannot be STX. Choose one side only.";
    }
    if (tokenMismatchWarning) {
      return "Selected tokens do not match the initialized pool.";
    }
    return null;
  }, [tokenContracts, tokenIsStx, tokenMismatchWarning]);

  const currentPrice = useMemo(() => {
    if (pool.reserveX === 0 || pool.reserveY === 0) return 0;
    return pool.reserveY / pool.reserveX;
  }, [pool.reserveX, pool.reserveY]);

  const poolHistoryKey = useMemo(
    () =>
      `pool-history-${RESOLVED_STACKS_NETWORK}-${poolContractId || "unknown"}`,
    [RESOLVED_STACKS_NETWORK, poolContractId],
  );
  const { poolHistory, clearPoolHistory } = usePoolHistory({
    poolHistoryKey,
    pool,
    currentPrice,
    snapshotIntervalMs: SNAPSHOT_INTERVAL_MS,
    retentionMs: DAY_MS * 90,
  });

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

  const liquidityPreview = useMemo(() => {
    const amountX = Number(liqX);
    const amountY = Number(liqY);
    if (!Number.isFinite(amountX) || !Number.isFinite(amountY)) return null;
    if (amountX <= 0 || amountY <= 0) return null;
    const amountXMicro = Math.floor(amountX * TOKEN_DECIMALS);
    const amountYMicro = Math.floor(amountY * TOKEN_DECIMALS);
    if (amountXMicro <= 0 || amountYMicro <= 0) return null;

    if (pool.totalShares === 0 || pool.reserveX === 0 || pool.reserveY === 0) {
      const shares = Math.floor(
        Number(bigintSqrt(BigInt(amountXMicro) * BigInt(amountYMicro))),
      );
      return {
        shares,
        actualX: amountX,
        actualY: amountY,
        initializing: true,
      };
    }

    const reserveXMicro = Math.floor(pool.reserveX * TOKEN_DECIMALS);
    const reserveYMicro = Math.floor(pool.reserveY * TOKEN_DECIMALS);
    if (reserveXMicro <= 0 || reserveYMicro <= 0) return null;
    const sharesFromX = Math.floor(
      (amountXMicro * pool.totalShares) / reserveXMicro,
    );
    const sharesFromY = Math.floor(
      (amountYMicro * pool.totalShares) / reserveYMicro,
    );
    const shares = Math.max(0, Math.min(sharesFromX, sharesFromY));
    if (shares <= 0) return null;
    const actualXMicro = Math.floor((shares * reserveXMicro) / pool.totalShares);
    const actualYMicro = Math.floor((shares * reserveYMicro) / pool.totalShares);
    return {
      shares,
      actualX: actualXMicro / TOKEN_DECIMALS,
      actualY: actualYMicro / TOKEN_DECIMALS,
      initializing: false,
    };
  }, [liqX, liqY, pool.reserveX, pool.reserveY, pool.totalShares]);

  const initialLiquidityTooSmall = useMemo(() => {
    if (!liquidityPreview?.initializing) return false;
    return liquidityPreview.shares <= Number(MINIMUM_LIQUIDITY);
  }, [liquidityPreview]);

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
  const { analytics, portfolioMetrics, portfolioHistory, clearPortfolioHistory } = useAnalytics({
    stacksAddress,
    portfolioHistoryKey,
    portfolioTotals,
    currentPrice,
    pool,
    activityItems,
    dayMs: DAY_MS,
    snapshotIntervalMs: SNAPSHOT_INTERVAL_MS,
  });

  const exportPortfolioHistoryCsv = useCallback(() => {
    const esc = (value: unknown) => {
      const raw = value === null || value === undefined ? "" : String(value);
      const needsQuotes = /[",\n\r]/.test(raw);
      const cleaned = raw.replaceAll('"', '""');
      return needsQuotes ? `"${cleaned}"` : cleaned;
    };
    const header = ["ts", "totalX", "totalY", "priceYX", "reserveX", "reserveY"].join(
      ",",
    );
    const rows = portfolioHistory.map((snap) =>
      [
        esc(new Date(snap.ts).toISOString()),
        esc(snap.totalX),
        esc(snap.totalY),
        esc(snap.priceYX),
        esc(snap.reserveX ?? ""),
        esc(snap.reserveY ?? ""),
      ].join(","),
    );
    downloadTextFile(
      `portfolio-history-${RESOLVED_STACKS_NETWORK}-${Date.now()}.csv`,
      [header, ...rows].join("\n"),
      "text/csv",
    );
  }, [downloadTextFile, portfolioHistory]);

  const exportPoolHistoryCsv = useCallback(() => {
    const esc = (value: unknown) => {
      const raw = value === null || value === undefined ? "" : String(value);
      const needsQuotes = /[",\n\r]/.test(raw);
      const cleaned = raw.replaceAll('"', '""');
      return needsQuotes ? `"${cleaned}"` : cleaned;
    };
    const header = ["ts", "reserveX", "reserveY", "priceYX", "totalShares"].join(
      ",",
    );
    const rows = poolHistory.map((snap) =>
      [
        esc(new Date(snap.ts).toISOString()),
        esc(snap.reserveX),
        esc(snap.reserveY),
        esc(snap.priceYX),
        esc(snap.totalShares ?? ""),
      ].join(","),
    );
    downloadTextFile(
      `pool-history-${RESOLVED_STACKS_NETWORK}-${Date.now()}.csv`,
      [header, ...rows].join("\n"),
      "text/csv",
    );
  }, [downloadTextFile, poolHistory]);

  const exportActivityCsv = useCallback(() => {
    const esc = (value: unknown) => {
      const raw = value === null || value === undefined ? "" : String(value);
      const needsQuotes = /[",\n\r]/.test(raw);
      const cleaned = raw.replaceAll('"', '""');
      return needsQuotes ? `"${cleaned}"` : cleaned;
    };
    const header = ["ts", "kind", "status", "txid", "message", "detail"].join(
      ",",
    );
    const rows = activityItems.map((item) =>
      [
        esc(new Date(item.ts).toISOString()),
        esc(item.kind),
        esc(item.status),
        esc(item.txid ?? ""),
        esc(item.message),
        esc(item.detail ?? ""),
      ].join(","),
    );
    downloadTextFile(
      `activity-${RESOLVED_STACKS_NETWORK}-${Date.now()}.csv`,
      [header, ...rows].join("\n"),
      "text/csv",
    );
  }, [activityItems, downloadTextFile]);

  const clearActivityHistory = useCallback(() => {
    setActivityItems([]);
    setActivityFilter("all");
    setActivitySearch("");
    try {
      localStorage.removeItem(activityKey);
    } catch (error) {
      console.warn("Activity history clear failed", error);
    }
  }, [activityKey, setActivityItems]);

  const lpFeeEstimates = useMemo(() => {
    const now = Date.now();
    const share = Math.max(0, Math.min(1, poolShare));
    let feeCount = 0;
    let totalX = 0;
    let totalY = 0;
    let total24X = 0;
    let total24Y = 0;

    activityItems
      .filter((item) => item.kind === "swap" && item.status === "confirmed")
      .forEach((item) => {
        const fee = item.meta?.fee;
        const symbol = item.meta?.feeSymbol;
        if (!isFiniteNumber(fee) || !symbol) return;
        feeCount += 1;
        if (symbol === "X") {
          totalX += fee;
          if (now - item.ts <= DAY_MS) total24X += fee;
        } else {
          totalY += fee;
          if (now - item.ts <= DAY_MS) total24Y += fee;
        }
      });

    return {
      hasFeeData: feeCount > 0,
      feeTotalX: totalX,
      feeTotalY: totalY,
      fee24hX: total24X,
      fee24hY: total24Y,
      earnedTotalX: totalX * share,
      earnedTotalY: totalY * share,
      earned24hX: total24X * share,
      earned24hY: total24Y * share,
    };
  }, [activityItems, poolShare]);

  // TODO: Replace with on-chain read once the contract exposes claimable fee data.
  const claimableFees = null as
    | { x: number; y: number; updatedAt?: number }
    | null;

  // TODO: Update this function if you want to implement more robust logic for fetching the current block height, such as using a WebSocket connection to listen for new blocks or implementing retry logic in case of network errors
  const fetchTipHeight = async () => {
    const res = await fetch(`${STACKS_API}/extended/v1/info`);
    if (!res.ok) return 0;
    const data = await res.json().catch(() => ({}));
    return Number(data?.stacks_tip_height || 0);
  };

  const refreshNetworkHealth = useCallback(async () => {
    if (typeof window === "undefined") return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 6_000);
    const startedAt = typeof performance !== "undefined" ? performance.now() : 0;

    setNetworkHealthChecking(true);
    try {
      const res = await fetch(`${STACKS_API}/extended/v1/info`, {
        signal: controller.signal,
      });
      const latencyMs =
        typeof performance !== "undefined"
          ? Math.max(0, Math.round(performance.now() - startedAt))
          : null;
      if (!res.ok) {
        setNetworkHealth({
          ok: false,
          tipHeight: null,
          latencyMs,
          lastCheckedAt: Date.now(),
          error: `HTTP ${res.status}`,
        });
        return;
      }
      const data = await res.json().catch(() => ({}));
      const tip = Number(data?.stacks_tip_height || 0);
      setNetworkHealth({
        ok: Number.isFinite(tip) && tip > 0,
        tipHeight: Number.isFinite(tip) && tip > 0 ? tip : null,
        latencyMs,
        lastCheckedAt: Date.now(),
        error: null,
      });
    } catch (error) {
      const latencyMs =
        typeof performance !== "undefined"
          ? Math.max(0, Math.round(performance.now() - startedAt))
          : null;
      setNetworkHealth({
        ok: false,
        tipHeight: null,
        latencyMs,
        lastCheckedAt: Date.now(),
        error: error instanceof Error ? error.message : "Fetch failed",
      });
    } finally {
      window.clearTimeout(timeout);
      setNetworkHealthChecking(false);
    }
  }, [STACKS_API]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const run = async () => {
      await refreshNetworkHealth();
      if (cancelled) return;
    };
    void run();
    const timer = window.setInterval(() => {
      void refreshNetworkHealth();
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [refreshNetworkHealth]);

  // TODO: Update this function if your contract uses a different approval mechanism, such as separate allowance functions for each token, or if you want to implement more detailed error handling and user feedback based on your contract's specific response structure and error codes
  const detectApprovalSupport = useCallback(
    async (token: TokenKey) => {
      if (tokenIsStx[token]) return false;
      const t = tokenContracts[token];
      if (!t?.address || !t?.contractName) return false;
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
    [STACKS_API, tokenContracts, tokenIsStx],
  );

  // TODO: Update this function if your contract uses a different approval mechanism, such as separate allowance functions for each token, or if you want to implement more detailed error handling and user feedback based on your contract's specific response structure and error codes
  const fetchAllowance = useCallback(
    async (token: TokenKey, owner: string) => {
      if (tokenIsStx[token]) return null;
      if (!approvalSupport[token]) return null;
      const t = tokenContracts[token];
      if (!t?.address || !t?.contractName) return null;
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
      tokenIsStx.x,
      tokenIsStx.y,
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
    tokenSelection.xId,
    tokenSelection.yId,
    tokenSelection.xIsStx,
    tokenSelection.yIsStx,
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
    tokenSelection.xId,
    tokenSelection.yId,
    tokenSelection.xIsStx,
    tokenSelection.yIsStx,
  ]);

  useEffect(() => {
    fetchPoolState(stacksAddress);
  }, [fetchPoolState, stacksAddress]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(favoritePoolsKey);
      if (!raw) {
        setFavoritePools([]);
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      const next = Array.isArray(parsed)
        ? parsed.filter((item) => typeof item === "string")
        : [];
      setFavoritePools(next);
    } catch {
      setFavoritePools([]);
    }
  }, [favoritePoolsKey]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(recentPoolsKey);
      if (!raw) {
        setRecentPools([]);
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        setRecentPools([]);
        return;
      }
      const migrated = parsed
        .map((item): RecentPoolEntry | null => {
          if (typeof item === "string") {
            return { id: item, target: "swap", openedAt: 0 };
          }
          if (!item || typeof item !== "object") return null;
          const record = item as Partial<RecentPoolEntry>;
          if (typeof record.id !== "string") return null;
          const target =
            record.target === "liquidity" || record.target === "swap"
              ? record.target
              : "swap";
          const openedAt =
            typeof record.openedAt === "number" &&
            Number.isFinite(record.openedAt)
              ? record.openedAt
              : 0;
          return { id: record.id, target, openedAt };
        })
        .filter(Boolean) as RecentPoolEntry[];

      setRecentPools(migrated.slice(0, 6));
    } catch {
      setRecentPools([]);
    }
  }, [recentPoolsKey]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(favoritePoolsOnlyKey);
      if (!raw) {
        setPoolFavoritesOnly(false);
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      setPoolFavoritesOnly(Boolean(parsed));
    } catch {
      setPoolFavoritesOnly(false);
    }
  }, [favoritePoolsOnlyKey]);

  useEffect(() => {
    try {
      localStorage.setItem(
        favoritePoolsOnlyKey,
        JSON.stringify(poolFavoritesOnly),
      );
    } catch {
      // ignore storage errors
    }
  }, [favoritePoolsOnlyKey, poolFavoritesOnly]);

  const poolUiStorageKey = useMemo(
    () => `pool-ui-${RESOLVED_STACKS_NETWORK}`,
    [],
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(poolUiStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<{
        version: number;
        search: string;
        sort: "tvl" | "volume" | "fees" | "apr";
        sortDir: "asc" | "desc";
        favoritesOnly: boolean;
      }>;
      if (!parsed || typeof parsed !== "object") return;
      if (typeof parsed.search === "string") setPoolSearch(parsed.search);
      if (
        parsed.sort === "tvl" ||
        parsed.sort === "volume" ||
        parsed.sort === "fees" ||
        parsed.sort === "apr"
      ) {
        setPoolSort(parsed.sort);
      }
      if (parsed.sortDir === "asc" || parsed.sortDir === "desc") {
        setPoolSortDir(parsed.sortDir);
      }
      if (typeof parsed.favoritesOnly === "boolean") {
        setPoolFavoritesOnly(parsed.favoritesOnly);
      }
    } catch {
      // ignore storage errors
    }
  }, [poolUiStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(
        poolUiStorageKey,
        JSON.stringify({
          version: 1,
          search: poolSearch,
          sort: poolSort,
          sortDir: poolSortDir,
          favoritesOnly: poolFavoritesOnly,
        }),
      );
    } catch {
      // ignore storage errors
    }
  }, [poolFavoritesOnly, poolSearch, poolSort, poolSortDir, poolUiStorageKey]);

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

  const swapSettingsKey = useMemo(
    () => `swap-settings-${RESOLVED_STACKS_NETWORK}-${stacksAddress || "guest"}`,
    [RESOLVED_STACKS_NETWORK, stacksAddress],
  );
  const approvalSettingsKey = useMemo(
    () =>
      `approval-settings-${RESOLVED_STACKS_NETWORK}-${stacksAddress || "guest"}`,
    [RESOLVED_STACKS_NETWORK, stacksAddress],
  );
  const targetSettingsKey = useMemo(
    () =>
      `target-settings-${RESOLVED_STACKS_NETWORK}-${stacksAddress || "guest"}`,
    [RESOLVED_STACKS_NETWORK, stacksAddress],
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(swapSettingsKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as
        | {
            slippageInput?: unknown;
            deadlineMinutesInput?: unknown;
            swapDirection?: unknown;
          }
        | null;
      if (!parsed || typeof parsed !== "object") return;
      if (typeof parsed.slippageInput === "string") {
        setSlippageInput(parsed.slippageInput);
      }
      if (typeof parsed.deadlineMinutesInput === "string") {
        setDeadlineMinutesInput(parsed.deadlineMinutesInput);
      }
      if (parsed.swapDirection === "x-to-y" || parsed.swapDirection === "y-to-x") {
        setSwapDirection(parsed.swapDirection);
      }
    } catch (error) {
      console.warn("Swap settings load failed", error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swapSettingsKey]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(activityUiKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as
        | { activityFilter?: unknown; activitySearch?: unknown }
        | null;
      if (!parsed || typeof parsed !== "object") return;
      const next = parsed.activityFilter;
      if (
        next === "swap" ||
        next === "confirmed" ||
        next === "submitted" ||
        next === "add-liquidity" ||
        next === "remove-liquidity" ||
        next === "approve" ||
        next === "faucet" ||
        next === "failed" ||
        next === "cancelled" ||
        next === "all"
      ) {
        setActivityFilter(next);
      }
      if (typeof parsed.activitySearch === "string") {
        setActivitySearch(parsed.activitySearch);
      }
    } catch (error) {
      console.warn("Activity UI load failed", error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityUiKey]);

  useEffect(() => {
    try {
      localStorage.setItem(
        swapSettingsKey,
        JSON.stringify({ slippageInput, deadlineMinutesInput, swapDirection }),
      );
    } catch {
      // ignore storage errors
    }
  }, [deadlineMinutesInput, slippageInput, swapDirection, swapSettingsKey]);

  useEffect(() => {
    try {
      localStorage.setItem(
        activityUiKey,
        JSON.stringify({ activityFilter, activitySearch }),
      );
    } catch {
      // ignore storage errors
    }
  }, [activityFilter, activitySearch, activityUiKey]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(approvalSettingsKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { approveUnlimited?: unknown } | null;
      if (!parsed || typeof parsed !== "object") return;
      if (typeof parsed.approveUnlimited === "boolean") {
        setApproveUnlimited(parsed.approveUnlimited);
      }
    } catch (error) {
      console.warn("Approval settings load failed", error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvalSettingsKey]);

  useEffect(() => {
    try {
      localStorage.setItem(
        approvalSettingsKey,
        JSON.stringify({ approveUnlimited }),
      );
    } catch {
      // ignore storage errors
    }
  }, [approvalSettingsKey, approveUnlimited]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(targetSettingsKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as
        | {
            targetPriceEnabled?: unknown;
            targetCondition?: unknown;
            targetPairDirection?: unknown;
            targetPriceInput?: unknown;
          }
        | null;
      if (!parsed || typeof parsed !== "object") return;
      if (typeof parsed.targetPriceEnabled === "boolean") {
        setTargetPriceEnabled(parsed.targetPriceEnabled);
      }
      if (parsed.targetCondition === ">=" || parsed.targetCondition === "<=") {
        setTargetCondition(parsed.targetCondition);
      }
      if (
        parsed.targetPairDirection === "x-to-y" ||
        parsed.targetPairDirection === "y-to-x"
      ) {
        setTargetPairDirection(parsed.targetPairDirection);
      }
      if (typeof parsed.targetPriceInput === "string") {
        setTargetPriceInput(parsed.targetPriceInput);
      }
    } catch (error) {
      console.warn("Target settings load failed", error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetSettingsKey]);

  useEffect(() => {
    try {
      localStorage.setItem(
        targetSettingsKey,
        JSON.stringify({
          targetPriceEnabled,
          targetCondition,
          targetPairDirection,
          targetPriceInput,
        }),
      );
    } catch {
      // ignore storage errors
    }
  }, [
    targetCondition,
    targetPairDirection,
    targetPriceEnabled,
    targetPriceInput,
    targetSettingsKey,
  ]);

  const resetSwapSettings = useCallback(() => {
    setSlippageInput("0.5");
    setDeadlineMinutesInput("30");
    setHighSlippageConfirmed(false);
    setImpactConfirmed(false);
  }, []);

  const resetAllLocalData = useCallback(() => {
    const ok = window.confirm(
      "This will clear your local UI data for Clardex (settings, favorites, activity, alerts, and portfolio history) and reload the page. Continue?",
    );
    if (!ok) return;

    const keys = [
      ONBOARDING_STORAGE_KEY,
      poolContractStorageKey,
      tokenSelectionKey,
      portfolioHistoryKey,
      poolHistoryKey,
      activityKey,
      activityUiKey,
      priceAlertsKey,
      favoritePoolsKey,
      favoritePoolsOnlyKey,
      poolUiStorageKey,
      swapSettingsKey,
      approvalSettingsKey,
      targetSettingsKey,
    ];

    for (const key of keys) {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore storage errors
      }
    }

    window.location.reload();
  }, [
    activityKey,
    activityUiKey,
    approvalSettingsKey,
    favoritePoolsKey,
    favoritePoolsOnlyKey,
    poolContractStorageKey,
    poolHistoryKey,
    poolUiStorageKey,
    portfolioHistoryKey,
    priceAlertsKey,
    swapSettingsKey,
    targetSettingsKey,
    tokenSelectionKey,
  ]);

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

  const swapConfirmPriceMovePct = useMemo(() => {
    if (!swapConfirmDraft) return null;
    if (!Number.isFinite(swapConfirmDraft.outputPreview)) return null;
    const liveOut = liveSwapOutput;
    if (!isFiniteNumber(liveOut)) return null;
    if (!swapConfirmDraft.outputPreview) return null;
    const delta = Math.abs(liveOut - swapConfirmDraft.outputPreview);
    return (delta / swapConfirmDraft.outputPreview) * 100;
  }, [liveSwapOutput, swapConfirmDraft]);
  const swapConfirmPriceMoved =
    Number.isFinite(swapConfirmPriceMovePct) &&
    (swapConfirmPriceMovePct ?? 0) >= PRICE_MOVE_WARN_PCT;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(FAUCET_COOLDOWN_KEY);
      if (!raw) return;
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) {
        setLastFaucetAt(parsed);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    const computeRemaining = () => {
      if (!lastFaucetAt) return 0;
      return Math.max(0, lastFaucetAt + FAUCET_COOLDOWN_MS - Date.now());
    };
    setFaucetCooldownRemainingMs(computeRemaining());
    if (!lastFaucetAt) return;
    const timer = window.setInterval(() => {
      setFaucetCooldownRemainingMs(computeRemaining());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lastFaucetAt]);

  const faucetCooldownActive = faucetCooldownRemainingMs > 0;
  const faucetCooldownLabel = faucetCooldownActive
    ? `${Math.ceil(faucetCooldownRemainingMs / 1000)}s`
    : null;

  useEffect(() => {
    setImpactConfirmed(false);
  }, [swapInput, swapDirection]);

  const highSlippageRequired = useMemo(() => {
    const parsed = Number(slippageInput);
    return Number.isFinite(parsed) && parsed > 5;
  }, [slippageInput]);

  useEffect(() => {
    if (!highSlippageRequired) setHighSlippageConfirmed(false);
  }, [highSlippageRequired]);

  const customTokenRequired = useMemo(() => {
    const preset = new Set(PRESET_TOKENS.map((token) => token.id));
    const xCustom = !tokenSelection.xIsStx && !preset.has(tokenSelection.xId);
    const yCustom = !tokenSelection.yIsStx && !preset.has(tokenSelection.yId);
    return xCustom || yCustom;
  }, [
    tokenSelection.xId,
    tokenSelection.xIsStx,
    tokenSelection.yId,
    tokenSelection.yIsStx,
  ]);

  useEffect(() => {
    if (!customTokenRequired) setCustomTokenConfirmed(false);
  }, [customTokenRequired]);

  const prepareSwapDraft = async (addressOverride?: string | null) => {
    const activeAddress = addressOverride || stacksAddress;
    setSwapMessage(null);
    const tokenConfigError = validateTokenConfig();
    if (tokenConfigError) {
      setSwapMessage(tokenConfigError);
      return null;
    }
    const amount = Number(swapInput);
    if (!amount || amount <= 0) {
      setSwapMessage("Enter an amount greater than 0.");
      return null;
    }
    if (!activeAddress) {
      setSwapMessage("Connect a Stacks wallet first.");
      return null;
    }
    if (!isNetworkAddress(activeAddress)) {
      setSwapMessage(
        `Network mismatch: connected address is not ${RESOLVED_STACKS_NETWORK}. Switch wallet network and reconnect.`,
      );
      return null;
    }
    if (customTokenRequired && !customTokenConfirmed) {
      setSwapMessage(
        "Confirm the unverified token warning before swapping with custom tokens.",
      );
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
          `Approve ${fromX ? selectionLabels.x : selectionLabels.y} first. Required: ${formatNumber(amount)}, current allowance: ${formatNumber(allowance)}.`,
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
    if (slippagePercent > 5 && !highSlippageConfirmed) {
      setSwapMessage(
        "High slippage requires confirmation before swapping.",
      );
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

    let preflightFee: number | null = null;
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
      preflightFee = simulated.fee;
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
    const functionArgs = [
      toOptionalTokenCv("x"),
      toOptionalTokenCv("y"),
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
      feeEstimate: preflightFee,
      feeSymbol: fromX ? "X" : "Y",
      functionName,
      functionArgs,
    } satisfies SwapDraft;
  };

  const handleSwap = async () => {
    const draft = await prepareSwapDraft();
    if (!draft) return;
    setSwapConfirmDraft(draft);
    setSwapConfirmAddressOverride(null);
  };

  const refreshSwapConfirmDraft = async () => {
    if (!swapConfirmDraft) return;
    try {
      setSwapConfirmRefreshing(true);
      const draft = await prepareSwapDraft(swapConfirmAddressOverride);
      if (!draft) return;
      setSwapConfirmDraft(draft);
    } finally {
      setSwapConfirmRefreshing(false);
    }
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
    if (!isNetworkAddress(activeAddress)) {
      setSwapMessage(
        `Network mismatch: connected address is not ${RESOLVED_STACKS_NETWORK}. Switch wallet network and reconnect.`,
      );
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
            meta: {
              fee: draft.feeEstimate ?? null,
              feeSymbol: draft.feeSymbol,
              amountIn: draft.amount,
              amountOut: draft.outputPreview,
              fromSymbol: draft.fromSymbol,
              toSymbol: draft.toSymbol,
            },
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
    setSwapConfirmDraft(draft);
    setSwapConfirmAddressOverride(activeAddress);
  };

  const handleApprove = async (
    token: TokenKey,
    amount?: number,
    mode: "required" | "custom" | "unlimited" | "revoke" = "required",
  ) => {
    setApprovalMessage(null);
    if (!stacksAddress) {
      setApprovalMessage("Connect a Stacks wallet first.");
      return;
    }
    if (!isNetworkAddress(stacksAddress)) {
      setApprovalMessage(
        `Network mismatch: connected address is not ${RESOLVED_STACKS_NETWORK}. Switch wallet network and reconnect.`,
      );
      return;
    }
    if (tokenIsStx[token]) {
      setApprovalMessage("STX does not require approvals.");
      return;
    }
    if (!approvalSupport[token]) {
      setApprovalMessage(
        `${selectionLabels[token]} does not require approvals with the current contract.`,
      );
      return;
    }

    const unlimitedMicro = 9_999_999_999_999_999n;
    const tokenLabel = selectionLabels[token];
    const tokenContract = tokenContracts[token];
    if (!tokenContract?.address || !tokenContract?.contractName) {
      setApprovalMessage("Token contract is missing or invalid.");
      return;
    }

    let amountMicro: bigint;
    if (mode === "revoke") {
      amountMicro = 0n;
    } else if (mode === "unlimited") {
      amountMicro = unlimitedMicro;
    } else {
      const nextAmount = Number(amount || 0);
      if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
        setApprovalMessage("Enter an approval amount greater than 0.");
        return;
      }
      amountMicro = BigInt(Math.max(1, Math.floor(nextAmount * TOKEN_DECIMALS)));
    }

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
    const tokenConfigError = validateTokenConfig();
    if (tokenConfigError) {
      setLiqMessage(tokenConfigError);
      return;
    }
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
    if (!isNetworkAddress(stacksAddress)) {
      setLiqMessage(
        `Network mismatch: connected address is not ${RESOLVED_STACKS_NETWORK}. Switch wallet network and reconnect.`,
      );
      return;
    }
    if (approvalSupport.x) {
      const allowanceX = allowances.x || 0;
      if (allowanceX + Number.EPSILON < amountX) {
        setLiqMessage(
          `Approve ${selectionLabels.x} first. Required: ${formatNumber(amountX)}, current allowance: ${formatNumber(allowanceX)}.`,
        );
        return;
      }
    }
    if (approvalSupport.y) {
      const allowanceY = allowances.y || 0;
      if (allowanceY + Number.EPSILON < amountY) {
        setLiqMessage(
          `Approve ${selectionLabels.y} first. Required: ${formatNumber(amountY)}, current allowance: ${formatNumber(allowanceY)}.`,
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
          toOptionalTokenCv("x"),
          toOptionalTokenCv("y"),
          boolCV(tokenIsStx.x),
          boolCV(tokenIsStx.y),
          uintCV(amountXMicro),
          uintCV(amountYMicro),
        ]
      : [
          toOptionalTokenCv("x"),
          toOptionalTokenCv("y"),
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
    const tokenConfigError = validateTokenConfig();
    if (tokenConfigError) {
      setBurnMessage(tokenConfigError);
      return;
    }
    const shares = Number(burnShares);
    if (shares <= 0) {
      setBurnMessage("Enter a share amount greater than 0.");
      return;
    }
    if (!stacksAddress) {
      setBurnMessage("Connect a Stacks wallet first.");
      return;
    }
    if (!isNetworkAddress(stacksAddress)) {
      setBurnMessage(
        `Network mismatch: connected address is not ${RESOLVED_STACKS_NETWORK}. Switch wallet network and reconnect.`,
      );
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
          toOptionalTokenCv("x"),
          toOptionalTokenCv("y"),
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
    if (faucetCooldownActive) {
      setFaucetMessage(
        `Faucet cooldown active. Try again in ${faucetCooldownLabel || "a moment"}.`,
      );
      return;
    }
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
      const nextTxids = results
        .map((entry) => entry.split(": ")[1] || entry)
        .map((txid) => String(txid || "").trim())
        .filter(Boolean);
      setFaucetTxids((prev) => {
        const seen = new Set<string>();
        const merged = [...nextTxids, ...(Array.isArray(prev) ? prev : [])].filter(
          (txid) => {
            if (!txid || seen.has(txid)) return false;
            seen.add(txid);
            return true;
          },
        );
        return merged.slice(0, 8);
      });
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
      const now = Date.now();
      setLastFaucetAt(now);
      try {
        localStorage.setItem(FAUCET_COOLDOWN_KEY, String(now));
      } catch {
        // ignore storage errors
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
        actionLabel: faucetPending
          ? "Requesting..."
          : faucetCooldownActive
            ? `Cooldown ${faucetCooldownLabel}`
            : "Use faucet",
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
      faucetCooldownActive,
      faucetCooldownLabel,
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

  const handleSyncToPoolRatioFromY = () => {
    if (pool.reserveX === 0 || pool.reserveY === 0) return;
    const ratio = pool.reserveY / pool.reserveX;
    const y = Number(liqY) || 0;
    const x = ratio > 0 ? y / ratio : 0;
    setLiqX(x.toFixed(4));
  };

  const fillLiquidityInput = (token: "x" | "y") => {
    if (token === "x") {
      setLiqX(String(Number(balances.tokenX.toFixed(4))));
      return;
    }
    setLiqY(String(Number(balances.tokenY.toFixed(4))));
  };

  const setMaxLiquidity = () => {
    const maxX = balances.tokenX || 0;
    const maxY = balances.tokenY || 0;
    if (pool.reserveX > 0 && pool.reserveY > 0) {
      const ratio = pool.reserveY / pool.reserveX;
      const yFromX = maxX * ratio;
      if (yFromX <= maxY) {
        setLiqX(String(Number(maxX.toFixed(4))));
        setLiqY(String(Number(yFromX.toFixed(4))));
      } else {
        const xFromY = ratio > 0 ? maxY / ratio : 0;
        setLiqX(String(Number(xFromY.toFixed(4))));
        setLiqY(String(Number(maxY.toFixed(4))));
      }
      return;
    }
    setLiqX(String(Number(maxX.toFixed(4))));
    setLiqY(String(Number(maxY.toFixed(4))));
  };

  const setMaxSwap = () => {
    const fromX = swapDirection === "x-to-y";
    const fromIsStx = fromX ? tokenIsStx.x : tokenIsStx.y;
    const balance = fromX ? balances.tokenX : balances.tokenY;
    if (!balance || balance <= 0) {
      setSwapInput("");
      return;
    }
    const max = fromIsStx ? Math.max(0, balance - STX_SWAP_FEE_BUFFER) : balance;
    setSwapInput(String(Number(max.toFixed(6))));
  };

  const handleOpenPoolFromList = (
    poolId: string,
    target: "swap" | "liquidity",
  ) => {
    if (!poolId) return;
    setRecentPools((prev) => {
      const now = Date.now();
      const next = [
        { id: poolId, target, openedAt: now },
        ...prev.filter((item) => item.id !== poolId),
      ].slice(0, 6);
      try {
        localStorage.setItem(recentPoolsKey, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
    setPoolContractId(poolId);
    setTokenValidation({ x: { status: "idle" }, y: { status: "idle" } });
    setTokenSelectMessage("Switching pool...");
    setActiveTab(target);
    setTokenSelectHighlight(true);
    window.setTimeout(() => setTokenSelectHighlight(false), 1400);
  };

  const toggleFavoritePool = (poolId: string) => {
    setFavoritePools((prev) => {
      const exists = prev.includes(poolId);
      const next = exists ? prev.filter((id) => id !== poolId) : [...prev, poolId];
      try {
        localStorage.setItem(favoritePoolsKey, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const clearFavoritePools = () => {
    setFavoritePools([]);
    try {
      localStorage.setItem(favoritePoolsKey, JSON.stringify([]));
    } catch {
      // ignore storage errors
    }
  };

  const clearRecentPools = () => {
    setRecentPools([]);
    try {
      localStorage.setItem(recentPoolsKey, JSON.stringify([]));
    } catch {
      // ignore storage errors
    }
  };

  const setSwapPreset = (percent: number) => {
    const balance =
      swapDirection === "x-to-y" ? balances.tokenX : balances.tokenY;
    if (!balance || balance <= 0) return;
    const normalized = Math.max(0, Math.min(1, percent));
    const next = balance * normalized;
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

  const suggestedSlippagePercent = useMemo(() => {
    if (!priceImpact || priceImpact <= 0) return 0.5;
    const suggested = clamp(0.3 + priceImpact * 0.2, 0.1, 3);
    return Math.round(suggested * 10) / 10;
  }, [priceImpact]);
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
    const fromX = swapDirection === "x-to-y";
    const fromIsStx = fromX ? tokenIsStx.x : tokenIsStx.y;
    const balance = fromX ? balances.tokenX : balances.tokenY;
    if (!balance || balance <= 0) return 0;
    const max = fromIsStx ? Math.max(0, balance - STX_SWAP_FEE_BUFFER) : balance;
    return Math.max(0, Number(max.toFixed(4)));
  }, [balances.tokenX, balances.tokenY, swapDirection, tokenIsStx.x, tokenIsStx.y]);

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

  useEffect(() => {
    if (!txToastInit.current) {
      for (const item of activityItems) {
        if (!item.txid) continue;
        txToastByTxid.current[item.txid] = item.status;
      }
      txToastInit.current = true;
      return;
    }

    for (const item of activityItems) {
      if (!item.txid) continue;
      const last = txToastByTxid.current[item.txid];
      if (last === item.status) continue;
      txToastByTxid.current[item.txid] = item.status;

      if (last !== "submitted") continue;
      if (item.status !== "confirmed" && item.status !== "failed") continue;

      const tone: ToastTone = item.status === "confirmed" ? "success" : "error";
      const kindLabel = item.kind.replaceAll("-", " ");
      const headline = `${kindLabel.charAt(0).toUpperCase()}${kindLabel.slice(1)} ${item.status}`;

      let receipt = "";
      const meta = item.meta;
      const amountIn = meta?.amountIn;
      const amountOut = meta?.amountOut;
      if (
        item.kind === "swap" &&
        meta?.fromSymbol &&
        meta?.toSymbol &&
        isFiniteNumber(amountIn) &&
        isFiniteNumber(amountOut)
      ) {
        receipt = ` | ${formatNumber(amountIn)} ${meta.fromSymbol} -> ~${formatNumber(amountOut)} ${meta.toSymbol}`;
      }

      pushToast(`${headline}${receipt}`, tone, {
        label: "Explorer",
        href: buildExplorerTxUrl(item.txid),
      });

      if (browserAlertsEnabled && typeof Notification !== "undefined") {
        try {
          new Notification(`Clardex tx ${item.status}`, {
            body: `${headline}${receipt}`,
          });
        } catch {
          // ignore notification failures
        }
      }
    }
  }, [activityItems, browserAlertsEnabled, buildExplorerTxUrl, pushToast]);

  const handleManualRefresh = useCallback(async () => {
    setFrontendMessage(null);
    try {
      void refreshNetworkHealth();
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
  }, [fetchPoolState, refreshNetworkHealth, stacksAddress, syncBalances]);

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
    if (parsed > 50) return 0.5;
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
      tokenLabels={selectionLabels}
      tokenMismatch={!!tokenMismatchWarning}
      approvalSupport={approvalSupport}
      approveUnlimited={approveUnlimited}
      setApproveUnlimited={setApproveUnlimited}
      unlimitedApprovalConfirmed={unlimitedApprovalConfirmed}
      setUnlimitedApprovalConfirmed={setUnlimitedApprovalConfirmed}
      allowances={allowances}
      formatNumber={formatNumber}
      handleApprove={handleApprove}
      stacksAddress={stacksAddress}
      networkMismatch={networkMismatch}
      approvePending={approvePending}
      spenderContractId={spenderContractId}
    />
  );

  const networkMismatch = useMemo(
    () => Boolean(stacksAddress && !isNetworkAddress(stacksAddress)),
    [stacksAddress],
  );

  const closeSwapConfirm = useCallback(() => {
    setSwapConfirmDraft(null);
    setSwapConfirmAddressOverride(null);
  }, []);

  const confirmSwapAndSign = useCallback(async () => {
    if (!swapConfirmDraft) return;
    const draft = swapConfirmDraft;
    const addressOverride = swapConfirmAddressOverride;
    closeSwapConfirm();
    await executeSwap(draft, addressOverride);
  }, [closeSwapConfirm, swapConfirmAddressOverride, swapConfirmDraft]);

  const openWalletMenu = useCallback(() => {
    setWalletMenuOpen(true);
  }, []);

  const closeWalletMenu = useCallback(() => {
    setWalletMenuOpen(false);
  }, []);

  const closeCommandPalette = useCallback(() => {
    setCommandPaletteOpen(false);
    setCommandQuery("");
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key !== "Escape") return;

      if (commandPaletteOpen) {
        event.preventDefault();
        closeCommandPalette();
        return;
      }

      if (swapConfirmDraft) {
        event.preventDefault();
        closeSwapConfirm();
        return;
      }

      if (walletMenuOpen) {
        event.preventDefault();
        closeWalletMenu();
        return;
      }

      if (showOnboarding) {
        event.preventDefault();
        closeOnboarding(false);
        return;
      }

      if (activityDrawerOpen || activityDrawerClosing) {
        event.preventDefault();
        closeActivityDrawer();
        return;
      }

      if (drawerOpen || drawerClosing) {
        event.preventDefault();
        closeNavDrawer();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activityDrawerClosing,
    activityDrawerOpen,
    closeActivityDrawer,
    closeCommandPalette,
    closeNavDrawer,
    closeOnboarding,
    closeSwapConfirm,
    closeWalletMenu,
    commandPaletteOpen,
    drawerClosing,
    drawerOpen,
    showOnboarding,
    swapConfirmDraft,
    walletMenuOpen,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isK = event.key.toLowerCase() === "k";
      const meta = event.metaKey || event.ctrlKey;
      if (!meta || !isK) return;
      event.preventDefault();
      setCommandPaletteOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const activeEl = document.activeElement as HTMLElement | null;
      const isTyping =
        !!activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          (activeEl as HTMLElement).isContentEditable);

      if (isTyping) return;
      if (event.key !== "/") return;

      event.preventDefault();
      setCommandPaletteOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const commandItems = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [
      {
        id: "nav-trade",
        label: "Go to Trade",
        keywords: "tab swap trade",
        hotkey: "T",
        run: () => {
          setActiveTab("swap");
          closeCommandPalette();
        },
      },
      {
        id: "nav-prices",
        label: "Go to Prices",
        keywords: "tab prices chart board",
        hotkey: "P",
        run: () => {
          setActiveTab("prices");
          closeCommandPalette();
        },
      },
      {
        id: "nav-pools",
        label: "Go to Pools",
        keywords: "tab pools list favorites",
        hotkey: "O",
        run: () => {
          setActiveTab("pools");
          closeCommandPalette();
        },
      },
      {
        id: "nav-analytics",
        label: "Go to Analytics",
        keywords: "tab analytics pnl il",
        hotkey: "A",
        run: () => {
          setActiveTab("analytics");
          closeCommandPalette();
        },
      },
      {
        id: "nav-liquidity",
        label: "Go to Pool (Liquidity)",
        keywords: "tab liquidity pool lp add remove",
        hotkey: "L",
        run: () => {
          setActiveTab("liquidity");
          closeCommandPalette();
        },
      },
      {
        id: "open-activity",
        label: "Open Activity",
        keywords: "drawer transactions tx",
        run: () => {
          openActivityDrawer();
          closeCommandPalette();
        },
      },
      {
        id: "copy-activity-csv",
        label: "Copy activity CSV (filtered)",
        keywords: "copy activity csv export transactions",
        run: () => {
          void copyToClipboard("CSV", activityCsv);
          closeCommandPalette();
        },
      },
      {
        id: "download-activity-csv",
        label: "Download activity CSV (filtered)",
        keywords: "download activity csv export transactions",
        run: () => {
          downloadTextFile(
            `activity-${RESOLVED_STACKS_NETWORK}-${Date.now()}.csv`,
            activityCsv,
            "text/csv",
          );
          closeCommandPalette();
        },
      },
      {
        id: "clear-activity",
        label: "Clear activity history",
        keywords: "clear reset activity history",
        run: () => {
          if (activityItems.length > 0) {
            const ok = window.confirm(
              "Clear your local activity history for this pool?",
            );
            if (!ok) return;
          }
          clearActivityHistory();
          closeCommandPalette();
        },
      },
      {
        id: "reset-local",
        label: "Reset local UI data",
        keywords: "reset clear local storage ui settings favorites alerts portfolio",
        run: () => {
          resetAllLocalData();
          closeCommandPalette();
        },
      },
      {
        id: "open-wallet",
        label: "Open Wallet menu",
        keywords: "wallet address disconnect",
        run: () => {
          if (stacksAddress) openWalletMenu();
          closeCommandPalette();
        },
      },
      {
        id: "refresh-pool",
        label: "Refresh pool data",
        keywords: "refresh reload pool balances",
        run: () => {
          void handleManualRefresh();
          closeCommandPalette();
        },
      },
      {
        id: "copy-swap-snapshot",
        label: "Copy swap snapshot",
        keywords: "copy snapshot quote impact",
        run: () => {
          void handleCopySwapSnapshot();
          closeCommandPalette();
        },
      },
      {
        id: "copy-pool-contract",
        label: "Copy pool contract ID",
        keywords: "copy pool contract",
        run: () => {
          void copyToClipboard(
            "Pool contract",
            `${poolContract.address}.${poolContract.contractName}`,
          );
          closeCommandPalette();
        },
      },
      {
        id: "view-pool-contract",
        label: "View pool contract on explorer",
        keywords: "explorer pool contract view",
        run: () => {
          window.open(
            `https://explorer.hiro.so/contract/${poolContract.address}/${poolContract.contractName}?chain=${RESOLVED_STACKS_NETWORK}`,
            "_blank",
            "noopener,noreferrer",
          );
          closeCommandPalette();
        },
      },
      {
        id: "swap-reset",
        label: "Reset swap settings",
        keywords: "slippage deadline reset",
        run: () => {
          resetSwapSettings();
          closeCommandPalette();
        },
      },
      {
        id: "swap-25",
        label: "Set swap to 25%",
        keywords: "swap preset 25",
        run: () => {
          setSwapPreset(0.25);
          closeCommandPalette();
        },
      },
      {
        id: "swap-50",
        label: "Set swap to 50%",
        keywords: "swap preset 50",
        run: () => {
          setSwapPreset(0.5);
          closeCommandPalette();
        },
      },
      {
        id: "swap-75",
        label: "Set swap to 75%",
        keywords: "swap preset 75",
        run: () => {
          setSwapPreset(0.75);
          closeCommandPalette();
        },
      },
      {
        id: "swap-100",
        label: "Set swap to 100%",
        keywords: "swap preset 100 max",
        run: () => {
          setSwapPreset(1);
          closeCommandPalette();
        },
      },
    ];

    if (stacksAddress) {
      items.unshift({
        id: "view-address",
        label: "View wallet on explorer",
        keywords: "wallet address explorer view hiro",
        run: () => {
          window.open(
            buildExplorerAddressUrl(stacksAddress),
            "_blank",
            "noopener,noreferrer",
          );
          closeCommandPalette();
        },
      });

      items.unshift({
        id: "copy-address-link",
        label: "Copy wallet explorer link",
        keywords: "copy wallet address explorer link hiro",
        run: () => {
          void copyToClipboard(
            "Explorer link",
            buildExplorerAddressUrl(stacksAddress),
          );
          closeCommandPalette();
        },
      });

      items.unshift({
        id: "copy-address",
        label: "Copy wallet address",
        keywords: "copy address",
        run: () => {
          void copyToClipboard("Address", stacksAddress);
          closeCommandPalette();
        },
      });
    }

    return items;
  }, [
    RESOLVED_STACKS_NETWORK,
    activityCsv,
    activityItems.length,
    clearActivityHistory,
    closeCommandPalette,
    copyToClipboard,
    buildExplorerAddressUrl,
    downloadTextFile,
    handleCopySwapSnapshot,
    handleManualRefresh,
    openActivityDrawer,
    openWalletMenu,
    poolContract.address,
    poolContract.contractName,
    resetSwapSettings,
    resetAllLocalData,
    setActiveTab,
    setSwapPreset,
    stacksAddress,
  ]);

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
                className={activeTab === "prices" ? "is-active" : ""}
                onClick={() => setActiveTab("prices")}
              >
                Prices
              </button>
              <button
                className={activeTab === "pools" ? "is-active" : ""}
                onClick={() => setActiveTab("pools")}
              >
                Pools
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
          <button
            className="nav-search"
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            aria-label="Open search"
            title="Search (Ctrl/Cmd+K or /)"
          >
            <span className="nav-search-icon">Search</span>
            <span className="nav-search-text">tokens, pools, and wallets</span>
            <span className="nav-search-hint">Ctrl/Cmd+K</span>
          </button>
          <div className="nav-actions">
            {STACKS_API && (
              <button
                className={`tiny ${
                  networkHealthChecking
                    ? "neutral"
                    : networkHealth.ok &&
                        networkHealth.lastCheckedAt !== null &&
                        activityNow - networkHealth.lastCheckedAt <= 120_000
                      ? "success"
                      : "warn"
                }`}
                type="button"
                onClick={() => void refreshNetworkHealth()}
                aria-label="Stacks API status"
                title={[
                  `Stacks API: ${STACKS_API}`,
                  networkHealth.lastCheckedAt
                    ? `Last check: ${new Date(networkHealth.lastCheckedAt).toLocaleTimeString()}`
                    : "Last check: never",
                  networkHealth.latencyMs !== null
                    ? `Latency: ~${networkHealth.latencyMs}ms`
                    : null,
                  networkHealth.error ? `Error: ${networkHealth.error}` : null,
                ]
                  .filter(Boolean)
                  .join("\n")}
              >
                {networkHealthChecking
                  ? "API checking"
                  : networkHealth.ok
                    ? "API ok"
                    : "API down"}
                {networkHealth.tipHeight !== null
                  ? ` · h ${formatCompactNumber(networkHealth.tipHeight)}`
                  : ""}
              </button>
            )}
            <button
              className="tiny ghost"
              type="button"
              onClick={() => void handleManualRefresh()}
              disabled={poolPending}
              aria-label="Refresh pool data"
              title={
                lastPoolRefreshAt
                  ? `Refresh pool/balances\nLast pool refresh: ${new Date(lastPoolRefreshAt).toLocaleTimeString()}`
                  : "Refresh pool/balances"
              }
            >
              {poolPending ? "Refreshing" : "Refresh"}
            </button>
            {poolSelectorOptions.length > 0 && (
              <label className="pool-select" title="Select pool contract">
                <span className="pool-select-label">Pool</span>
                <select
                  value={poolContractId}
                  onChange={(e) => setPoolContractId(e.target.value)}
                  aria-label="Select pool"
                >
                  {poolSelectorOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {poolsDirectoryPending && (
                  <span className="pool-select-status" aria-hidden="true">
                    Loading
                  </span>
                )}
              </label>
            )}
            <button
              className="activity-pill"
              type="button"
              onClick={openActivityDrawer}
              aria-label="Open activity drawer"
            >
              Activity
              {pendingTxs.length > 0 && (
                <span className="activity-badge">{pendingTxs.length}</span>
              )}
            </button>
            <button
              className="nav-burger"
              type="button"
              aria-label="Open menu"
              onClick={openNavDrawer}
            >
              <span />
              <span />
              <span />
            </button>

            {stacksAddress ? (
              <AddressPill
                address={stacksAddress}
                networkLabel={RESOLVED_STACKS_NETWORK}
                networkMismatch={networkMismatch}
                onClick={openWalletMenu}
              />
            ) : (
              <button className="wallet-pill" onClick={handleStacksConnect}>
                Connect Stacks
              </button>
            )}
          </div>
        </div>
      </header>

      {(activityDrawerOpen || activityDrawerClosing) && (
        <div
          className={`activity-drawer-backdrop ${activityDrawerClosing ? "is-closing" : ""}`}
          onClick={closeActivityDrawer}
          role="dialog"
          aria-modal="true"
        >
          <div
            className={`activity-drawer ${activityDrawerClosing ? "is-closing" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="nav-drawer-head">
              <div>
                <p className="eyebrow">Activity</p>
                <h2>Transactions</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Close activity drawer"
                onClick={closeActivityDrawer}
              >
                ×
              </button>
            </div>
            <div className="activity-drawer-controls">
              <div className="activity-filter-row">
                <button
                  className={`tiny ghost ${
                    activityFilter === "all" ? "is-active" : ""
                  }`}
                  onClick={() => setActivityFilter("all")}
                >
                  All
                </button>
                <button
                  className={`tiny ghost ${
                    activityFilter === "submitted" ? "is-active" : ""
                  }`}
                  onClick={() => setActivityFilter("submitted")}
                >
                  Pending
                </button>
                <button
                  className={`tiny ghost ${
                    activityFilter === "confirmed" ? "is-active" : ""
                  }`}
                  onClick={() => setActivityFilter("confirmed")}
                >
                  Confirmed
                </button>
                <button
                  className={`tiny ghost ${
                    activityFilter === "failed" ? "is-active" : ""
                  }`}
                  onClick={() => setActivityFilter("failed")}
                >
                  Failed
                </button>
                <button
                  className={`tiny ghost ${
                    activityFilter === "cancelled" ? "is-active" : ""
                  }`}
                  onClick={() => setActivityFilter("cancelled")}
                >
                  Cancelled
                </button>
                <button
                  className={`tiny ghost ${
                    activityFilter === "swap" ? "is-active" : ""
                  }`}
                  onClick={() => setActivityFilter("swap")}
                >
                  Swaps
                </button>
                <button
                  className={`tiny ghost ${
                    activityFilter === "add-liquidity" ? "is-active" : ""
                  }`}
                  onClick={() => setActivityFilter("add-liquidity")}
                >
                  Add LP
                </button>
                <button
                  className={`tiny ghost ${
                    activityFilter === "remove-liquidity" ? "is-active" : ""
                  }`}
                  onClick={() => setActivityFilter("remove-liquidity")}
                >
                  Remove LP
                </button>
                <button
                  className={`tiny ghost ${
                    activityFilter === "approve" ? "is-active" : ""
                  }`}
                  onClick={() => setActivityFilter("approve")}
                >
                  Approvals
                </button>
                <button
                  className={`tiny ghost ${
                    activityFilter === "faucet" ? "is-active" : ""
                  }`}
                  onClick={() => setActivityFilter("faucet")}
                >
                  Faucet
                </button>
              </div>
              <div className="activity-search-row">
                <input
                  className="activity-search"
                  value={activitySearch}
                  onChange={(e) => setActivitySearch(e.target.value)}
                  placeholder="Search txid, status, message..."
                  aria-label="Search activity"
                />
                <button
                  className="tiny ghost"
                  type="button"
                  onClick={() => setActivitySearch("")}
                  disabled={!activitySearch.trim()}
                >
                  Clear search
                </button>
              </div>
              <div className="mini-actions">
                <button
                  className="tiny ghost"
                  type="button"
                  onClick={() => void copyToClipboard("CSV", activityCsv)}
                  disabled={activityDrawerItems.length === 0}
                >
                  Copy CSV
                </button>
                <button
                  className="tiny ghost"
                  type="button"
                  onClick={() =>
                    downloadTextFile(
                      `activity-${RESOLVED_STACKS_NETWORK}-${Date.now()}.csv`,
                      activityCsv,
                      "text/csv",
                    )
                  }
                  disabled={activityDrawerItems.length === 0}
                >
                  Export CSV
                </button>
                <button
                  className="tiny ghost"
                  type="button"
                  onClick={() => exportActivityCsv()}
                  disabled={activityItems.length === 0}
                >
                  Export all CSV
                </button>
                <button
                  className="tiny ghost"
                  type="button"
                  onClick={() =>
                    void copyToClipboard(
                      "Diagnostics",
                      JSON.stringify(
                        {
                          ts: new Date().toISOString(),
                          resolvedStacksNetwork: RESOLVED_STACKS_NETWORK,
                          stacksAddress,
                          networkMismatch,
                          poolContractId,
                          tokenSelection,
                          pool,
                          currentPrice,
                          balances,
                          allowances,
                          approvalSupport,
                          approveUnlimited,
                          slippageInput,
                          deadlineMinutesInput,
                          swapDirection,
                          swapInput,
                          activityFilter,
                          activitySearch,
                          userAgent:
                            typeof navigator === "undefined"
                              ? null
                              : navigator.userAgent,
                        },
                        null,
                        2,
                      ),
                    )
                  }
                >
                  Copy diagnostics
                </button>
                <button
                  className="tiny ghost"
                  onClick={() => {
                    clearActivityHistory();
                  }}
                  disabled={activityItems.length === 0}
                >
                  Clear
                </button>
              </div>
            </div>

            {activityItems.length > 0 && (
              <p className="muted small activity-drawer-summary">
                Showing {Math.min(activityDrawerItems.length, activityLimit)} of{" "}
                {activityDrawerItems.length} matching entries.
              </p>
            )}
            {activityDrawerItems.length === 0 ? (
              <p className="muted small">
                {activityItems.length === 0
                  ? "No activity yet."
                  : "No activity matches the current filter."}
              </p>
            ) : (
              <div className="activity-drawer-list">
                {activityDrawerItems.slice(0, activityLimit).map((item) => (
                  <div className="activity-drawer-item" key={item.id}>
                    <div className="activity-drawer-main">
                      <span className={`chip ghost status-${item.status}`}>
                        {item.status}
                      </span>
                      <strong>{item.message}</strong>
                    </div>
                    <div className="activity-drawer-meta">
                      <span
                        className="muted small"
                        title={new Date(item.ts).toLocaleString()}
                      >
                        {formatRelativeTime(item.ts)}
                      </span>
                      {item.txid ? (
                        <div className="activity-chip-row">
                          <a
                            className="chip ghost"
                            href={buildExplorerTxUrl(item.txid)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {item.txid.slice(0, 6)}...{item.txid.slice(-6)}
                          </a>
                          <button
                            className="chip ghost"
                            type="button"
                            onClick={() =>
                              void copyToClipboard("Txid", item.txid || "")
                            }
                            aria-label="Copy txid"
                          >
                            Copy
                          </button>
                          <button
                            className="chip ghost"
                            type="button"
                            onClick={() =>
                              void copyToClipboard(
                                "Explorer link",
                                buildExplorerTxUrl(item.txid || ""),
                              )
                            }
                            aria-label="Copy explorer link"
                          >
                            Copy link
                          </button>
                        </div>
                      ) : null}
                      {(() => {
                        if (item.kind !== "swap") return null;
                        const meta = item.meta;
                        const amountIn = meta?.amountIn;
                        const amountOut = meta?.amountOut;
                        const fee = meta?.fee;
                        if (!meta?.fromSymbol || !meta?.toSymbol) return null;
                        if (!isFiniteNumber(amountIn) || !isFiniteNumber(amountOut)) {
                          return null;
                        }
                        return (
                          <div className="activity-chip-row">
                            <span className="chip ghost">
                              In {formatNumber(amountIn)} {meta.fromSymbol}
                            </span>
                            <span className="chip ghost">
                              Out ~{formatNumber(amountOut)} {meta.toSymbol}
                            </span>
                            {isFiniteNumber(fee) && meta.feeSymbol ? (
                              <span className="chip ghost">
                                Fee est {formatNumber(fee)} {meta.feeSymbol}
                              </span>
                            ) : null}
                          </div>
                        );
                      })()}
                    </div>
                    {item.detail ? (
                      <p className="muted small">{item.detail}</p>
                    ) : null}
                    {item.txid ? (
                      <p className="muted small">
                        {item.chainStatus
                          ? item.chainStatus.replace(/\b\w/g, (char) =>
                              char.toUpperCase(),
                            )
                          : "Awaiting chain update"}
                        {item.lastCheckedAt
                          ? ` · checked ${formatRelativeTime(item.lastCheckedAt)}`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                ))}
                {activityDrawerItems.length > activityLimit && (
                  <button
                    className="tiny ghost activity-load-more"
                    type="button"
                    onClick={() => setActivityLimit((prev) => prev + 10)}
                  >
                    Load more
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {(drawerOpen || drawerClosing) && (
        <div
          className={`nav-drawer-backdrop ${drawerClosing ? "is-closing" : ""}`}
          onClick={closeNavDrawer}
          role="dialog"
          aria-modal="true"
        >
          <div
            className={`nav-drawer ${drawerClosing ? "is-closing" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="nav-drawer-head">
              <h2>Menu</h2>
              <button
                className="icon-button"
                type="button"
                aria-label="Close menu"
                onClick={closeNavDrawer}
              >
                ×
              </button>
            </div>

            <div className="drawer-section">
              <h3 className="drawer-section-title">Wallet</h3>
              <div className="drawer-balance-row">
                <span>{selectionLabels.x}</span>
                <span>{formatNumber(balances.tokenX)}</span>
              </div>
              <div className="drawer-balance-row">
                <span>{selectionLabels.y}</span>
                <span>{formatNumber(balances.tokenY)}</span>
              </div>
              <div className="drawer-balance-row">
                <span>LP shares</span>
                <span>{formatNumber(balances.lpShares)}</span>
              </div>
              {stacksAddress ? (
                <div className="activity-chip-row" style={{ marginTop: 10 }}>
                  <button
                    className="chip ghost"
                    type="button"
                    onClick={() => void copyToClipboard("Address", stacksAddress)}
                  >
                    Copy address
                  </button>
                  <a
                    className="chip ghost"
                    href={buildExplorerAddressUrl(stacksAddress)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on explorer
                  </a>
                  <button
                    className="chip ghost"
                    type="button"
                    onClick={() =>
                      void copyToClipboard(
                        "Explorer link",
                        buildExplorerAddressUrl(stacksAddress),
                      )
                    }
                  >
                    Copy explorer link
                  </button>
                </div>
              ) : null}
            </div>

            <div className="drawer-section">
              <h3 className="drawer-section-title">Activity</h3>
              <ul className="drawer-activity-list">
                {activityItems.length === 0 ? (
                  <li className="drawer-activity-empty">No recent activity</li>
                ) : (
                  activityItems.slice(0, 5).map((item) => (
                    <li key={item.id} className="drawer-activity-item">
                      <span className="drawer-activity-time">
                        {new Date(item.ts).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="drawer-activity-message">
                        {item.message}
                      </span>
                      <span
                        className={`drawer-activity-status drawer-activity-status-${item.status}`}
                      >
                        {item.status}
                      </span>
                      {item.txid ? (
                        <div className="activity-chip-row">
                          <a
                            className="chip ghost"
                            href={buildExplorerTxUrl(item.txid)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {item.txid.slice(0, 6)}...{item.txid.slice(-6)}
                          </a>
                          <button
                            className="chip ghost"
                            type="button"
                            onClick={() =>
                              void copyToClipboard("Txid", item.txid || "")
                            }
                            aria-label="Copy txid"
                          >
                            Copy
                          </button>
                          <button
                            className="chip ghost"
                            type="button"
                            onClick={() =>
                              void copyToClipboard(
                                "Explorer link",
                                buildExplorerTxUrl(item.txid!),
                              )
                            }
                            aria-label="Copy explorer link"
                          >
                            Copy link
                          </button>
                        </div>
                      ) : null}
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="drawer-section">
              <h3 className="drawer-section-title">Local data</h3>
              <button
                className="tiny ghost"
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  resetAllLocalData();
                }}
              >
                Reset local UI data
              </button>
            </div>

            <nav className="nav-drawer-links">
              <button
                className={activeTab === "swap" ? "is-active" : ""}
                onClick={() => {
                  setActiveTab("swap");
                  setDrawerOpen(false);
                }}
              >
                Trade
              </button>
              <button
                className={activeTab === "prices" ? "is-active" : ""}
                onClick={() => {
                  setActiveTab("prices");
                  setDrawerOpen(false);
                }}
              >
                Prices
              </button>
              <button
                className={activeTab === "pools" ? "is-active" : ""}
                onClick={() => {
                  setActiveTab("pools");
                  setDrawerOpen(false);
                }}
              >
                Pools
              </button>
              <button
                className={activeTab === "analytics" ? "is-active" : ""}
                onClick={() => {
                  setActiveTab("analytics");
                  setDrawerOpen(false);
                }}
              >
                Analytics
              </button>
              <button
                className={activeTab === "liquidity" ? "is-active" : ""}
                onClick={() => {
                  setActiveTab("liquidity");
                  setDrawerOpen(false);
                }}
              >
                Pool
              </button>
              <hr />
              {stacksAddress ? (
                <AddressPill
                  address={stacksAddress}
                  networkLabel={RESOLVED_STACKS_NETWORK}
                  networkMismatch={networkMismatch}
                  onClick={() => {
                    setDrawerOpen(false);
                    openWalletMenu();
                  }}
                />
              ) : (
                <button
                  className="wallet-pill"
                  onClick={() => {
                    handleStacksConnect();
                    setDrawerOpen(false);
                  }}
                >
                  Connect Stacks
                </button>
              )}
            </nav>
          </div>
        </div>
      )}

      <main
        className={`content single ${showMinimalSwapLayout ? "simple-content" : ""}`}
      >
        <section
          className={`panel swap-panel ${showMinimalSwapLayout ? "simple-mode" : ""}`}
        >
          <div className="dashboard-layout">
            {!showMinimalSwapLayout && (
              <aside className="dashboard-sidebar">
                <PortfolioPanel
                  portfolioMetrics={portfolioMetrics}
                  portfolioTotals={portfolioTotals}
                  poolShare={poolShare}
                  lpPosition={lpPosition}
                  formatNumber={formatNumber}
                  formatSignedPercent={formatSignedPercent}
                />
              </aside>
            )}

            <div className="dashboard-main">
              {!showMinimalSwapLayout && (
                <div className="panel-head">
                  <div className="panel-subtitle">
                    {activeTab === "liquidity"
                      ? "Add or remove liquidity from the pool."
                      : activeTab === "pools"
                        ? "Browse pools and jump straight into trading or LP."
                        : "Inspect price movement, reserves, and local activity trends."}
                  </div>
                </div>
              )}

              {stacksAddress && networkMismatch && (
                <div className="note error">
                  <p className="muted small">Network mismatch</p>
                  <strong>
                    Connected address is not {RESOLVED_STACKS_NETWORK}. Swap and
                    LP actions are blocked.
                  </strong>
                  <p className="muted small">
                    Switch your wallet to {RESOLVED_STACKS_NETWORK} or disconnect
                    and reconnect.
                  </p>
                </div>
              )}

              <div
                className={`token-card ${
                  tokenSelectHighlight ? "is-highlighted" : ""
                }`}
                ref={tokenSelectRef}
              >
                <div className="token-card-head">
                  <div>
                    <span className="muted small">Token selection</span>
                    <strong>Choose SIP-010 tokens or STX</strong>
                  </div>
                  <div className="mini-actions">
                    <button
                      className="tiny ghost"
                      onClick={() => {
                        setTokenDraft(tokenSelection);
                        setTokenSelectMessage(null);
                        setTokenValidation({ x: { status: "idle" }, y: { status: "idle" } });
                      }}
                    >
                      Reset
                    </button>
                    <button
                      className="tiny ghost"
                      onClick={() => {
                        setMetadataByPrincipal({});
                        try {
                          localStorage.removeItem(metadataCacheKey);
                        } catch {
                          // ignore storage errors
                        }
                      }}
                    >
                      Clear token cache
                    </button>
                    <button className="tiny" onClick={() => void applyTokenSelection()}>
                      Apply
                    </button>
                  </div>
                </div>
                <div className="dual-input">
                  <div>
                    <label>Preset</label>
                    <select
                      className="token-select"
                      value={
                        PRESET_TOKENS.find((token) => token.id === tokenDraft.xId)
                          ?.id || "custom"
                      }
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === "custom") return;
                        setTokenDraft((prev) => ({
                          ...prev,
                          xId: value,
                          xIsStx: false,
                        }));
                        setTokenValidation((prev) => ({
                          ...prev,
                          x: { status: "idle" },
                        }));
                      }}
                    >
                      <option value="custom">Custom</option>
                      {PRESET_TOKENS.map((token) => (
                        <option key={`x-${token.id}`} value={token.id}>
                          {token.label}
                        </option>
                      ))}
                    </select>
                    <label>Token X (contract::asset)</label>
                    <input
                      type="text"
                      value={tokenDraft.xId}
                      onChange={(e) =>
                        setTokenDraft((prev) => ({
                          ...prev,
                          xId: e.target.value,
                        }))
                      }
                      disabled={tokenDraft.xIsStx}
                      placeholder="SP...contract::asset"
                    />
                    {tokenValidation.x.status === "checking" && (
                      <p className="muted small">Validating token...</p>
                    )}
                    {tokenValidation.x.status === "ok" && !tokenDraft.xIsStx && (
                      <p className="muted small">SIP-010 token verified.</p>
                    )}
                    {tokenValidation.x.status === "error" && (
                      <p className="muted small">{tokenValidation.x.message}</p>
                    )}
                    {!tokenDraft.xIsStx && tokenDraft.xId && (
                      <p className="muted small">
                        {metadataByPrincipal[getTokenPrincipal(tokenDraft.xId)]
                          ?.loading
                          ? "Loading metadata..."
                          : metadataByPrincipal[getTokenPrincipal(tokenDraft.xId)]
                              ?.symbol
                            ? `Detected: ${
                                metadataByPrincipal[
                                  getTokenPrincipal(tokenDraft.xId)
                                ]?.symbol
                              }${
                                metadataByPrincipal[
                                  getTokenPrincipal(tokenDraft.xId)
                                ]?.name
                                  ? ` — ${
                                      metadataByPrincipal[
                                        getTokenPrincipal(tokenDraft.xId)
                                      ]?.name
                                    }`
                                  : ""
                              }`
                            : metadataByPrincipal[
                                  getTokenPrincipal(tokenDraft.xId)
                                ]?.error || "Metadata unavailable"}
                      </p>
                    )}
                    <label className="target-toggle">
                      <input
                        type="checkbox"
                        checked={tokenDraft.xIsStx}
                        onChange={(e) => {
                          setTokenDraft((prev) => ({
                            ...prev,
                            xIsStx: e.target.checked,
                          }));
                          setTokenValidation((prev) => ({
                            ...prev,
                            x: { status: "idle" },
                          }));
                        }}
                      />
                      Use STX
                    </label>
                  </div>
                  <div>
                    <label>Preset</label>
                    <select
                      className="token-select"
                      value={
                        PRESET_TOKENS.find((token) => token.id === tokenDraft.yId)
                          ?.id || "custom"
                      }
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === "custom") return;
                        setTokenDraft((prev) => ({
                          ...prev,
                          yId: value,
                          yIsStx: false,
                        }));
                        setTokenValidation((prev) => ({
                          ...prev,
                          y: { status: "idle" },
                        }));
                      }}
                    >
                      <option value="custom">Custom</option>
                      {PRESET_TOKENS.map((token) => (
                        <option key={`y-${token.id}`} value={token.id}>
                          {token.label}
                        </option>
                      ))}
                    </select>
                    <label>Token Y (contract::asset)</label>
                    <input
                      type="text"
                      value={tokenDraft.yId}
                      onChange={(e) =>
                        setTokenDraft((prev) => ({
                          ...prev,
                          yId: e.target.value,
                        }))
                      }
                      disabled={tokenDraft.yIsStx}
                      placeholder="SP...contract::asset"
                    />
                    {tokenValidation.y.status === "checking" && (
                      <p className="muted small">Validating token...</p>
                    )}
                    {tokenValidation.y.status === "ok" && !tokenDraft.yIsStx && (
                      <p className="muted small">SIP-010 token verified.</p>
                    )}
                    {tokenValidation.y.status === "error" && (
                      <p className="muted small">{tokenValidation.y.message}</p>
                    )}
                    {!tokenDraft.yIsStx && tokenDraft.yId && (
                      <p className="muted small">
                        {metadataByPrincipal[getTokenPrincipal(tokenDraft.yId)]
                          ?.loading
                          ? "Loading metadata..."
                          : metadataByPrincipal[getTokenPrincipal(tokenDraft.yId)]
                              ?.symbol
                            ? `Detected: ${
                                metadataByPrincipal[
                                  getTokenPrincipal(tokenDraft.yId)
                                ]?.symbol
                              }${
                                metadataByPrincipal[
                                  getTokenPrincipal(tokenDraft.yId)
                                ]?.name
                                  ? ` — ${
                                      metadataByPrincipal[
                                        getTokenPrincipal(tokenDraft.yId)
                                      ]?.name
                                    }`
                                  : ""
                              }`
                            : metadataByPrincipal[
                                  getTokenPrincipal(tokenDraft.yId)
                                ]?.error || "Metadata unavailable"}
                      </p>
                    )}
                    <label className="target-toggle">
                      <input
                        type="checkbox"
                        checked={tokenDraft.yIsStx}
                        onChange={(e) => {
                          setTokenDraft((prev) => ({
                            ...prev,
                            yIsStx: e.target.checked,
                          }));
                          setTokenValidation((prev) => ({
                            ...prev,
                            y: { status: "idle" },
                          }));
                        }}
                      />
                      Use STX
                    </label>
                  </div>
                </div>
                <p className="muted small">
                  For SIP-010 tokens, use the full asset id format
                  `contract::asset`. STX uses your native balance.
                </p>
                {tokenMismatchWarning && (
                  <div className="note subtle">
                    <p className="muted small">Pool token mismatch</p>
                    <strong>
                      Pool: {tokenMismatchWarning.pool} · Selected:{" "}
                      {tokenMismatchWarning.selected}
                    </strong>
                    <p className="muted small">
                      Swaps and liquidity will fail unless you select the same
                      tokens as the initialized pool.
                    </p>
                  </div>
                )}
                {tokenSelectMessage && (
                  <p className="muted small">{tokenSelectMessage}</p>
                )}
                <TokenDiscoverPanel
                  resolvedStacksNetwork={RESOLVED_STACKS_NETWORK}
                  seedTokens={tokenDiscoverSeeds}
                  selected={{
                    xId: tokenDraft.xId,
                    yId: tokenDraft.yId,
                    xIsStx: tokenDraft.xIsStx,
                    yIsStx: tokenDraft.yIsStx,
                  }}
                  metadataByPrincipal={metadataByPrincipal}
                  getTokenPrincipal={getTokenPrincipal}
                  validateSip10Token={validateSip10Token}
                  onPickToken={pickDiscoverToken}
                />
              </div>

              {pendingTxs.length > 0 && (
                <div className="note subtle pending-tracker">
                  <div className="activity-head">
                    <div>
                      <p className="eyebrow">Pending</p>
                      <h3>
                        {pendingTxs.length} transaction
                        {pendingTxs.length === 1 ? "" : "s"} in flight
                      </h3>
                    </div>
                    <div className="mini-actions">
                      <button
                        className="tiny ghost"
                        onClick={() => void handleManualRefresh()}
                        disabled={poolPending}
                      >
                        Refresh now
                      </button>
                      {pendingTxs[0]?.txid ? (
                        <a
                          className="tiny ghost"
                          href={buildExplorerTxUrl(pendingTxs[0]!.txid!)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View latest
                        </a>
                      ) : null}
                    </div>
                  </div>
                  <p className="muted small">
                    We are polling the chain and will refresh balances on
                    confirmation.
                  </p>
                  <div className="pending-tracker-list">
                    {pendingTxSummary.map((item) => (
                      <div className="pending-tracker-item" key={item.id}>
                        <div className="pending-tracker-main">
                          <div>
                            <strong>{item.message}</strong>
                            <p className="muted small">
                              {item.trackerLabel}
                              {item.lastCheckedAt
                                ? ` · checked ${formatRelativeTime(item.lastCheckedAt)}`
                                : ""}
                            </p>
                          </div>
                          <span className="chip ghost status-submitted">
                            tracking
                          </span>
                        </div>
                        <div className="pending-tracker-meta">
                          <span className="muted small">
                            Submitted {formatRelativeTime(item.submittedAt || item.ts)}
                          </span>
                          {item.txid ? (
                            <div className="mini-actions">
                              <a
                                className="tiny ghost"
                                href={buildExplorerTxUrl(item.txid)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {item.txid.slice(0, 6)}...{item.txid.slice(-6)}
                              </a>
                              <button
                                className="tiny ghost"
                                type="button"
                                onClick={() =>
                                  void copyToClipboard("Txid", item.txid || "")
                                }
                              >
                                Copy
                              </button>
                              <button
                                className="tiny ghost"
                                type="button"
                                onClick={() =>
                                  void copyToClipboard(
                                    "Explorer link",
                                    buildExplorerTxUrl(item.txid || ""),
                                  )
                                }
                              >
                                Copy link
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "swap" ? (
                <SwapCard
                  showMinimalSwapLayout={showMinimalSwapLayout}
                  poolContract={poolContract}
                  FEE_BPS={FEE_BPS}
                  tokenLabels={selectionLabels}
                  tokenIcons={selectionIcons}
                  tokenIsStx={tokenIsStx}
                  poolTokenLabels={poolTokenLabels}
                  poolTokenIcons={poolTokenIcons}
                  poolTokenIsStx={{
                    x: !!tokenInfo?.tokenXIsStx,
                    y: !!tokenInfo?.tokenYIsStx,
                  }}
                  tokenInfo={tokenInfo}
                  tokenMismatch={!!tokenMismatchWarning}
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
                  lastPoolRefreshAt={lastPoolRefreshAt}
                  handleCopySwapSnapshot={handleCopySwapSnapshot}
                  priceImpact={priceImpact}
                  slippageRatio={slippageRatio}
                  PRICE_IMPACT_WARN_PCT={PRICE_IMPACT_WARN_PCT}
                  PRICE_IMPACT_CONFIRM_PCT={PRICE_IMPACT_CONFIRM_PCT}
                  PRICE_IMPACT_BLOCK_PCT={PRICE_IMPACT_BLOCK_PCT}
                  suggestedSlippagePercent={suggestedSlippagePercent}
                  splitSuggestionCount={splitSuggestionCount}
                  applySplitSuggestion={applySplitSuggestion}
                  impactConfirmed={impactConfirmed}
                  setImpactConfirmed={setImpactConfirmed}
                  slippageInput={slippageInput}
                  setSlippageInput={setSlippageInput}
                  highSlippageRequired={highSlippageRequired}
                  highSlippageConfirmed={highSlippageConfirmed}
                  setHighSlippageConfirmed={setHighSlippageConfirmed}
                  deadlineMinutesInput={deadlineMinutesInput}
                  setDeadlineMinutesInput={setDeadlineMinutesInput}
                  onResetSwapSettings={resetSwapSettings}
                  customTokenRequired={customTokenRequired}
                  customTokenConfirmed={customTokenConfirmed}
                  setCustomTokenConfirmed={setCustomTokenConfirmed}
                  networkMismatch={networkMismatch}
                  resolvedStacksNetwork={RESOLVED_STACKS_NETWORK}
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
                  onGoToPool={() => setActiveTab("liquidity")}
                  onMintFaucet={() => handleFaucet()}
                  onOpenTokenSelector={handleOpenTokenSelector}
                  faucetPending={faucetPending}
                  faucetCooldownActive={faucetCooldownActive}
                  faucetCooldownLabel={faucetCooldownLabel}
                />
              ) : activeTab === "prices" ? (
                <div className="prices-stack">
                  <MarketChartPanel
                    markets={marketChartMarkets}
                    formatNumber={formatNumber}
                  />
                  <TradeSimulatorPanel
                    markets={marketChartMarkets}
                    formatNumber={formatNumber}
                  />
                  <PriceBoardPanel
                    markets={priceBoardMarkets}
                    formatNumber={formatNumber}
                    formatCompactNumber={formatCompactNumber}
                    formatSignedPercent={formatSignedPercent}
                    storageKey={priceBoardStorageKey}
                  />
                </div>
              ) : activeTab === "liquidity" ? (
                <Suspense
                  fallback={<div className="note subtle">Loading pool...</div>}
                >
                  <LiquidityCard
                    handleSyncToPoolRatio={handleSyncToPoolRatio}
                    handleSyncToPoolRatioFromY={handleSyncToPoolRatioFromY}
                    setMaxLiquidity={setMaxLiquidity}
                    handleFaucet={handleFaucet}
                    faucetPending={faucetPending}
                    tokenLabels={selectionLabels}
                    tokenIcons={selectionIcons}
                    tokenIsStx={tokenIsStx}
                    poolTokenLabels={poolTokenLabels}
                    poolTokenIcons={poolTokenIcons}
                    poolTokenIsStx={{
                      x: !!tokenInfo?.tokenXIsStx,
                      y: !!tokenInfo?.tokenYIsStx,
                    }}
                    tokenInfo={tokenInfo}
                    tokenMismatch={!!tokenMismatchWarning}
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
                    lpPosition={lpPosition}
                    portfolioTotals={portfolioTotals}
                    portfolioMetrics={portfolioMetrics}
                    feeEstimates={lpFeeEstimates}
                    claimableFees={claimableFees}
                    formatSignedPercent={formatSignedPercent}
                    pool={pool}
                    liquidityPreview={liquidityPreview}
                    initialLiquidityTooSmall={initialLiquidityTooSmall}
                    handleRemoveLiquidity={handleRemoveLiquidity}
                    recentSwaps={recentSwaps}
                    resolvedStacksNetwork={RESOLVED_STACKS_NETWORK}
                    onViewAllActivity={() => setActivityDrawerOpen(true)}
                    activityCount={activityItems.length}
                  />
                </Suspense>
              ) : activeTab === "pools" ? (
                <PoolListPanel
                  pools={poolList}
                  search={poolSearch}
                  setSearch={setPoolSearch}
                  favoritesOnly={poolFavoritesOnly}
                  setFavoritesOnly={setPoolFavoritesOnly}
                  sort={poolSort}
                  setSort={setPoolSort}
                  sortDir={poolSortDir}
                  setSortDir={setPoolSortDir}
                  favorites={favoritePools}
                  toggleFavorite={toggleFavoritePool}
                  clearFavorites={clearFavoritePools}
                  recentPools={recentPoolsForPanel}
                  clearRecentPools={clearRecentPools}
                  onResetFilters={() => {
                    setPoolSearch("");
                    setPoolFavoritesOnly(false);
                    setPoolSort("tvl");
                    setPoolSortDir("desc");
                  }}
                  onOpenPool={handleOpenPoolFromList}
                  onCopyPoolId={(id) => void copyToClipboard("Pool contract", id)}
                  resolvedStacksNetwork={RESOLVED_STACKS_NETWORK}
                  formatCompactNumber={formatCompactNumber}
                  formatNumber={formatNumber}
                />
              ) : (
                <Suspense
                  fallback={
                    <div className="note subtle">Loading analytics...</div>
                  }
                >
                  <AnalyticsPanel
                    analytics={analytics}
                    portfolioMetrics={portfolioMetrics}
                    currentPrice={currentPrice}
                    pool={pool}
                    poolShare={poolShare}
                    poolHistory={poolHistory}
                    portfolioHistoryCount={portfolioHistory.length}
                    activityItems={activityItems}
                    tokenLabels={selectionLabels}
                    onExportPortfolioCsv={exportPortfolioHistoryCsv}
                    onExportPoolCsv={exportPoolHistoryCsv}
                    onClearPortfolioHistory={clearPortfolioHistory}
                    onClearPoolHistory={clearPoolHistory}
                    formatNumber={formatNumber}
                    formatSignedPercent={formatSignedPercent}
                    formatCompactNumber={formatCompactNumber}
                  />
                </Suspense>
              )}

              {!showMinimalSwapLayout && faucetTxids.length > 0 && (
                <div className="note subtle">
                  <div className="activity-head">
                    <p className="muted small">Recent faucet tx</p>
                    <div className="mini-actions">
                      <button
                        className="tiny ghost"
                        type="button"
                        onClick={() =>
                          void copyToClipboard("Faucet txids", faucetTxids.join("\n"))
                        }
                      >
                        Copy all
                      </button>
                      <button
                        className="tiny ghost"
                        type="button"
                        onClick={() => {
                          setFaucetTxids([]);
                          pushToast("Cleared faucet tx list.", "success");
                        }}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="chip-row">
                    {faucetTxids.map((txid) => (
                      <div className="mini-actions" key={txid}>
                        <a
                          className="chip ghost"
                          href={buildExplorerTxUrl(txid)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {txid.slice(0, 6)}...{txid.slice(-6)}
                        </a>
                        <button
                          className="chip ghost"
                          type="button"
                          onClick={() => void copyToClipboard("Txid", txid)}
                        >
                          Copy
                        </button>
                        <button
                          className="chip ghost"
                          type="button"
                          onClick={() =>
                            void copyToClipboard("Explorer link", buildExplorerTxUrl(txid))
                          }
                        >
                          Copy link
                        </button>
                      </div>
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
      <SwapConfirmModal
        open={Boolean(swapConfirmDraft)}
        draft={swapConfirmDraft}
        fromLabel={swapDirection === "x-to-y" ? selectionLabels.x : selectionLabels.y}
        toLabel={swapDirection === "x-to-y" ? selectionLabels.y : selectionLabels.x}
        resolvedStacksNetwork={RESOLVED_STACKS_NETWORK}
        priceMovePct={swapConfirmPriceMovePct}
        priceMoved={swapConfirmPriceMoved}
        refreshingQuote={swapConfirmRefreshing}
        onRefreshQuote={() => void refreshSwapConfirmDraft()}
        onClose={closeSwapConfirm}
        onConfirm={() => void confirmSwapAndSign()}
        onCopy={(text) => void copyToClipboard("Swap details", text)}
        formatNumber={formatNumber}
      />
      <WalletMenuModal
        open={walletMenuOpen}
        address={stacksAddress}
        resolvedStacksNetwork={RESOLVED_STACKS_NETWORK}
        networkMismatch={networkMismatch}
        onClose={closeWalletMenu}
        onCopyAddress={(address) => void copyToClipboard("Address", address)}
        onDisconnect={() => {
          handleStacksDisconnect();
          closeWalletMenu();
        }}
      />
      <CommandPaletteModal
        open={commandPaletteOpen}
        query={commandQuery}
        setQuery={setCommandQuery}
        items={commandItems}
        onClose={closeCommandPalette}
      />
      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast-item toast-${toast.tone}`}
            role="status"
          >
            <div className="toast-item-body">
              <span className="toast-item-message">{toast.message}</span>
              {toast.actionHref ? (
                <a
                  className="toast-action"
                  href={toast.actionHref}
                  target="_blank"
                  rel="noreferrer"
                >
                  {toast.actionLabel || "View"}
                </a>
              ) : null}
            </div>
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
          disabled={faucetPending || faucetCooldownActive}
          title={
            faucetCooldownActive
              ? `Cooldown ${faucetCooldownLabel}`
              : "Mint token X from faucet"
          }
        >
          {faucetPending
            ? "Loading..."
            : faucetCooldownActive
              ? `Cooldown ${faucetCooldownLabel}`
              : "X Faucet"}
        </button>
        <button
          className="chip"
          onClick={() => handleFaucet("y")}
          disabled={faucetPending || faucetCooldownActive}
          title={
            faucetCooldownActive
              ? `Cooldown ${faucetCooldownLabel}`
              : "Mint token Y from faucet"
          }
        >
          {faucetPending
            ? "Loading..."
            : faucetCooldownActive
              ? `Cooldown ${faucetCooldownLabel}`
              : "Y Faucet"}
        </button>
        <button
          className="chip"
          onClick={() => handleFaucet()}
          disabled={faucetPending || faucetCooldownActive}
          title={
            faucetCooldownActive
              ? `Cooldown ${faucetCooldownLabel}`
              : "Mint token X and Y from faucet"
          }
        >
          {faucetPending
            ? "Loading..."
            : faucetCooldownActive
              ? `Cooldown ${faucetCooldownLabel}`
              : "XY Faucet"}
        </button>
      </div>
      {poolPending && <span className="sr-only">Loading pool data</span>}
    </div>
  );
}

export default App;
