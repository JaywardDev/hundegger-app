import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "server", "data");
const MATRIX_FILE = path.join(DATA_DIR, "matrix.json");

const BAYS = Array.from({ length: 13 }, (_, i) => `B${String(i + 1).padStart(2, "0")}`);
const LEVELS = Array.from({ length: 10 }, (_, i) => `L${String(i + 1).padStart(2, "0")}`);

const buildEmptyMatrix = () => {
  const matrix = {};
  for (const bay of BAYS) {
    matrix[bay] = {};
    for (const level of LEVELS) {
      matrix[bay][level] = null;
    }
  }
  return matrix;
};

const ensureMatrixShape = (matrix) => {
  const next = buildEmptyMatrix();
  if (!matrix || typeof matrix !== "object") return next;
  for (const bay of BAYS) {
    const levels = matrix[bay];
    if (!levels || typeof levels !== "object") continue;
    for (const level of LEVELS) {
      const cell = levels[level];
      if (cell && typeof cell === "object") {
        next[bay][level] = {
          ...cell,
          bay,
          level,
          items: Array.isArray(cell.items) ? cell.items : []
        };
      } else {
        next[bay][level] = null;
      }
    }
  }
  return next;
};

async function writeMatrixFile(matrix) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(MATRIX_FILE, JSON.stringify(matrix, null, 2));
}

async function readMatrixFile() {
  try {
    const contents = await fs.readFile(MATRIX_FILE, "utf8");
    return ensureMatrixShape(JSON.parse(contents));
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      const matrix = buildEmptyMatrix();
      await writeMatrixFile(matrix);
      return matrix;
    }
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const matrix = await readMatrixFile();
    res.status(200).json(matrix);
  } catch (error) {
    console.error("Matrix handler error", error);
    res.status(500).json({ error: "Internal server error" });
  }
}