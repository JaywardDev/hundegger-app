import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useRouter } from "../lib/router";

type Member = {
  ID: number;
  job: string;
  truss: string;
  member: string;
  type: string;
  width: number;
  thickness: number;
  length: number;
  material: string;
  quantity: number;
  done: number;
  cuts: Array<{
    endCut: {
      end: number;
      location: number;
      angle: number;
      angleOffset: number;
    };
  }>;
};

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

const crc32 = (data: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const createZipBlob = (filename: string, content: string) => {
  const encoder = new TextEncoder();
  const filenameBytes = encoder.encode(filename);
  const fileData = encoder.encode(content);
  const checksum = crc32(fileData);

  const localHeader = new Uint8Array(30 + filenameBytes.length);
  const localView = new DataView(localHeader.buffer);
  localView.setUint32(0, 0x04034b50, true);
  localView.setUint16(4, 20, true); // version needed
  localView.setUint16(6, 0, true); // general purpose
  localView.setUint16(8, 0, true); // compression (store)
  localView.setUint16(10, 0, true); // mod time
  localView.setUint16(12, 0, true); // mod date
  localView.setUint32(14, checksum, true);
  localView.setUint32(18, fileData.length, true);
  localView.setUint32(22, fileData.length, true);
  localView.setUint16(26, filenameBytes.length, true);
  localView.setUint16(28, 0, true); // extra length
  localHeader.set(filenameBytes, 30);

  const centralHeader = new Uint8Array(46 + filenameBytes.length);
  const centralView = new DataView(centralHeader.buffer);
  centralView.setUint32(0, 0x02014b50, true);
  centralView.setUint16(4, 20, true); // version made by
  centralView.setUint16(6, 20, true); // version needed
  centralView.setUint16(8, 0, true); // general purpose
  centralView.setUint16(10, 0, true); // compression
  centralView.setUint16(12, 0, true); // mod time
  centralView.setUint16(14, 0, true); // mod date
  centralView.setUint32(16, checksum, true);
  centralView.setUint32(20, fileData.length, true);
  centralView.setUint32(24, fileData.length, true);
  centralView.setUint16(28, filenameBytes.length, true);
  centralView.setUint16(30, 0, true); // extra length
  centralView.setUint16(32, 0, true); // comment length
  centralView.setUint16(34, 0, true); // disk number start
  centralView.setUint16(36, 0, true); // internal attrs
  centralView.setUint32(38, 0, true); // external attrs
  centralView.setUint32(42, 0, true); // local header offset
  centralHeader.set(filenameBytes, 46);

  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  const centralDirectoryOffset = localHeader.length + fileData.length;
  const centralDirectorySize = centralHeader.length;
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true); // disk number
  endView.setUint16(6, 0, true); // central dir start disk
  endView.setUint16(8, 1, true); // records on this disk
  endView.setUint16(10, 1, true); // total records
  endView.setUint32(12, centralDirectorySize, true);
  endView.setUint32(16, centralDirectoryOffset, true);
  endView.setUint16(20, 0, true); // comment length

  return new Blob([localHeader, fileData, centralHeader, endRecord], {
    type: "application/zip",
  });
};

const parseMillimeter = (field: string) => Number(field.split(":")[0]);

const deriveJobName = (input: string, file?: File) => {
  const trimmed = input.trim();
  if (trimmed) {
    return trimmed;
  }

  if (file) {
    return file.name.replace(/\.[^.]+$/, "");
  }

  return "job";
};

