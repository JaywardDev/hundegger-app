import React from "react";
import { useShallow } from "zustand/shallow";
import {
  BAYS,
  LEVELS,
  type Bay,
  type Cell,
  type Level
} from "../lib/types";
import type { MatrixPayload } from "../lib/api";
import { useMatrixStore } from "../store/useMatrixStore";

const TIMBER_HEIGHT = 68;
const TIMBER_GAP = 14;
const TIMBER_STEP = TIMBER_HEIGHT + TIMBER_GAP;
const STACK_BASE_OFFSET = 32;
const STACK_FALL_DISTANCE = 96;
const STAGE_HEIGHT = STACK_BASE_OFFSET + LEVELS.length * TIMBER_STEP;

type VisualStack = {
  id: string;
  bay: Bay;
  level: Level;
  cell: Cell;
  position: number;
  phase: "enter" | "stable" | "exit";
};

type ColumnState = Record<Bay, VisualStack[]>;

const buildStackId = (cell: Cell) => `${cell.bay}-${cell.level}-${cell.updated_at}`;

const buildInitialColumns = (matrix: MatrixPayload): ColumnState => {
  const columns = {} as ColumnState;
  for (const bay of BAYS) {
    const stacks: VisualStack[] = [];
    let position = 0;
    for (const level of LEVELS) {
      const cell = matrix[bay][level];
      if (!cell || !cell.items.length) continue;
      stacks.push({
        id: buildStackId(cell),
        bay,
        level,
        cell,
        position,
        phase: "stable"
      });
      position += 1;
    }
    columns[bay] = stacks;
  }
  return columns;
};

type StackTimberProps = {
  visual: VisualStack;
  editingEnabled: boolean;
  onOpenEditor: (bay: Bay, level: Level) => void;
  onEnterComplete: (bay: Bay, id: string) => void;
  onExitComplete: (bay: Bay, id: string) => void;
};

const StackTimber: React.FC<StackTimberProps> = ({
  visual,
  editingEnabled,
  onOpenEditor,
  onEnterComplete,
  onExitComplete
}) => {
  const { bay, level, cell, position, phase, id } = visual;
  const [dropStage, setDropStage] = React.useState<"start" | "settling">(
    phase === "enter" ? "start" : "settling"
  );
  const hasReportedEnter = React.useRef(phase !== "enter");
  const enterFrameRef = React.useRef<number | null>(null);
  const settleFrameRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (phase === "enter") {
      hasReportedEnter.current = false;
      setDropStage("start");
      enterFrameRef.current = requestAnimationFrame(() => {
        settleFrameRef.current = requestAnimationFrame(() => {
          setDropStage("settling");
        });
      });
      return () => {
        if (enterFrameRef.current !== null) cancelAnimationFrame(enterFrameRef.current);
        if (settleFrameRef.current !== null) cancelAnimationFrame(settleFrameRef.current);
      };
    }
    setDropStage("settling");
    return undefined;
  }, [phase]);

  React.useEffect(() => {
    return () => {
      if (enterFrameRef.current !== null) cancelAnimationFrame(enterFrameRef.current);
      if (settleFrameRef.current !== null) cancelAnimationFrame(settleFrameRef.current);
    };
  }, []);

  const baseTranslate = -position * TIMBER_STEP;
  const translateY =
    baseTranslate - (phase === "enter" && dropStage === "start" ? STACK_FALL_DISTANCE : 0);
  const disableTransition = phase === "enter" && dropStage === "start";

  const handleTransitionEnd = (event: React.TransitionEvent<HTMLButtonElement>) => {
    if (event.propertyName !== "transform") return;
    if (phase === "enter" && !hasReportedEnter.current) {
      hasReportedEnter.current = true;
      onEnterComplete(bay, id);
    }
  };

  const handleAnimationEnd = () => {
    if (phase === "exit") {
      onExitComplete(bay, id);
    }
  };

  const firstItem = cell.items[0];
  const additionalCount = cell.items.length - 1;
  const metaParts = [
    `${firstItem.length_mm}mm`,
    `${firstItem.pieces} pcs`
  ];
  if (additionalCount > 0) metaParts.push(`+${additionalCount}`);
  if (firstItem.grade) metaParts.push(firstItem.grade);
  if (firstItem.treatment) metaParts.push(firstItem.treatment);

  const titleLabel = `${bay} ${level} • ${firstItem.size_id} • ${firstItem.length_mm}mm • ${firstItem.pieces} pcs${
    additionalCount > 0 ? ` (+${additionalCount} more bundles)` : ""
  }`;

  return (
    <button
      type="button"
      className={`stack-timber${phase === "exit" ? " stack-timber--exiting" : ""}`}
      style={{
        height: `${TIMBER_HEIGHT}px`,
        bottom: `${STACK_BASE_OFFSET}px`,
        transform: `translate3d(0, ${translateY}px, 0)`,
        transition: disableTransition
          ? "none"
          : "transform 600ms cubic-bezier(0.19, 1, 0.22, 1)"
      }}
      onClick={() => editingEnabled && onOpenEditor(bay, level)}
      onTransitionEnd={handleTransitionEnd}
      disabled={!editingEnabled}
      aria-label={`Edit ${bay} ${level}`}
      title={titleLabel}
    >
      <span className="stack-timber__inner" onAnimationEnd={handleAnimationEnd}>
        <span className="stack-timber__label">{firstItem.size_id}</span>
        <span className="stack-timber__meta">{metaParts.join(" • ")}</span>
      </span>
    </button>
  );
};

