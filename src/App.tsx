import { useEffect, useMemo, useState } from 'react'
import { connect, openContractCall } from '@stacks/connect'
import {
  AnchorMode,
  PostConditionMode,
  contractPrincipalCV,
  cvToValue,
  fetchCallReadOnlyFunction,
  standardPrincipalCV,
  uintCV,
} from '@stacks/transactions'
import { STACKS_TESTNET, createNetwork } from '@stacks/network'
import './App.css'
import { appKit } from './wallets/appkit'

type PoolState = {
  reserveX: number
  reserveY: number
  totalShares: number
}

type Balances = {
  tokenX: number
  tokenY: number
  lpShares: number
}

const FEE_BPS = 30
const BPS = 10_000
const FAUCET_AMOUNT = 5_000
const STACKS_NETWORK_NAME = 'testnet'
const STACKS_NETWORK = STACKS_NETWORK_NAME
const STACKS_API =
  (typeof import.meta !== 'undefined' &&
    (import.meta as { env?: Record<string, string | undefined> })?.env?.[
      'VITE_STACKS_API'
    ]) ||
  'https://api.testnet.hiro.so'
const CONTRACT_ADDRESS =
  (typeof import.meta !== 'undefined' &&
    (import.meta as { env?: Record<string, string | undefined> })?.env?.[
      'VITE_CONTRACT_ADDRESS'
    ]) ||
  'ST1G4ZDXED8XM2XJ4Q4GJ7F4PG4EJQ1KKXVPSAX13'

const normalizeTokenId = (value: string | undefined, assetName: string) => {
  if (value?.includes('::')) return value
  if (value) return `${value}::${assetName}`
  return ''
}

const TOKEN_CONTRACTS = {
  x:
    normalizeTokenId(
      (typeof import.meta !== 'undefined' &&
        (import.meta as { env?: Record<string, string | undefined> })?.env?.[
          'VITE_TOKEN_X'
        ]) as string | undefined,
      'token-x'
    ) || `${CONTRACT_ADDRESS}.token-x::token-x`,
  y:
    normalizeTokenId(
      (typeof import.meta !== 'undefined' &&
        (import.meta as { env?: Record<string, string | undefined> })?.env?.[
          'VITE_TOKEN_Y'
        ]) as string | undefined,
      'token-y'
    ) || `${CONTRACT_ADDRESS}.token-y::token-y`,
}
const TOKEN_DECIMALS = 1_000_000
const MINIMUM_LIQUIDITY = 1_000n
const POOL_CONTRACT_ID =
  (typeof import.meta !== 'undefined' &&
    (import.meta as { env?: Record<string, string | undefined> })?.env?.[
      'VITE_POOL_CONTRACT'
    ]) ||
  `${CONTRACT_ADDRESS}.pool-v5`
const FAUCET_API =
  (typeof import.meta !== 'undefined' &&
    (import.meta as { env?: Record<string, string | undefined> })?.env?.[
      'VITE_FAUCET_URL'
    ]) ||
  'http://localhost:8787'

const shortAddress = (addr: string) =>
  addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr

const formatNumber = (value: number) =>
  value.toLocaleString(undefined, {
    maximumFractionDigits: 6,
    minimumFractionDigits: 0,
  })

const isTestnetAddress = (addr: string | null) =>
  !!addr && /^S[NT][A-Z0-9]{38,}$/.test(addr)

const parseContractId = (id: string) => {
  const [address, nameWithAsset] = id.split('.')
  const contractName = (nameWithAsset || '').split('::')[0]
  return { address, contractName }
}

const bigintSqrt = (value: bigint) => {
  if (value < 0n) throw new Error('sqrt only works on non-negative inputs')
  if (value < 2n) return value
  let x0 = BigInt(Math.floor(Math.sqrt(Number(value))))
  let x1 = (x0 + value / x0) >> 1n
  while (x1 < x0) {
    x0 = x1
    x1 = (x0 + value / x0) >> 1n
  }
  return x0
}

