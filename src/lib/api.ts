import { API_BASE_URL } from "./apiBaseUrl";
import type { Bay, Cell, Level } from "./types";

export type MatrixPayload = Record<Bay, Record<Level, Cell | null>>;

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