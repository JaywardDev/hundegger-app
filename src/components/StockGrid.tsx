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

type DragState = {
  bay: Bay;
  id: string;
  pointerId: number;
  startY: number;
  originIndex: number;
  currentIndex: number;
  offset: number;
  hasMoved: boolean;
};

const CELL_ID_SEPARATOR = "::";

const buildStackId = (cell: Cell) =>
  `${cell.bay}${CELL_ID_SEPARATOR}${cell.level}${CELL_ID_SEPARATOR}${cell.updated_at}`;

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

const moveItem = <T,>(array: T[], from: number, to: number) => {
  if (from === to) return array;
  const copy = [...array];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
};

const composeColumn = (active: VisualStack[], exiting: VisualStack[]) => {
  const next: VisualStack[] = [];
  active.forEach((stack, index) => {
    next.push({ ...stack, position: index, phase: stack.phase });
  });
  exiting.forEach((stack, index) => {
    next.push({ ...stack, position: active.length + index });
  });
  return next;
};

const clampIndex = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

type StackTimberProps = {
  visual: VisualStack;
  editingEnabled: boolean;
  onOpenEditor: (bay: Bay, level: Level) => void;
  onEnterComplete: (bay: Bay, id: string) => void;
  onExitComplete: (bay: Bay, id: string) => void;
  onPointerDown?: (
    event: React.PointerEvent<HTMLButtonElement>,
    stack: VisualStack
  ) => void;
  onPointerMove?: (
    event: React.PointerEvent<HTMLButtonElement>,
    stack: VisualStack
  ) => void;
  onPointerUp?: (
    event: React.PointerEvent<HTMLButtonElement>,
    stack: VisualStack
  ) => void;
  isDragging?: boolean;
  dragOffset?: number;
  isMatched?: boolean;
};

const StackTimber: React.FC<StackTimberProps> = ({
  visual,
  editingEnabled,
  onOpenEditor,
  onEnterComplete,
  onExitComplete,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  isDragging,
  dragOffset,
  isMatched
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
  const enterOffset = phase === "enter" && dropStage === "start" ? STACK_FALL_DISTANCE : 0;
  const translateY = baseTranslate - enterOffset + (isDragging ? dragOffset ?? 0 : 0);
  const disableTransition = (phase === "enter" && dropStage === "start") || !!isDragging;

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
      className={`stack-timber${phase === "exit" ? " stack-timber--exiting" : ""}${
        isDragging ? " stack-timber--dragging" : ""
      }${isMatched ? " stack-timber--matched" : ""}`}
      style={{
        height: `${TIMBER_HEIGHT}px`,
        bottom: `${STACK_BASE_OFFSET}px`,
        transform: `translate3d(0, ${translateY}px, 0)`,
        transition: disableTransition
          ? "none"
          : "transform 600ms cubic-bezier(0.19, 1, 0.22, 1)"
      }}
      onPointerDown={(event) => {
        if (!editingEnabled) return;
        onPointerDown?.(event, visual);
      }}
      onPointerMove={(event) => {
        if (!editingEnabled) return;
        onPointerMove?.(event, visual);
      }}
      onPointerUp={(event) => {
        if (!editingEnabled) return;
        onPointerUp?.(event, visual);
      }}
      onPointerCancel={(event) => {
        if (!editingEnabled) return;
        onPointerUp?.(event, visual);
      }}
      onDoubleClick={(event) => {
        if (!editingEnabled) return;
        event.preventDefault();
        onOpenEditor(bay, level);
      }}
      onKeyDown={(event) => {
        if (!editingEnabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenEditor(bay, level);
        }
      }}
      onTransitionEnd={handleTransitionEnd}
      disabled={!editingEnabled}
      aria-label={`Edit ${bay} ${level}`}
      title={titleLabel}
    >
      <span className="stack-timber__inner" onAnimationEnd={handleAnimationEnd}>
        <span className="stack-timber__texture" aria-hidden="true" />
        <span className="stack-timber__straps" aria-hidden="true" />
        <span className="stack-timber__label-card">
          <span className="stack-timber__label">{firstItem.size_id}</span>
          <span className="stack-timber__meta">{metaParts.join(" • ")}</span>
        </span>
      </span>
    </button>
  );
};

type MatchedCells = Partial<Record<Bay, Set<Level>>>;

type StockGridProps = {
  matchedCells?: MatchedCells;
};

