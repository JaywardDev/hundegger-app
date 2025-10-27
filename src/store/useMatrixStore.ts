import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
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

const buildEmptyMatrix = (): Record<Bay, Record<Level, Cell | null>> => {
  const matrix = {} as Record<Bay, Record<Level, Cell | null>>;
  for (const bay of BAYS) {
    matrix[bay] = {} as Record<Level, Cell | null>;
    for (const level of LEVELS) matrix[bay][level] = null;
  }
  return matrix;
};

const ensureMatrixShape = (
  matrix?: Record<Bay, Partial<Record<Level, Cell | null>>> | null
): Record<Bay, Record<Level, Cell | null>> => {
  const next = buildEmptyMatrix();
  if (!matrix) return next;
  for (const bay of BAYS) {
    const levels = matrix[bay];
    if (!levels) continue;
    for (const level of LEVELS) {
      const cell = levels[level];
      if (cell) next[bay][level] = cell;
    }
  }
  return next;
};

const storage = typeof window !== "undefined"
  ? createJSONStorage(() => window.localStorage)
  : undefined;

export const useMatrixStore = create<MatrixStore>()(
  persist(
    (set) => ({
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
    }),
    {
      name: "hundegger-matrix-store",
      ...(storage ? { storage } : {}),
      partialize: (state) => ({ matrix: state.matrix }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.matrix = ensureMatrixShape(state.matrix);
      }
    }
  )
);