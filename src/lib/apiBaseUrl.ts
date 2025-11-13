const resolveApiBaseUrl = (): string => {
  const configured = import.meta.env.VITE_API_URL;
  if (configured) {
    return configured;
  }

  if (typeof window === "undefined") {
    return "http://localhost:4000";
  }

  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:4000`;
};

export const API_BASE_URL = resolveApiBaseUrl();