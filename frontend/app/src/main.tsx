import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./tokens/theme.css";
import "./tokens/typography.css";
import "./tokens/motion.css";
import "./tokens/base.css";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";

const container = document.getElementById("root");
if (!container) {
  throw new Error("#root が見つかりません");
}

createRoot(container).render(
  <StrictMode>
    {/* 描画中の例外で真っ白にしない（components/ErrorBoundary.tsx） */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
