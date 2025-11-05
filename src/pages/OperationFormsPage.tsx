import { useCallback, useState } from "react";
import { useRouter } from "../lib/router";
import {
  submitDailyRegistryEntry,
  type DailyRegistryPayload,
  type DailyRegistrySuccessResponse,
  OperationsFormError,
  isOperationsFormError,
} from "../lib/operationsFormApi";

const PLACEHOLDER_FORM_LINK =
  "https://docs.google.com/forms/d/e/FORM_ID/viewform";
const PLACEHOLDER_FORM_EMBED_LINK =
  "https://docs.google.com/forms/d/e/FORM_ID/viewform?embedded=true";

type SubmissionStatus =
  | "idle"
  | "submitting"
  | "success"
  | "error"
  | "network-error";

interface SubmissionState {
  status: SubmissionStatus;
  message: string;
  row?: number;
  error: OperationsFormError | null;
  lastPayload: DailyRegistryPayload | null;
}

function createInitialSubmissionState(): SubmissionState {
  return {
    status: "idle",
    message: "",
    row: undefined,
    error: null,
    lastPayload: null,
  };
}

export function useOperationsFormSubmission() {
  const [state, setState] = useState<SubmissionState>(() =>
    createInitialSubmissionState()
  );

  const submit = useCallback(
    async (payload: DailyRegistryPayload): Promise<DailyRegistrySuccessResponse> => {
      setState({
        status: "submitting",
        message: "Submitting entry…",
        row: undefined,
        error: null,
        lastPayload: payload,
      });

      try {
        const result = await submitDailyRegistryEntry(payload);
        setState({
          status: "success",
          message: `Entry saved to row ${result.row}.`,
          row: result.row,
          error: null,
          lastPayload: null,
        });
        return result;
      } catch (error) {
        const operationsError = isOperationsFormError(error)
          ? error
          : new OperationsFormError(
              "Unable to submit the entry. Please try again.",
              { kind: "unknown", cause: error }
            );

        const status =
          operationsError.kind === "network" ? "network-error" : "error";

        setState({
          status,
          message: operationsError.message,
          row: undefined,
          error: operationsError,
          lastPayload: operationsError.kind === "network" ? payload : null,
        });

        throw operationsError;
      }
    },
    []
  );

  const retry = useCallback((): Promise<DailyRegistrySuccessResponse | null> => {
    if (!state.lastPayload) {
      return Promise.resolve<DailyRegistrySuccessResponse | null>(null);
    }
    return submit(state.lastPayload);
  }, [state.lastPayload, submit]);

  const reset = useCallback(() => {
    setState(createInitialSubmissionState());
  }, []);

  return {
    status: state.status,
    message: state.message,
    row: state.row,
    error: state.error,
    submit,
    retry,
    reset,
    isIdle: state.status === "idle",
    isSubmitting: state.status === "submitting",
  };
}

export type OperationsFormSubmission = ReturnType<typeof useOperationsFormSubmission>;  

export function OperationsFormPage() {
  const { navigate } = useRouter();
  const submission = useOperationsFormSubmission();

  return (
    <main className="operations-page">
      <div className="operations-page__inner">
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
            <h1>Operations intake form</h1>
            <p>
              Embed the Google Form that feeds the operations sheet so teammates can
              submit updates without leaving the app.
            </p>
          </div>
        </header>
        <div className="sheet-actions">
          <a
            className="link-button"
            href={PLACEHOLDER_FORM_LINK}
            target="_blank"
            rel="noreferrer"
          >
            Open the form in Google ↗
          </a>
        </div>
        <section className="sheet-embed" aria-label="Embedded Google Form">
          <iframe
            title="Operations Google Form"
            src={PLACEHOLDER_FORM_EMBED_LINK}
            loading="lazy"
            allow="clipboard-read; clipboard-write"
          />
          <p className="sheet-embed__placeholder">
            Replace the placeholder URLs in <code>OperationsFormPage.tsx</code> with the
            published Google Form link. Ensure the form responses are connected to the
            intended sheet tab before sharing with operators.
          </p>
        </section>
        <SubmissionStatusBanner submission={submission} />        
      </div>
    </main>
  );
}

function SubmissionStatusBanner({
  submission,
}: {
  submission: OperationsFormSubmission;
}) {
  if (submission.status === "idle") {
    return null;
  }

  const className = `operations-form-status operations-form-status--${submission.status}`;

  return (
    <div className={className} role="status" aria-live="polite">
      <p className="operations-form-status__message">{submission.message}</p>
      <div className="operations-form-status__actions">
        {submission.status === "network-error" ? (
          <button
            type="button"
            className="link-button"
            onClick={() => submission.retry()}
            disabled={submission.isSubmitting}
          >
            Retry
          </button>
        ) : null}
        {submission.status !== "submitting" ? (
          <button
            type="button"
            className="link-button"
            onClick={() => submission.reset()}
          >
            Dismiss
          </button>
        ) : null}
      </div>
    </div>
  );
}

export type { DailyRegistryPayload } from "../lib/operationsFormApi";