import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./tokens/theme.css";
import "./tokens/typography.css";
import "./tokens/motion.css";
import "./tokens/base.css";
import { App } from "./App";

const container = document.getElementById("root");
if (!container) {
  throw new Error("#root が見つかりません");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
