import "./index.css";
import { RouterProvider, useRouter } from "./lib/router";
import { LandingPage } from "./pages/LandingPage";
import { StockPage } from "./pages/StockPage";
import { OperationsDataPage } from "./pages/OperationsDataPage";

function AppRoutes() {
  const { route } = useRouter();

  if (route === "stock") {
    return <StockPage />;
  }

  if (route === "operations") {
    return <OperationsDataPage />;
  }

  return <LandingPage />;
}

export default function App() {
  return (
    <RouterProvider>
      <AppRoutes />
    </RouterProvider>
  );
}
