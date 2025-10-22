import { HeaderBar } from "../components/HeaderBar";
import { StockGrid } from "../components/StockGrid";
import { CellEditor } from "../components/CellEditor";
import { exportWorkbook } from "../lib/excel";
import { useMatrixStore } from "../store/useMatrixStore";
import { useRouter } from "../lib/router";

export function StockPage() {
  const { navigate } = useRouter();
  const matrix = useMatrixStore((s) => s.matrix);

  return (
    <main className="stock-page">
      <div className="stock-page__inner">
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
            <h1>Stock-take</h1>
            <p>Review, adjust, and export the 12&nbsp;m timber inventory.</p>
          </div>
        </header>
        <HeaderBar onExport={() => exportWorkbook(matrix)} />
        <section className="grid-section" aria-label="Stock grid">
          <StockGrid />
        </section>
      </div>
      <CellEditor />
    </main>
  );
}