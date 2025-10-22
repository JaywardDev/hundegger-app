import React from "react";
import { useMatrixStore } from "../store/useMatrixStore";
import { linearMeters, cubicMeters } from "../lib/calc";

export const HeaderBar: React.FC<{ onExport: () => void }> = ({ onExport }) => {
  const matrix = useMatrixStore((s) => s.matrix);
  // quick totals
  let pieces = 0, lm = 0, m3 = 0;
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
    <div className="bar">
      <h1>12m Timber Stock (10×13)</h1>
      <div className="spacer" />
      <div className="totals">
        <span>Pieces: <b>{pieces}</b></span>
        <span>Linear m: <b>{lm.toFixed(2)}</b></span>
        <span>m³: <b>{m3.toFixed(3)}</b></span>
      </div>
      <button onClick={onExport}>Export XLSX</button>
    </div>
  );
};
