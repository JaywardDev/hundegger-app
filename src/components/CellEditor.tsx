import React, { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/shallow";
import { useMatrixStore } from "../store/useMatrixStore";
import { SIZE_PRESETS, LENGTH_PRESETS_MM, GRADE_PRESETS, TREATMENT_PRESETS } from "../lib/presets";
import type { StackItem } from "../lib/types";

const createDefaultItem = (): StackItem => ({
  size_id: "45x90",
  width_mm: 90,
  thickness_mm: 45,
  length_mm: 12000,
  grade: "LVL11",
  treatment: "H1.2",
  pieces: 0
});

export const CellEditor: React.FC = () => {
  const { editor, setEditor, saveCell, clearCell, matrix, syncing } = useMatrixStore(
    useShallow((s) => ({
      editor: s.editor,
      setEditor: s.setEditor,
      saveCell: s.saveCell,
      clearCell: s.clearCell,
      matrix: s.matrix,
      syncing: s.syncing
    }))
  );

  const [items, setItems] = useState<StackItem[]>([createDefaultItem()]);

  const target = editor.target;
  const targetBay = target?.bay;
  const targetLevel = target?.level;  
  const open = editor.open && !!target;

  useEffect(() => {
    if (!open || !targetBay || !targetLevel) return;
    const cell = matrix[targetBay][targetLevel];
    if (cell && cell.items.length) {
      setItems(cell.items.map((item) => ({ ...item })));
    } else {
      setItems([createDefaultItem()]);
    }
  }, [open, targetBay, targetLevel, matrix]);  

  const setItem = (idx: number, patch: Partial<StackItem>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const addItem = () =>
    setItems((prev) => [
      ...prev,
      { ...(prev[0] ?? createDefaultItem()), pieces: 0 }
    ]);

  const removeItem = (idx: number) => setItems((p) => p.filter((_, i) => i !== idx));

  const canSave = useMemo(() => items.some((i) => i.pieces > 0), [items]);

  if (!open || !target) return null;

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Edit stock cell">
      <div className="dialog">
        <div className="dialog__header">
          <div>
            <p className="dialog__eyebrow">Cell</p>
            <h2>{target.bay} • {target.level}</h2>
          </div>
          <button
            type="button"
            className="button button--ghost button--icon"
            onClick={() => setEditor({ open: false })}
            aria-label="Close editor"
          >
            ✕
          </button>
        </div>

        <div className="list">
          {items.map((it, idx) => (
            <div className="row" key={idx}>
              <div className="field">
                <label htmlFor={`size-${idx}`}>Size</label>
                <select
                  id={`size-${idx}`}
                  value={it.size_id}
                  onChange={(e) => {
                    const preset = SIZE_PRESETS.find((p) => p.id === e.target.value)!;
                    setItem(idx, {
                      size_id: preset.id,
                      width_mm: preset.width_mm,
                      thickness_mm: preset.thickness_mm
                    });
                  }}
                >
                  {SIZE_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor={`length-${idx}`}>Length (mm)</label>
                <select
                  id={`length-${idx}`}
                  value={it.length_mm}
                  onChange={(e) => setItem(idx, { length_mm: Number(e.target.value) })}
                >
                  {LENGTH_PRESETS_MM.map((mm) => (
                    <option key={mm} value={mm}>
                      {mm}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor={`grade-${idx}`}>Grade</label>
                <select
                  id={`grade-${idx}`}
                  value={it.grade ?? ""}
                  onChange={(e) => setItem(idx, { grade: e.target.value || undefined })}
                >
                  <option value="">—</option>
                  {GRADE_PRESETS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor={`treatment-${idx}`}>Treatment</label>
                <select
                  id={`treatment-${idx}`}
                  value={it.treatment ?? ""}
                  onChange={(e) => setItem(idx, { treatment: e.target.value || undefined })}
                >
                  <option value="">—</option>
                  {TREATMENT_PRESETS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor={`pieces-${idx}`}>Pieces</label>
                <input
                  id={`pieces-${idx}`}
                  inputMode="numeric"
                  min={0}
                  type="number"
                  value={it.pieces}
                  onChange={(e) => setItem(idx, { pieces: Number(e.target.value) })}
                />
              </div>

              <div className="field">
                <label htmlFor={`bundle-${idx}`}>Bundle ID</label>
                <input
                  id={`bundle-${idx}`}
                  value={it.bundle_id ?? ""}
                  onChange={(e) => setItem(idx, { bundle_id: e.target.value || undefined })}
                />
              </div>

              <button
                type="button"
                className="button button--ghost button--danger"
                onClick={() => removeItem(idx)}
                disabled={items.length === 1}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="dialog__footer">
          <button type="button" className="button button--ghost" onClick={addItem}>
            + Add item
          </button>
          <button
            type="button"
            className="button button--ghost button--danger"
            disabled={!matrix[target.bay][target.level] || syncing}
            onClick={() => {
              void clearCell(target.bay, target.level);
              setItems([createDefaultItem()]);
              setEditor({ open: false });
            }}
          >
            Clear cell
          </button>          
          <div className="spacer" />
          <button
            type="button"
            className="button button--primary"
            disabled={!canSave || syncing}
            onClick={() => void saveCell(target.bay, target.level, items)}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
