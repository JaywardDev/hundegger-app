import ExcelJS from "exceljs";
import { BAYS, LEVELS, type Bay, type Level, type Cell } from "./types";
import { linearMeters, cubicMeters } from "./calc";

export async function exportWorkbook(matrix: Record<Bay, Record<Level, Cell | null>>) {
  const wb = new ExcelJS.Workbook();

  // 1) Matrix_View
  const ws1 = wb.addWorksheet("Matrix_View");
  // Headers
  ws1.getCell(1, 1).value = "";
  BAYS.forEach((bay, idx) => ws1.getCell(1, 2 + idx).value = bay);
  const levelOrder = [...LEVELS].reverse();

  levelOrder.forEach((lvl, r) => {
    ws1.getCell(2 + r, 1).value = lvl;
    BAYS.forEach((bay, c) => {
      const cell = matrix[bay][lvl];
      const excelCell = ws1.getCell(2 + r, 2 + c);
      if (!cell || !cell.items.length) {
        excelCell.value = "";
      } else if (cell.items.length === 1) {
        const it = cell.items[0];
        excelCell.value = formatItemSummary(it);
      } else {
        const [first, ...rest] = cell.items;
        excelCell.value = `${formatItemSummary(first)} +${rest.length}`;
        const comment = cell.items
          .map((it) => formatItemSummary(it))
          .join("\n");
        // comments are supported in ExcelJS via note
        excelCell.note = comment;
      }
    });
  });

  // 2) Normalized_Data
  const ws2 = wb.addWorksheet("Normalized_Data");
  const headers = [
    "Area","Bay","Level","Bundle_ID","Width_mm","Thickness_mm","Size","Length_mm",
    "Grade","Treatment","Pieces","Linear_m","Cubic_m","Updated_By","Updated_At","Notes"
  ];
  ws2.addRow(headers);

  for (const bay of BAYS) {
    for (const level of levelOrder) {
      const cell = matrix[bay][level];
      if (!cell) continue;
      for (const it of cell.items) {
        ws2.addRow([
          "12m Floor",
          bay,
          level,
          it.bundle_id ?? "",
          it.width_mm,
          it.thickness_mm,
          it.size_id,
          it.length_mm,
          it.grade ?? "",
          it.treatment ?? "",
          it.pieces,
          linearMeters(it),
          cubicMeters(it),
          cell.updated_by,
          cell.updated_at,
          it.notes ?? ""
        ]);
      }
    }
  }

  // Download in browser
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `Timber_Stocktake_${new Date().toISOString().slice(0,10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function formatItemSummary(it: Cell["items"][number]) {
  const parts = [it.size_id];
  if (it.length_mm !== 12000) {
    parts.push(`${it.length_mm}mm`);
  }
  if (it.grade && it.grade !== "LVL11") {
    parts.push(it.grade);
  }
  if (it.treatment && it.treatment !== "H1.2") {
    parts.push(it.treatment);
  }

  return `${parts.join(" ")} (${it.pieces})`;
}
