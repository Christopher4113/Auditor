import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// Connect the provider when the agreed public Convex API is implemented.
// Local fixtures keep this frontend usable without a deployment or credentials.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
