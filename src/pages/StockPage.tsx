import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useShallow } from "zustand/shallow";
import { HeaderBar } from "../components/HeaderBar";
import { StockGrid } from "../components/StockGrid";
import { CellEditor } from "../components/CellEditor";
import { exportWorkbook } from "../lib/excel";
import { useMatrixStore } from "../store/useMatrixStore";
import { useRouter } from "../lib/router";
import { USERS } from "../lib/users";
import { BAYS, LEVELS, type Bay, type Level } from "../lib/types";

type SearchCriteria = {
  size?: string;
  length?: number;
  grade?: string;
  treatment?: string;
};

export function StockPage() {
  const { navigate } = useRouter();
  const matrix = useMatrixStore((s) => s.matrix);
  const loading = useMatrixStore((s) => s.loading);
  const syncing = useMatrixStore((s) => s.syncing);
  const error = useMatrixStore((s) => s.error);
  const loadMatrix = useMatrixStore((s) => s.loadMatrix);
  const reloadMatrix = useMatrixStore((s) => s.reloadMatrix);
  const { editingEnabled, currentUser, enableEditing, disableEditing } = useMatrixStore(
    useShallow((s) => ({
      editingEnabled: s.editingEnabled,
      currentUser: s.currentUser,
      enableEditing: s.enableEditing,
      disableEditing: s.disableEditing
    }))
  );
  const [authOpen, setAuthOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [authError, setAuthError] = useState<string>();
  const pinRef = useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchSelections, setSearchSelections] = useState({
    size: "",
    length: "",
    grade: "",
    treatment: ""
  });
  const [matchedCells, setMatchedCells] = useState<Array<{ bay: Bay; level: Level }>>([]);
  const [searchResultLabel, setSearchResultLabel] = useState("");
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const firstFilterRef = useRef<HTMLSelectElement>(null);
  const searchWasOpenRef = useRef(false);

  useEffect(() => {
    void loadMatrix();
  }, [loadMatrix]);

  useEffect(() => {
    const handlePageHide = () => {
      disableEditing();
    };

    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      disableEditing();
    };
  }, [disableEditing]);  

  const statusMessage = loading ? "Loading matrix…" : syncing ? "Saving changes…" : undefined;
  const editingLabel = useMemo(() => {
    if (!editingEnabled || !currentUser) return "Editing locked";
    return `Editing as ${currentUser.name} (${currentUser.title})`;
  }, [editingEnabled, currentUser]);

  useEffect(() => {
    if (authOpen) {
      setPin("");
      setAuthError(undefined);
      pinRef.current?.focus();
    }
  }, [authOpen]);

  const filterOptions = useMemo(() => {
    const sizes = new Set<string>();
    const lengths = new Set<number>();
    const grades = new Set<string>();
    const treatments = new Set<string>();

    for (const bay of BAYS) {
      const column = matrix[bay];
      if (!column) continue;
      for (const level of LEVELS) {
        const cell = column[level];
        if (!cell) continue;
        for (const item of cell.items) {
          if (item.size_id) sizes.add(item.size_id);
          if (item.length_mm) lengths.add(item.length_mm);
          if (item.grade) grades.add(item.grade);
          if (item.treatment) treatments.add(item.treatment);
        }
      }
    }

    const compareSizes = (a: string, b: string) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

    return {
      sizes: Array.from(sizes).sort(compareSizes),
      lengths: Array.from(lengths).sort((a, b) => a - b),
      grades: Array.from(grades).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
      treatments: Array.from(treatments).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    };
  }, [matrix]);

  const normalizedCriteria = useMemo<SearchCriteria>(() => ({
    size: searchSelections.size || undefined,
    length: searchSelections.length ? Number(searchSelections.length) : undefined,
    grade: searchSelections.grade || undefined,
    treatment: searchSelections.treatment || undefined
  }), [searchSelections]);

  const hasActiveFilters = useMemo(
    () =>
      Boolean(
        normalizedCriteria.size ||
          normalizedCriteria.length ||
          normalizedCriteria.grade ||
          normalizedCriteria.treatment
      ),
    [normalizedCriteria]
  );

  const formatLength = useCallback((mm: number) => {
    const meters = mm / 1000;
    const meterLabel = Number.isInteger(meters) ? meters.toString() : meters.toFixed(1);
    return `${meterLabel} m (${mm} mm)`;
  }, []);

  const computeMatches = useCallback(
    (criteria: SearchCriteria) => {
      const results: Array<{ bay: Bay; level: Level }> = [];

      for (const bay of BAYS) {
        const column = matrix[bay];
        if (!column) continue;
        for (const level of LEVELS) {
          const cell = column[level];
          if (!cell || !cell.items.length) continue;

          const matches = cell.items.some((item) => {
            if (criteria.size && item.size_id !== criteria.size) return false;
            if (criteria.length !== undefined && item.length_mm !== criteria.length) return false;
            if (criteria.grade && item.grade !== criteria.grade) return false;
            if (criteria.treatment && item.treatment !== criteria.treatment) return false;
            return true;
          });

          if (matches) {
            results.push({ bay, level });
          }
        }
      }

      return results;
    },
    [matrix]
  );

  useEffect(() => {
    if (!searchOpen) return;
    if (!hasActiveFilters) {
      setMatchedCells([]);
      setSearchResultLabel("");
      return;
    }

    const results = computeMatches(normalizedCriteria);
    setMatchedCells(results);
    setSearchResultLabel(
      results.length === 0
        ? "No stacks matched the selected filters."
        : results.length === 1
        ? "1 stack highlighted."
        : `${results.length} stacks highlighted.`
    );
  }, [searchOpen, hasActiveFilters, computeMatches, normalizedCriteria]);

  useEffect(() => {
    if (searchOpen) {
      searchWasOpenRef.current = true;
      firstFilterRef.current?.focus();
      return;
    }

    if (searchWasOpenRef.current) {
      setMatchedCells([]);
      setSearchResultLabel("");
      searchButtonRef.current?.focus();
      searchWasOpenRef.current = false;
    }
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSearchOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [searchOpen]);

  const matchedCellMap = useMemo(() => {
    if (!matchedCells.length) return undefined;
    const map: Partial<Record<Bay, Set<Level>>> = {};
    for (const match of matchedCells) {
      if (!map[match.bay]) {
        map[match.bay] = new Set<Level>();
      }
      map[match.bay]!.add(match.level);
    }
    return map;
  }, [matchedCells]);

  const filterSummary = useMemo(() => {
    if (!hasActiveFilters) {
      return "Select one or more attributes to highlight matching stacks.";
    }

    const parts: string[] = [];
    if (normalizedCriteria.size) parts.push(`size ${normalizedCriteria.size}`);
    if (normalizedCriteria.length) parts.push(`length ${formatLength(normalizedCriteria.length)}`);
    if (normalizedCriteria.grade) parts.push(`grade ${normalizedCriteria.grade}`);
    if (normalizedCriteria.treatment) parts.push(`treatment ${normalizedCriteria.treatment}`);

    return `Highlighting stacks matching ${parts.join(", ")}.`;
  }, [formatLength, hasActiveFilters, normalizedCriteria]);

  const handleClearFilters = useCallback(() => {
    setSearchSelections({ size: "", length: "", grade: "", treatment: "" });
    setMatchedCells([]);
    setSearchResultLabel("");
  }, []);

  const handleSearchOpen = useCallback(() => {
    setSearchOpen(true);
  }, []);

  const handleSearchClose = useCallback(() => {
    setSearchOpen(false);
  }, []);

  const { sizes, lengths, grades, treatments } = filterOptions;
  const matchCount = matchedCells.length;
  const statusClassName = `search-dialog__status${
    !searchResultLabel
      ? " search-dialog__status--muted"
      : matchCount > 0
      ? " search-dialog__status--positive"
      : " search-dialog__status--warning"
  }`;
  const searchTitleId = "search-dialog-title";
  const searchDescriptionId = "search-dialog-description";

  const handleAuthSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const user = USERS.find((u) => u.pin === pin.trim());
    if (!user) {
      setAuthError("Incorrect PIN. Please try again.");
      setPin("");
      pinRef.current?.focus();
      return;
    }
    enableEditing({ name: user.name, title: user.title });
    setAuthOpen(false);
  };

  return (
    <main className={`stock-page${authOpen ? " stock-page--auth-open" : ""}`}>
      <div className="stock-page__inner">
        <header className="page-header">
          <button
            type="button"
            className="link-button"
            onClick={() => navigate("home")}
            aria-label="Back to landing page"
          >
            ← Back
          </button>
          <div>
            <h1>Stock-take</h1>
            <p>Review, adjust, and export the 12&nbsp;m timber inventory.</p>
          </div>
        </header>
        <section className="editing-controls" aria-live="polite">
          <div className="editing-status">{editingLabel}</div>
          <div className="editing-actions">
            {editingEnabled ? (
              <button type="button" className="button button--ghost" onClick={disableEditing}>
                Stop editing
              </button>
            ) : (
              <button type="button" className="button button--primary" onClick={() => setAuthOpen(true)}>
                Edit stock
              </button>
            )}
          </div>
        </section>        
        <HeaderBar
          onExport={() => exportWorkbook(matrix)}
          onSearch={handleSearchOpen}
          searchButtonRef={searchButtonRef}
        />
        {statusMessage && (
          <div className="status-banner" role="status" aria-live="polite">
            {statusMessage}
          </div>
        )}
        {error && (
          <div className="status-banner status-banner--error" role="alert">
            <span>{error}</span>
            <button type="button" className="link-button" onClick={() => void reloadMatrix()}>
              Retry
            </button>
          </div>
        )}          
        <section className="grid-section" aria-label="Stock grid">
          {!editingEnabled && (
            <p className="grid-locked-message">Press Edit stock and authenticate to make changes.</p>
          )}          
          <StockGrid matchedCells={matchedCellMap} />
        </section>
      </div>
      {searchOpen && (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby={searchTitleId}
          aria-describedby={searchDescriptionId}
        >
          <div className="dialog search-dialog">
            <div className="dialog__header">
              <div>
                <p className="dialog__eyebrow">Search</p>
                <h2 id={searchTitleId}>Highlight timber stacks</h2>
              </div>
              <button
                type="button"
                className="button button--ghost button--icon"
                onClick={handleSearchClose}
                aria-label="Close search"
              >
                ✕
              </button>
            </div>
            <form
              className="search-dialog__form"
              onSubmit={(event) => event.preventDefault()}
            >
              <div className="search-dialog__fields">
                <div className="field">
                  <label htmlFor="search-size">Size</label>
                  <select
                    id="search-size"
                    ref={firstFilterRef}
                    value={searchSelections.size}
                    onChange={(event) =>
                      setSearchSelections((prev) => ({ ...prev, size: event.target.value }))
                    }
                  >
                    <option value="">Any size</option>
                    {sizes.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="search-length">Length</label>
                  <select
                    id="search-length"
                    value={searchSelections.length}
                    onChange={(event) =>
                      setSearchSelections((prev) => ({ ...prev, length: event.target.value }))
                    }
                  >
                    <option value="">Any length</option>
                    {lengths.map((length) => (
                      <option key={length} value={String(length)}>
                        {formatLength(length)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="search-grade">Grade</label>
                  <select
                    id="search-grade"
                    value={searchSelections.grade}
                    onChange={(event) =>
                      setSearchSelections((prev) => ({ ...prev, grade: event.target.value }))
                    }
                  >
                    <option value="">Any grade</option>
                    {grades.map((grade) => (
                      <option key={grade} value={grade}>
                        {grade}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="search-treatment">Treatment</label>
                  <select
                    id="search-treatment"
                    value={searchSelections.treatment}
                    onChange={(event) =>
                      setSearchSelections((prev) => ({ ...prev, treatment: event.target.value }))
                    }
                  >
                    <option value="">Any treatment</option>
                    {treatments.map((treatment) => (
                      <option key={treatment} value={treatment}>
                        {treatment}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p id={searchDescriptionId} className="search-dialog__summary">
                {filterSummary}
              </p>
              <p className={statusClassName} role="status" aria-live="polite">
                {searchResultLabel}
              </p>
            </form>
            <div className="dialog__footer">
              <button
                type="button"
                className="button button--ghost"
                onClick={handleClearFilters}
                disabled={!hasActiveFilters}
              >
                Clear filters
              </button>
              <div className="spacer" />
              <button type="button" className="button button--primary" onClick={handleSearchClose}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}      
      <CellEditor />
      {authOpen && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Unlock stock editing">
          <form className="pin-dialog" onSubmit={handleAuthSubmit}>
            <h2>Enter PIN</h2>
            <p className="pin-dialog__hint">Only authorised users can update the stock grid.</p>
            <label htmlFor="pin-input" className="visually-hidden">
              PIN code
            </label>
            <input
              ref={pinRef}
              id="pin-input"
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              className="pin-input"
              aria-invalid={authError ? "true" : "false"}
            />
            {authError && (
              <p className="pin-dialog__error" role="alert">
                {authError}
              </p>
            )}
            <div className="pin-dialog__actions">
              <button type="button" className="button button--ghost" onClick={() => setAuthOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="button button--primary">
                Unlock editing
              </button>
            </div>
          </form>
        </div>
      )}      
    </main>
  );
}