export const StockGrid: React.FC<StockGridProps> = ({ matchedCells }) => {
  const { matrix, setEditor, editingEnabled, reorderBay } = useMatrixStore(
    useShallow((state) => ({
      matrix: state.matrix,
      setEditor: state.setEditor,
      editingEnabled: state.editingEnabled,
      reorderBay: state.reorderBay
    }))
  );
  const [columns, setColumns] = React.useState<ColumnState>(() => buildInitialColumns(matrix));
  const columnsRef = React.useRef(columns);
  React.useEffect(() => {
    columnsRef.current = columns;
  }, [columns]);  
  const hydratedRef = React.useRef(false);
  const gridClassName = editingEnabled ? "stack-grid" : "stack-grid stack-grid--locked";
  const [dragState, setDragState] = React.useState<DragState | null>(null);
  const dragPreventClickRef = React.useRef(false);
  const lastTouchTapRef = React.useRef<{ time: number; id: string } | null>(null);
  const longPressTimerRef = React.useRef<number | null>(null);
  const longPressTriggeredRef = React.useRef(false);

  const clearLongPress = React.useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);  

  const openEditor = React.useCallback(
    (bay: Bay, level: Level, intent: "add" | "edit") => {
      if (!editingEnabled) return;
      setEditor({ open: true, target: { bay, level }, intent });
    },
    [editingEnabled, setEditor]
  );

  const handleEditStack = React.useCallback(
    (bay: Bay, level: Level) => {
      if (dragPreventClickRef.current) {
        dragPreventClickRef.current = false;
        return;
      }
      openEditor(bay, level, "edit");
    },
    [openEditor]
  );

  const handleAddStack = React.useCallback(
    (bay: Bay) => {
      if (!editingEnabled) return;
      const availableLevel = LEVELS.find((level) => {
        const cell = matrix[bay][level];
        return !cell || !cell.items.length;
      });
      if (!availableLevel) return;
      openEditor(bay, availableLevel, "add");
    },
    [editingEnabled, matrix, openEditor]
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

  React.useEffect(() => {
    setDragState(null);
    dragPreventClickRef.current = false;
  }, [matrix]);

  const handleDragStart = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>, stack: VisualStack) => {
      if (!editingEnabled || stack.phase === "exit") return;
      const columnStacks = columnsRef.current[stack.bay] ?? [];
      const activeStacks = columnStacks.filter((item) => item.phase !== "exit");
      const index = activeStacks.findIndex((item) => item.id === stack.id);
      if (index === -1) return;
      dragPreventClickRef.current = false;
      longPressTriggeredRef.current = false;
      clearLongPress();
      if (event.pointerType === "touch") {
        longPressTimerRef.current = window.setTimeout(() => {
          longPressTimerRef.current = null;
          longPressTriggeredRef.current = true;
          handleEditStack(stack.bay, stack.level);
        }, 500);
      }      
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragState({
        bay: stack.bay,
        id: stack.id,
        pointerId: event.pointerId,
        startY: event.clientY,
        originIndex: index,
        currentIndex: index,
        offset: 0,
        hasMoved: false
      });
    },
    [clearLongPress, editingEnabled, handleEditStack]
  );

  const handleDragMove = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>, stack: VisualStack) => {
      if (!editingEnabled) return;
      setDragState((state) => {
        if (!state || state.id !== stack.id) return state;
        const columnStacks = columnsRef.current[stack.bay] ?? [];
        const activeStacks = columnStacks.filter((item) => item.phase !== "exit");
        if (activeStacks.length <= 1) {
          return { ...state, offset: event.clientY - state.startY };
        }

        const delta = event.clientY - state.startY;
        if (Math.abs(delta) > 4) {
          dragPreventClickRef.current = true;
          clearLongPress();
        }

        const displacement = Math.round(-delta / TIMBER_STEP);
        let targetIndex = state.originIndex + displacement;
        targetIndex = clampIndex(targetIndex, 0, activeStacks.length - 1);

        const currentIndex = activeStacks.findIndex((item) => item.id === stack.id);
        const fromIndex = currentIndex === -1 ? state.currentIndex : currentIndex;

        if (targetIndex !== fromIndex) {
          setColumns((prev) => {
            const prevColumn = prev[stack.bay] ?? [];
            const active = prevColumn.filter((item) => item.phase !== "exit");
            const exiting = prevColumn.filter((item) => item.phase === "exit");
            const sourceIndex = active.findIndex((item) => item.id === stack.id);
            if (sourceIndex === -1) return prev;
            const reordered = moveItem(active, sourceIndex, targetIndex);
            const composed = composeColumn(reordered, exiting);
            return { ...prev, [stack.bay]: composed };
          });
          return {
            ...state,
            startY: event.clientY,
            originIndex: targetIndex,
            currentIndex: targetIndex,
            offset: 0,
            hasMoved: true
          };
        }

        return { ...state, offset: delta };
      });
    },
    [clearLongPress, editingEnabled, setColumns]
  );

  const handleDragEnd = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>, stack: VisualStack) => {
      const target = event.currentTarget;
      const pointerType = event.pointerType;
      let shouldRequestEdit = false;
      const wasLongPress = longPressTriggeredRef.current;
      longPressTriggeredRef.current = false;
      clearLongPress();      

      setDragState((state) => {
        if (!state || state.id !== stack.id) return state;
        if (target?.hasPointerCapture(state.pointerId)) {
          target.releasePointerCapture(state.pointerId);
        }

        setColumns((prev) => {
          const prevColumn = prev[stack.bay] ?? [];
          const active = prevColumn.filter((item) => item.phase !== "exit");
          const exiting = prevColumn.filter((item) => item.phase === "exit");
          return { ...prev, [stack.bay]: composeColumn(active, exiting) };
        });

        if (state.hasMoved) {
          const columnStacks = columnsRef.current[stack.bay] ?? [];
          const activeStacks = columnStacks
            .filter((item) => item.phase !== "exit")
            .map((item) => item.id);
          void reorderBay(stack.bay, activeStacks);
          dragPreventClickRef.current = true;
          lastTouchTapRef.current = null;
          clearLongPress();        
        } else {
          dragPreventClickRef.current = false;

          if (wasLongPress) {
            dragPreventClickRef.current = true;
            lastTouchTapRef.current = null;
          } else if (pointerType === "touch") {
            const now = Date.now();
            const tapId = stack.id;
            const lastTap = lastTouchTapRef.current;

            if (lastTap && lastTap.id === tapId && now - lastTap.time < 350) {
              shouldRequestEdit = true;
              lastTouchTapRef.current = null;
            } else {
              lastTouchTapRef.current = { time: now, id: tapId };
            }
          } else {
            lastTouchTapRef.current = null;
          }
        }

        return null;
      });

      if (shouldRequestEdit) {
        handleEditStack(stack.bay, stack.level);
      }
    },
    [clearLongPress, handleEditStack, reorderBay, setColumns]
  );

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
          const activeStacks = columnStacks.filter((stack) => stack.phase !== "exit");
          const canAdd = LEVELS.some((level) => {
            const cell = matrix[bay][level];
            return !cell || !cell.items.length;
          });          
          return (
            <div key={bay} className="stack-column" role="group" aria-label={`Bay ${bay}`}>
              <header className="stack-column__header">
                <span className="stack-column__title">{bay}</span>
                <div className="stack-column__actions">
                  <span className="stack-column__count" aria-hidden="true">
                    {activeStacks.length}
                  </span>
                  <button
                    type="button"
                    className="stack-column__add"
                    onClick={() => handleAddStack(bay)}
                    disabled={!editingEnabled || !canAdd}
                    aria-label={`Add timber to bay ${bay}`}
                  >
                    +
                  </button>
                </div>
              </header>
              <div className="stack-column__stage" style={{ height: `${STAGE_HEIGHT}px` }}>
                <div className="stack-column__arena">
                  {columnStacks.map((stack) => (
                    <StackTimber
                      key={stack.id}
                      visual={stack}
                      editingEnabled={editingEnabled && stack.phase !== "exit"}
                      onOpenEditor={handleEditStack}
                      onEnterComplete={handleEnterComplete}
                      onExitComplete={handleExitComplete}
                      onPointerDown={stack.phase !== "exit" ? handleDragStart : undefined}
                      onPointerMove={stack.phase !== "exit" ? handleDragMove : undefined}
                      onPointerUp={stack.phase !== "exit" ? handleDragEnd : undefined}
                      isDragging={
                        stack.phase !== "exit" &&
                        dragState?.id === stack.id &&
                        dragState?.bay === bay
                      }
                      dragOffset={
                        stack.phase !== "exit" && dragState?.id === stack.id
                          ? dragState?.offset ?? 0
                          : 0
                      }
                      isMatched={stack.phase !== "exit" && matchedCells?.[bay]?.has(stack.level)}                   
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