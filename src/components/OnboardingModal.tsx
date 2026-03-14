type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  action: () => void;
  complete: boolean;
};

type OnboardingModalProps = {
  onboardingSteps: OnboardingStep[];
  onboardingCompletedCount: number;
  onboardingProgressPercent: number;
  closeOnboarding: (dismissed: boolean) => void;
  faucetPending: boolean;
};

export default function OnboardingModal(props: OnboardingModalProps) {
  const {
    onboardingSteps,
    onboardingCompletedCount,
    onboardingProgressPercent,
    closeOnboarding,
    faucetPending,
  } = props;

  return (
    <div className="onboarding-backdrop" onClick={() => closeOnboarding(false)}>
      <div className="onboarding-modal" onClick={(e) => e.stopPropagation()}>
        <div className="onboarding-head">
          <div>
            <p className="eyebrow">First Run Guide</p>
            <h3>How to use Clardex</h3>
          </div>
          <button className="tiny ghost" onClick={() => closeOnboarding(false)}>
            Close
          </button>
        </div>
        <div className="onboarding-grid">
          <div className="onboarding-card">
            <span className="chip success">
              {onboardingCompletedCount}/{onboardingSteps.length} complete
            </span>
            <h4>Fastest path</h4>
            <p className="muted small">
              Connect a Stacks wallet, mint demo assets, then review Pool and
              Analytics before making your first swap.
            </p>
            <div className="setup-progress-bar" aria-hidden="true">
              <span style={{ width: `${onboardingProgressPercent}%` }} />
            </div>
          </div>
          <div className="onboarding-card">
            <h4>What is simulated vs on-chain</h4>
            <p className="muted small">
              Quotes, alerts, and local analytics are frontend-derived. Swaps,
              approvals, liquidity actions, and faucet mints use the connected
              wallet and configured contracts.
            </p>
          </div>
        </div>
        <div className="onboarding-list">
          {onboardingSteps.map((step, index) => (
            <div
              key={step.id}
              className={`onboarding-item ${step.complete ? "is-complete" : ""}`}
            >
              <div>
                <p className="muted small">Step {index + 1}</p>
                <strong>{step.title}</strong>
                <p className="muted small">{step.description}</p>
              </div>
              <button
                className={step.complete ? "tiny ghost" : "tiny"}
                onClick={() => {
                  step.action();
                  if (step.id !== "connect" && step.id !== "fund") {
                    closeOnboarding(false);
                  }
                }}
                disabled={step.complete || (step.id === "fund" && faucetPending)}
              >
                {step.actionLabel}
              </button>
            </div>
          ))}
        </div>
        <div className="onboarding-footer">
          <p className="muted small">
            The guide is local to this browser. Reopen it any time from the
            setup card.
          </p>
          <div className="mini-actions">
            <button className="secondary" onClick={() => closeOnboarding(true)}>
              Dismiss
            </button>
            <button className="primary" onClick={() => closeOnboarding(false)}>
              Continue exploring
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
