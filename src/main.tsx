import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { registerAppRecoveryHandlers } from "./lib/app-recovery";
import "./index.css";

declare global {
  interface Window {
    __EZ_APP_BOOTED__?: boolean;
  }
}

registerAppRecoveryHandlers();

createRoot(document.getElementById("root")!).render(<App />);
window.__EZ_APP_BOOTED__ = true;
