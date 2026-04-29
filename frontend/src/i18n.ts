import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import de from "./locales/de.json";
import en from "./locales/en.json";

void i18n.use(initReactI18next).init({
  resources: {
    de: { translation: de },
    en: { translation: en },
  },
  lng: "de",
  /** Keys missing in the active bundle resolve from English (avoids raw key paths in DE). */
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
