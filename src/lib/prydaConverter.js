// Shared CSV -> PSF conversion.
//
// Imported by both the browser page (src/pages/PrydaConversionPage.tsx) and the
// command line tool (pryda_converter/csv-to-members.js) so the two can never
// drift apart again. Keep this file dependency free and runnable in both places:
// TextEncoder, DataView and Uint8Array are all available in browsers and Node 20+.

/**
 * @typedef {{ end: number, location: number, angle: number, angleOffset: number }} EndCut
 * @typedef {{ endCut: EndCut }} Cut
 * @typedef {{
 *   ID: number,
 *   job: string,
 *   truss: string,
 *   member: string,
 *   type: string,
 *   width: number,
 *   thickness: number,
 *   length: number,
 *   material: string,
 *   quantity: number,
 *   done: number,
 *   cuts: Cut[],
 * }} Member
 * @typedef {"error" | "warning"} IssueSeverity
 * @typedef {{ line: number, code: string, message: string, raw: string, severity: IssueSeverity }} RowIssue
 * @typedef {{ meta: typeof PSF_META, members: Member[] }} PsfPayload
 */

/**
 * How to treat a row carrying more than one length.
 * @typedef {"reject" | "first"} MultipleLengths
 */

export const PSF_META = Object.freeze({
  majorVersion: 2,
  minorVersion: 0,
  createdBy: "Hundegger app CSV→Pryda",
  fenceLine: "BACK",
});

/** A row is only ever accepted with a single length, so 8 fields exactly. */
const SEMICOLON_FIELD_COUNT = 8;

/** Issue code for a row carrying more than one length. */
export const MULTIPLE_LENGTHS = "MULTIPLE_LENGTHS";

/** Issue code for such a row once it has been converted on its first length. */
export const MULTIPLE_LENGTHS_TRIMMED = "MULTIPLE_LENGTHS_TRIMMED";

/**
 * True when every blocking issue is a row carrying several lengths, i.e. the file
 * would convert if it were re-run with multipleLengths: "first".
 *
 * @param {RowIssue[]} issues
 * @returns {boolean}
 */
export const isRecoverableWithFirstLength = (issues) =>
  issues.length > 0 && issues.every((entry) => entry.code === MULTIPLE_LENGTHS);

/** Whole millimetres, optionally followed by the ":nn" sub-millimetre part. */
const MILLIMETRE_TOKEN = /^\d+(?::\d+)?$/;

/**
 * Raised when a file contains rows we will not convert. Carries every offending
 * row so the operator can fix them all in one pass instead of one per attempt.
 */
export class ConversionError extends Error {
  /**
   * @param {RowIssue[]} issues
   * @param {string} [fileName]
   */
  constructor(issues, fileName) {
    const lines = issues.filter((entry) => entry.line > 0).map((entry) => entry.line);
    const where = lines.length ? ` (line${lines.length > 1 ? "s" : ""} ${lines.join(", ")})` : "";
    const subject = fileName ? `${fileName}: ` : "";
    super(
      lines.length
        ? `${subject}${lines.length} row${lines.length > 1 ? "s" : ""} could not be converted${where}.`
        : `${subject}${issues[0]?.message ?? "Unable to convert file."}`
    );
    this.name = "ConversionError";
    /** @type {RowIssue[]} */
    this.issues = issues;
    /** @type {string | undefined} */
    this.fileName = fileName;
  }
}

/**
 * @param {number} line
 * @param {string} code
 * @param {string} message
 * @param {string} raw
 * @param {IssueSeverity} [severity]
 * @returns {RowIssue}
 */
const issue = (line, code, message, raw, severity = "error") => ({ line, code, message, raw, severity });

/** @returns {string} */
export const formatIssue = (/** @type {RowIssue} */ entry) =>
  entry.line > 0 ? `Line ${entry.line}: ${entry.message}` : entry.message;

