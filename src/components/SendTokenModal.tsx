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
  onClose: () => void;
  onConnect: () => void;
  onSendTokenChange: (token: TokenKey) => void;
  onAmountChange: (amount: string) => void;
  onRecipientChange: (recipient: string) => void;
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
    onClose,
    onConnect,
    onSendTokenChange,
    onAmountChange,
    onRecipientChange,
    onMax,
    onClear,
    onSubmit,
    formatNumber,
  } = props;

  if (!open) return null;

  return (
    <div
      className="confirm-modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-modal-head">
          <div>
            <p className="eyebrow">Send</p>
            <h2>Send tokens</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            x
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

            <div className="drawer-send-token-row" role="group" aria-label="Token to send">
              <button
                className={`tiny ghost ${sendToken === "x" ? "is-active" : ""}`}
                type="button"
                aria-pressed={sendToken === "x"}
                onClick={() => onSendTokenChange("x")}
                disabled={sendPending}
              >
                {selectionLabels.x}
              </button>
              <button
                className={`tiny ghost ${sendToken === "y" ? "is-active" : ""}`}
                type="button"
                aria-pressed={sendToken === "y"}
                onClick={() => onSendTokenChange("y")}
                disabled={sendPending}
              >
                {selectionLabels.y}
              </button>
            </div>

            <div className="drawer-send-meta">
              <span className="muted small">
                Available: {formatNumber(sendToken === "x" ? balances.tokenX : balances.tokenY)}{" "}
                {selectionLabels[sendToken]}
              </span>
              <button
                className="tiny ghost"
                type="button"
                onClick={onMax}
                disabled={!stacksAddress || sendPending}
              >
                Max
              </button>
            </div>

            <label>
              Amount
              <input
                className="drawer-send-input"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={sendAmount}
                onChange={(event) => onAmountChange(event.target.value)}
                placeholder="0.00"
                disabled={!stacksAddress || sendPending}
              />
            </label>

            <label>
              Recipient address
              <input
                className="drawer-send-input"
                type="text"
                value={sendRecipient}
                onChange={(event) => onRecipientChange(event.target.value)}
                placeholder={recipientPlaceholder}
                autoComplete="off"
                disabled={!stacksAddress || sendPending}
              />
            </label>

            <div className="drawer-send-actions">
              <button
                className="primary"
                type="submit"
                disabled={
                  !stacksAddress ||
                  sendPending ||
                  !sendAmount.trim() ||
                  !sendRecipient.trim()
                }
              >
                {sendPending ? "Sending..." : "Send"}
              </button>
              <button
                className="tiny ghost"
                type="button"
                onClick={onClear}
                disabled={sendPending || (!sendAmount && !sendRecipient && !sendMessage)}
              >
                Clear
              </button>
            </div>

            {sendMessage ? <p className="note drawer-send-note">{sendMessage}</p> : null}
          </form>
        </div>
      </div>
    </div>
  );
}

