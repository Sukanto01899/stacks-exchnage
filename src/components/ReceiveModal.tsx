import { useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";

type ReceiveModalProps = {
  open: boolean;
  stacksAddress: string | null;
  explorerUrl: string | null;
  onClose: () => void;
  onConnect: () => void;
  onCopyAddress: () => void;
  onCopyExplorerLink: () => void;
};

export default function ReceiveModal(props: ReceiveModalProps) {
  const {
    open,
    stacksAddress,
    explorerUrl,
    onClose,
    onConnect,
    onCopyAddress,
    onCopyExplorerLink,
  } = props;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="confirm-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-modal-head">
          <div>
            <p className="eyebrow">Receive</p>
            <h2>Receive tokens</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M1 1l12 12M13 1 1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="confirm-modal-body">
          {!stacksAddress ? (
            <div className="note subtle">
              <strong>Connect your wallet to receive tokens.</strong>
              <div className="note-actions">
                <button className="tiny ghost" type="button" onClick={onConnect}>
                  Connect Stacks
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="receive-qr" aria-label="Address QR code">
                <QRCodeSVG
                  value={stacksAddress}
                  size={168}
                  marginSize={2}
                  bgColor="#ffffff"
                  fgColor="#000000"
                />
              </div>
              <div className="confirm-modal-summary">
                <p className="muted small">Your address</p>
                <button
                  className="receive-address"
                  type="button"
                  onClick={onCopyAddress}
                  title="Click to copy"
                >
                  {stacksAddress}
                </button>
              </div>
              <div className="confirm-modal-actions">
                <button className="secondary" type="button" onClick={onCopyAddress}>
                  Copy address
                </button>
                <button className="secondary" type="button" onClick={onCopyExplorerLink}>
                  Copy explorer link
                </button>
                {explorerUrl && (
                  <a
                    className="secondary"
                    href={explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in explorer
                  </a>
                )}
              </div>
              <p className="muted small">
                Send tokens to this address from another wallet or exchange.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

