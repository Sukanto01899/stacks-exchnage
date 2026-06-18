import { useEffect, useRef, useState } from "react";
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

const QR_EXPORT_SIZE = 512;

function svgToPngBlob(svgEl: SVGSVGElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgEl);
    const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(svgUrl);
      const canvas = document.createElement("canvas");
      canvas.width = QR_EXPORT_SIZE;
      canvas.height = QR_EXPORT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("no canvas context")); return; }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, QR_EXPORT_SIZE, QR_EXPORT_SIZE);
      ctx.drawImage(img, 0, 0, QR_EXPORT_SIZE, QR_EXPORT_SIZE);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("toBlob failed"));
      }, "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(svgUrl); reject(new Error("img load failed")); };
    img.src = svgUrl;
  });
}

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

  const qrWrapRef = useRef<HTMLDivElement>(null);
  const [qrFeedback, setQrFeedback] = useState<"download" | "copy" | null>(null);

  useEffect(() => {
    if (!qrFeedback) return;
    const t = window.setTimeout(() => setQrFeedback(null), 1800);
    return () => window.clearTimeout(t);
  }, [qrFeedback]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const canShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  const getSvgEl = () =>
    qrWrapRef.current?.querySelector<SVGSVGElement>("svg") ?? null;

  const handleShare = async () => {
    if (!stacksAddress) return;
    try {
      await navigator.share({
        title: "My Stacks address",
        text: stacksAddress,
      });
    } catch (error) {
      // user cancelled the share sheet, or share is unsupported — ignore
      if (error instanceof Error && error.name !== "AbortError") {
        console.warn("Share failed", error);
      }
    }
  };

  const handleDownloadQR = async () => {
    const svg = getSvgEl();
    if (!svg || !stacksAddress) return;
    try {
      const blob = await svgToPngBlob(svg);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${stacksAddress.slice(0, 10)}-qr.png`;
      a.click();
      URL.revokeObjectURL(url);
      setQrFeedback("download");
    } catch {
      // ignore — browser may block in sandboxed envs
    }
  };

  const handleCopyQR = async () => {
    const svg = getSvgEl();
    if (!svg) return;
    try {
      const blob = await svgToPngBlob(svg);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setQrFeedback("copy");
    } catch {
      // ClipboardItem not available in all browsers — silently ignore
    }
  };

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
              <div className="receive-qr" ref={qrWrapRef} aria-label="Address QR code">
                <QRCodeSVG
                  value={stacksAddress}
                  size={168}
                  marginSize={2}
                  bgColor="#ffffff"
                  fgColor="#000000"
                />
              </div>
              <div className="receive-qr-actions">
                <button
                  className={`tiny ghost${qrFeedback === "download" ? " is-active" : ""}`}
                  type="button"
                  onClick={() => void handleDownloadQR()}
                  title="Download QR as PNG"
                >
                  {qrFeedback === "download" ? (
                    <>
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                        <path d="M1.5 5.5l2.5 2.5 5.5-5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Saved
                    </>
                  ) : (
                    <>
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                        <path d="M5.5 1v6M3 5l2.5 2.5L8 5M1 9.5h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Download
                    </>
                  )}
                </button>
                <button
                  className={`tiny ghost${qrFeedback === "copy" ? " is-active" : ""}`}
                  type="button"
                  onClick={() => void handleCopyQR()}
                  title="Copy QR image to clipboard"
                >
                  {qrFeedback === "copy" ? (
                    <>
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                        <path d="M1.5 5.5l2.5 2.5 5.5-5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Copied
                    </>
                  ) : (
                    <>
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                        <rect x="0.75" y="2.75" width="6.5" height="6.5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                        <path d="M2.75 2.75V2A.75.75 0 0 1 3.5 1.25h4.75A.75.75 0 0 1 9 2v4.75a.75.75 0 0 1-.75.75H7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                      </svg>
                      Copy image
                    </>
                  )}
                </button>
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
                {canShare && (
                  <button className="secondary" type="button" onClick={() => void handleShare()}>
                    Share
                  </button>
                )}
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
