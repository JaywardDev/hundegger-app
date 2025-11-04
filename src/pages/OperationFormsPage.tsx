import { useRouter } from "../lib/router";

const PLACEHOLDER_FORM_LINK =
  "https://docs.google.com/forms/d/e/FORM_ID/viewform";
const PLACEHOLDER_FORM_EMBED_LINK =
  "https://docs.google.com/forms/d/e/FORM_ID/viewform?embedded=true";

export function OperationsFormPage() {
  const { navigate } = useRouter();

  return (
    <main className="operations-page">
      <div className="operations-page__inner">
        <header className="page-header">
          <button
            type="button"
            className="link-button"
            onClick={() => navigate("home")}
            aria-label="Back to landing page"
          >
            ← Back
          </button>
          <div>
            <h1>Operations intake form</h1>
            <p>
              Embed the Google Form that feeds the operations sheet so teammates can
              submit updates without leaving the app.
            </p>
          </div>
        </header>
        <div className="sheet-actions">
          <a
            className="link-button"
            href={PLACEHOLDER_FORM_LINK}
            target="_blank"
            rel="noreferrer"
          >
            Open the form in Google ↗
          </a>
        </div>
        <section className="sheet-embed" aria-label="Embedded Google Form">
          <iframe
            title="Operations Google Form"
            src={PLACEHOLDER_FORM_EMBED_LINK}
            loading="lazy"
            allow="clipboard-read; clipboard-write"
          />
          <p className="sheet-embed__placeholder">
            Replace the placeholder URLs in <code>OperationsFormPage.tsx</code> with the
            published Google Form link. Ensure the form responses are connected to the
            intended sheet tab before sharing with operators.
          </p>
        </section>
      </div>
    </main>
  );
}