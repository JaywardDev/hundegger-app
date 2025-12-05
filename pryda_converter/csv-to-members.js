const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");

if (!process.argv[2]) {
  console.error("Usage: node csv-to-members.js <input-file> [jobName]");
  process.exit(1);
}

const inputPath = process.argv[2];

// default job name from file name if not provided
const jobName =
  process.argv[3] ||
  path.basename(inputPath).replace(/\.[^.]+$/, "");

const lines = fs
  .readFileSync(inputPath, "utf8")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l.length > 0);

function parseMm(field) {
  // "616:00" -> 616
  return Number(field.split(":")[0]);
}

const members = [];

for (const rawLine of lines) {
  const line = rawLine.replace(/^\uFEFF/, ""); // strip BOM if present
  const parts = line.split(".");

  // We support:
  //  - 11 fields: ID.frame.truss.member.type.material.qty.thk.width.len.total
  //  - 10 fields: ID.truss.member.type.material.qty.thk.width.len.total
  if (parts.length !== 11 && parts.length !== 10) {
    throw new Error(`Unexpected field count (${parts.length}) in line: ${line}`);
  }

  let idStr, truss, member, type, material, qtyStr, thkStr, widthStr, lengthStr, totalStr;

  if (parts.length === 11) {
    // with unused frame value
    [idStr, /* frame */ , truss, member, type, material, qtyStr, thkStr, widthStr, lengthStr, totalStr] =
      parts;
  } else {
    // cleaned format (no frame)
    [idStr, truss, member, type, material, qtyStr, thkStr, widthStr, lengthStr, totalStr] = parts;
  }

  const ID = Number(idStr);
  const quantity = Number(qtyStr);
  const thickness = parseMm(thkStr);
  const width = parseMm(widthStr);
  const length = parseMm(lengthStr);

  members.push({
    ID,
    job: jobName,
    truss,
    member,
    type,
    width,
    thickness,
    length,
    material: `${width}x${thickness} ${material}`,
    quantity,
    done: 0,
    cuts: [
      {
        endCut: {
          end: 1,
          location: 0,
          angle: 90,
          angleOffset: 0,
        },
      },
      {
        endCut: {
          end: 2,
          location: length,
          angle: 90,
          angleOffset: 0,
        },
      },
    ],
  });
}

const meta = {
  majorVersion: 2,
  minorVersion: 0,
  createdBy: "Hundegger app CSV→Pryda by Jayward",
  fenceLine: "BACK",
};

const result = {
  meta,
  members,
};

fs.writeFileSync(
  "members.json",
  JSON.stringify(result, null, 2),
  "utf8"
);

const zip = new AdmZip();
zip.addFile("members.json", Buffer.from(JSON.stringify(result, null, 2), "utf8"));

const outName = `${jobName}.psf`;
zip.writeZip(outName);

console.log(
  `Created members.json for job "${jobName}" with ${members.length} members.`
);