/**
 * @param {string} raw
 * @param {string} label
 * @param {number} line
 * @param {string} rawLine
 * @param {RowIssue[]} issues
 * @returns {number | null}
 */
function readMillimetres(raw, label, line, rawLine, issues) {
  const value = raw.trim();

  if (!value) {
    issues.push(issue(line, "EMPTY_FIELD", `${label} is empty.`, rawLine));
    return null;
  }

  if (!MILLIMETRE_TOKEN.test(value)) {
    issues.push(
      issue(line, "INVALID_NUMBER", `${label} reads "${value}", which is not a measurement in millimetres.`, rawLine)
    );
    return null;
  }

  // "616:00" -> 616. The sub-millimetre part has always been discarded; Pryda
  // members are cut to whole millimetres.
  const millimetres = Number(value.split(":")[0]);

  if (millimetres <= 0) {
    issues.push(issue(line, "INVALID_NUMBER", `${label} must be greater than zero (found "${value}").`, rawLine));
    return null;
  }

  return millimetres;
}

/**
 * @param {string} raw
 * @param {number} line
 * @param {string} rawLine
 * @param {RowIssue[]} issues
 * @returns {number | null}
 */
function readQuantity(raw, line, rawLine, issues) {
  const value = raw.trim();

  if (!value) {
    issues.push(issue(line, "EMPTY_FIELD", "Quantity is empty.", rawLine));
    return null;
  }

  if (!/^\d+$/.test(value)) {
    issues.push(issue(line, "INVALID_NUMBER", `Quantity reads "${value}", which is not a whole number.`, rawLine));
    return null;
  }

  const quantity = Number(value);

  if (quantity < 1) {
    issues.push(issue(line, "INVALID_NUMBER", "Quantity must be at least 1.", rawLine));
    return null;
  }

  return quantity;
}

/**
 * @param {string} raw
 * @param {string} label
 * @param {number} line
 * @param {string} rawLine
 * @param {RowIssue[]} issues
 * @returns {string | null}
 */
function readText(raw, label, line, rawLine, issues) {
  const value = raw.trim();

  if (!value) {
    issues.push(issue(line, "EMPTY_FIELD", `${label} is empty.`, rawLine));
    return null;
  }

  return value;
}

/**
 * Reads the length from the tail of a row.
 *
 * A well formed row carries exactly one length. Some exports group several
 * lengths under a single quantity, and they show up in two shapes: as extra
 * delimited fields (";90;136;137") or as one field holding several numbers
 * (";90;22 23").
 *
 * By default such a row is rejected rather than guessed at, because the file does
 * not say how the quantity divides between the lengths - cutting that split the
 * wrong way scraps timber. With multipleLengths set to "first" the row converts on
 * its first length and records a warning naming what was dropped, so the decision
 * stays visible instead of silent.
 *
 * @param {string[]} tail
 * @param {number} line
 * @param {string} rawLine
 * @param {RowIssue[]} issues
 * @param {MultipleLengths} multipleLengths
 * @returns {number | null}
 */
function readLength(tail, line, rawLine, issues, multipleLengths) {
  const tokens = tail.flatMap((part) => part.trim().split(/\s+/)).filter(Boolean);

  if (tokens.length === 0) {
    issues.push(issue(line, "EMPTY_FIELD", "Length is missing.", rawLine));
    return null;
  }

  if (tokens.length > 1) {
    if (multipleLengths === "first") {
      const length = readMillimetres(tokens[0], "Length", line, rawLine, issues);

      if (length !== null) {
        issues.push(
          issue(
            line,
            MULTIPLE_LENGTHS_TRIMMED,
            `Row listed ${tokens.length} lengths (${tokens.join(", ")}). ` +
              `Cut to ${tokens[0]}, ignoring ${tokens.slice(1).join(", ")}.`,
            rawLine,
            "warning"
          )
        );
      }

      return length;
    }

    issues.push(
      issue(
        line,
        MULTIPLE_LENGTHS,
        `Row lists ${tokens.length} lengths (${tokens.join(", ")}) against a single quantity. ` +
          "Split it into one row per length in the source export, each with its own quantity.",
        rawLine
      )
    );
    return null;
  }

  return readMillimetres(tokens[0], "Length", line, rawLine, issues);
}

