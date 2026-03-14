type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  action: () => void;
  complete: boolean;
};

type SetupPanelProps = {
  onboardingSteps: OnboardingStep[];
  onboardingCompletedCount: number;
  onboardingProgressPercent: number;
  activeTab: "swap" | "liquidity" | "analytics";
  onboardingDismissed: boolean;
  faucetPending: boolean;
  openOnboarding: () => void;
  closeOnboarding: (dismissed: boolean) => void;
};

export default function SetupPanel(props: SetupPanelProps) {
  const {
    onboardingSteps,
    onboardingCompletedCount,
    onboardingProgressPercent,
    activeTab,
    onboardingDismissed,
    faucetPending,
    openOnboarding,
    closeOnboarding,
  } = props;

  return (
    <section className="setup-panel">
      <div className="setup-head">
        <div>
          <p className="eyebrow">Start Here</p>
          <h3>Guided setup</h3>
        </div>
        <button className="tiny ghost" onClick={openOnboarding}>
          Open guide
        </button>
      </div>
      <div className="setup-progress">
        <div>
          <p className="muted small">
            {onboardingCompletedCount}/{onboardingSteps.length} steps complete
          </p>
          <strong>
            {onboardingCompletedCount === onboardingSteps.length
              ? "Exchange ready"
              : "Finish setup to trade with fewer surprises"}
          </strong>
        </div>
        <div className="setup-progress-bar" aria-hidden="true">
          <span style={{ width: `${onboardingProgressPercent}%` }} />
        </div>
      </div>
      <div className="setup-list">
        {onboardingSteps.map((step, index) => (
          <div
            key={step.id}
            className={`setup-item ${step.complete ? "is-complete" : ""}`}
          >
            <div className="setup-step">
              <span className="setup-index">{index + 1}</span>
              <div>
                <strong>{step.title}</strong>
                <p className="muted small">{step.description}</p>
              </div>
            </div>
            <button
              className={step.complete ? "tiny ghost" : "tiny"}
              onClick={step.action}
              disabled={step.complete || (step.id === "fund" && faucetPending)}
            >
              {step.actionLabel}
            </button>
          </div>
        ))}
      </div>
      <div className="setup-tips">
        <p className="muted small">
          {activeTab === "swap"
            ? "Swap tab tip: compare price impact before submitting and use preview if the trade is large."
            : activeTab === "liquidity"
              ? "Pool tab tip: use Match pool ratio before adding liquidity to avoid avoidable skew."
              : "Analytics tip: keep the app open after trading to build more local history points."}
        </p>
        {!onboardingDismissed &&
          onboardingCompletedCount < onboardingSteps.length && (
            <button className="tiny ghost" onClick={() => closeOnboarding(true)}>
              Hide setup card
            </button>
          )}
      </div>
    </section>
  );
}
