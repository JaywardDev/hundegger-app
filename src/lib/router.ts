import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

type Route = "home" | "stock";

type RouterContextValue = {
  route: Route;
  navigate: (next: Route) => void;
};

const RouterContext = createContext<RouterContextValue | undefined>(undefined);

const hashForRoute = (route: Route) => (route === "home" ? "#/" : "#/stock");

const routeFromHash = (hash: string): Route => {
  if (hash === "#/stock") {
    return "stock";
  }

  return "home";
};

export function RouterProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash || "#/"));

  useEffect(() => {
    if (!window.location.hash) {
      window.location.hash = hashForRoute(route);
    }
  }, [route]);

  useEffect(() => {
    const onHashChange = () => {
      setRoute(routeFromHash(window.location.hash || "#/"));
    };

    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = useCallback((next: Route) => {
    const targetHash = hashForRoute(next);
    if (window.location.hash === targetHash) {
      setRoute(next);
      return;
    }

    window.location.hash = targetHash;
  }, []);
  const value = useMemo<RouterContextValue>(() => ({ route, navigate }), [route, navigate]);

  return createElement(RouterContext.Provider, { value }, children);
}

export const useRouter = () => {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error("useRouter must be used within a RouterProvider");
  }
  return context;
};