import { createClient } from "@supabase/supabase-js";

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

const ensureBayLevels = (bay, levels) => {
  const source = levels && typeof levels === "object" ? levels : {};
  const next = {};

  for (const level of LEVELS) {
    const cell = source[level];
    if (cell && typeof cell === "object") {
      next[level] = {
        ...cell,
        bay,
        level,
        items: Array.isArray(cell.items) ? cell.items : []
      };
    } else {
      next[level] = null;
    }
  }

  return next;
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

let cachedClient = null;

const getSupabaseClient = () => {
  if (cachedClient) return cachedClient;
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    const missing = [];
    if (!SUPABASE_URL) missing.push("SUPABASE_URL");
    if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    const error = new Error(`Missing Supabase environment variables: ${missing.join(", ")}`);
    error.code = "MISSING_ENV";
    throw error;
  }
  cachedClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });
  return cachedClient;
};

const parseRequestBody = async (req) => {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (error) {
      return null;
    }
  }

  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
};

const mapItems = (items, cellId) => {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    cell_id: cellId,
    size_id: item.size_id ?? null,
    width_mm: item.width_mm ?? null,
    thickness_mm: item.thickness_mm ?? null,
    length_mm: item.length_mm ?? null,
    grade: item.grade ?? null,
    treatment: item.treatment ?? null,
    pieces: item.pieces ?? null,
    bundle_id: item.bundle_id ?? null,
    notes: item.notes ?? null,
    position: item.position ?? null
  }));
};

const buildMatrixFromRows = (rows) => {
  const matrix = buildEmptyMatrix();
  if (!Array.isArray(rows)) return matrix;
  for (const row of rows) {
    const bay = row?.bay_code;
    const level = row?.level_code;
    if (!bay || !level || !matrix[bay] || !(level in matrix[bay])) continue;
    const items = Array.isArray(row.stock_items)
      ? row.stock_items.map((item) => ({
          id: item.id,
          cell_id: item.cell_id,
          size_id: item.size_id,
          width_mm: item.width_mm,
          thickness_mm: item.thickness_mm,
          length_mm: item.length_mm,
          grade: item.grade,
          treatment: item.treatment,
          pieces: item.pieces,
          bundle_id: item.bundle_id,
          notes: item.notes,
          position: item.position
        }))
      : [];
    matrix[bay][level] = {
      id: row.id,
      bay,
      level,
      area_id: row.area_id,
      locked: row.locked ?? false,
      updated_at: row.updated_at,
      updated_by: row.updated_by,
      items
    };
  }
  return matrix;
};

const fetchMatrix = async (supabase) => {
  const { data, error } = await supabase
    .from("stock_cells")
    .select("id, area_id, bay_code, level_code, locked, updated_at, updated_by, stock_items(*)")
    .eq("area_id", "default");
  if (error) throw error;
  return buildMatrixFromRows(data);
};

const replaceMatrix = async (supabase, matrix) => {
  const ensuredMatrix = ensureMatrixShape(matrix);

  const { data: existingCells, error: fetchError } = await supabase
    .from("stock_cells")
    .select("id")
    .eq("area_id", "default");
  if (fetchError) throw fetchError;

  const cellIds = Array.isArray(existingCells) ? existingCells.map((cell) => cell.id) : [];
  if (cellIds.length > 0) {
    const { error: deleteItemsError } = await supabase
      .from("stock_items")
      .delete()
      .in("cell_id", cellIds);
    if (deleteItemsError) throw deleteItemsError;
  }

  const { error: deleteCellsError } = await supabase
    .from("stock_cells")
    .delete()
    .eq("area_id", "default");
  if (deleteCellsError) throw deleteCellsError;

  for (const bay of BAYS) {
    const levels = ensuredMatrix[bay];
    if (!levels) continue;
    for (const level of LEVELS) {
      const cell = levels[level];
      if (!cell) continue;

      const { data: insertedCell, error: insertCellError } = await supabase
        .from("stock_cells")
        .insert({
          area_id: "default",
          bay_code: bay,
          level_code: level,
          locked: Boolean(cell.locked),
          updated_by: cell.updated_by ?? null
        })
        .select()
        .single();
      if (insertCellError) throw insertCellError;

      const itemsPayload = mapItems(cell.items, insertedCell.id);
      if (itemsPayload.length > 0) {
        const { error: insertItemsError } = await supabase
          .from("stock_items")
          .insert(itemsPayload);
        if (insertItemsError) throw insertItemsError;
      }
    }
  }
};

