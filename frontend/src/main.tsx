import { PrimeReactProvider } from "primereact/api";
import "primeicons/primeicons.css";
import "primeflex/primeflex.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import "./i18n";
import "./index.css";

import laraDark from "primereact/resources/themes/lara-dark-blue/theme.css?url";
import laraLight from "primereact/resources/themes/lara-light-blue/theme.css?url";

const primeLink = document.getElementById("prime-theme-link") as HTMLLinkElement | null;
const initialDark =
  document.documentElement.dataset.theme !== "light";
if (primeLink) {
  primeLink.href = initialDark ? laraDark : laraLight;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PrimeReactProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PrimeReactProvider>
  </StrictMode>,
);
