import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useRouter } from "../lib/router";
import {
  ConversionError,
  buildPsf,
  createPayload,
  isRecoverableWithFirstLength,
  parseCutList,
} from "../lib/prydaConverter.js";
import type { Member, MultipleLengths, RowIssue } from "../lib/prydaConverter.js";

type ReportedIssue = RowIssue & { file: string };

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

export function PrydaConversionPage() {
  const { navigate } = useRouter();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [jobNames, setJobNames] = useState<Record<string, string>>({});
  const [jobName, setJobName] = useState("");
  const [status, setStatus] = useState("Select a CSV file to begin.");
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<ReportedIssue[]>([]);
  const [warnings, setWarnings] = useState<ReportedIssue[]>([]);
  // Set only when every blocking issue is a row carrying several lengths, so the
  // offer to convert on the first length never appears next to a real error.
  const [canUseFirstLength, setCanUseFirstLength] = useState(false);
  const [downloadItems, setDownloadItems] = useState<Array<{ name: string; url: string }>>([]);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [bundleMode, setBundleMode] = useState<"separate" | "bundle">("separate");

  const defaultJobName = useMemo(() => {
    const firstFile = selectedFiles[0];
    return firstFile ? deriveJobName(jobName, firstFile) : deriveJobName(jobName);
  }, [jobName, selectedFiles]);

  useEffect(() => {
    return () => {
      downloadItems.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [downloadItems]);

  // The name a file will actually be converted under. The per-file input and the
  // conversion both read this, so what the operator sees is what lands in the PSF.
  const resolveJobName = (file: File) => deriveJobName(jobNames[file.name] ?? jobName, file);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    setSelectedFiles(files);
    setJobNames({});
    setJobName("");
    setMemberCount(null);
    setDownloadItems([]);
    setMembers([]);
    setError(null);
    setIssues([]);
    setWarnings([]);
    setCanUseFirstLength(false);

    if (files.length > 0) {
      const fileLabel = files.length === 1 ? files[0].name : `${files.length} files`;
      setStatus(`Loaded ${fileLabel}. Ready to convert.`);
    } else {
      setStatus("Select a CSV file to begin.");
    }
  };

  const handleConvert = async (multipleLengths: MultipleLengths = "reject") => {
    if (selectedFiles.length === 0) {
      setError("Please select at least one CSV file to convert.");
      setStatus("Waiting for CSV files.");
      return;
    }

    setIsConverting(true);
    setError(null);
    setIssues([]);
    setWarnings([]);
    setCanUseFirstLength(false);
    setMemberCount(null);
    setDownloadItems([]);
    setStatus("Processing file(s)...");

    try {
      const contents = await Promise.all(selectedFiles.map((file) => file.text()));

      const perFileResults: Array<{ jobName: string; fileName: string; members: Member[] }> = [];
      const rejected: ReportedIssue[] = [];
      const trimmed: ReportedIssue[] = [];

      // Member IDs run on across files so a bundled PSF cannot contain duplicates.
      let nextId = 1;

      // Every file is parsed even after one fails, so the operator sees every bad
      // row in one pass instead of discovering them one attempt at a time.
      selectedFiles.forEach((file, index) => {
        const finalJobName = resolveJobName(file);

        try {
          const parsed = parseCutList(contents[index], {
            jobName: finalJobName,
            startId: nextId,
            fileName: file.name,
            multipleLengths,
          });

          nextId = parsed.nextId;
          trimmed.push(...parsed.warnings.map((entry) => ({ ...entry, file: file.name })));
          perFileResults.push({ jobName: finalJobName, fileName: file.name, members: parsed.members });
        } catch (parseError) {
          if (!(parseError instanceof ConversionError)) {
            throw parseError;
          }

          rejected.push(...parseError.issues.map((entry) => ({ ...entry, file: file.name })));
        }
      });

      if (rejected.length > 0) {
        const fileCount = new Set(rejected.map((entry) => entry.file)).size;
        setIssues(rejected);
        setCanUseFirstLength(isRecoverableWithFirstLength(rejected));
        setError(
          `${rejected.length} row${rejected.length > 1 ? "s" : ""} in ${fileCount} file${
            fileCount > 1 ? "s" : ""
          } could not be converted. Nothing was written - fix the rows below and convert again.`
        );
        setStatus("Conversion failed.");
        setMembers([]);
        return;
      }

      setWarnings(trimmed);

      const aggregatedMembers = perFileResults.flatMap((result) => result.members);
      const totalMembers = aggregatedMembers.length;

      let downloads: Array<{ name: string; url: string }> = [];

      const toDownload = (name: string, payloadMembers: Member[]) => {
        const blob = new Blob([buildPsf(createPayload(payloadMembers))], {
          type: "application/zip",
        });

        return { name, url: URL.createObjectURL(blob) };
      };

      if (bundleMode === "bundle") {
        const bundleName =
          perFileResults.length === 1 ? `${perFileResults[0].jobName}.psf` : "pryda-jobs.psf";

        downloads = [toDownload(bundleName, aggregatedMembers)];
      } else {
        downloads = perFileResults.map((result) =>
          toDownload(`${result.jobName}.psf`, result.members)
        );
      }

      setDownloadItems(downloads);
      setMemberCount(totalMembers);
      setMembers(aggregatedMembers);

      const jobLabel =
        perFileResults.length === 1
          ? `job "${perFileResults[0].jobName}"`
          : `${perFileResults.length} jobs`;
      const bundleLabel =
        bundleMode === "bundle" && perFileResults.length > 1 ? " Bundled into a single psf." : "";
      const trimmedLabel = trimmed.length
        ? ` ${trimmed.length} row${trimmed.length > 1 ? "s" : ""} cut to the first listed length.`
        : "";

      setStatus(`Converted ${totalMembers} members for ${jobLabel}.${bundleLabel}${trimmedLabel}`);
    } catch (conversionError) {
      const message =
        conversionError instanceof Error ? conversionError.message : "Unable to convert file.";
      setError(message);
      setStatus("Conversion failed.");
      setMembers([]);
    } finally {
      setIsConverting(false);
    }
  };

  const handleDownload = (url: string, name: string) => {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    setStatus(`Downloaded ${name}.`);
  };

  // Browsers drop back-to-back programmatic downloads, so space them out.
  const handleDownloadAll = async () => {
    for (const item of downloadItems) {
      handleDownload(item.url, item.name);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
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
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              multiple
              onChange={handleFileChange}
            />
            <span className="pryda-field__hint">
              Accepts semicolon-separated rows with 8 fields, or dot-separated rows with 10 or 11
              fields. One length per row.
            </span>
          </label>

          <label className="pryda-field">
            <span className="pryda-field__label">Default job name</span>
            <input
              type="text"
              value={jobName}
              onChange={(event) => setJobName(event.target.value)}
              placeholder={defaultJobName}
            />
            <span className="pryda-field__hint">
              Used when a file-specific name is empty. Defaults to the uploaded file name.
            </span>
          </label>
        </div>

        {selectedFiles.length > 0 ? (
          <section className="pryda-list" aria-label="Per-file job names">
            <h2 className="pryda-preview__title">Files</h2>
            <div className="pryda-grid">
              {selectedFiles.map((file) => (
                <label className="pryda-field" key={file.name}>
                  <span className="pryda-field__label">{file.name}</span>
                  <input
                    type="text"
                    value={jobNames[file.name] ?? deriveJobName(jobName, file)}
                    onChange={(event) =>
                      setJobNames((current) => ({
                        ...current,
                        [file.name]: event.target.value,
                      }))
                    }
                    placeholder={deriveJobName("", file)}
                  />
                  <span className="pryda-field__hint">PSF job name for this file.</span>
                </label>
              ))}
            </div>
          </section>
        ) : null}

        <div className="pryda-grid">
          <fieldset className="pryda-field" role="group" aria-label="Download mode">
            <legend className="pryda-field__label">Download mode</legend>
            <label className="pryda-choice">
              <input
                type="radio"
                name="bundle-mode"
                value="separate"
                checked={bundleMode === "separate"}
                onChange={() => setBundleMode("separate")}
              />
              <span>One PSF per file</span>
            </label>
            <label className="pryda-choice">
              <input
                type="radio"
                name="bundle-mode"
                value="bundle"
                checked={bundleMode === "bundle"}
                onChange={() => setBundleMode("bundle")}
              />
              <span>Bundle all into a single psf</span>
            </label>
            <span className="pryda-field__hint">Choose how downloads are packaged.</span>
          </fieldset>
        </div>

        <div className="pryda-actions">
          <button
            className="button button--primary"
            onClick={() => handleConvert("reject")}
            disabled={isConverting}
          >
            {isConverting ? "Converting..." : "Convert to PSF"}
          </button>
          <button
            className="button"
            onClick={handleDownloadAll}
            disabled={downloadItems.length === 0}
          >
            Download {downloadItems.length > 1 ? "all" : "PSF"}
          </button>
          <button className="button button--ghost" onClick={() => navigate("home")}>
            Back to home
          </button>
        </div>

        <p className="pryda-status" role="status">
          <span className="pryda-status__text">{status}</span>
          {memberCount !== null ? <span className="pryda-pill">{memberCount} members</span> : null}
          {selectedFiles.length > 0 ? (
            <span className="pryda-pill">{selectedFiles.length} file(s)</span>
          ) : null}
        </p>

        {error ? <p className="pryda-error">{error}</p> : null}

        {canUseFirstLength ? (
          <div className="pryda-override">
            <p className="pryda-override__text">
              Every row above simply lists more than one length. You can convert anyway, cutting
              each to the <strong>first</strong> length and ignoring the rest.
            </p>
            <button
              className="button"
              onClick={() => handleConvert("first")}
              disabled={isConverting}
            >
              Convert using the first length
            </button>
          </div>
        ) : null}

        {warnings.length > 0 ? (
          <section className="pryda-preview" aria-label="Rows cut to their first length">
            <div className="pryda-preview__header">
              <h2 className="pryda-preview__title">Lengths ignored</h2>
              <span className="pryda-pill">{warnings.length} row(s)</span>
            </div>

            <p className="pryda-warning">
              These rows listed more than one length. They were cut to the first one - check them
              against the job before running the saw.
            </p>

            <div className="pryda-table pryda-table--issues" role="table" aria-label="Trimmed rows">
              <div className="pryda-table__row pryda-table__row--head" role="row">
                <span role="columnheader">File</span>
                <span role="columnheader">Line</span>
                <span role="columnheader">What was used</span>
              </div>

              {warnings.map((entry, index) => (
                <div
                  className="pryda-table__row"
                  role="row"
                  key={`${entry.file}-${entry.line}-${entry.code}-${index}`}
                >
                  <span role="cell">{entry.file}</span>
                  <span role="cell">{entry.line > 0 ? entry.line : "-"}</span>
                  <span role="cell">
                    {entry.message}
                    {entry.raw ? <code className="pryda-issue__raw">{entry.raw}</code> : null}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {issues.length > 0 ? (
          <section className="pryda-preview" aria-label="Rows that could not be converted">
            <div className="pryda-preview__header">
              <h2 className="pryda-preview__title">Rows to fix</h2>
              <span className="pryda-pill">{issues.length} row(s)</span>
            </div>

            <div className="pryda-table pryda-table--issues" role="table" aria-label="Rejected rows">
              <div className="pryda-table__row pryda-table__row--head" role="row">
                <span role="columnheader">File</span>
                <span role="columnheader">Line</span>
                <span role="columnheader">Problem</span>
              </div>

              {issues.map((entry, index) => (
                <div
                  className="pryda-table__row"
                  role="row"
                  key={`${entry.file}-${entry.line}-${entry.code}-${index}`}
                >
                  <span role="cell">{entry.file}</span>
                  <span role="cell">{entry.line > 0 ? entry.line : "-"}</span>
                  <span role="cell">
                    {entry.message}
                    {entry.raw ? <code className="pryda-issue__raw">{entry.raw}</code> : null}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {downloadItems.length > 0 ? (
          <section className="pryda-preview" aria-label="Download links">
            <div className="pryda-preview__header">
              <h2 className="pryda-preview__title">Downloads</h2>
              <span className="pryda-pill">{downloadItems.length} file(s)</span>
            </div>
            <div className="pryda-table pryda-table--downloads" role="table" aria-label="PSF downloads">
              <div className="pryda-table__row pryda-table__row--head" role="row">
                <span role="columnheader">File</span>
                <span role="columnheader">Action</span>
              </div>
              {downloadItems.map((download) => (
                <div className="pryda-table__row" role="row" key={download.name}>
                  <span role="cell">{download.name}</span>
                  <span role="cell">
                    <button className="button" onClick={() => handleDownload(download.url, download.name)}>
                      Download
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {members.length > 0 ? (
          <section className="pryda-preview" aria-label="Conversion preview">
            <div className="pryda-preview__header">
              <h2 className="pryda-preview__title">Preview</h2>
              <span className="pryda-pill">{members.length} rows</span>
            </div>

            <div className="pryda-table pryda-table--preview" role="table" aria-label="Converted members">
              <div className="pryda-table__row pryda-table__row--head" role="row">
                <span role="columnheader">Job</span>
                <span role="columnheader">Truss</span>
                <span role="columnheader">Member</span>
                <span role="columnheader">Length</span>
                <span role="columnheader">Quantity</span>
                <span role="columnheader">Size</span>
                <span role="columnheader">Grade</span>
              </div>

              {members.map((member, index) => {
                const size = `${member.width}x${member.thickness}`;
                const grade = member.material.split(" ").slice(1).join(" ") || member.material;

                return (
                  <div className="pryda-table__row" role="row" key={`${member.job}-${member.ID}-${index}`}>
                    <span role="cell">{member.job}</span>
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
