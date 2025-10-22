export type Bay =
  | "B01" | "B02" | "B03" | "B04" | "B05" | "B06" | "B07"
  | "B08" | "B09" | "B10" | "B11" | "B12" | "B13";

export type Level =
  | "L01" | "L02" | "L03" | "L04" | "L05"
  | "L06" | "L07" | "L08" | "L09" | "L10";

export type StackItem = {
  size_id: string;        // e.g., "90x45"
  width_mm: number;
  thickness_mm: number;
  length_mm: number;      // e.g., 6000
  grade?: string;         // SG8/SG10
  treatment?: string;     // H1.2/H3.2
  pieces: number;
  bundle_id?: string;
  notes?: string;
};

export type Cell = {
  bay: Bay;
  level: Level;
  items: StackItem[];     // allow mixed
  updated_by: string;     // hardcode or PIN later
  updated_at: string;     // ISO string
  locked?: boolean;
};

export type Snapshot = {
  id: string;
  area: "12m Floor";
  taken_at: string;
  taken_by: string;
  matrix: Record<Bay, Record<Level, Cell | null>>;
};

export const BAYS: Bay[] = Array.from({ length: 13 }, (_, i) =>
  `B${String(i + 1).padStart(2, "0")}` as Bay
);

export const LEVELS: Level[] = Array.from({ length: 10 }, (_, i) =>
  `L${String(i + 1).padStart(2, "0")}` as Level
);
