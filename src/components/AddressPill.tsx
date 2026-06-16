import { useMemo, useState } from "react";
import { buildExplorerAddressUrl } from "../lib/explorer";
import { shortAddress } from "../lib/helper";

type AddressPillProps = {
  address: string;
  networkLabel: string;
  networkMismatch: boolean;
  onClick: () => void;
};

const fnv1a32 = (input: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

const fingerprintFromHash = (hash: number) =>
  hash.toString(16).toUpperCase().padStart(8, "0").slice(0, 6);

const hslFromHash = (hash: number, offset: number) => {
  const hue = (hash + offset) % 360;
  const sat = 68;
  const light = 52;
  return `hsl(${hue} ${sat}% ${light}%)`;
};

export default function AddressPill(props: AddressPillProps) {
  const { address, networkLabel, networkMismatch, onClick } = props;

  const [copied, setCopied] = useState(false);

  const handleCopy = async (event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard errors
    }
  };

  const hash = useMemo(() => fnv1a32(address), [address]);
  const fingerprint = useMemo(() => fingerprintFromHash(hash), [hash]);
  const a = useMemo(() => hslFromHash(hash, 11), [hash]);
  const b = useMemo(() => hslFromHash(hash, 97), [hash]);
  const explorerUrl = useMemo(
    () => buildExplorerAddressUrl(address, networkLabel),
    [address, networkLabel],
  );

  return (
    <div
      className={`wallet-pill address-pill address-pill-wrap ${
        networkMismatch ? "is-warning" : ""
      }`}
    >
      <button
        className="address-pill-main"
        onClick={onClick}
        title={address}
        type="button"
      >
        <span
          className="address-identicon"
          aria-hidden="true"
          style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
        />
        <span className="address-text">
          {shortAddress(address)}
          <span className="address-fingerprint">{fingerprint}</span>
        </span>
        <span className={`chip ${networkMismatch ? "warn" : "ghost"}`}>
          {networkLabel}
        </span>
      </button>
      <button
        className={`address-pill-copy${copied ? " is-copied" : ""}`}
        type="button"
        title={copied ? "Copied!" : "Copy address"}
        aria-label={copied ? "Copied!" : "Copy address"}
        onClick={(event) => void handleCopy(event)}
      >
        {copied ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M1.5 6l3 3 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <rect x="0.75" y="3.25" width="7.5" height="7.5" rx="1.25" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M3.25 3.25V2.5A1.25 1.25 0 0 1 4.5 1.25h5.25A1.25 1.25 0 0 1 11 2.5v5.25A1.25 1.25 0 0 1 9.75 9H9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        )}
      </button>
      <a
        className="address-pill-explorer"
        href={explorerUrl}
        target="_blank"
        rel="noreferrer"
        title="Open address in explorer"
        onClick={(event) => event.stopPropagation()}
      >
        Open
      </a>
    </div>
  );
}
