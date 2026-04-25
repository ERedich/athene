import { PrimeReactProvider } from "primereact/api";
import "primeicons/primeicons.css";
import "primeflex/primeflex.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import "./i18n";
import "./index.css";
import { initializeTheme } from "./theme";

initializeTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PrimeReactProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PrimeReactProvider>
  </StrictMode>,
);