function App() {
  const [pool, setPool] = useState<PoolState>({
    reserveX: 0,
    reserveY: 0,
    totalShares: 0,
  })

  const [balances, setBalances] = useState<Balances>({
    tokenX: 0,
    tokenY: 0,
    lpShares: 0,
  })
  const [faucetTxids, setFaucetTxids] = useState<string[]>([])

  const [activeTab, setActiveTab] = useState<'swap' | 'liquidity'>('swap')
  const [swapDirection, setSwapDirection] = useState<'x-to-y' | 'y-to-x'>(
    'x-to-y'
  )
  const [swapInput, setSwapInput] = useState('100')
  const [swapOutput, setSwapOutput] = useState<number | null>(null)
  const [swapMessage, setSwapMessage] = useState<string | null>(null)

  const [liqX, setLiqX] = useState('1200')
  const [liqY, setLiqY] = useState('1200')
  const [liqMessage, setLiqMessage] = useState<string | null>(null)

  const [burnShares, setBurnShares] = useState('0')
  const [burnMessage, setBurnMessage] = useState<string | null>(null)

  const [faucetMessage, setFaucetMessage] = useState<string | null>(null)
  const [faucetPending, setFaucetPending] = useState(false)

  const [stacksAddress, setStacksAddress] = useState<string | null>(null)
  const [btcStatus, setBtcStatus] = useState<string | null>(null)
  const [balancePending, setBalancePending] = useState(false)
  const [poolPending, setPoolPending] = useState(false)

  const network = useMemo(
    () =>
      createNetwork({
        ...STACKS_TESTNET,
        client: { baseUrl: STACKS_API },
      }),
    [STACKS_API]
  )
  const poolContract = useMemo(() => parseContractId(POOL_CONTRACT_ID), [])
  const tokenContracts = useMemo(
    () => ({
      x: parseContractId(TOKEN_CONTRACTS.x),
      y: parseContractId(TOKEN_CONTRACTS.y),
    }),
    []
  )

  const fetchTipHeight = async () => {
    const res = await fetch(`${STACKS_API}/extended/v1/info`)
    if (!res.ok) return 0
    const data = await res.json().catch(() => ({}))
    return Number(data?.stacks_tip_height || 0)
  }

  const fetchPoolState = async (address?: string | null) => {
    setPoolPending(true)
    try {
      const senderAddress = address || CONTRACT_ADDRESS
      const reserves = await fetchCallReadOnlyFunction({
        contractAddress: poolContract.address,
        contractName: poolContract.contractName,
        functionName: 'get-reserves',
        functionArgs: [],
        senderAddress,
        network,
      })
      const totalSupply = await fetchCallReadOnlyFunction({
        contractAddress: poolContract.address,
        contractName: poolContract.contractName,
        functionName: 'get-total-supply',
        functionArgs: [],
        senderAddress,
        network,
      })
      const lpBalance =
        address &&
        (await fetchCallReadOnlyFunction({
          contractAddress: poolContract.address,
          contractName: poolContract.contractName,
          functionName: 'get-lp-balance',
          functionArgs: [standardPrincipalCV(address)],
          senderAddress,
          network,
        }))

      const reserveValue = cvToValue(reserves) as { x: string; y: string }
      const totalSupplyValue = Number(cvToValue(totalSupply) || 0)
      const lpBalanceValue = lpBalance ? Number(cvToValue(lpBalance) || 0) : 0

      setPool({
        reserveX: Number(reserveValue?.x || 0) / TOKEN_DECIMALS,
        reserveY: Number(reserveValue?.y || 0) / TOKEN_DECIMALS,
        totalShares: totalSupplyValue,
      })
      if (address) {
        setBalances((prev) => ({
          ...prev,
          lpShares: lpBalanceValue,
        }))
      }
    } catch (error) {
      console.warn('Pool state fetch failed', error)
    } finally {
      setPoolPending(false)
    }
  }

  const fetchOnChainBalances = async (address: string) => {
    const response = await fetch(
      `${STACKS_API}/extended/v1/address/${address}/balances`
    )
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(
        `Failed to fetch balances from Stacks API (${response.status}). ${errorText}`
      )
    }
    const data = await response.json()
    const fungible = data?.fungible_tokens || {}
    const tokenX = fungible[TOKEN_CONTRACTS.x]
    const tokenY = fungible[TOKEN_CONTRACTS.y]
    const normalize = (balance?: { balance?: string }) =>
      balance?.balance ? Number(balance.balance) / TOKEN_DECIMALS : 0

    const missing = []
    if (!tokenX) missing.push(TOKEN_CONTRACTS.x)
    if (!tokenY) missing.push(TOKEN_CONTRACTS.y)

    return {
      tokenX: normalize(tokenX),
      tokenY: normalize(tokenY),
      missing,
      found: Object.keys(fungible || {}),
    }
  }

  const fetchPoolReserves = async (address?: string | null) => {
    const senderAddress = address || CONTRACT_ADDRESS
    const reserves = await fetchCallReadOnlyFunction({
      contractAddress: poolContract.address,
      contractName: poolContract.contractName,
      functionName: 'get-reserves',
      functionArgs: [],
      senderAddress,
      network,
    })
    return cvToValue(reserves) as { x: string; y: string }
  }

  const syncBalances = async (address: string, opts?: { silent?: boolean }) => {
    if (!address) return
    try {
      setBalancePending(true)
      if (!opts?.silent) {
        setFaucetMessage('Refreshing on-chain balances from testnet...')
      }
      const next = await fetchOnChainBalances(address)
      const reserves = await fetchPoolReserves(address)
      setBalances((prev) => ({
        ...prev,
        tokenX: next.tokenX ?? prev.tokenX,
        tokenY: next.tokenY ?? prev.tokenY,
      }))
      setPool((prev) => ({
        ...prev,
        reserveX: Number(reserves?.x || 0) / TOKEN_DECIMALS,
        reserveY: Number(reserves?.y || 0) / TOKEN_DECIMALS,
      }))
      await fetchPoolState(address)
      if (!opts?.silent) {
        const missing = next.missing?.length
          ? `Missing: ${next.missing.join(' & ')}`
          : 'Loaded on-chain balances from testnet.'
        setFaucetMessage(missing)
      }
    } catch (error) {
      if (!opts?.silent) {
        setFaucetMessage(
          error instanceof Error
            ? error.message
            : 'Could not load on-chain balances.'
        )
      }
    } finally {
      setBalancePending(false)
    }
  }

  useEffect(() => {
    fetchPoolState(stacksAddress)
  }, [stacksAddress])

  useEffect(() => {
    fetchPoolState(stacksAddress)
  }, [])

  const handleStacksConnect = async () => {
    try {
      const result = await connect({
        forceWalletSelect: true,
        network: STACKS_NETWORK_NAME,
      })

      const addr = result?.addresses
        ?.map((entry: any) =>
          typeof entry === 'string' ? entry : (entry?.address as string | undefined)
        )
        .find((a: string | undefined) => isTestnetAddress(a || null))

      if (!addr) {
        throw new Error('No Stacks testnet address returned. Switch wallet to a Stacks testnet account.')
      }

      setStacksAddress(addr)
      await syncBalances(addr)
    } catch (error) {
      console.error('Stacks connect error', error)
      setStacksAddress(null)
      setFaucetMessage(
        error instanceof Error
          ? error.message
          : 'Failed to connect a Stacks testnet wallet. Use an ST/SN address.'
      )
    }
  }

  const handleStacksDisconnect = () => {
    setStacksAddress(null)
    try {
      localStorage.removeItem('stacks-connect-selected-provider')
      localStorage.removeItem('stacks-connect-addresses')
    } catch (error) {
      console.warn('Stacks disconnect cleanup failed', error)
    }
  }

  const handleBtcConnect = () => {
    setBtcStatus('Opening modal…')
    appKit
      .open({ view: 'Connect' })
      .then(() =>
        setBtcStatus('Modal open: select Leather, Xverse, or WalletConnect.')
      )
      .catch((error) => {
        console.error('Bitcoin connect error', error)
        setBtcStatus('Could not open modal. Check WalletConnect project id and extensions.')
      })
  }

  const handleBtcDisconnect = () => {
    setBtcStatus(null)
  }

  const poolShare = useMemo(() => {
    if (pool.totalShares === 0) return 0
    return balances.lpShares / pool.totalShares
  }, [balances.lpShares, pool.totalShares])

  const currentPrice = useMemo(() => {
    if (pool.reserveX === 0 || pool.reserveY === 0) return 0
    return pool.reserveY / pool.reserveX
  }, [pool.reserveX, pool.reserveY])

  const quoteSwap = (amount: number, fromX: boolean) => {
    const reserveIn = fromX ? pool.reserveX : pool.reserveY
    const reserveOut = fromX ? pool.reserveY : pool.reserveX
    if (amount <= 0 || reserveIn <= 0 || reserveOut <= 0) return 0
    const fee = (amount * FEE_BPS) / BPS
    const amountAfterFee = amount - fee
    return (reserveOut * amountAfterFee) / (reserveIn + amountAfterFee)
  }

  const handleSwap = async () => {
    setSwapMessage(null)
    const amount = Number(swapInput)
    if (!amount || amount <= 0) {
      setSwapMessage('Enter an amount greater than 0.')
      return
    }
    if (!stacksAddress) {
      setSwapMessage('Connect a Stacks wallet first.')
      return
    }
    if (pool.reserveX <= 0 || pool.reserveY <= 0) {
      setSwapMessage('Pool has no liquidity yet. Add liquidity first.')
      return
    }
    const fromX = swapDirection === 'x-to-y'
    const inputBalance = fromX ? balances.tokenX : balances.tokenY
    if (amount > inputBalance) {
      setSwapMessage('Not enough balance for this swap.')
      return
    }
    const outputPreview = quoteSwap(amount, fromX)
    setSwapOutput(outputPreview)
    if (outputPreview <= 0) {
      setSwapMessage('Pool has no liquidity for this direction yet.')
      return
    }
    const amountMicro = BigInt(Math.floor(amount * TOKEN_DECIMALS))
    const minOutMicro = BigInt(0)
    const tip = await fetchTipHeight()
    const deadline = tip > 0 ? BigInt(tip + 20) : BigInt(0)

    const functionName = fromX ? 'swap-x-for-y' : 'swap-y-for-x'
    const functionArgs = fromX
      ? [
          contractPrincipalCV(tokenContracts.x.address, tokenContracts.x.contractName),
          contractPrincipalCV(tokenContracts.y.address, tokenContracts.y.contractName),
          uintCV(amountMicro),
          uintCV(minOutMicro),
          standardPrincipalCV(stacksAddress),
          uintCV(deadline),
        ]
      : [
          contractPrincipalCV(tokenContracts.x.address, tokenContracts.x.contractName),
          contractPrincipalCV(tokenContracts.y.address, tokenContracts.y.contractName),
          uintCV(amountMicro),
          uintCV(minOutMicro),
          standardPrincipalCV(stacksAddress),
          uintCV(deadline),
        ]

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
          setSwapMessage(`Swap submitted. Txid: ${payload.txId}`)
          await syncBalances(stacksAddress, { silent: true })
          await fetchPoolState(stacksAddress)
        },
        onCancel: () => setSwapMessage('Swap cancelled.'),
      })
    } catch (error) {
      setSwapMessage(
        error instanceof Error ? error.message : 'Swap failed. Check wallet and try again.'
      )
    }
  }

  const handleAddLiquidity = async () => {
    setLiqMessage(null)
    const amountX = Number(liqX)
    const amountY = Number(liqY)
    if (amountX <= 0 || amountY <= 0) {
      setLiqMessage('Enter positive amounts for both tokens.')
      return
    }
    if (!stacksAddress) {
      setLiqMessage('Connect a Stacks wallet first.')
      return
    }
    const initializing = pool.totalShares === 0
    const amountXMicro = BigInt(Math.floor(amountX * TOKEN_DECIMALS))
    const amountYMicro = BigInt(Math.floor(amountY * TOKEN_DECIMALS))
    const minShares = BigInt(0)

    if (initializing) {
      const shares = bigintSqrt(amountXMicro * amountYMicro)
      if (shares <= MINIMUM_LIQUIDITY) {
        setLiqMessage(
          `Deposit too small to initialize pool. Need > ${MINIMUM_LIQUIDITY.toString()} initial shares (try larger amounts).`
        )
        return
      }
    }

    const functionName = initializing ? 'initialize-pool' : 'add-liquidity'
    const functionArgs = initializing
      ? [
          contractPrincipalCV(tokenContracts.x.address, tokenContracts.x.contractName),
          contractPrincipalCV(tokenContracts.y.address, tokenContracts.y.contractName),
          uintCV(amountXMicro),
          uintCV(amountYMicro),
        ]
      : [
          contractPrincipalCV(tokenContracts.x.address, tokenContracts.x.contractName),
          contractPrincipalCV(tokenContracts.y.address, tokenContracts.y.contractName),
          uintCV(amountXMicro),
          uintCV(amountYMicro),
          uintCV(minShares),
        ]

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
          setLiqMessage(`Liquidity submitted. Txid: ${payload.txId}`)
          await syncBalances(stacksAddress, { silent: true })
          await fetchPoolState(stacksAddress)
        },
        onCancel: () => setLiqMessage('Liquidity cancelled.'),
      })
    } catch (error) {
      setLiqMessage(
        error instanceof Error
          ? error.message
          : 'Liquidity add failed. Check wallet and try again.'
      )
    }
  }

  const handleRemoveLiquidity = async () => {
    setBurnMessage(null)
    const shares = Number(burnShares)
    if (shares <= 0) {
      setBurnMessage('Enter a share amount greater than 0.')
      return
    }
    if (!stacksAddress) {
      setBurnMessage('Connect a Stacks wallet first.')
      return
    }
    const sharesUint = BigInt(Math.floor(shares))
    const minX = BigInt(0)
    const minY = BigInt(0)

    try {
      await openContractCall({
        network,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Allow,
        contractAddress: poolContract.address,
        contractName: poolContract.contractName,
        functionName: 'remove-liquidity',
        functionArgs: [
          contractPrincipalCV(tokenContracts.x.address, tokenContracts.x.contractName),
          contractPrincipalCV(tokenContracts.y.address, tokenContracts.y.contractName),
          uintCV(sharesUint),
          uintCV(minX),
          uintCV(minY),
        ],
        onFinish: async (payload) => {
          setBurnMessage(`Remove liquidity submitted. Txid: ${payload.txId}`)
          await syncBalances(stacksAddress, { silent: true })
          await fetchPoolState(stacksAddress)
        },
        onCancel: () => setBurnMessage('Remove liquidity cancelled.'),
      })
    } catch (error) {
      setBurnMessage(
        error instanceof Error
          ? error.message
          : 'Remove liquidity failed. Check wallet and try again.'
      )
    }
  }

  const requestFaucet = async (token: 'x' | 'y') => {
    if (!stacksAddress) {
      throw new Error('Connect a Stacks wallet to receive testnet tokens.')
    }
    if (!isTestnetAddress(stacksAddress)) {
      throw new Error('Connected address is not testnet (must start with ST or SN). Switch wallet to testnet.')
    }
    const response = await fetch(`${FAUCET_API}/faucet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: stacksAddress, token }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data.error || 'Faucet request failed.')
    }
    return data
  }

  const handleFaucet = async (token?: 'x' | 'y') => {
    try {
      setFaucetPending(true)
      setFaucetMessage('Requesting testnet faucet mint...')
      const targets = token ? [token] : ['x', 'y']
      const results = []
      for (const t of targets) {
        const res = await requestFaucet(t as 'x' | 'y')
        results.push(`${t.toUpperCase()}: ${res.txid}`)
      }
      setFaucetTxids(results.map((entry) => entry.split(': ')[1] || entry))
      setBalances((prev) => ({
        tokenX: prev.tokenX + (targets.includes('x') ? FAUCET_AMOUNT : 0),
        tokenY: prev.tokenY + (targets.includes('y') ? FAUCET_AMOUNT : 0),
        lpShares: prev.lpShares,
      }))
      setFaucetMessage(
        `Faucet sent ${targets.map((t) => t.toUpperCase()).join(' & ')} on testnet. Txid(s): ${results.join(
          ' | '
        )}`
      )
      if (stacksAddress) {
        setFaucetMessage(
          `Faucet sent ${targets
            .map((t) => t.toUpperCase())
            .join(' & ')} on testnet. Txid(s): ${results.join(
            ' | '
          )} (click Refresh after confirmation to show on-chain balance).`
        )
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Faucet failed. Try again.'
      setFaucetMessage(message)
    } finally {
      setFaucetPending(false)
    }
  }

  const handleSyncToPoolRatio = () => {
    if (pool.reserveX === 0 || pool.reserveY === 0) return
    const ratio = pool.reserveY / pool.reserveX
    const x = Number(liqX) || 0
    const y = x * ratio
    setLiqY(y.toFixed(4))
  }

  const setMaxSwap = () => {
    if (swapDirection === 'x-to-y') {
      setSwapInput(String(balances.tokenX || ''))
      return
    }
    setSwapInput(String(balances.tokenY || ''))
  }

  const setMaxBurn = () => {
    setBurnShares(String(balances.lpShares || '0'))
  }

  const SwapCard = () => (
    <div className="swap-card">
      <div className="token-card">
        <div className="token-card-head">
          <span className="muted">From</span>
          <div className="mini-actions">
            <button className="tiny ghost" onClick={() => setSwapDirection('x-to-y')}>
              X → Y
            </button>
            <button className="tiny ghost" onClick={() => setSwapDirection('y-to-x')}>
              Y → X
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
          <span className="token-pill">
            {swapDirection === 'x-to-y' ? 'Token X' : 'Token Y'}
          </span>
        </div>
        <p className="muted small">
          Balance:{' '}
          {swapDirection === 'x-to-y'
            ? formatNumber(balances.tokenX)
            : formatNumber(balances.tokenY)}
        </p>
      </div>

      <button
        className="switcher"
        onClick={() =>
          setSwapDirection((prev) => (prev === 'x-to-y' ? 'y-to-x' : 'x-to-y'))
        }
      >
        ⇅
      </button>

      <div className="token-card">
        <div className="token-card-head">
          <span className="muted">To</span>
          <span className="pill-small">
            {swapDirection === 'x-to-y' ? 'Token Y' : 'Token X'}
          </span>
        </div>
        <div className="token-output">
          <h3>{swapOutput !== null ? formatNumber(swapOutput) : '0.0'}</h3>
          <p className="muted small">Expected output</p>
        </div>
      </div>

      <div className="inline-stats">
        <div>
          <p className="muted small">Price (X→Y)</p>
          <strong>
            {currentPrice ? `1 X ≈ ${formatNumber(currentPrice)} Y` : 'N/A'}
          </strong>
        </div>
        <div>
          <p className="muted small">Fee</p>
          <strong>0.30%</strong>
        </div>
        <div>
          <p className="muted small">Pool reserves</p>
          <strong>
            {formatNumber(pool.reserveX)} X · {formatNumber(pool.reserveY)} Y
          </strong>
        </div>
      </div>

      <button className="primary" onClick={handleSwap}>
        Swap {swapDirection === 'x-to-y' ? 'X for Y' : 'Y for X'}
      </button>
      {swapMessage && <p className="note">{swapMessage}</p>}
    </div>
  )

  const LiquidityCard = () => (
    <div className="lp-stack">
      <div className="token-card">
        <div className="token-card-head">
          <span className="muted">Add liquidity</span>
          <div className="mini-actions">
            <button className="tiny ghost" onClick={handleSyncToPoolRatio}>
              Match pool ratio
            </button>
            <button className="tiny ghost" onClick={() => handleFaucet()} disabled={faucetPending}>
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
          <span className="muted">Remove liquidity</span>
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
          Your LP: {formatNumber(balances.lpShares)} · Pool share:{' '}
          {(poolShare * 100).toFixed(2)}%
        </p>
        <button className="primary" onClick={handleRemoveLiquidity}>
          Remove liquidity
        </button>
        {burnMessage && <p className="note">{burnMessage}</p>}
      </div>
    </div>
  )

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="mark">⇌</div>
          <div>
            <p className="eyebrow">Stacks DEX demo</p>
            <h1>Uniswap-style swap desk</h1>
            <p className="muted">
              Simulate swaps and LP actions before wiring real Clarity calls.
            </p>
          </div>
        </div>
        <div className="top-actions">
          <button className="chip" onClick={() => handleFaucet()} disabled={faucetPending}>
            Faucet 5k X + 5k Y
          </button>
          <button
            className="chip ghost"
            onClick={() => stacksAddress && syncBalances(stacksAddress)}
            disabled={!stacksAddress || balancePending}
          >
            {balancePending ? 'Refreshing...' : 'Refresh balances'}
          </button>
          {stacksAddress ? (
            <>
              <span className="chip success">Stacks: {shortAddress(stacksAddress)}</span>
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
          ) : (
            <button className="chip ghost" onClick={handleBtcConnect}>
              Connect Bitcoin
            </button>
          )}
        </div>
      </header>

      <div className="status-row top">
        <div>
          <p className="muted small">Stacks</p>
          <strong>{stacksAddress || 'Not connected'}</strong>
        </div>
        <div>
          <p className="muted small">Stacks network</p>
          <strong>{STACKS_NETWORK_NAME}</strong>
        </div>
        <div>
          <p className="muted small">Bitcoin</p>
          <strong>{btcStatus || 'Not connected'}</strong>
        </div>
        <div>
          <p className="muted small">Wallet balances</p>
          <strong>
            {formatNumber(balances.tokenX)} X · {formatNumber(balances.tokenY)}{' '}
            Y · {formatNumber(balances.lpShares)} LP
          </strong>
        </div>
      </div>

      <div className="main-grid">
        <section className="panel swap-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Swap box</p>
              <h2>
                {activeTab === 'swap'
                  ? 'Trade tokens instantly'
                  : 'Manage liquidity'}
              </h2>
            </div>
            <div className="tabs">
              <button
                className={activeTab === 'swap' ? 'active' : ''}
                onClick={() => setActiveTab('swap')}
              >
                Swap
              </button>
              <button
                className={activeTab === 'liquidity' ? 'active' : ''}
                onClick={() => setActiveTab('liquidity')}
              >
                Liquidity
              </button>
            </div>
          </div>

          {activeTab === 'swap' ? <SwapCard /> : <LiquidityCard />}
          {faucetMessage && <p className="note subtle">{faucetMessage}</p>}
          {faucetTxids.length > 0 && (
            <div className="note subtle">
              <p className="muted small">Recent faucet tx</p>
              <div className="chip-row">
                {faucetTxids.map((txid) => (
                  <a
                    key={txid}
                    className="chip ghost"
                    href={`https://explorer.hiro.so/txid/${txid}?chain=${STACKS_NETWORK_NAME}`}
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

        <aside className="panel info">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Pool + sim</p>
              <h3>Live math preview</h3>
            </div>
            <span className="pill-small">Sim only</span>
          </div>
          <div className="stat-grid">
            <div>
              <p className="muted small">Reserves</p>
              <strong>
                {formatNumber(pool.reserveX)} X / {formatNumber(pool.reserveY)} Y
              </strong>
            </div>
            <div>
              <p className="muted small">LP supply</p>
              <strong>{formatNumber(pool.totalShares)} shares</strong>
            </div>
            <div>
              <p className="muted small">Your pool share</p>
              <strong>{(poolShare * 100).toFixed(2)}%</strong>
            </div>
            <div>
              <p className="muted small">Price impact (est.)</p>
              <strong>
                {swapOutput
                  ? `${(Number(swapInput || 0) / (pool.reserveX || 1)).toFixed(
                      4
                    )}%`
                  : 'Enter amount'}
              </strong>
            </div>
          </div>
          <div className="info-note">
            <p className="muted">
              This UI mirrors Uniswap-style UX: one swap box, live quotes, and a
              faucet to fill your wallet with demo tokens so you can practice
              swapping and adding/removing liquidity before wiring real
              contract-calls.
            </p>
            <div className="chip-row">
              <button className="chip ghost" onClick={() => handleFaucet('x')} disabled={faucetPending}>
                Faucet 5k X only
              </button>
              <button className="chip ghost" onClick={() => handleFaucet('y')} disabled={faucetPending}>
                Faucet 5k Y only
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default App
