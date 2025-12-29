import { useMemo, useState } from 'react'
import { connect } from '@stacks/connect'
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
const STACKS_NETWORK = 'testnet'

const shortAddress = (addr: string) =>
  addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr

const formatNumber = (value: number) =>
  value.toLocaleString(undefined, {
    maximumFractionDigits: 6,
    minimumFractionDigits: 0,
  })

function App() {
  const [pool, setPool] = useState<PoolState>({
    reserveX: 60_000,
    reserveY: 60_000,
    totalShares: 120_000,
  })

  const [balances, setBalances] = useState<Balances>({
    tokenX: 0,
    tokenY: 0,
    lpShares: 0,
  })

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

  const [stacksAddress, setStacksAddress] = useState<string | null>(null)
  const [btcStatus, setBtcStatus] = useState<string | null>(null)

  const handleStacksConnect = async () => {
    try {
      const result = await connect({
        forceWalletSelect: true,
        network: STACKS_NETWORK,
      })

      if (result?.addresses?.length) {
        setStacksAddress(result.addresses[0]?.address || null)
      }
    } catch (error) {
      console.error('Stacks connect error', error)
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

  const handleSwap = () => {
    setSwapMessage(null)
    const amount = Number(swapInput)
    if (!amount || amount <= 0) {
      setSwapMessage('Enter an amount greater than 0.')
      return
    }
    const fromX = swapDirection === 'x-to-y'
    const inputBalance = fromX ? balances.tokenX : balances.tokenY
    if (amount > inputBalance) {
      setSwapMessage('Not enough balance. Grab faucet or lower the amount.')
      return
    }

    const output = quoteSwap(amount, fromX)
    setSwapOutput(output)
    if (output <= 0) {
      setSwapMessage('Pool has no liquidity for this direction yet.')
      return
    }

    const fee = (amount * FEE_BPS) / BPS
    const amountAfterFee = amount - fee

    setPool((prev) => ({
      reserveX: fromX
        ? prev.reserveX + amountAfterFee
        : prev.reserveX - output,
      reserveY: fromX
        ? prev.reserveY - output
        : prev.reserveY + amountAfterFee,
      totalShares: prev.totalShares,
    }))

    setBalances((prev) => ({
      tokenX: fromX ? prev.tokenX - amount : prev.tokenX + output,
      tokenY: fromX ? prev.tokenY + output : prev.tokenY - amount,
      lpShares: prev.lpShares,
    }))

    setSwapMessage(
      `Simulated swap: received ${formatNumber(
        output
      )} ${fromX ? 'Token Y' : 'Token X'} (0.30% fee from input).`
    )
  }

  const handleAddLiquidity = () => {
    setLiqMessage(null)
    const amountX = Number(liqX)
    const amountY = Number(liqY)
    if (amountX <= 0 || amountY <= 0) {
      setLiqMessage('Enter positive amounts for both tokens.')
      return
    }
    if (amountX > balances.tokenX || amountY > balances.tokenY) {
      setLiqMessage('Not enough balance. Use faucet or reduce the deposit.')
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

    setBalances((prev) => ({
      tokenX: prev.tokenX - amountX,
      tokenY: prev.tokenY - amountY,
      lpShares: prev.lpShares + minted,
    }))

    setBurnShares(String(minted))
    setLiqMessage(
      `Simulated deposit: minted ${formatNumber(
        minted
      )} LP shares at current ratio.`
    )
  }

  const handleRemoveLiquidity = () => {
    setBurnMessage(null)
    const shares = Number(burnShares)
    if (shares <= 0) {
      setBurnMessage('Enter a share amount greater than 0.')
      return
    }
    if (shares > balances.lpShares) {
      setBurnMessage('Cannot burn more shares than your wallet owns.')
      return
    }
    if (shares > pool.totalShares) {
      setBurnMessage('Pool total shares is lower than that burn amount.')
      return
    }
    const amountX = (shares * pool.reserveX) / pool.totalShares
    const amountY = (shares * pool.reserveY) / pool.totalShares

    setPool((prev) => ({
      reserveX: prev.reserveX - amountX,
      reserveY: prev.reserveY - amountY,
      totalShares: prev.totalShares - shares,
    }))

    setBalances((prev) => ({
      tokenX: prev.tokenX + amountX,
      tokenY: prev.tokenY + amountY,
      lpShares: prev.lpShares - shares,
    }))

    setBurnMessage(
      `Simulated withdrawal: received ${formatNumber(
        amountX
      )} X and ${formatNumber(amountY)} Y.`
    )
  }

  const handleFaucet = (token?: 'x' | 'y') => {
    setFaucetMessage(null)
    setBalances((prev) => ({
      tokenX: prev.tokenX + (token === 'y' ? 0 : FAUCET_AMOUNT),
      tokenY: prev.tokenY + (token === 'x' ? 0 : FAUCET_AMOUNT),
      lpShares: prev.lpShares,
    }))
    if (!token) {
      setFaucetMessage(
        `Airdropped ${formatNumber(FAUCET_AMOUNT)} X and ${formatNumber(
          FAUCET_AMOUNT
        )} Y to your wallet.`
      )
      return
    }
    setFaucetMessage(
      `Airdropped ${formatNumber(FAUCET_AMOUNT)} ${
        token === 'x' ? 'X' : 'Y'
      } to your wallet.`
    )
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
            <button className="tiny ghost" onClick={() => handleFaucet()}>
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
          <button className="chip" onClick={() => handleFaucet()}>
            Faucet 5k X + 5k Y
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
          <strong>{STACKS_NETWORK}</strong>
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
              <button className="chip ghost" onClick={() => handleFaucet('x')}>
                Faucet 5k X only
              </button>
              <button className="chip ghost" onClick={() => handleFaucet('y')}>
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
