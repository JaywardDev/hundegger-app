import http from "http";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath, URL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "data");
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

async function readMatrixFile() {
  try {
    const contents = await fs.readFile(MATRIX_FILE, "utf8");
    return ensureMatrixShape(JSON.parse(contents));
  } catch (error) {
    if (error.code === "ENOENT") {
      const matrix = buildEmptyMatrix();
      await writeMatrixFile(matrix);
      return matrix;
    }
    throw error;
  }
}

async function writeMatrixFile(matrix) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(MATRIX_FILE, JSON.stringify(matrix, null, 2));
}

const ALLOWED_ORIGIN = process.env.MATRIX_SERVER_ALLOW_ORIGIN ?? "*";

const sendJson = (res, statusCode, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(body);
};

const parseBody = async (req) => {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 1_000_000) {
      throw new Error("Payload too large");
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    const parseError = new Error("Invalid JSON");
    parseError.statusCode = 400;
    throw parseError;
  }
};

const server = http.createServer(async (req, res) => {
  const originHeaders = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (!req.url) {
    res.writeHead(400, originHeaders);
    res.end();
    return;
  }

  const { pathname } = new URL(req.url, "http://localhost");

  if (req.method === "OPTIONS") {
    res.writeHead(204, originHeaders);
    res.end();
    return;
  }

  try {
    if (req.method === "GET" && pathname === "/healthz") {
      sendJson(res, 200, { status: "ok" });
      return;
    }

    if (req.method === "GET" && pathname === "/matrix") {
      const matrix = await readMatrixFile();
      sendJson(res, 200, matrix);
      return;
    }

    if (req.method === "PUT" && pathname === "/matrix") {
      const payload = await parseBody(req);
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        sendJson(res, 400, { error: "Matrix payload must be an object" });
        return;
      }
      const matrix = ensureMatrixShape(payload);
      await writeMatrixFile(matrix);
      sendJson(res, 200, matrix);
      return;
    }

    res.writeHead(404, {
      ...originHeaders,
      "Content-Type": "application/json"
    });
    res.end(JSON.stringify({ error: "Not found" }));
  } catch (error) {
    console.error("Matrix API error", error);
    if (error.message === "Payload too large") {
      sendJson(res, 413, { error: "Payload too large" });
      return;
    }
    if (error.statusCode === 400) {
      sendJson(res, 400, { error: error.message });
      return;
    }
    sendJson(res, 500, { error: "Internal server error" });
  }
});

const PORT = Number(process.env.MATRIX_SERVER_PORT ?? 4000);

server.listen(PORT, () => {
  console.log(`Hundegger matrix API listening on port ${PORT}`);
});