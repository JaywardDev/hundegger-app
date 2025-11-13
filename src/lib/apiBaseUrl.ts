const resolveApiBaseUrl = (): string => {
  const configured = import.meta.env.VITE_API_URL;
  if (configured) {
    return configured;
  }

  // When running on the server (e.g. Node / server-side code)
  if (typeof window === "undefined") {
    return "http://localhost:4000";
  }

  const { protocol, hostname, origin } = window.location;

  // Local dev: frontend on 5173 (or LAN IP), backend on 4000
  if (hostname === "localhost" || hostname.startsWith("192.168.")) {
    return `${protocol}//${hostname}:4000`;
  }

  // Production (e.g. hundegger.jaywardseverino.com)
  // → use the same origin as the frontend, no port
  return origin;
};

export const API_BASE_URL = resolveApiBaseUrl();