import { useRouter } from "../lib/router";

export function LandingPage() {
  const { navigate } = useRouter();

  return (
    <main className="landing-page">
      <section className="landing-card" aria-labelledby="landing-title">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">◦</span>
          <div>
            <p className="brand-label">Hector Egger NZ</p>
            <h1 id="landing-title">HUNDEGGER</h1>
          </div>
        </div>
        <p className="landing-tagline">
          Your timber management solution and operations data hub.
        </p>
        <div className="landing-actions">
          <button className="cta-button" onClick={() => navigate("stock")}>
            Stock-take
            <span aria-hidden="true" className="cta-icon">
              →
            </span>
          </button>
          <button
            className="cta-button cta-button--secondary"
            onClick={() => navigate("operations")}
          >
            Operations
            <span aria-hidden="true" className="cta-icon">
              →
            </span>
          </button>
        </div>
        <div className="landing-meta" aria-hidden="true">
          <span>About</span>
          <span>Settings</span>
        </div>
      </section>
    </main>
  );
}