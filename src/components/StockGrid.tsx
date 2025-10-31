import React from "react";
import { useShallow } from "zustand/shallow";
import { useMatrixStore } from "../store/useMatrixStore";
import { BAYS, LEVELS, type Bay, type Level } from "../lib/types";

const cellLabel = (bay: Bay, level: Level) => `${bay} • ${level}`;

export const StockGrid: React.FC = () => {
  const { matrix, setEditor, editingEnabled } = useMatrixStore(
    useShallow((s) => ({
      matrix: s.matrix,
      setEditor: s.setEditor,
      editingEnabled: s.editingEnabled
    }))
  );
  const gridClassName = editingEnabled ? "grid" : "grid grid--locked";  
  return (
    <div className="grid-wrap">
      <table className={gridClassName} aria-label="Timber stock matrix">
        <thead>
          <tr>
            <th scope="col" aria-hidden="true" />
            {BAYS.map((b) => (
              <th scope="col" key={b}>
                {b}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...LEVELS].reverse().map((l) => ( 
            <tr key={l}>
              <th scope="row">{l}</th>
              {BAYS.map((b) => {
                const cell = matrix[b][l];
                const text =
                  !cell || !cell.items.length
                    ? ""
                    : cell.items.length === 1
                    ? `${cell.items[0].size_id} • ${cell.items[0].length_mm} • ${cell.items[0].pieces}`
                    : `${cell.items[0].size_id} • ${cell.items[0].length_mm} • ${cell.items[0].pieces} +${
                        cell.items.length - 1
                      }`;

                const openEditor = () => {
                  if (!editingEnabled) return;
                  setEditor({ open: true, target: { bay: b, level: l } });
                };

                return (
                  <td
                    key={b + l}
                    title={cellLabel(b, l)}
                    className={cell ? "filled" : "empty"}
                    onClick={openEditor}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openEditor();
                      }
                    }}
                    role="button"
                    tabIndex={editingEnabled ? 0 : -1}
                    aria-disabled={!editingEnabled}
                    aria-label={`Edit ${cellLabel(b, l)}`}
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