/**
 * @param {object} fields
 * @param {number} fields.ID
 * @param {string} fields.job
 * @param {string} fields.truss
 * @param {string} fields.member
 * @param {string} fields.type
 * @param {string} fields.materialBase
 * @param {number} fields.quantity
 * @param {number} fields.thickness
 * @param {number} fields.width
 * @param {number} fields.length
 * @returns {Member}
 */
function buildMember({ ID, job, truss, member, type, materialBase, quantity, thickness, width, length }) {
  return {
    ID,
    job,
    truss,
    member,
    type,
    width,
    thickness,
    length,
    material: `${width}x${thickness} ${materialBase}`,
    quantity,
    done: 0,
    cuts: [
      { endCut: { end: 1, location: 0, angle: 90, angleOffset: 0 } },
      { endCut: { end: 2, location: length, angle: 90, angleOffset: 0 } },
    ],
  };
}

/**
 * Semicolon format, 8 fields:
 *   truss;memberList;type;material;qty;thk;width;length
 *   13;R_0016 R_0008;Blocking;Pine;3;35;70;616
 *
 * @param {string} rawLine
 * @param {number} line
 * @param {string} job
 * @param {number} ID
 * @param {RowIssue[]} issues
 * @param {MultipleLengths} multipleLengths
 * @returns {Member | null}
 */
function parseSemicolonRow(rawLine, line, job, ID, issues, multipleLengths) {
  const parts = rawLine.split(";");

  if (parts.length < SEMICOLON_FIELD_COUNT) {
    issues.push(
      issue(
        line,
        "FIELD_COUNT",
        `Row has ${parts.length} fields, expected ${SEMICOLON_FIELD_COUNT} ` +
          "(truss;members;type;material;qty;thickness;width;length).",
        rawLine
      )
    );
    return null;
  }

  const truss = readText(parts[0], "Truss", line, rawLine, issues);
  const member = readText(parts[1], "Member list", line, rawLine, issues);
  const type = readText(parts[2], "Type", line, rawLine, issues);
  const materialBase = readText(parts[3], "Material", line, rawLine, issues);
  const quantity = readQuantity(parts[4], line, rawLine, issues);
  const thickness = readMillimetres(parts[5], "Thickness", line, rawLine, issues);
  const width = readMillimetres(parts[6], "Width", line, rawLine, issues);
  // Everything past the width is the length. A trailing delimiter contributes no
  // token and is tolerated; two values are not.
  const length = readLength(parts.slice(7), line, rawLine, issues, multipleLengths);

  if (
    truss === null ||
    member === null ||
    type === null ||
    materialBase === null ||
    quantity === null ||
    thickness === null ||
    width === null ||
    length === null
  ) {
    return null;
  }

  return buildMember({ ID, job, truss, member, type, materialBase, quantity, thickness, width, length });
}

/**
 * Dot format, 10 or 11 fields:
 *   ID.[frame.]truss.member.type.material.qty.thk.width.len.total
 *   47.429.Roof.R_0016.Blocking.Pine.1.35:00.70:00.616:00.616:00
 *
 * The frame field (11 field variant) and the trailing total are both unused.
 *
 * @param {string} rawLine
 * @param {number} line
 * @param {string} job
 * @param {number} fallbackId
 * @param {RowIssue[]} issues
 * @param {MultipleLengths} multipleLengths
 * @returns {Member | null}
 */
