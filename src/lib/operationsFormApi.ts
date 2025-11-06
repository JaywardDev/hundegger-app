export interface DailyRegistryPayload {
  date: string;
  operator: string;
  startTime: string;
  finishTime: string;
  projectFile: string;
  timeRemainStart: string | number;
  timeRemainEnd: string | number;
  downtimeHrs?: string | number | null;
  downtimeReason?: string | null;
  interruptionHrs?: string | number | null;
  interruptionReason?: string | null;
}

export interface DailyRegistrySuccessResponse {
  ok: true;
  row: number;
}

export type OperationsFormErrorKind =
  | "network"
  | "http"
  | "config"
  | "unknown";
const fallbackApiHost = () => {
  if (typeof window === "undefined") return "http://localhost:4000";
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:4000`;
};

const resolveDefaultWebAppUrl = (): string => {
  const override = import.meta.env.VITE_DAILY_REGISTRY_WEB_APP_URL;
  if (override) {
    return override;
  }

  const base = import.meta.env.VITE_MATRIX_API_URL ?? fallbackApiHost();
  try {
    return new URL("/daily-registry", base).toString();
  } catch (error) {
    console.warn("Unable to construct daily registry URL from base", error);
    const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
    return `${normalizedBase}/daily-registry`;
  }
};

const DEFAULT_WEB_APP_URL = resolveDefaultWebAppUrl();

export class OperationsFormError extends Error {
  readonly status: number | null;
  readonly code?: string;
  readonly details?: unknown;
  readonly kind: OperationsFormErrorKind;

  constructor(
    message: string,
    options?: {
      status?: number | null;
      code?: string;
      details?: unknown;
      kind?: OperationsFormErrorKind;
      cause?: unknown;
    }
  ) {
    super(message);
    this.name = "OperationsFormError";
    this.status = options?.status ?? null;
    this.code = options?.code;
    this.details = options?.details;
    this.kind = options?.kind ?? "unknown";
    if (options?.cause !== undefined) {
      Object.defineProperty(this, "cause", {
        enumerable: false,
        configurable: true,
        writable: false,
        value: options.cause,
      });
    }
  }
}

export function isOperationsFormError(error: unknown): error is OperationsFormError {
  return error instanceof OperationsFormError;
}

export function isOperationsFormNetworkError(error: unknown): error is OperationsFormError {
  return isOperationsFormError(error) && error.kind === "network";
}

export async function submitDailyRegistryEntry(
  payload: DailyRegistryPayload,
  overrides?: {
    signal?: AbortSignal;
    webAppUrl?: string;
    token?: string;
  }
): Promise<DailyRegistrySuccessResponse> {
  const url = overrides?.webAppUrl ?? DEFAULT_WEB_APP_URL;
  const token = overrides?.token ?? import.meta.env.VITE_DAILY_REGISTRY_API_TOKEN;

  if (!url) {
    throw new OperationsFormError(
      "Daily Registry endpoint is not configured. Set VITE_DAILY_REGISTRY_WEB_APP_URL in your environment.",
      { kind: "config" }
    );
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(token ? { ...payload, apiToken: token } : payload),
      signal: overrides?.signal,
    });
  } catch (error) {
    throw new OperationsFormError(
      "Network request failed. Check your connection and try again.",
      { kind: "network", cause: error }
    );
  }

  const text = await response.text();
  let data: unknown = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new OperationsFormError("Received a non-JSON response from the server.", {
        kind: "http",
        status: response.status,
        cause: error,
      });
    }
  }

  if (!response.ok) {
    const body = data as
      | {
          error?: { message?: string; code?: string; details?: unknown };
        }
      | null;

    const message = body?.error?.message ?? `Request failed with status ${response.status}.`;
    throw new OperationsFormError(message, {
      kind: "http",
      status: response.status,
      code: body?.error?.code,
      details: body?.error?.details,
    });
  }

  const success = data as DailyRegistrySuccessResponse | null;
  if (!success || typeof success.row !== "number") {
    throw new OperationsFormError("Unexpected response payload from the server.", {
      kind: "http",
      status: response.status,
      details: data,
    });
  }

  return success;
}