import "./index.css";
import { RouterProvider, useRouter } from "./lib/router";
import { LandingPage } from "./pages/LandingPage";
import { PrydaConversionPage } from "./pages/PrydaConversionPage";
import { StockPage } from "./pages/StockPage";
import { OperationsFormPage } from "./pages/OperationFormsPage";

function AppRoutes() {
  const { route } = useRouter();

  if (route === "stock") {
    return <StockPage />;
  }

  if (route === "operations") {
    return <OperationsFormPage />;
  }

  if (route === "pryda") {
    return <PrydaConversionPage />;
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
