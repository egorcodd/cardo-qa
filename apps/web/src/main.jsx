import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { LangProvider } from "./i18n.jsx";
import "./index.css";

document.documentElement.dataset.theme =
  localStorage.getItem("cardo_theme") || "system";
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <LangProvider>
      <App />
    </LangProvider>
  </React.StrictMode>,
);