const replaceBay = async (supabase, bay, levels) => {
  const ensuredLevels = ensureBayLevels(bay, levels);

  const { data: existingCells, error: fetchError } = await supabase
    .from("stock_cells")
    .select("id")
    .eq("area_id", "default")
    .eq("bay_code", bay);
  if (fetchError) throw fetchError;

  const cellIds = Array.isArray(existingCells) ? existingCells.map((cell) => cell.id) : [];
  if (cellIds.length > 0) {
    const { error: deleteItemsError } = await supabase
      .from("stock_items")
      .delete()
      .in("cell_id", cellIds);
    if (deleteItemsError) throw deleteItemsError;
  }

  const { error: deleteCellsError } = await supabase
    .from("stock_cells")
    .delete()
    .eq("area_id", "default")
    .eq("bay_code", bay);
  if (deleteCellsError) throw deleteCellsError;

  for (const level of LEVELS) {
    const cell = ensuredLevels[level];
    if (!cell) continue;

    const { data: insertedCell, error: insertCellError } = await supabase
      .from("stock_cells")
      .insert({
        area_id: "default",
        bay_code: bay,
        level_code: level,
        locked: Boolean(cell.locked),
        updated_by: cell.updated_by ?? null
      })
      .select()
      .single();
    if (insertCellError) throw insertCellError;

    const itemsPayload = mapItems(cell.items, insertedCell.id);
    if (itemsPayload.length > 0) {
      const { error: insertItemsError } = await supabase
        .from("stock_items")
        .insert(itemsPayload);
      if (insertItemsError) throw insertItemsError;
    }
  }
};

export default async function handler(req, res) {
  let supabase;
  try {
    supabase = getSupabaseClient();
  } catch (error) {
    if (error.code === "MISSING_ENV") {
      res.status(500).json({ error: error.message });
      return;
    }
    console.error("Failed to initialize Supabase client", error);
    res.status(500).json({ error: "Internal server error" });
    return;
  }

  if (req.method === "GET") {
    try {
      const matrix = await fetchMatrix(supabase);
      res.status(200).json(matrix);
    } catch (error) {
      console.error("Matrix GET error", error);
      res.status(500).json({ error: "Internal server error" });
    }
    return;
  }

  if (req.method === "PUT") {
    try {
      const payload = await parseRequestBody(req);
      if (!payload || typeof payload !== "object") {
        res.status(400).json({ error: "Invalid matrix payload" });
        return;
      }

      await replaceMatrix(supabase, payload);
      const matrix = await fetchMatrix(supabase);
      res.status(200).json(matrix);
    } catch (error) {
      if (error && error.status === 400) {
        res.status(400).json({ error: error.message || "Invalid matrix payload" });
        return;
      }
      console.error("Matrix PUT error", error);
      res.status(500).json({ error: "Internal server error" });
    }
    return;
  }

  if (req.method === "PATCH") {
    try {
      const payload = await parseRequestBody(req);
      const bay = payload?.bay;

      if (!payload || typeof payload !== "object" || !bay) {
        res.status(400).json({ error: "Invalid bay payload" });
        return;
      }

      if (!BAYS.includes(bay)) {
        res.status(400).json({ error: "Bay is out of range" });
        return;
      }

      await replaceBay(supabase, bay, payload.levels);
      const matrix = await fetchMatrix(supabase);
      res.status(200).json(matrix);
    } catch (error) {
      console.error("Matrix PATCH error", error);
      res.status(500).json({ error: "Internal server error" });
    }
    return;
  }

  res.setHeader("Allow", "GET, PUT, PATCH");
  res.status(405).json({ error: "Method not allowed" });
} 