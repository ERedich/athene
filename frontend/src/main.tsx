import { PrimeReactProvider } from "primereact/api";
import "primeflex/primeflex.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import "./i18n";
import "./index.css";
import { applyDensity, readInitialDensity } from "./tableDensity";
import { initializeTheme } from "./theme";

initializeTheme();
applyDensity(readInitialDensity());

const primeReactConfig = {
  ripple: true,
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PrimeReactProvider value={primeReactConfig}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PrimeReactProvider>
  </StrictMode>,
);
