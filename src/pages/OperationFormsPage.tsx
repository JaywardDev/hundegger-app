import {
  useCallback,
  useEffect,
  useState,
} from "react";
import type { ChangeEvent, FormEvent, ReactElement } from "react";
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

function useOperationsFormSubmission() {
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
        console.log("[hook] calling submitDailyRegistryEntry with:", payload);
        const result = await submitDailyRegistryEntry(payload);
        console.log("[hook] success result:", result);

        setState({
          status: "success",
          message: `Entry saved to row ${result.row}.`,
          row: result.row,
          error: null,
          lastPayload: null,
        });
        return result;
      } catch (error) {
        console.log("[hook] error:", error)
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

type OperationsFormSubmission = ReturnType<typeof useOperationsFormSubmission>;

interface DailyRegistryFormState {
  date: string;
  operator: string;
  startTime: string;
  finishTime: string;
  projectFile: string;
  actualVolumeCut: string;
  timeRemainStart: string;
  timeRemainEnd: string;
  downtimeHrs: string;
  downtimeReason: string;
  interruptionHrs: string;
  interruptionReason: string;
}

function createInitialFormState(): DailyRegistryFormState {
  const today = new Date();
  const isoDate = new Date(
    today.getTime() - today.getTimezoneOffset() * 60000
  )
    .toISOString()
    .slice(0, 10);

  return {
    date: isoDate,
    operator: "",
    startTime: "",
    finishTime: "",
    projectFile: "",
    actualVolumeCut: "",
    timeRemainStart: "",
    timeRemainEnd: "",
    downtimeHrs: "",
    downtimeReason: "",
    interruptionHrs: "",
    interruptionReason: "",
  };
}

function normalizeNumberField(value: string): string | number {
  const trimmed = value.trim();
  const numeric = Number(trimmed);
  return trimmed && Number.isFinite(numeric) ? numeric : trimmed;
}

function normalizeOptionalNumberField(value: string): string | number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : trimmed;
}