function parseDotRow(rawLine, line, job, fallbackId, issues, multipleLengths) {
  const parts = rawLine.split(".");

  if (parts.length !== 10 && parts.length !== 11) {
    issues.push(
      issue(
        line,
        "FIELD_COUNT",
        `Row has ${parts.length} fields, expected 10 or 11 ` +
          "(ID.frame.truss.member.type.material.qty.thickness.width.length.total). " +
          "Note that dot separated rows cannot carry decimal points.",
        rawLine
      )
    );
    return null;
  }

  const offset = parts.length === 11 ? 1 : 0;
  const idRaw = parts[0].trim();
  const ID = /^\d+$/.test(idRaw) ? Number(idRaw) : fallbackId;

  if (!/^\d+$/.test(idRaw)) {
    issues.push(issue(line, "INVALID_NUMBER", `ID reads "${idRaw}", which is not a whole number.`, rawLine));
  }

  const truss = readText(parts[1 + offset], "Truss", line, rawLine, issues);
  const member = readText(parts[2 + offset], "Member", line, rawLine, issues);
  const type = readText(parts[3 + offset], "Type", line, rawLine, issues);
  const materialBase = readText(parts[4 + offset], "Material", line, rawLine, issues);
  const quantity = readQuantity(parts[5 + offset], line, rawLine, issues);
  const thickness = readMillimetres(parts[6 + offset], "Thickness", line, rawLine, issues);
  const width = readMillimetres(parts[7 + offset], "Width", line, rawLine, issues);
  const length = readLength([parts[8 + offset]], line, rawLine, issues, multipleLengths);

  if (
    !/^\d+$/.test(idRaw) ||
    truss === null ||
    member === null ||
    type === null ||
    materialBase === null ||
    quantity === null ||
    thickness === null ||
    width === null ||
    length === null
  ) {
    return null;
  }

  return buildMember({ ID, job, truss, member, type, materialBase, quantity, thickness, width, length });
}

/**
 * Parses a cut list into Pryda members.
 *
 * Every row is inspected before anything is reported, so a file with several bad
 * rows surfaces all of them at once. If any row is rejected the whole file is
 * rejected: a cut list that is quietly missing members is more dangerous than one
 * that refuses to convert.
 *
 * multipleLengths decides what happens to a row carrying more than one length:
 * "reject" (the default) refuses the file, "first" converts on the first length
 * and returns a warning naming what was dropped. It does not relax any other
 * check - a bad number or a wrong field count still rejects the file.
 *
 * @param {string} contents
 * @param {{
 *   jobName: string,
 *   startId?: number,
 *   fileName?: string,
 *   multipleLengths?: MultipleLengths,
 * }} options
 * @returns {{ members: Member[], nextId: number, warnings: RowIssue[] }}
 */
export function parseCutList(contents, { jobName, startId = 1, fileName, multipleLengths = "reject" }) {
  // Strip a file level BOM, then split keeping the original line numbers so the
  // numbers we report match what the operator sees in their editor.
  const rows = contents
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((text, index) => ({ line: index + 1, text: text.replace(/^﻿/, "").trim() }))
    .filter((row) => row.text.length > 0);

  if (!rows.length) {
    throw new ConversionError([issue(0, "EMPTY_FILE", "The file has no data rows.", "")], fileName);
  }

  /** @type {RowIssue[]} */
  const issues = [];
  /** @type {Member[]} */
  const members = [];
  let nextId = startId;

  for (const row of rows) {
    const member = row.text.includes(";")
      ? parseSemicolonRow(row.text, row.line, jobName, nextId, issues, multipleLengths)
      : parseDotRow(row.text, row.line, jobName, nextId, issues, multipleLengths);

    if (member) {
      members.push(member);
      nextId += 1;
    }
  }

  const errors = issues.filter((entry) => entry.severity === "error");

  if (errors.length) {
    throw new ConversionError(errors, fileName);
  }

  // Warnings only ever reach the caller on a file that converted, so none of them
  // can belong to a row that was dropped.
  return { members, nextId, warnings: issues.filter((entry) => entry.severity === "warning") };
}

