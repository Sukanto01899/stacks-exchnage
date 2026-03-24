import { useMemo } from "react";
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

  const hash = useMemo(() => fnv1a32(address), [address]);
  const fingerprint = useMemo(() => fingerprintFromHash(hash), [hash]);
  const a = useMemo(() => hslFromHash(hash, 11), [hash]);
  const b = useMemo(() => hslFromHash(hash, 97), [hash]);

  return (
    <button
      className={`wallet-pill address-pill ${networkMismatch ? "is-warning" : ""}`}
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
  );
}

