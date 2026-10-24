import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { ConvexProvider } from "convex/react";
import App from "./App.tsx";
import { convex } from "./data/live";

// With CONVEX_URL (root .env.local, written by `pnpm dev:convex`) the rail is live; without it, fixtures.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {convex ? (
      <ConvexProvider client={convex}>
        <App />
      </ConvexProvider>
    ) : (
      <App />
    )}
  </StrictMode>,
);
