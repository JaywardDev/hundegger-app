import React from "react";
import { useMatrixStore } from "../store/useMatrixStore";
import { linearMeters, cubicMeters } from "../lib/calc";

export const HeaderBar: React.FC<{ onExport: () => void }> = ({ onExport }) => {
  const matrix = useMatrixStore((s) => s.matrix);
  let pieces = 0;
  let lm = 0;
  let m3 = 0;

  for (const col of Object.values(matrix)) {
    for (const cell of Object.values(col)) {
      if (!cell) continue;
      for (const it of cell.items) {
        pieces += it.pieces;
        lm += linearMeters(it);
        m3 += cubicMeters(it);
      }
    }
  }

  return (
    <section className="summary-card" aria-label="Stock totals and export">
      <div className="summary-card__heading">
        <h2>12&nbsp;m timber stock</h2>
        <p>13 bays × 10 levels</p>
      </div>
      <dl className="summary-card__metrics">
        <div>
          <dt>Pieces</dt>
          <dd>{pieces}</dd>
        </div>
        <div>
          <dt>Linear metres</dt>
          <dd>{lm.toFixed(2)}</dd>
        </div>
        <div>
          <dt>Cubic metres</dt>
          <dd>{m3.toFixed(3)}</dd>
        </div>
      </dl>
      <button type="button" className="button button--primary" onClick={onExport}>
        Export workbook
      </button>
    </section>
  );
};
