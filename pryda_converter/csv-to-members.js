// Converts Pryda cut list CSV exports into .psf archives from the command line.
//
// Usage:
//   node pryda_converter/csv-to-members.js <input.csv> [more.csv ...] [options]
//
// Options:
//   --job <name>      Job name for every input (default: each file's own name)
//   --out-dir <dir>   Where to write the .psf files (default: alongside the input)
//   --bundle <file>   Merge every input into one .psf at this path
//   --first-length    Convert rows that list several lengths on the first one,
//                     instead of rejecting them. Other checks still apply.
//
// The parsing and PSF building live in ../src/lib/prydaConverter.js, shared with
// the browser page, so both routes always produce identical output.

import { writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  ConversionError,
  buildPsf,
  createPayload,
  formatIssue,
  isRecoverableWithFirstLength,
  parseCutList,
} from "../src/lib/prydaConverter.js";

const USAGE =
  "Usage: node pryda_converter/csv-to-members.js <input.csv> [more.csv ...] " +
  "[--job <name>] [--out-dir <dir>] [--bundle <file.psf>] [--first-length]";

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {string[]} */
  const inputs = [];
  /** @type {{ job?: string, outDir?: string, bundle?: string, firstLength?: boolean }} */
  const options = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--first-length") {
      options.firstLength = true;
      continue;
    }

    if (arg === "--job" || arg === "--out-dir" || arg === "--bundle") {
      const value = argv[++i];

      if (!value) {
        throw new Error(`${arg} needs a value.\n${USAGE}`);
      }

      if (arg === "--job") options.job = value;
      else if (arg === "--out-dir") options.outDir = value;
      else options.bundle = value;

      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option "${arg}".\n${USAGE}`);
    }

    inputs.push(arg);
  }

  if (!inputs.length) {
    throw new Error(USAGE);
  }

  return { inputs, options };
}

const jobNameFor = (inputPath, override) =>
  override || path.basename(inputPath).replace(/\.[^.]+$/, "");

/** @param {import("../src/lib/prydaConverter.js").Member[]} members */
const writePsf = (outPath, members) => {
  writeFileSync(outPath, buildPsf(createPayload(members)));
  console.log(`Wrote ${outPath} (${members.length} members).`);
};

async function main() {
  const { inputs, options } = parseArgs(process.argv.slice(2));

  /** @type {Array<{ inputPath: string, job: string, members: import("../src/lib/prydaConverter.js").Member[] }>} */
  const results = [];
  /** @type {string[]} */
  const failures = [];
  /** @type {string[]} */
  const trimmed = [];
  let recoverable = false;

  // Member IDs run on across files so a bundle cannot contain duplicates.
  let nextId = 1;

  // Every file is parsed even after one fails, so a single run reports every
  // problem rather than surfacing them one at a time.
  for (const inputPath of inputs) {
    const job = jobNameFor(inputPath, options.job);

    let contents;
    try {
      contents = await readFile(inputPath, "utf8");
    } catch {
      failures.push(`${inputPath}: could not be read.`);
      continue;
    }

    try {
      const parsed = parseCutList(contents, {
        jobName: job,
        startId: nextId,
        fileName: path.basename(inputPath),
        multipleLengths: options.firstLength ? "first" : "reject",
      });

      nextId = parsed.nextId;
      trimmed.push(...parsed.warnings.map((entry) => `  ${inputPath} ${formatIssue(entry)}`));
      results.push({ inputPath, job, members: parsed.members });
    } catch (error) {
      if (!(error instanceof ConversionError)) {
        throw error;
      }

      recoverable = recoverable || isRecoverableWithFirstLength(error.issues);
      failures.push(
        `${inputPath}:\n${error.issues.map((entry) => `  ${formatIssue(entry)}`).join("\n")}`
      );
    }
  }

  if (failures.length) {
    console.error("Conversion failed. Nothing was written.\n");
    console.error(failures.join("\n\n"));

    if (recoverable && !options.firstLength) {
      console.error(
        "\nEvery rejected row simply lists more than one length. Re-run with --first-length " +
          "to cut each to the first length and ignore the rest."
      );
    }

    process.exitCode = 1;
    return;
  }

  if (trimmed.length) {
    console.warn(
      `${trimmed.length} row${trimmed.length > 1 ? "s" : ""} cut to the first listed length:`
    );
    console.warn(trimmed.join("\n"));
    console.warn("");
  }

  if (options.bundle) {
    writePsf(
      options.bundle,
      results.flatMap((result) => result.members)
    );
    return;
  }

  for (const result of results) {
    const outDir = options.outDir ?? path.dirname(result.inputPath);
    writePsf(path.join(outDir, `${result.job}.psf`), result.members);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
