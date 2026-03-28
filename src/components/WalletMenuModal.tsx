import { useEffect, useState } from "react";

type WalletMenuModalProps = {
  open: boolean;
  address: string | null;
  resolvedStacksNetwork: string;
  networkMismatch: boolean;
  onClose: () => void;
  onCopyAddress: (address: string) => void;
  onDisconnect: () => void;
};

export default function WalletMenuModal(props: WalletMenuModalProps) {
  const {
    open,
    address,
    resolvedStacksNetwork,
    networkMismatch,
    onClose,
    onCopyAddress,
    onDisconnect,
  } = props;

  if (!open || !address) return null;

  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <div
      className="wallet-menu-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="wallet-menu" onClick={(e) => e.stopPropagation()}>
        <div className="wallet-menu-head">
          <div>
            <p className="eyebrow">Wallet</p>
            <h2>Connected</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close"
            onClick={onClose}
          >
            x
          </button>
        </div>

        {networkMismatch && (
          <div className="note error">
            <p className="muted small">Network mismatch</p>
            <strong>
              This address does not match {resolvedStacksNetwork}. Actions are
              blocked.
            </strong>
          </div>
        )}

        <div className="wallet-menu-body">
          <p className="muted small">Address</p>
          <div className="wallet-menu-address">{address}</div>

          <div className="wallet-menu-actions">
            <button
              className="secondary"
              type="button"
              onClick={() => {
                onCopyAddress(address);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy address"}
            </button>
            <a
              className="secondary"
              href={`https://explorer.hiro.so/address/${address}?chain=${resolvedStacksNetwork}`}
              target="_blank"
              rel="noreferrer"
            >
              View on explorer
            </a>
          </div>

          <button className="tiny ghost" type="button" onClick={onDisconnect}>
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}