/**
 * @param {Member[]} members
 * @returns {PsfPayload}
 */
export const createPayload = (members) => ({ meta: PSF_META, members });

const createCrcTable = () => {
  const table = new Uint32Array(256);

  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }

  return table;
};

const CRC_TABLE = createCrcTable();

/**
 * @param {Uint8Array} data
 * @returns {number}
 */
const crc32 = (data) => {
  let crc = 0xffffffff;

  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
};

// 1980-01-01, the earliest date the ZIP format can express. A zeroed date is
// month 0 / day 0, which some archive readers reject.
const DOS_DATE = (1 << 5) | 1;
const DOS_TIME = 0;

/**
 * Builds a stored (uncompressed) ZIP archive. A .psf file is exactly this: a ZIP
 * holding a single members.json.
 *
 * @param {Array<{ filename: string, content: string }>} entries
 * @returns {Uint8Array<ArrayBuffer>} a fresh buffer, safe to hand straight to Blob or writeFileSync
 */
export function buildZipArchive(entries) {
  const encoder = new TextEncoder();
  /** @type {Uint8Array[]} */
  const localParts = [];
  /** @type {Uint8Array[]} */
  const centralParts = [];

  let offset = 0;

  for (const entry of entries) {
    const filenameBytes = encoder.encode(entry.filename);
    const fileData = encoder.encode(entry.content);
    const checksum = crc32(fileData);

    const localHeader = new Uint8Array(30 + filenameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true); // version needed
    localView.setUint16(6, 0, true); // general purpose
    localView.setUint16(8, 0, true); // compression (store)
    localView.setUint16(10, DOS_TIME, true);
    localView.setUint16(12, DOS_DATE, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, fileData.length, true);
    localView.setUint32(22, fileData.length, true);
    localView.setUint16(26, filenameBytes.length, true);
    localView.setUint16(28, 0, true); // extra length
    localHeader.set(filenameBytes, 30);

    localParts.push(localHeader, fileData);

    const centralHeader = new Uint8Array(46 + filenameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true); // version made by
    centralView.setUint16(6, 20, true); // version needed
    centralView.setUint16(8, 0, true); // general purpose
    centralView.setUint16(10, 0, true); // compression
    centralView.setUint16(12, DOS_TIME, true);
    centralView.setUint16(14, DOS_DATE, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, fileData.length, true);
    centralView.setUint32(24, fileData.length, true);
    centralView.setUint16(28, filenameBytes.length, true);
    centralView.setUint16(30, 0, true); // extra length
    centralView.setUint16(32, 0, true); // comment length
    centralView.setUint16(34, 0, true); // disk number start
    centralView.setUint16(36, 0, true); // internal attrs
    centralView.setUint32(38, 0, true); // external attrs
    centralView.setUint32(42, offset, true); // local header offset
    centralHeader.set(filenameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + fileData.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralParts.reduce((size, part) => size + part.length, 0);

  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true); // disk number
  endView.setUint16(6, 0, true); // central dir start disk
  endView.setUint16(8, entries.length, true); // records on this disk
  endView.setUint16(10, entries.length, true); // total records
  endView.setUint32(12, centralDirectorySize, true);
  endView.setUint32(16, centralDirectoryOffset, true);
  endView.setUint16(20, 0, true); // comment length

  const parts = [...localParts, ...centralParts, endRecord];
  const total = parts.reduce((size, part) => size + part.length, 0);
  const archive = new Uint8Array(total);

  let cursor = 0;
  for (const part of parts) {
    archive.set(part, cursor);
    cursor += part.length;
  }

  return archive;
}

/**
 * @param {PsfPayload} payload
 * @returns {Uint8Array<ArrayBuffer>}
 */
export const buildPsf = (payload) =>
  buildZipArchive([{ filename: "members.json", content: JSON.stringify(payload, null, 2) }]);
