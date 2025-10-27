import http from "http";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath, URL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "data");
const MATRIX_FILE = path.join(DATA_DIR, "matrix.json");
const STATIC_DIR = path.resolve(__dirname, "..", "dist");
const STATIC_INDEX = path.join(STATIC_DIR, "index.html");

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

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp"
};

const respondWithFile = async (res, statusCode, filePath, originHeaders) => {
  const data = await fs.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
  res.writeHead(statusCode, {
    ...originHeaders,
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(data)
  });
  res.end(data);
};

const fileExists = async (filePath) => {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
};

const tryServeStatic = async (req, res, pathname, originHeaders) => {
  try {
    const normalized = path.posix.normalize(pathname);
    if (normalized.includes("..")) {
      return false;
    }

    const relativePath = normalized.startsWith("/") ? normalized.slice(1) : normalized;
    const resolvedPath = path.resolve(STATIC_DIR, relativePath);
    const insideStaticDir =
      resolvedPath === STATIC_DIR || resolvedPath.startsWith(`${STATIC_DIR}${path.sep}`);
    if (!insideStaticDir) {
      return false;
    }

    let filePath = resolvedPath;

    let stats = await fs.stat(filePath).catch((error) => {
      if (error.code === "ENOENT") {
        return null;
      }
      throw error;
    });

    if (stats?.isDirectory()) {
      filePath = path.join(filePath, "index.html");
      stats = await fs.stat(filePath).catch((error) => {
        if (error.code === "ENOENT") {
          return null;
        }
        throw error;
      });
    }

    if (stats?.isFile()) {
      await respondWithFile(res, 200, filePath, originHeaders);
      return true;
    }

    const acceptsHtml = (req.headers["accept"] ?? "").includes("text/html");
    if (acceptsHtml && (await fileExists(STATIC_INDEX))) {
      await respondWithFile(res, 200, STATIC_INDEX, originHeaders);
      return true;
    }

    return false;
  } catch (error) {
    console.error("Static asset error", error);
    return false;
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

    if (req.method === "GET") {
      const served = await tryServeStatic(req, res, pathname, originHeaders);
      if (served) {
        return;
      }
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