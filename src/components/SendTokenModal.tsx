import { useEffect, useRef } from "react";
import type { TokenKey } from "../type";

type SendTokenModalProps = {
  open: boolean;
  stacksAddress: string | null;
  selectionLabels: Record<TokenKey, string>;
  balances: { tokenX: number; tokenY: number };
  sendToken: TokenKey;
  sendAmount: string;
  sendRecipient: string;
  sendPending: boolean;
  sendMessage: string | null;
  recipientPlaceholder: string;
  recentRecipients: string[];
  onClose: () => void;
  onConnect: () => void;
  onSendTokenChange: (token: TokenKey) => void;
  onAmountChange: (amount: string) => void;
  onRecipientChange: (recipient: string) => void;
  onForgetRecipient: (recipient: string) => void;
  onMax: () => void;
  onClear: () => void;
  onSubmit: () => void;
  formatNumber: (value: number) => string;
};

export default function SendTokenModal(props: SendTokenModalProps) {
  const {
    open,
    stacksAddress,
    selectionLabels,
    balances,
    sendToken,
    sendAmount,
    sendRecipient,
    sendPending,
    sendMessage,
    recipientPlaceholder,
    recentRecipients,
    onClose,
    onConnect,
    onSendTokenChange,
    onAmountChange,
    onRecipientChange,
    onForgetRecipient,
    onMax,
    onClear,
    onSubmit,
    formatNumber,
  } = props;

  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [open]);

  const parsedAmount = Number(sendAmount) || 0;
  const currentBalance = sendToken === "x" ? balances.tokenX : balances.tokenY;
  const sendLabel = selectionLabels[sendToken];

  const setAmountFraction = (fraction: number) => {
    const raw = currentBalance * fraction;
    if (raw > 0) onAmountChange(String(+raw.toFixed(6)));
  };
  const isInsufficient = parsedAmount > 0 && parsedAmount > currentBalance;
  const afterSendBalance = Math.max(0, currentBalance - parsedAmount);
  const hasAmount = parsedAmount > 0 && !isInsufficient;
  const recipientTrimmed = sendRecipient.trim();
  const isAddressInvalid =
    recipientTrimmed.length > 0 &&
    !recipientTrimmed.startsWith("SP") &&
    !recipientTrimmed.startsWith("ST");
  const isOwnAddress =
    recipientTrimmed.length > 0 &&
    !!stacksAddress &&
    recipientTrimmed === stacksAddress.trim();
  const hasValidRecipient =
    recipientTrimmed.length > 0 && !isAddressInvalid && !isOwnAddress;
  const showPreview = hasAmount && hasValidRecipient && !sendPending;

  const handlePaste = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) onRecipientChange(text);
    } catch {
      // clipboard unavailable or permission denied — ignore
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="send-dialog"
      aria-label="Send tokens"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-modal-head">
          <div>
            <p className="eyebrow">Transfer</p>
            <h2>Send tokens</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M1 1l12 12M13 1 1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="confirm-modal-body">
          <form
            className="drawer-send-form"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            {!stacksAddress ? (
              <div className="note subtle">
                <strong>Connect your wallet to send tokens.</strong>
                <div className="note-actions">
                  <button className="tiny ghost" type="button" onClick={onConnect}>
                    Connect Stacks
                  </button>
                </div>
              </div>
            ) : null}

            {/* Token selector */}
            <div className="drawer-send-token-row" role="group" aria-label="Token to send">
              {(["x", "y"] as const).map((key) => (
                <button
                  key={key}
                  className={`tiny ghost ${sendToken === key ? "is-active" : ""}`}
                  type="button"
                  aria-pressed={sendToken === key}
                  onClick={() => onSendTokenChange(key)}
                  disabled={sendPending}
                >
                  {selectionLabels[key]}
                </button>
              ))}
            </div>

            {/* Amount */}
            <div className="drawer-send-field">
              <div className="drawer-send-field-head">
                <span className="muted small">Amount</span>
                <div className="drawer-send-field-actions">
                  <span className="muted small">
                    Available: {formatNumber(currentBalance)} {sendLabel}
                  </span>
                  <button
                    className="tiny ghost"
                    type="button"
                    onClick={() => setAmountFraction(0.25)}
                    disabled={!stacksAddress || sendPending || currentBalance <= 0}
                  >
                    25%
                  </button>
                  <button
                    className="tiny ghost"
                    type="button"
                    onClick={() => setAmountFraction(0.5)}
                    disabled={!stacksAddress || sendPending || currentBalance <= 0}
                  >
                    50%
                  </button>
                  <button
                    className="tiny ghost"
                    type="button"
                    onClick={onMax}
                    disabled={!stacksAddress || sendPending || currentBalance <= 0}
                  >
                    Max
                  </button>
                </div>
              </div>
              <div className={`drawer-send-amount-wrap${isInsufficient ? " is-error" : ""}`}>
                <input
                  className="drawer-send-amount-input"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={sendAmount}
                  onChange={(event) => onAmountChange(event.target.value)}
                  placeholder="0.00"
                  disabled={!stacksAddress || sendPending}
                  aria-label="Amount to send"
                />
                <span className="drawer-send-token-label">{sendLabel}</span>
              </div>
              {isInsufficient && (
                <p className="drawer-send-hint is-error">
                  Exceeds balance by {formatNumber(parsedAmount - currentBalance)} {sendLabel}.
                </p>
              )}
              {hasAmount && (
                <p className="drawer-send-hint">
                  Remaining after send: {formatNumber(afterSendBalance)} {sendLabel}
                </p>
              )}
            </div>

            {/* Recipient */}
            <div className="drawer-send-field">
              <div className="drawer-send-field-head">
                <span className="muted small">Recipient address</span>
                <button
                  className="tiny ghost"
                  type="button"
                  onClick={() => void handlePaste()}
                  disabled={!stacksAddress || sendPending}
                >
                  Paste
                </button>
              </div>
              <input
                className={`drawer-send-input${isAddressInvalid || isOwnAddress ? " is-error" : ""}`}
                type="text"
                value={sendRecipient}
                onChange={(event) => onRecipientChange(event.target.value)}
                placeholder={recipientPlaceholder}
                autoComplete="off"
                disabled={!stacksAddress || sendPending}
                aria-label="Recipient Stacks address"
                aria-invalid={isAddressInvalid || isOwnAddress}
              />
              {isAddressInvalid && (
                <p className="drawer-send-hint is-error">
                  Stacks addresses start with SP (mainnet) or ST (testnet).
                </p>
              )}
              {isOwnAddress && (
                <p className="drawer-send-hint is-error">
                  This is your own connected wallet — pick a different recipient.
                </p>
              )}
              {hasValidRecipient && (
                <p className="drawer-send-hint is-valid">Valid address ✓</p>
              )}
              {recentRecipients.length > 0 && (
                <div className="drawer-send-recent" aria-label="Recent recipients">
                  <span className="muted small">Recent</span>
                  <div className="drawer-send-recent-chips">
                    {recentRecipients.map((address) => (
                      <span
                        key={address}
                        className={`recent-chip${address === recipientTrimmed ? " is-active" : ""}`}
                      >
                        <button
                          className="recent-chip-pick"
                          type="button"
                          onClick={() => onRecipientChange(address)}
                          disabled={!stacksAddress || sendPending}
                          title={address}
                        >
                          {address.slice(0, 6)}…{address.slice(-4)}
                        </button>
                        <button
                          className="recent-chip-remove"
                          type="button"
                          onClick={() => onForgetRecipient(address)}
                          disabled={sendPending}
                          aria-label={`Remove ${address} from recent recipients`}
                          title="Remove"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Preview */}
            {showPreview && (
              <div className="drawer-send-preview">
                <span className="muted small">Sending</span>
                <strong>
                  {formatNumber(parsedAmount)} {sendLabel}
                </strong>
                <span className="muted small">to</span>
                <span className="drawer-send-preview-address">
                  {recipientTrimmed.slice(0, 8)}…{recipientTrimmed.slice(-6)}
                </span>
              </div>
            )}

            <div className="drawer-send-actions">
              <button
                className="primary"
                type="submit"
                disabled={
                  !stacksAddress ||
                  sendPending ||
                  !sendAmount.trim() ||
                  !sendRecipient.trim() ||
                  isInsufficient ||
                  isAddressInvalid ||
                  isOwnAddress
                }
              >
                {sendPending && (
                  <span className="loading-spinner button-spinner" aria-hidden="true" />
                )}
                {sendPending ? "Sending..." : "Send"}
              </button>
              <button
                className="tiny ghost"
                type="button"
                onClick={onClear}
                disabled={sendPending || (!sendAmount && !sendRecipient)}
              >
                Clear
              </button>
            </div>

            {sendMessage ? <p className="note drawer-send-note">{sendMessage}</p> : null}
          </form>
        </div>
      </div>
    </dialog>
  );
}
