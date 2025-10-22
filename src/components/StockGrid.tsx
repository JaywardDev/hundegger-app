import React from "react";
import { useMatrixStore } from "../store/useMatrixStore";
import { BAYS, LEVELS, type Bay, type Level } from "../lib/types";
const cellLabel = (bay: Bay, level: Level) => `${bay} • ${level}`;

export const StockGrid: React.FC = () => {
  const { matrix, setEditor } = useMatrixStore((s) => ({
    matrix: s.matrix,
    setEditor: s.setEditor
  }));

  return (
    <div className="grid-wrap">
      <table className="grid">
        <thead>
          <tr>
            <th />
            {BAYS.map((b) => (
              <th key={b}>{b}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {LEVELS.map((l) => (
            <tr key={l}>
              <th>{l}</th>
              {BAYS.map((b) => {
                const cell = matrix[b][l];
                const text =
                  !cell || !cell.items.length
                    ? "—"
                    : cell.items.length === 1
                    ? `${cell.items[0].size_id} • ${cell.items[0].length_mm} • ${cell.items[0].pieces}`
                    : `${cell.items[0].size_id} • ${cell.items[0].length_mm} • ${cell.items[0].pieces} +${cell.items.length - 1}`;
                return (
                  <td
                    key={b + l}
                    title={cellLabel(b, l)}
                    className={cell ? "filled" : "empty"}
                    onClick={() => setEditor({ open: true, target: { bay: b, level: l } })}
                  >
                    {text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
