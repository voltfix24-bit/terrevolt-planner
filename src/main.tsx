import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyTheme, getInitialTheme } from "./hooks/use-theme";
import { registerAppServiceWorker } from "./lib/pwa-register";

// Apply theme before first paint to prevent FOUC.
applyTheme(getInitialTheme());

createRoot(document.getElementById("root")!).render(<App />);

registerAppServiceWorker();
