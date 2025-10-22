import { create } from "zustand";
import { BAYS, LEVELS, type Bay, type Level, type Cell, type StackItem } from "../lib/types";

type EditorState = {
  open: boolean;
  target?: { bay: Bay; level: Level };
};

type MatrixStore = {
  matrix: Record<Bay, Record<Level, Cell | null>>;
  editor: EditorState;
  setEditor: (editor: EditorState) => void;
  saveCell: (bay: Bay, level: Level, items: StackItem[]) => void;
  clearCell: (bay: Bay, level: Level) => void;
};

const buildEmptyMatrix = () => {
  const m: Record<Bay, Record<Level, Cell | null>> = {} as any;
  for (const b of BAYS) {
    m[b] = {} as any;
    for (const l of LEVELS) m[b][l] = null;
  }
  return m;
};

export const useMatrixStore = create<MatrixStore>((set) => ({
  matrix: buildEmptyMatrix(),
  editor: { open: false },
  setEditor: (editor) => set({ editor }),
  saveCell: (bay, level, items) =>
    set((state) => {
      const cell: Cell = {
        bay,
        level,
        items,
        updated_by: "JAY", // TODO: replace with PIN user
        updated_at: new Date().toISOString()
      };
      const copy = structuredClone(state.matrix);
      copy[bay][level] = cell;
      return { matrix: copy, editor: { open: false } };
    }),
  clearCell: (bay, level) =>
    set((state) => {
      const copy = structuredClone(state.matrix);
      copy[bay][level] = null;
      return { matrix: copy };
    })
}));
