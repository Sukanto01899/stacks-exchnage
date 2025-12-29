import { useMemo, useState } from 'react'
import { AppConfig, UserSession, showConnect } from '@stacks/connect'
import './App.css'
import { appKit } from './wallets/appkit'

type PoolState = {
  reserveX: number
  reserveY: number
  totalShares: number
}

const FEE_BPS = 30
const BPS = 10_000

const formatNumber = (value: number) =>
  value.toLocaleString(undefined, {
    maximumFractionDigits: 6,
    minimumFractionDigits: 0,
  })

function App() {
  const [pool, setPool] = useState<PoolState>({
    reserveX: 50_000,
    reserveY: 50_000,
    totalShares: 100_000,
  })

  const [swapDirection, setSwapDirection] = useState<'x-to-y' | 'y-to-x'>(
    'x-to-y'
  )
  const [swapInput, setSwapInput] = useState('1000')
  const [swapOutput, setSwapOutput] = useState<number | null>(null)
  const [swapMessage, setSwapMessage] = useState<string | null>(null)

  const [liqX, setLiqX] = useState('2500')
  const [liqY, setLiqY] = useState('2500')
  const [liqMessage, setLiqMessage] = useState<string | null>(null)

  const [burnShares, setBurnShares] = useState('500')
  const [burnMessage, setBurnMessage] = useState<string | null>(null)

  const [stacksAddress, setStacksAddress] = useState<string | null>(null)
  const [btcStatus, setBtcStatus] = useState<string | null>(null)

  const stacksUserSession = useMemo(
    () => new UserSession({ appConfig: new AppConfig(['store_write']) }),
    []
  )

  const stacksAppIcon = useMemo(
    () =>
      typeof window !== 'undefined'
        ? `${window.location.origin}/vite.svg`
        : 'http://localhost/vite.svg',
    []
  )

  const handleStacksConnect = () => {
    showConnect({
      userSession: stacksUserSession,
      manifestPath: '/manifest.json',
      redirectTo: typeof window !== 'undefined' ? window.location.origin : '/',
      appDetails: {
        name: 'Stacks AMM Demo',
        icon: stacksAppIcon,
      },
      onFinish: () => {
        const data = stacksUserSession.loadUserData()
        const address =
          data?.profile?.stxAddress?.testnet ||
          data?.profile?.stxAddress?.mainnet
        if (address) setStacksAddress(address)
      },
    })
  }

  const poolShare = useMemo(() => {
    if (pool.totalShares === 0) return 0
    return (burnShares ? Number(burnShares) || 0 : 0) / pool.totalShares
  }, [burnShares, pool.totalShares])

  const quoteSwap = (amount: number, fromX: boolean) => {
    const reserveIn = fromX ? pool.reserveX : pool.reserveY
    const reserveOut = fromX ? pool.reserveY : pool.reserveX
    if (amount <= 0 || reserveIn <= 0 || reserveOut <= 0) return 0
    const fee = (amount * FEE_BPS) / BPS
    const amountAfterFee = amount - fee
    return (reserveOut * amountAfterFee) / (reserveIn + amountAfterFee)
  }

  const handleSwap = () => {
    const amount = Number(swapInput)
    if (!amount || amount <= 0) {
      setSwapMessage('Enter an amount greater than 0.')
      return
    }
    const fromX = swapDirection === 'x-to-y'
    const output = quoteSwap(amount, fromX)
    setSwapOutput(output)
    if (output <= 0) {
      setSwapMessage('Pool has no liquidity for this direction yet.')
      return
    }
    // Update simulated reserves
    const fee = (amount * FEE_BPS) / BPS
    const amountAfterFee = amount - fee
    if (fromX) {
      setPool((prev) => ({
        ...prev,
        reserveX: prev.reserveX + amountAfterFee,
        reserveY: prev.reserveY - output,
      }))
    } else {
      setPool((prev) => ({
        ...prev,
        reserveX: prev.reserveX - output,
        reserveY: prev.reserveY + amountAfterFee,
      }))
    }
    setSwapMessage(
      `Simulated swap: received ${formatNumber(output)} ${
        fromX ? 'Token Y' : 'Token X'
      } (fee ${FEE_BPS / 100}% taken from input).`
    )
  }

  const handleAddLiquidity = () => {
    const amountX = Number(liqX)
    const amountY = Number(liqY)
    if (amountX <= 0 || amountY <= 0) {
      setLiqMessage('Enter positive amounts for both tokens.')
      return
    }

    let minted = 0
    if (pool.totalShares === 0) {
      minted = Math.floor(Math.sqrt(amountX * amountY))
    } else {
      const shareX = (amountX * pool.totalShares) / pool.reserveX
      const shareY = (amountY * pool.totalShares) / pool.reserveY
      minted = Math.floor(Math.min(shareX, shareY))
    }

    if (minted <= 0) {
      setLiqMessage('Deposit does not increase shares. Check pool ratios.')
      return
    }

    setPool((prev) => ({
      reserveX: prev.reserveX + amountX,
      reserveY: prev.reserveY + amountY,
      totalShares: prev.totalShares + minted,
    }))

    setLiqMessage(
      `Simulated deposit: minted ${formatNumber(
        minted
      )} LP shares at current ratio.`
    )
  }

  const handleRemoveLiquidity = () => {
    const shares = Number(burnShares)
    if (shares <= 0) {
      setBurnMessage('Enter a share amount greater than 0.')
      return
    }
    if (shares > pool.totalShares) {
      setBurnMessage('Cannot burn more shares than total supply.')
      return
    }
    const amountX = (shares * pool.reserveX) / pool.totalShares
    const amountY = (shares * pool.reserveY) / pool.totalShares

    setPool((prev) => ({
      reserveX: prev.reserveX - amountX,
      reserveY: prev.reserveY - amountY,
      totalShares: prev.totalShares - shares,
    }))

    setBurnMessage(
      `Simulated withdrawal: received ${formatNumber(
        amountX
      )} X and ${formatNumber(amountY)} Y.`
    )
  }

  return (
    <div className="page">
      <section className="card connect">
        <div>
          <p className="eyebrow">Wallets</p>
          <h2>Connect to start real transactions</h2>
          <p className="muted">
            Use Stacks Connect for contract calls or Bitcoin wallets via Reown
            AppKit (Leather, Xverse, WalletConnect QR).
          </p>
        </div>
        <div className="connect-actions">
          <button className="primary" onClick={handleStacksConnect}>
            Connect Stacks (Stacks Connect)
          </button>
          <button
            className="ghost"
            onClick={() => {
              appKit.open()
              setBtcStatus(
                'Modal opened. Choose Leather, Xverse, or WalletConnect QR to link a Bitcoin wallet.'
              )
            }}
          >
            Connect Bitcoin (Leather / Xverse / QR)
          </button>
        </div>
        <div className="status-row">
          <div>
            <p className="muted">Stacks</p>
            <strong>{stacksAddress || 'Not connected'}</strong>
          </div>
          <div>
            <p className="muted">Bitcoin</p>
            <strong>{btcStatus || 'Not connected'}</strong>
          </div>
        </div>
      </section>

      <header className="hero">
        <div>
          <p className="eyebrow">Stacks DEX Demo</p>
          <h1>Pool dashboard for your Clarity AMM</h1>
          <p className="lede">
            Simulate swaps and liquidity moves against the constant-product
            pool. Hook in wallet connectivity later to execute real txs on
            devnet/testnet.
          </p>
          <div className="chips">
            <span>Fee: 0.30%</span>
            <span>Trait: sip-010</span>
            <span>Contracts: pool / pool-v5 / token-x / token-y</span>
          </div>
        </div>
        <div className="pill">
          <div>
            <p className="muted">Current reserves</p>
            <h3>
              {formatNumber(pool.reserveX)} X
              <span className="muted"> / </span>
              {formatNumber(pool.reserveY)} Y
            </h3>
            <p className="muted">
              LP supply: {formatNumber(pool.totalShares)} shares
            </p>
          </div>
        </div>
      </header>

      <section className="grid">
        <div className="card">
          <div className="card-head">
            <h2>Swap simulator</h2>
            <span className="pill-small">Constant product</span>
          </div>
          <div className="form-row">
            <label>Direction</label>
            <div className="segmented">
              <button
                className={swapDirection === 'x-to-y' ? 'active' : ''}
                onClick={() => setSwapDirection('x-to-y')}
              >
                X → Y
              </button>
              <button
                className={swapDirection === 'y-to-x' ? 'active' : ''}
                onClick={() => setSwapDirection('y-to-x')}
              >
                Y → X
              </button>
            </div>
          </div>
          <div className="form-row">
            <label>Input amount</label>
            <input
              type="number"
              value={swapInput}
              onChange={(e) => setSwapInput(e.target.value)}
              min="0"
            />
          </div>
          <button className="primary" onClick={handleSwap}>
            Simulate swap
          </button>
          {swapOutput !== null && (
            <p className="muted">
              Expected output: {formatNumber(swapOutput)}{' '}
              {swapDirection === 'x-to-y' ? 'Y' : 'X'}
            </p>
          )}
          {swapMessage && <p className="note">{swapMessage}</p>}
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Add liquidity</h2>
            <span className="pill-small">LP mint</span>
          </div>
          <div className="form-row">
            <label>Token X</label>
            <input
              type="number"
              value={liqX}
              onChange={(e) => setLiqX(e.target.value)}
              min="0"
            />
          </div>
          <div className="form-row">
            <label>Token Y</label>
            <input
              type="number"
              value={liqY}
              onChange={(e) => setLiqY(e.target.value)}
              min="0"
            />
          </div>
          <button className="primary" onClick={handleAddLiquidity}>
            Simulate deposit
          </button>
          {liqMessage && <p className="note">{liqMessage}</p>}
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Remove liquidity</h2>
            <span className="pill-small">LP burn</span>
          </div>
          <div className="form-row">
            <label>LP shares to burn</label>
            <input
              type="number"
              value={burnShares}
              onChange={(e) => setBurnShares(e.target.value)}
              min="0"
            />
          </div>
          <button className="primary" onClick={handleRemoveLiquidity}>
            Simulate withdrawal
          </button>
          <p className="muted">
            Share fraction: {(poolShare * 100).toFixed(2)}% of pool
          </p>
          {burnMessage && <p className="note">{burnMessage}</p>}
        </div>
      </section>

      <section className="card wide">
        <div className="card-head">
          <h2>Hook this up</h2>
          <span className="pill-small">Next steps</span>
        </div>
        <div className="list">
          <div>
            <strong>Wallet wiring</strong>
            <p className="muted">
              Add a Stacks wallet connector (e.g., Hiro) and replace simulate
              actions with contract-calls to `pool-v5` or your chosen version.
            </p>
          </div>
          <div>
            <strong>Contract endpoints</strong>
            <p className="muted">
              swap-x-for-y / swap-y-for-x, add-liquidity, remove-liquidity.
              Tokens implement SIP-010 (token-x, token-y).
            </p>
          </div>
          <div>
            <strong>Devnet commands</strong>
            <p className="muted">
              Use Clarinet console to mint test tokens and seed liquidity before
              connecting the UI. Keep fee at 30 bps (configurable in contract).
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

export default App
