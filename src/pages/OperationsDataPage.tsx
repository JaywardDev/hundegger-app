import { useRouter } from "../lib/router";

const PLACEHOLDER_SHEET_LINK =
  "https://docs.google.com/spreadsheets/d/1WxxhatxzcHd6_pAvBgc5Mw70-0qQVS3LXVZYbyPT-_c/edit?gid=1036640273#gid=1036640273";
const PLACEHOLDER_SHEET_EMBED_LINK =
  "https://docs.google.com/spreadsheets/d/1WxxhatxzcHd6_pAvBgc5Mw70-0qQVS3LXVZYbyPT-_c/edit?gid=1036640273#gid=1036640273/preview";

export function OperationsDataPage() {
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
            <h1>Operations data</h1>
            <p>
              Review the temporary Google Sheet while we build the in-app operations
              workspace.
            </p>
          </div>
        </header>
        <div className="sheet-actions">
          <a
            className="link-button"
            href={PLACEHOLDER_SHEET_LINK}
            target="_blank"
            rel="noreferrer"
          >
            Open in Google Sheets ↗
          </a>
        </div>
        <section className="sheet-embed" aria-label="Embedded Google Sheet preview">
          <iframe
            title="Google Sheet placeholder"
            src={PLACEHOLDER_SHEET_EMBED_LINK}
            loading="lazy"
            allow="clipboard-read; clipboard-write"
          />
          <p className="sheet-embed__placeholder">
            Replace the placeholder URLs in <code>OperationsDataPage.tsx</code> with the
            published Google Sheet link when it is ready. If the preview does not load,
            use the button above to open the sheet directly in Google.
          </p>
        </section>
      </div>
    </main>
  );
}