export const StockGrid: React.FC = () => {
  const { matrix, setEditor, editingEnabled } = useMatrixStore(
    useShallow((state) => ({
      matrix: state.matrix,
      setEditor: state.setEditor,
      editingEnabled: state.editingEnabled
    }))
  );
  const [columns, setColumns] = React.useState<ColumnState>(() => buildInitialColumns(matrix));
  const hydratedRef = React.useRef(false);
  const gridClassName = editingEnabled ? "stack-grid" : "stack-grid stack-grid--locked";

  const openEditor = React.useCallback(
    (bay: Bay, level: Level) => {
      if (!editingEnabled) return;
      setEditor({ open: true, target: { bay, level } });
    },
    [editingEnabled, setEditor]
  );

  React.useEffect(() => {
    setColumns((previous) => {
      const nextColumns = {} as ColumnState;

      for (const bay of BAYS) {
        const prevStacks = previous[bay] ?? [];
        const activeStacks: VisualStack[] = [];
        const exitStacks: VisualStack[] = [];
        const consumedPrev = new Set<string>();
        let position = 0;

        for (const level of LEVELS) {
          const cell = matrix[bay][level];
          if (!cell || !cell.items.length) continue;

          const prevMatch = prevStacks.find(
            (stack) => stack.level === level && stack.phase !== "exit"
          );

          if (prevMatch && prevMatch.cell.updated_at === cell.updated_at) {
            activeStacks.push({
              ...prevMatch,
              cell,
              position,
              phase: prevMatch.phase === "enter" ? "enter" : "stable"
            });
            consumedPrev.add(prevMatch.id);
          } else {
            if (prevMatch && prevMatch.phase !== "exit") {
              exitStacks.push({ ...prevMatch, phase: "exit" });
              consumedPrev.add(prevMatch.id);
            }

            activeStacks.push({
              id: buildStackId(cell),
              bay,
              level,
              cell,
              position,
              phase: hydratedRef.current ? "enter" : "stable"
            });
          }

          position += 1;
        }

        for (const prevStack of prevStacks) {
          if (consumedPrev.has(prevStack.id)) continue;
          if (prevStack.phase === "exit") {
            exitStacks.push(prevStack);
          } else {
            exitStacks.push({ ...prevStack, phase: "exit" });
          }
        }

        nextColumns[bay] = [...activeStacks, ...exitStacks];
      }

      hydratedRef.current = true;
      return nextColumns;
    });
  }, [matrix]);

  const handleEnterComplete = React.useCallback((bay: Bay, id: string) => {
    setColumns((prev) => {
      const column = prev[bay];
      if (!column) return prev;
      let changed = false;
      const nextColumn = column.map((stack) => {
        if (stack.id === id && stack.phase === "enter") {
          changed = true;
          return { ...stack, phase: "stable" };
        }
        return stack;
      });
      if (!changed) return prev;
      return { ...prev, [bay]: nextColumn };
    });
  }, []);

  const handleExitComplete = React.useCallback((bay: Bay, id: string) => {
    setColumns((prev) => {
      const column = prev[bay];
      if (!column) return prev;
      const filtered = column.filter((stack) => stack.id !== id);
      if (filtered.length === column.length) return prev;
      return { ...prev, [bay]: filtered };
    });
  }, []);
  return (
    <div className="stack-grid-wrap">
      <div className={gridClassName}>
        {BAYS.map((bay) => {
          const columnStacks = columns[bay] ?? [];
          return (
            <div key={bay} className="stack-column" role="group" aria-label={`Bay ${bay}`}>
              <header className="stack-column__header">
                <span className="stack-column__title">{bay}</span>
                <span className="stack-column__count" aria-hidden="true">
                  {columnStacks.filter((stack) => stack.phase !== "exit").length}
                </span>
              </header>
              <div className="stack-column__stage" style={{ height: `${STAGE_HEIGHT}px` }}>
                <div className="stack-column__levels" aria-hidden="true">
                  {LEVELS.map((level, index) => {
                    const levelCell = matrix[bay][level];
                    const isFilled = !!levelCell && !!levelCell.items.length;
                    const markerBottom =
                      STACK_BASE_OFFSET + index * TIMBER_STEP + TIMBER_HEIGHT / 2;
                    const markerClass = `stack-level-marker${
                      isFilled ? " stack-level-marker--filled" : ""
                    }${editingEnabled ? "" : " stack-level-marker--disabled"}`;
                    const label = isFilled
                      ? `Edit ${bay} ${level}`
                      : `Add timber to ${bay} ${level}`;
                    return (
                      <button
                        key={level}
                        type="button"
                        className={markerClass}
                        style={{ bottom: `${markerBottom}px` }}
                        onClick={() => openEditor(bay, level)}
                        disabled={!editingEnabled}
                        aria-label={label}
                      >
                        <span className="visually-hidden">{label}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="stack-column__arena">
                  {columnStacks.map((stack) => (
                    <StackTimber
                      key={stack.id}
                      visual={stack}
                      editingEnabled={editingEnabled}
                      onOpenEditor={openEditor}
                      onEnterComplete={handleEnterComplete}
                      onExitComplete={handleExitComplete}
                    />
                  ))}
                  <div className="stack-column__base" aria-hidden="true" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};