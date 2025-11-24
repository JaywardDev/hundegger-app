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
  persistBay,
  type BayPayload,
  type MatrixPayload
} from "../lib/api";
import type { AuthenticatedUser } from "../lib/users";

type EditorIntent = "add" | "edit";

type EditorState = {
  open: boolean;
  target?: { bay: Bay; level: Level };
  intent?: EditorIntent;
};

type MatrixStore = {
  matrix: MatrixPayload;
  editor: EditorState;
  loading: boolean;
  loaded: boolean;
  syncing: boolean;
  error?: string;
  editingEnabled: boolean;
  currentUser?: AuthenticatedUser; 
  setEditor: (editor: EditorState) => void;
  enableEditing: (user: AuthenticatedUser) => void;
  disableEditing: () => void;
  loadMatrix: () => Promise<void>;
  reloadMatrix: () => Promise<void>;
  saveCell: (
    bay: Bay,
    level: Level,
    items: StackItem[],
    options?: { moveToTop?: boolean; moveTo?: boolean }
  ) => Promise<void>;
  clearCell: (bay: Bay, level: Level) => Promise<void>;
  reorderBay: (bay: Bay, orderedIds: string[]) => Promise<void>;
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

const CELL_ID_SEPARATOR = "::";

const buildCellId = (cell: Cell) =>
  `${cell.bay}${CELL_ID_SEPARATOR}${cell.level}${CELL_ID_SEPARATOR}${cell.updated_at}`;

const rebuildBayLevels = (
  bay: Bay,
  cells: (Cell | null)[],
  base: Record<Level, Cell | null>
) => {
  const nextColumn = {} as Record<Level, Cell | null>;
  for (const level of LEVELS) {
    nextColumn[level] = null;
  }

  cells.forEach((cell, index) => {
    if (!cell) return;
    const level = LEVELS[index];
    const source = base[cell.level];
    const payload = source ? { ...source, ...cell } : cell;
    nextColumn[level] = { ...payload, bay, level };
  });

  return nextColumn;
};

export const useMatrixStore = create<MatrixStore>()((set, get) => {
  const pushBay = async (bay: Bay, levels: BayPayload) => {
    set({ syncing: true, error: undefined });
    try {
      const remote = await persistBay(bay, levels);
      set({ syncing: false, matrix: ensureMatrixShape(remote) });
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
    editingEnabled: false,
    setEditor: (editor) =>
      set((state) => {
        if (editor.open && !state.editingEnabled) {
          return { editor: { open: false } };
        }
        return { editor };
      }),
    enableEditing: (user) =>
      set({ editingEnabled: true, currentUser: user, editor: { open: false } }),
    disableEditing: () => set({ editingEnabled: false, currentUser: undefined, editor: { open: false } }),
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
    saveCell: async (bay, level, items, options) => {
      const current = get().matrix;
      const user = get().currentUser;
      const previous = structuredClone(current);
      const next = structuredClone(current);
      const cell: Cell = {
        bay,
        level,
        items,
        updated_by: user ? `${user.name} (${user.title})` : "Unknown user",
        updated_at: new Date().toISOString()
      };
      next[bay][level] = cell;

      if (options?.moveToTop) {
        const orderedCells = LEVELS.map((lvl) => next[bay][lvl]).filter(
          (value): value is Cell => !!value
        );
        const targetIndex = orderedCells.findIndex(
          (entry) => entry.updated_at === cell.updated_at
        );
        if (targetIndex !== -1) {
          const [targetCell] = orderedCells.splice(targetIndex, 1);
          orderedCells.push(targetCell);
          next[bay] = rebuildBayLevels(bay, orderedCells, next[bay]);
        }
      }

      set({ matrix: next, editor: { open: false } });
      try {
        await pushBay(bay, next[bay]);
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
        await pushBay(bay, next[bay]);
      } catch {
        set({ matrix: previous });
      }
    },
    reorderBay: async (bay, orderedIds) => {
      const current = get().matrix;
      const previous = structuredClone(current);
      const next = structuredClone(current);

      const existingCells = LEVELS.map((level) => next[bay][level]).filter(
        (value): value is Cell => !!value
      );

      const idToCell = new Map(existingCells.map((cell) => [buildCellId(cell), cell]));
      const orderedCells: (Cell | null)[] = [];
      for (const id of orderedIds) {
        const cell = idToCell.get(id);
        if (cell) {
          orderedCells.push(cell);
          idToCell.delete(id);
        }
      }

      for (const cell of idToCell.values()) orderedCells.push(cell);

      next[bay] = rebuildBayLevels(bay, orderedCells, next[bay]);

      set({ matrix: next });
      try {
        await pushBay(bay, next[bay]);
      } catch {
        set({ matrix: previous });
      }
    }
  };
});