function normalizeOptionalTextField(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function OperationsFormPage() {
  const { navigate } = useRouter();
  const submission = useOperationsFormSubmission();
  const [formState, setFormState] = useState<DailyRegistryFormState>(() =>
    createInitialFormState()
  );

  useEffect(() => {
    if (submission.status === "success") {
      setFormState(createInitialFormState());
    }
  }, [submission.status]);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { name, value } = event.target;
      setFormState((current) => ({ ...current, [name]: value }));
    },
    []
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const payload: DailyRegistryPayload = {
        date: formState.date,
        operator: formState.operator.trim(),
        startTime: formState.startTime.trim(),
        finishTime: formState.finishTime.trim(),
        projectFile: formState.projectFile.trim(),
        actualVolumeCut: normalizeOptionalNumberField(formState.actualVolumeCut),
        timeRemainStart: normalizeNumberField(formState.timeRemainStart),
        timeRemainEnd: normalizeNumberField(formState.timeRemainEnd),
        downtimeHrs: normalizeOptionalNumberField(formState.downtimeHrs),
        downtimeReason: normalizeOptionalTextField(formState.downtimeReason),
        interruptionHrs: normalizeOptionalNumberField(
          formState.interruptionHrs
        ),
        interruptionReason: normalizeOptionalTextField(
          formState.interruptionReason
        ),
      };

      try {
        console.log("[page] calling submission.submit");
        const res = await submission.submit(payload);
        console.log("[page] submit success:", res);
      } catch (e) {
        console.log("[page] submit error:", e);
      }
    },
    [formState, submission]
  );

  const resetForm = useCallback(() => {
    setFormState(createInitialFormState());
    submission.reset();
  }, [submission]);  

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
              Log production details that feed the Daily_Registry Google Sheet without
              opening the external form.
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
            Open the Google Form ↗
          </a>
        </div>
        <section className="operations-form" aria-label="Operations intake form">
          <form className="operations-form__form" onSubmit={handleSubmit}>
            <div className="operations-form__grid" aria-label="Required details">
              <FormField
                id="date"
                label="Date"
                required
                input={
                  <input
                    id="date"
                    name="date"
                    type="date"
                    value={formState.date}
                    onChange={handleChange}
                    required
                    disabled={submission.isSubmitting}
                    autoComplete="off"
                  />
                }
              />
              <FormField
                id="operator"
                label="Operator"
                required
                input={
                  <input
                    id="operator"
                    name="operator"
                    type="text"
                    value={formState.operator}
                    onChange={handleChange}
                    required
                    disabled={submission.isSubmitting}
                    autoComplete="name"
                    placeholder="Jane Doe"
                  />
                }
              />
              <FormField
                id="startTime"
                label="Start time"
                required
                input={
                  <input
                    id="startTime"
                    name="startTime"
                    type="time"
                    value={formState.startTime}
                    onChange={handleChange}
                    required
                    disabled={submission.isSubmitting}
                  />
                }
              />
              <FormField
                id="finishTime"
                label="Finish time"
                required
                input={
                  <input
                    id="finishTime"
                    name="finishTime"
                    type="time"
                    value={formState.finishTime}
                    onChange={handleChange}
                    required
                    disabled={submission.isSubmitting}
                  />
                }
              />
              <FormField
                id="projectFile"
                label="Project file"
                required
                input={
                  <input
                    id="projectFile"
                    name="projectFile"
                    type="text"
                    value={formState.projectFile}
                    onChange={handleChange}
                    required
                    disabled={submission.isSubmitting}
                    placeholder="Project name or file code"
                  />
                }
              />
              <FormField
                id="actualVolumeCut"
                label="Actual volume cut"
                hint="Enter the total volume produced this shift"
                input={
                  <input
                    id="actualVolumeCut"
                    name="actualVolumeCut"
                    type="number"
                    value={formState.actualVolumeCut}
                    onChange={handleChange}
                    disabled={submission.isSubmitting}
                    step="0.01"
                    min="0"
                  />
                }
              />              
              <FormField
                id="timeRemainStart"
                label="Time remaining (start)"
                required
                hint="Hours remaining at the start of the shift"
                input={
                  <input
                    id="timeRemainStart"
                    name="timeRemainStart"
                    type="number"
                    value={formState.timeRemainStart}
                    onChange={handleChange}
                    required
                    disabled={submission.isSubmitting}
                    step="0.25"
                    min="0"
                  />
                }
              />
              <FormField
                id="timeRemainEnd"
                label="Time remaining (end)"
                required
                hint="Hours remaining at the end of the shift"
                input={
                  <input
                    id="timeRemainEnd"
                    name="timeRemainEnd"
                    type="number"
                    value={formState.timeRemainEnd}
                    onChange={handleChange}
                    required
                    disabled={submission.isSubmitting}
                    step="0.25"
                    min="0"
                  />
                }
              />
            </div>

            <fieldset className="operations-form__fieldset">
              <legend>Downtime (optional)</legend>
              <div className="operations-form__grid operations-form__grid--compact">
                <FormField
                  id="downtimeHrs"
                  label="Downtime hours"
                  input={
                    <input
                      id="downtimeHrs"
                      name="downtimeHrs"
                      type="number"
                      value={formState.downtimeHrs}
                      onChange={handleChange}
                      disabled={submission.isSubmitting}
                      step="0.25"
                      min="0"
                    />
                  }
                />
                <FormField
                  id="downtimeReason"
                  label="Downtime reason"
                  input={
                    <textarea
                      id="downtimeReason"
                      name="downtimeReason"
                      value={formState.downtimeReason}
                      onChange={handleChange}
                      disabled={submission.isSubmitting}
                      rows={3}
                    />
                  }
                />
              </div>
            </fieldset>

            <fieldset className="operations-form__fieldset">
              <legend>Interruptions (optional)</legend>
              <div className="operations-form__grid operations-form__grid--compact">
                <FormField
                  id="interruptionHrs"
                  label="Interruption hours"
                  input={
                    <input
                      id="interruptionHrs"
                      name="interruptionHrs"
                      type="number"
                      value={formState.interruptionHrs}
                      onChange={handleChange}
                      disabled={submission.isSubmitting}
                      step="0.25"
                      min="0"
                    />
                  }
                />
                <FormField
                  id="interruptionReason"
                  label="Interruption reason"
                  input={
                    <textarea
                      id="interruptionReason"
                      name="interruptionReason"
                      value={formState.interruptionReason}
                      onChange={handleChange}
                      disabled={submission.isSubmitting}
                      rows={3}
                    />
                  }
                />
              </div>
            </fieldset>

            <div className="operations-form__actions">
              <button
                type="submit"
                className="button button--primary"
                disabled={submission.isSubmitting}
              >
                {submission.isSubmitting ? "Submitting…" : "Submit entry"}
              </button>
              <button
                type="button"
                className="button"
                onClick={resetForm}
                disabled={submission.isSubmitting}
              >
                Reset form
              </button>
            </div>
          </form>
        </section>
        <SubmissionStatusBanner submission={submission} />
      </div>
    </main>
  );
}

function FormField({
  id,
  label,
  hint,
  required,
  input,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  input: ReactElement;
}) {
  return (
    <div className="operations-form__field">
      <label className="operations-form__label" htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true">*</span> : null}
      </label>
      {hint ? <p className="operations-form__hint">{hint}</p> : null}
      {input}
    </div>
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