import { createAppKit } from '@reown/appkit'
import { bitcoinTestnet } from '@reown/appkit/networks'
import { BitcoinAdapter } from '@reown/appkit-adapter-bitcoin'

const projectId =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'demo-walletconnect-project-id'

const metadata = {
  name: 'Stacks AMM Demo',
  description: 'Connect Bitcoin wallets for swaps/liquidity',
  url: typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
  icons: ['https://walletconnect.com/walletconnect-logo.png'],
}

export const appKit = createAppKit({
  projectId,
  adapters: [new BitcoinAdapter()],
  networks: [bitcoinTestnet],
  defaultNetwork: bitcoinTestnet,
  metadata,
  themeMode: 'dark',
})