const parseMembers = (contents: string, jobName: string) => {
  const lines = contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!lines.length) {
    throw new Error("The CSV file is empty.");
  }

  const members: Member[] = [];

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.replace(/^\uFEFF/, "");

    // ─────────────────────────────────────────────
    // NEW FORMAT: semicolon-separated
    // Example:
    // 13;R_0016 R_0008;Blocking;Pine;3;35;70;616
    // truss;memberList;type;material;qty;thk;width;length
    // ─────────────────────────────────────────────
    if (line.includes(";")) {
      const parts = line.split(";");

      if (parts.length !== 8) {
        throw new Error(
          `Line ${index + 1} has ${parts.length} fields (semicolon format). Expected 8.`
        );
      }

      const [
        trussRaw,
        memberRaw,
        typeRaw,
        materialRaw,
        qtyStr,
        thkStr,
        widthStr,
        lengthStr,
      ] = parts;

      const truss = trussRaw.trim();
      const member = memberRaw.trim();       // full "R_0016 R_0008 …"
      const type = typeRaw.trim();
      const materialBase = materialRaw.trim();

      const quantity = Number(qtyStr);
      const thickness = parseMillimeter(thkStr);
      const width = parseMillimeter(widthStr);
      const length = parseMillimeter(lengthStr);

      if ([quantity, thickness, width, length].some((value) => Number.isNaN(value))) {
        throw new Error(`Line ${index + 1} contains invalid numeric values.`);
      }

      members.push({
        ID: index + 1,                         // no ID in new format; use line number
        job: jobName,
        truss,
        member,
        type,
        width,
        thickness,
        length,
        material: `${width}x${thickness} ${materialBase}`, // e.g. "70x35 Pine"
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

      continue; // skip dot-format parsing for this line
    }

    // ─────────────────────────────────────────────
    // OLD FORMAT: dot-separated
    // 47.429.Roof.R_0016.Blocking.Pine.1.35:00.70:00.616:00.616:00
    // ─────────────────────────────────────────────
    const parts = line.split(".");

    if (parts.length !== 10 && parts.length !== 11) {
      throw new Error(
        `Line ${index + 1} has ${parts.length} fields (dot format). Expected 10 or 11.`
      );
    }

    let idStr: string;
    let truss: string;
    let member: string;
    let type: string;
    let materialBase: string;
    let qtyStr: string;
    let thkStr: string;
    let widthStr: string;
    let lengthStr: string;

    if (parts.length === 11) {
      // ID.frame.truss.member.type.material.qty.thk.width.len.total
      [idStr, , truss, member, type, materialBase, qtyStr, thkStr, widthStr, lengthStr] =
        parts;
    } else {
      // ID.truss.member.type.material.qty.thk.width.len.total
      [idStr, truss, member, type, materialBase, qtyStr, thkStr, widthStr, lengthStr] =
        parts;
    }

    const ID = Number(idStr);
    const quantity = Number(qtyStr);
    const thickness = parseMillimeter(thkStr);
    const width = parseMillimeter(widthStr);
    const length = parseMillimeter(lengthStr);

    if ([ID, quantity, thickness, width, length].some((value) => Number.isNaN(value))) {
      throw new Error(`Line ${index + 1} contains invalid numeric values.`);
    }

    members.push({
      ID,
      job: jobName,
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
    createdBy: "Hundegger app CSV→Pryda",
    fenceLine: "BACK",
  };

  return {
    meta,
    members,
  };
};

export function PrydaConversionPage() {
  const { navigate } = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [jobName, setJobName] = useState("");
  const [status, setStatus] = useState("Select a CSV file to begin.");
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [members, setMembers] = useState<Member[]>([]);  
  const [isConverting, setIsConverting] = useState(false);

  const defaultJobName = useMemo(() => deriveJobName(jobName, selectedFile || undefined), [jobName, selectedFile]);

  useEffect(() => {
    return () => {
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
    };
  }, [downloadUrl]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setSelectedFile(file ?? null);
    setMemberCount(null);
    setDownloadUrl(null);
    setDownloadName(null);
    setMembers([]);    
    setError(null);

    if (file) {
      const inferredJob = file.name.replace(/\.[^.]+$/, "");
      setJobName(inferredJob);
      setStatus(`Loaded ${file.name}. Ready to convert.`);
    } else {
      setStatus("Select a CSV file to begin.");
    }
  };

  const handleConvert = async () => {
    if (!selectedFile) {
      setError("Please select a CSV file to convert.");
      setStatus("Waiting for a CSV file.");
      return;
    }

    setIsConverting(true);
    setError(null);
    setMemberCount(null);
    setDownloadUrl(null);
    setDownloadName(null);
    setStatus("Processing file...");

    try {
      const contents = await selectedFile.text();
      const finalJobName = deriveJobName(jobName, selectedFile);
      const result = parseMembers(contents, finalJobName);
      const json = JSON.stringify(result, null, 2);
      const blob = createZipBlob("members.json", json);
      const url = URL.createObjectURL(blob);

      setDownloadUrl(url);
      setDownloadName(`${finalJobName}.psf`);
      setMemberCount(result.members.length);
      setMembers(result.members);
      setStatus(`Converted ${result.members.length} members for job "${finalJobName}".`);
    } catch (conversionError) {
      const message = conversionError instanceof Error ? conversionError.message : "Unable to convert file.";
      setError(message);
      setStatus("Conversion failed.");
      setMembers([]);
    } finally {
      setIsConverting(false);
    }
  };

  const handleDownload = () => {
    if (!downloadUrl || !downloadName) return;

    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = downloadName;
    anchor.click();
    setStatus(`Downloaded ${downloadName}.`);
  };

  return (
    <main className="pryda-page">
      <section className="pryda-card" aria-labelledby="pryda-title">
        <header className="pryda-card__header">
          <div>
            <h1 id="pryda-title">CSV to PSF</h1>
            <p className="pryda-card__lede">
              Upload CSV export and download a PSF archive ready
              for Pryda.
            </p>
          </div>
        </header>

        <div className="pryda-grid">
          <label className="pryda-field">
            <span className="pryda-field__label">CSV file</span>
            <input type="file" accept=".csv,text/csv,text/plain" onChange={handleFileChange} />
            <span className="pryda-field__hint">Accepts semicolon-separated with 8 to 11 fields</span>
          </label>

          <label className="pryda-field">
            <span className="pryda-field__label">Job name</span>
            <input
              type="text"
              value={jobName}
              onChange={(event) => setJobName(event.target.value)}
              placeholder={defaultJobName}
            />
            <span className="pryda-field__hint">Defaults to the uploaded file name.</span>
          </label>
        </div>

        <div className="pryda-actions">
          <button className="button button--primary" onClick={handleConvert} disabled={isConverting}>
            {isConverting ? "Converting..." : "Convert to PSF"}
          </button>
          <button className="button" onClick={handleDownload} disabled={!downloadUrl}>
            Download PSF
          </button>
          <button className="button button--ghost" onClick={() => navigate("home")}>
            Back to home
          </button>
        </div>

        <p className="pryda-status" role="status">
          <span className="pryda-status__text">{status}</span>
          {memberCount !== null ? <span className="pryda-pill">{memberCount} members</span> : null}
          {downloadName ? <span className="pryda-pill">{downloadName}</span> : null}
        </p>

        {error ? <p className="pryda-error">{error}</p> : null}

        {members.length > 0 ? (
          <section className="pryda-preview" aria-label="Conversion preview">
            <div className="pryda-preview__header">
              <h2 className="pryda-preview__title">Preview</h2>
              <span className="pryda-pill">{members.length} rows</span>
            </div>

            <div className="pryda-table" role="table" aria-label="Converted members">
              <div className="pryda-table__row pryda-table__row--head" role="row">
                <span role="columnheader">Truss</span>
                <span role="columnheader">Member</span>
                <span role="columnheader">Length</span>
                <span role="columnheader">Quantity</span>
                <span role="columnheader">Size</span>
                <span role="columnheader">Grade</span>
              </div>

              {members.map((member) => {
                const size = `${member.width}x${member.thickness}`;
                const grade = member.material.split(" ").slice(1).join(" ") || member.material;

                return (
                  <div className="pryda-table__row" role="row" key={`${member.truss}-${member.member}-${member.ID}`}>
                    <span role="cell">{member.truss}</span>
                    <span role="cell">{member.member}</span>
                    <span role="cell">{member.length}</span>
                    <span role="cell">{member.quantity}</span>
                    <span role="cell">{size}</span>
                    <span role="cell">{grade}</span>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}