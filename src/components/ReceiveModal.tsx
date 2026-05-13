type ReceiveModalProps = {
  open: boolean;
  stacksAddress: string | null;
  onClose: () => void;
  onConnect: () => void;
  onCopyAddress: () => void;
  onCopyExplorerLink: () => void;
};

export default function ReceiveModal(props: ReceiveModalProps) {
  const { open, stacksAddress, onClose, onConnect, onCopyAddress, onCopyExplorerLink } = props;

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
            x
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
              <div className="confirm-modal-summary">
                <p className="muted small">Your address</p>
                <strong style={{ wordBreak: "break-all" }}>{stacksAddress}</strong>
              </div>
              <div className="confirm-modal-actions">
                <button className="secondary" type="button" onClick={onCopyAddress}>
                  Copy address
                </button>
                <button className="secondary" type="button" onClick={onCopyExplorerLink}>
                  Copy explorer link
                </button>
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

