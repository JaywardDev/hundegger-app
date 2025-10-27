import type { Bay, Cell, Level } from "./types";

export type MatrixPayload = Record<Bay, Record<Level, Cell | null>>;

const fallbackHost = () => {
  if (typeof window === "undefined") return "http://localhost:4000";
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:4000`;
};

const API_BASE_URL = import.meta.env.VITE_MATRIX_API_URL ?? fallbackHost();

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers
    }
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const message = data?.error ?? res.statusText ?? "Request failed";
    throw new Error(message);
  }

  return data as T;
};

export const fetchMatrix = () => request<MatrixPayload>("/matrix");

export const persistMatrix = (matrix: MatrixPayload) =>
  request<MatrixPayload>("/matrix", {
    method: "PUT",
    body: JSON.stringify(matrix)
  });