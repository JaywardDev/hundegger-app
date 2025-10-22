import type { StackItem } from "./types";

export const linearMeters = (it: StackItem) => (it.pieces * it.length_mm) / 1000;
export const cubicMeters = (it: StackItem) =>
  (it.width_mm * it.thickness_mm * it.length_mm * it.pieces) / 1e9;
