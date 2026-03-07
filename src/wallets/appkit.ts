import { createAppKit } from "@reown/appkit";
import { bitcoinTestnet } from "@reown/appkit/networks";
import { BitcoinAdapter } from "@reown/appkit-adapter-bitcoin";

const projectId =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "walletconnect-project-id";

// TODO: Update metadata with your app's information
const metadata = {
  name: "Stacks AMM",
  description: "Connect Bitcoin wallets for swaps/liquidity",
  url:
    typeof window !== "undefined" ? window.location.origin : "http://localhost",
  icons: ["https://walletconnect.com/walletconnect-logo.png"],
};

export const appKit = createAppKit({
  projectId,
  adapters: [new BitcoinAdapter()],
  networks: [bitcoinTestnet],
  defaultNetwork: bitcoinTestnet,
  metadata,
  themeMode: "dark",
});
