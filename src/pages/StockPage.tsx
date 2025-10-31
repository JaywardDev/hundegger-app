import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useShallow } from "zustand/shallow";
import { HeaderBar } from "../components/HeaderBar";
import { StockGrid } from "../components/StockGrid";
import { CellEditor } from "../components/CellEditor";
import { exportWorkbook } from "../lib/excel";
import { useMatrixStore } from "../store/useMatrixStore";
import { useRouter } from "../lib/router";
import { USERS } from "../lib/users";

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

  useEffect(() => {
    void loadMatrix();
  }, [loadMatrix]);

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
        <HeaderBar onExport={() => exportWorkbook(matrix)} />
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
          <StockGrid />
        </section>
      </div>
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