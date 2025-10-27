import { create } from "zustand";
import {
  BAYS,
  LEVELS,
  type Bay,
  type Level,
  type Cell,
  type StackItem
} from "../lib/types";
import {
  fetchMatrix,
  persistMatrix,
  type MatrixPayload
} from "../lib/api";

type EditorState = {
  open: boolean;
  target?: { bay: Bay; level: Level };
};

type MatrixStore = {
  matrix: MatrixPayload;
  editor: EditorState;
  loading: boolean;
  loaded: boolean;
  syncing: boolean;
  error?: string;  
  setEditor: (editor: EditorState) => void;
  loadMatrix: () => Promise<void>;
  reloadMatrix: () => Promise<void>;
  saveCell: (bay: Bay, level: Level, items: StackItem[]) => Promise<void>;
  clearCell: (bay: Bay, level: Level) => Promise<void>;
};

const buildEmptyMatrix = (): MatrixPayload => {
  const matrix = {} as MatrixPayload;
  for (const bay of BAYS) {
    matrix[bay] = {} as Record<Level, Cell | null>;
    for (const level of LEVELS) matrix[bay][level] = null;
  }
  return matrix;
};

const ensureMatrixShape = (
  matrix?: Record<Bay, Partial<Record<Level, Cell | null>>> | null
): MatrixPayload => {
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

export const useMatrixStore = create<MatrixStore>()((set, get) => {
  const pushMatrix = async (matrix: MatrixPayload) => {
    set({ syncing: true, error: undefined });
    try {
      await persistMatrix(matrix);
      set({ syncing: false });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to sync matrix";
      set({ syncing: false, error: message });
      throw error;
    }
  };

  return {
    matrix: buildEmptyMatrix(),
    editor: { open: false },
    loading: false,
    loaded: false,
    syncing: false,
    setEditor: (editor) => set({ editor }),
    loadMatrix: async () => {
      const state = get();
      if (state.loaded || state.loading) return;
      await state.reloadMatrix();
    },
    reloadMatrix: async () => {
      set({ loading: true, error: undefined });
      try {
        const remote = await fetchMatrix();
        set({
          matrix: ensureMatrixShape(remote),
          loading: false,
          loaded: true
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to load matrix";
        set({ loading: false, loaded: true, error: message });
      }
    },
    saveCell: async (bay, level, items) => {
      const current = get().matrix;
      const previous = structuredClone(current);
      const next = structuredClone(current);
      const cell: Cell = {
        bay,
        level,
        items,
        updated_by: "JAY", // TODO: replace with PIN user
        updated_at: new Date().toISOString()
      };
      next[bay][level] = cell;
      set({ matrix: next, editor: { open: false } });
      try {
        await pushMatrix(next);
      } catch {
        set({ matrix: previous });
      }
    },
    clearCell: async (bay, level) => {
      const current = get().matrix;
      const previous = structuredClone(current);
      const next = structuredClone(current);
      next[bay][level] = null;
      set({ matrix: next });
      try {
        await pushMatrix(next);
      } catch {
        set({ matrix: previous });
      }
    }
  };
});