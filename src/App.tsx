import { StockGrid } from "./components/StockGrid";
import { HeaderBar } from "./components/HeaderBar";
import { exportWorkbook } from "./lib/excel";
import { useMatrixStore } from "./store/useMatrixStore";
import { CellEditor } from "./components/CellEditor";
import "./index.css";

export default function App() {
  const matrix = useMatrixStore((s) => s.matrix);

  return (
    <div className="app">
      <HeaderBar onExport={() => exportWorkbook(matrix)} />
      <StockGrid />
      <CellEditor />
    </div>
  );
}
