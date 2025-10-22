import React, { useMemo, useState } from "react";
import { useMatrixStore } from "../store/useMatrixStore";
import { SIZE_PRESETS, LENGTH_PRESETS_MM, GRADE_PRESETS, TREATMENT_PRESETS } from "../lib/presets";
import type { StackItem } from "../lib/types";

export const CellEditor: React.FC = () => {
  const { editor, setEditor, saveCell } = useMatrixStore((s) => ({
    editor: s.editor,
    setEditor: s.setEditor,
    saveCell: s.saveCell
  }));

  const [items, setItems] = useState<StackItem[]>([
    {
      size_id: "90x45",
      width_mm: 90,
      thickness_mm: 45,
      length_mm: 6000,
      grade: "SG8",
      treatment: "H1.2",
      pieces: 0
    }
  ]);

  const target = editor.target;
  const open = editor.open && !!target;

  const setItem = (idx: number, patch: Partial<StackItem>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const addItem = () =>
    setItems((prev) => [
      ...prev,
      { ...prev[0], pieces: 0 } // duplicate spec
    ]);

  const removeItem = (idx: number) => setItems((p) => p.filter((_, i) => i !== idx));

  const canSave = useMemo(() => items.some((i) => i.pieces > 0), [items]);

  if (!open || !target) return null;

  return (
    <div className="modal">
      <div className="dialog">
        <div className="header">
          <b>Cell:</b> {target.bay} • {target.level}
          <button className="ghost" onClick={() => setEditor({ open: false })}>✕</button>
        </div>

        <div className="list">
          {items.map((it, idx) => (
            <div className="row" key={idx}>
              <div className="field">
                <label>Size</label>
                <select
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
                    <option key={p.id} value={p.id}>{p.id}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Length (mm)</label>
                <select
                  value={it.length_mm}
                  onChange={(e) => setItem(idx, { length_mm: Number(e.target.value) })}
                >
                  {LENGTH_PRESETS_MM.map((mm) => (
                    <option key={mm} value={mm}>{mm}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Grade</label>
                <select
                  value={it.grade ?? ""}
                  onChange={(e) => setItem(idx, { grade: e.target.value || undefined })}
                >
                  <option value="">—</option>
                  {GRADE_PRESETS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>

              <div className="field">
                <label>Treatment</label>
                <select
                  value={it.treatment ?? ""}
                  onChange={(e) => setItem(idx, { treatment: e.target.value || undefined })}
                >
                  <option value="">—</option>
                  {TREATMENT_PRESETS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div className="field">
                <label>Pieces</label>
                <input
                  inputMode="numeric"
                  min={0}
                  type="number"
                  value={it.pieces}
                  onChange={(e) => setItem(idx, { pieces: Number(e.target.value) })}
                />
              </div>

              <div className="field">
                <label>Bundle ID</label>
                <input
                  value={it.bundle_id ?? ""}
                  onChange={(e) => setItem(idx, { bundle_id: e.target.value || undefined })}
                />
              </div>

              <button className="ghost danger" onClick={() => removeItem(idx)} disabled={items.length === 1}>
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="footer">
          <button onClick={addItem}>+ Add item</button>
          <div className="spacer" />
          <button
            className="primary"
            disabled={!canSave}
            onClick={() => saveCell(target.bay, target.level, items)}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
